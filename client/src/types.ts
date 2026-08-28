export interface ChangeItem {
  id: string;
  title: string;
  status: string;
}

export interface TaskItem {
  id: string;
  title: string;
  status: 'todo' | 'wip' | 'done';
  assignee?: string;
  lineNumber: number;
}

export interface Linkage {
  source: string;
  target: string;
}

export interface Artifacts {
  proposal: string;
  spec: string;
  design: string;
  tasks: string;
  linkages?: Linkage[];
}

// Keystone handshake v0.1 (.aidev/manifest.yaml) — see thamam/keystone SPEC.md

export interface KeystoneFinding {
  id: string;
  file: string;
  line: number;
  side?: 'old' | 'new';
  severity: 'blocker' | 'major' | 'minor' | 'info';
  title: string;
  detail?: string;
  status: 'open' | 'resolved' | 'dismissed';
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
  fresh: boolean;
  headSha: string | null;
  review?: KeystoneReviewEnvelope | null;
  wiki?: KeystoneWikiEnvelope | null;
}

export interface KeystoneManifest {
  enabled: boolean;
  handshake?: string;
  project?: { id: string; repo?: string; repo_id?: string };
  headSha?: string | null;
  artifacts?: KeystoneArtifact[];
}
