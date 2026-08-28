import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { getKeystoneManifest } from '../src/services/keystoneService.js';

const STALE_SHA = '9911c2d4f8e7a6b5c4d3e2f1a0b9c8d7e6f5a4b3';

const reviewEnvelope = (sourceSha: string) => ({
  format: 'review-findings',
  format_version: '0.1',
  project_id: 'keystone-fixture',
  source_sha: sourceSha,
  generated_by: 'theia',
  generated_at: '2026-08-23T18:40:00Z',
  payload: {
    findings: [
      {
        id: 'F-1',
        file: 'src/scheduler.c',
        line: 214,
        severity: 'major',
        title: 'Recovery path never resets the retry counter',
        status: 'open'
      }
    ]
  }
});

const wikiEnvelope = (sourceSha: string) => ({
  format: 'wiki',
  format_version: '1',
  project_id: 'keystone-fixture',
  source_sha: sourceSha,
  generated_by: 'codex-wiki',
  generated_at: '2026-08-28T06:00:00Z',
  payload: {
    analysis: {
      title: 'keystone-fixture',
      sections: [{ heading: 'Overview', content: 'What the fixture does.', diagram: null }]
    },
    wikiPages: [
      { title: 'Protocol', summary: 'The artifact envelope', category: 'Architecture', content: '...' }
    ],
    diagrams: [{ title: 'Pipeline', type: 'dataflow', mermaid: 'graph LR; a-->b;' }],
    suggestedQuestions: ['How is provenance recorded?']
  }
});

