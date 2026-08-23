import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { parse as parseYamlDocument } from 'yaml';
import { resolvePath } from './repoService.js';

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

export interface KeystoneArtifact {
  kind: string;
  path: string;
  format: string;
  producer?: string;
  source_sha: string;
  updated?: string;
  // SPEC.md R2 (freshness): fresh iff source_sha equals the currently pinned commit (HEAD)
  fresh: boolean;
  headSha: string | null;
  // Parsed envelope for review-findings/0.1 artifacts so the client can render findings
  review?: KeystoneReviewEnvelope | null;
}

export interface KeystoneManifestResult {
  enabled: boolean;
  handshake?: string;
  project?: { id: string; repo?: string; repo_id?: string };
  headSha?: string | null;
  artifacts?: KeystoneArtifact[];
}

function gitHeadSha(cwd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('git', ['rev-parse', 'HEAD'], { cwd }, (error, stdout) => {
      if (error) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function readReviewEnvelope(filePath: string): KeystoneReviewEnvelope | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    console.error(`Failed to read review-findings artifact at ${filePath}`, e);
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

  const rows: any[] = Array.isArray(manifest?.artifacts) ? manifest.artifacts : [];
  const artifacts: KeystoneArtifact[] = rows.map((row) => {
    const artifact: KeystoneArtifact = {
      ...row,
      fresh: headSha !== null && row.source_sha === headSha,
      headSha
    };
    if (row.format === 'review-findings/0.1' && row.path) {
      artifact.review = readReviewEnvelope(path.join(resolved, row.path));
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
