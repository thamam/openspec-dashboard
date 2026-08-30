import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { parse as parseYamlDocument } from 'yaml';
import { resolvePath } from './repoService.js';
import { resolveUnder } from '../utils/paths.js';

// Keystone handshake v0.1 manifest reader (thamam/keystone SPEC.md §1).
// The dashboard consumes .aidev/manifest.yaml so it can render artifacts it did not produce.

export interface KeystoneFinding {
  id: string;
  file: string;
  line: number;
  side?: 'old' | 'new';
  severity: 'blocker' | 'major' | 'minor' | 'info';
  title: string;
  detail?: string;
  status: 'open' | 'resolved' | 'dismissed';
  provenance?: Array<{ path: string; lines: [number, number] }>;
  trace?: string[];
}

export interface KeystoneReviewEnvelope {
  format: string;
  format_version: string;
  project_id: string;
  source_sha: string;
  generated_by: string;
  generated_at: string;
  payload: { findings: KeystoneFinding[] };
}

export interface KeystoneWikiPage {
  title: string;
  summary: string;
  category: string;
  content: string;
}

export interface KeystoneDiagram {
  title: string;
  type: 'architecture' | 'dependency' | 'dataflow' | 'relations';
  mermaid: string;
}

export interface KeystoneWikiEnvelope {
  format: string;
  format_version: string;
  project_id: string;
  source_sha: string;
  generated_by: string;
  generated_at: string;
  payload: {
    analysis: { title: string; sections: Array<{ heading: string; content: string; diagram: string | null }> };
    wikiPages: KeystoneWikiPage[];
    diagrams: KeystoneDiagram[];
    suggestedQuestions: string[];
  };
}

export interface KeystoneArtifact {
  kind: string;
  path: string;
  format: string;
  producer?: string;
  source_sha: string;
  updated?: string;
  // SPEC.md R2 (freshness, rule v0.2): fresh iff the effective commits (last commit
  // touching paths outside .aidev/) of source_sha and HEAD match
  fresh: boolean;
  headSha: string | null;
  // Parsed envelope for review-findings/0.1 artifacts so the client can render findings
  review?: KeystoneReviewEnvelope | null;
  // Parsed envelope for wiki/1 artifacts (codex-wiki's CodexResponse — SPEC.md §3)
  wiki?: KeystoneWikiEnvelope | null;
}

export interface KeystoneManifestResult {
  enabled: boolean;
  handshake?: string;
  project?: { id: string; repo?: string; repo_id?: string };
  headSha?: string | null;
  artifacts?: KeystoneArtifact[];
}

function git(cwd: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', args, { cwd }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function gitHeadSha(cwd: string): Promise<string | null> {
  return git(cwd, ['rev-parse', 'HEAD']);
}

// R2 rule v0.2: the effective commit of a ref is the last commit reachable from it
// touching any path outside .aidev/ — so committing the manifest itself never ages
// its own artifacts. Null when the ref is unknown or history is .aidev-only.
function effectiveCommit(cwd: string, ref: string): Promise<string | null> {
  return git(cwd, ['rev-list', '-1', ref, '--', ':(exclude).aidev']).then((out) => out || null);
}

function readEnvelope<T>(filePath: string, label: string): T | null {
  // A row pointing at a file that isn't there is a normal manifest state (artifact
  // not generated yet) — worth one line, not a stack. Malformed JSON is the real error.
  if (!fs.existsSync(filePath)) {
    console.warn(`Keystone: ${label} artifact missing at ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch (e) {
    console.error(`Failed to read ${label} artifact at ${filePath}`, e);
    return null;
  }
}

export async function getKeystoneManifest(repoPath: string): Promise<KeystoneManifestResult> {
  const resolved = resolvePath(repoPath);
  const manifestPath = path.join(resolved, '.aidev', 'manifest.yaml');

  // Mirror spec-design-yard's standalone-mode pattern: no manifest, no Keystone (SPEC.md R4 note)
  if (!fs.existsSync(manifestPath)) {
    return { enabled: false };
  }

  const manifest = parseYamlDocument(fs.readFileSync(manifestPath, 'utf-8'));
  const headSha = await gitHeadSha(resolved);

  const effectiveHead = headSha ? await effectiveCommit(resolved, 'HEAD') : null;

  const rows: any[] = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const effectiveBySha = new Map<string, string | null>();
  for (const row of rows) {
    if (row.source_sha && !effectiveBySha.has(row.source_sha)) {
      effectiveBySha.set(row.source_sha, headSha ? await effectiveCommit(resolved, row.source_sha) : null);
    }
  }
  const artifacts: KeystoneArtifact[] = rows.map((row) => {
    const artifact: KeystoneArtifact = {
      ...row,
      fresh: headSha !== null && (effectiveBySha.get(row.source_sha) ?? null) === effectiveHead,
      headSha
    };
    // S6: row.path comes from the repo's own manifest, which may be malicious —
    // it legitimately contains '/', so enforce containment under the repo root
    // instead of a no-separator regex. Out-of-root rows are skipped, not read.
    const envelopePath = row.path ? resolveUnder(resolved, row.path) : null;
    if (row.path && !envelopePath) {
      console.warn(`Keystone: artifact path escapes repo root, skipped: ${JSON.stringify(row.path)}`);
    }
    if (row.format === 'review-findings/0.1' && envelopePath) {
      artifact.review = readEnvelope<KeystoneReviewEnvelope>(envelopePath, 'review-findings');
    }
    if (row.format === 'wiki/1' && envelopePath) {
      artifact.wiki = readEnvelope<KeystoneWikiEnvelope>(envelopePath, 'wiki');
    }
    return artifact;
  });

  return {
    enabled: true,
    handshake: manifest?.handshake,
    project: manifest?.project,
    headSha,
    artifacts
  };
}