describe('keystoneService - getKeystoneManifest', () => {
  let tempDir: string;
  let repoDir: string;
  let headSha: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'keystone-test-'));

    // Git repo fixture with one commit so HEAD resolves
    repoDir = path.join(tempDir, 'pilot-repo');
    fs.mkdirSync(repoDir);
    execSync('git init -b main', { cwd: repoDir });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# fixture\n');
    execSync('git add README.md', { cwd: repoDir });
    execSync('git -c user.name=test -c user.email=test@example.com commit -m init --no-gpg-sign', { cwd: repoDir });
    headSha = execSync('git rev-parse HEAD', { cwd: repoDir }).toString().trim();

    const aidevDir = path.join(repoDir, '.aidev', 'artifacts');
    fs.mkdirSync(aidevDir, { recursive: true });
    fs.writeFileSync(
      path.join(aidevDir, 'review-fresh.json'),
      JSON.stringify(reviewEnvelope(headSha), null, 2)
    );
    fs.writeFileSync(
      path.join(aidevDir, 'wiki-fresh.json'),
      JSON.stringify(wikiEnvelope(headSha), null, 2)
    );
    fs.writeFileSync(
      path.join(repoDir, '.aidev', 'manifest.yaml'),
      [
        'handshake: "0.1"',
        '',
        'project:',
        '  id: keystone-fixture',
        '  repo: thamam/keystone-fixture',
        '',
        'artifacts:',
        '  - kind: review',
        '    path: .aidev/artifacts/review-fresh.json',
        '    format: review-findings/0.1',
        '    producer: theia',
        `    source_sha: ${headSha}`,
        '    updated: "2026-08-23"',
        '',
        '  - kind: wiki',
        '    path: .aidev/artifacts/wiki-fresh.json',
        '    format: wiki/1',
        '    producer: codex-wiki',
        `    source_sha: ${headSha}`,
        '    updated: "2026-08-28"',
        '',
        '  - kind: blueprint',
        '    path: main.spec.yaml',
        '    format: blueprint/1',
        '    producer: spec-design-yard',
        `    source_sha: ${STALE_SHA}`,
        '    updated: "2026-08-14"',
        ''
      ].join('\n')
    );
  });

  afterAll(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should return enabled: false when .aidev/manifest.yaml is missing', async () => {
    const noManifestDir = path.join(tempDir, 'no-manifest');
    fs.mkdirSync(noManifestDir);
    const result = await getKeystoneManifest(noManifestDir);
    expect(result).toEqual({ enabled: false });
  });

  it('should parse the manifest and compute fresh/stale against HEAD (R2)', async () => {
    const result = await getKeystoneManifest(repoDir);

    expect(result.enabled).toBe(true);
    expect(result.handshake).toBe('0.1');
    expect(result.project).toEqual({ id: 'keystone-fixture', repo: 'thamam/keystone-fixture' });
    expect(result.headSha).toBe(headSha);
    expect(result.artifacts).toHaveLength(3);

    const review = result.artifacts!.find(a => a.kind === 'review')!;
    expect(review.fresh).toBe(true);
    expect(review.headSha).toBe(headSha);
    expect(review.source_sha).toBe(headSha);
    expect(review.producer).toBe('theia');

    const blueprint = result.artifacts!.find(a => a.kind === 'blueprint')!;
    expect(blueprint.fresh).toBe(false);
    expect(blueprint.source_sha).toBe(STALE_SHA);
  });

  it('should include the parsed envelope payload for review-findings/0.1 artifacts', async () => {
    const result = await getKeystoneManifest(repoDir);
    const review = result.artifacts!.find(a => a.format === 'review-findings/0.1')!;

    expect(review.review).toBeTruthy();
    expect(review.review!.format).toBe('review-findings');
    expect(review.review!.format_version).toBe('0.1');
    expect(review.review!.payload.findings).toHaveLength(1);
    expect(review.review!.payload.findings[0]).toMatchObject({
      id: 'F-1',
      file: 'src/scheduler.c',
      line: 214,
      severity: 'major',
      status: 'open'
    });
  });

  it('should include the parsed envelope payload for wiki/1 artifacts (second producer)', async () => {
    const result = await getKeystoneManifest(repoDir);
    const wiki = result.artifacts!.find(a => a.format === 'wiki/1')!;

    expect(wiki.producer).toBe('codex-wiki');
    expect(wiki.fresh).toBe(true);
    expect(wiki.wiki).toBeTruthy();
    expect(wiki.wiki!.generated_by).toBe('codex-wiki');
    expect(wiki.wiki!.payload.analysis.title).toBe('keystone-fixture');
    expect(wiki.wiki!.payload.wikiPages).toHaveLength(1);
    expect(wiki.wiki!.payload.wikiPages[0]).toMatchObject({ title: 'Protocol', category: 'Architecture' });
    expect(wiki.wiki!.payload.diagrams[0].type).toBe('dataflow');
    // the review artifact is untouched: two producers, one consumer
    expect(result.artifacts!.find(a => a.format === 'review-findings/0.1')!.wiki).toBeUndefined();
  });

  it('should stay fresh after an .aidev-only commit and go stale on a code commit (R2 rule v0.2)', async () => {
    const wrinkleDir = path.join(tempDir, 'wrinkle-repo');
    fs.mkdirSync(wrinkleDir);
    const g = (cmd: string) =>
      execSync(`git -c user.name=test -c user.email=test@example.com ${cmd}`, { cwd: wrinkleDir })
        .toString()
        .trim();
    g('init -b main');
    fs.writeFileSync(path.join(wrinkleDir, 'code.txt'), 'v1\n');
    g('add code.txt');
    g('commit -m code --no-gpg-sign');
    const pinned = g('rev-parse HEAD');

    fs.mkdirSync(path.join(wrinkleDir, '.aidev'), { recursive: true });
    fs.writeFileSync(
      path.join(wrinkleDir, '.aidev', 'manifest.yaml'),
      [
        'handshake: "0.1"',
        'project:',
        '  id: wrinkle-fixture',
        'artifacts:',
        '  - kind: review',
        '    path: .aidev/artifacts/review.json',
        '    format: review-findings/0.1',
        `    source_sha: ${pinned}`,
        ''
      ].join('\n')
    );
    g('add .aidev');
    g('commit -m "pin artifact" --no-gpg-sign');

    // manifest commit advanced HEAD, but no non-.aidev change → still fresh
    let result = await getKeystoneManifest(wrinkleDir);
    expect(result.artifacts![0].fresh).toBe(true);

    fs.writeFileSync(path.join(wrinkleDir, 'code.txt'), 'v2\n');
    g('add code.txt');
    g('commit -m "more code" --no-gpg-sign');
    result = await getKeystoneManifest(wrinkleDir);
    expect(result.artifacts![0].fresh).toBe(false);
  });

  it('should mark artifacts stale when the repo has no git HEAD', async () => {
    const nonGitDir = path.join(tempDir, 'non-git');
    fs.mkdirSync(path.join(nonGitDir, '.aidev'), { recursive: true });
    fs.writeFileSync(
      path.join(nonGitDir, '.aidev', 'manifest.yaml'),
      [
        'handshake: "0.1"',
        'project:',
        '  id: non-git-fixture',
        'artifacts:',
        '  - kind: wiki',
        '    path: .aidev/artifacts/wiki.json',
        '    format: wiki/1',
        `    source_sha: ${STALE_SHA}`,
        ''
      ].join('\n')
    );

    const result = await getKeystoneManifest(nonGitDir);
    expect(result.enabled).toBe(true);
    expect(result.headSha).toBeNull();
    expect(result.artifacts![0].fresh).toBe(false);
  });
});
