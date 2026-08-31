import React, { useState, useEffect } from 'react';
import { KeystoneManifest, KeystoneArtifact, KeystoneFinding, KeystoneWikiEnvelope } from '../../../types';

interface Props {
  repoPath: string;
}

const KIND_COLORS: Record<string, string> = {
  spec: '#58a6ff',
  review: '#a371f7',
  wiki: '#3fb950',
  diagram: '#d29922',
  blueprint: '#f778ba',
  codegraph: '#8b949e',
  scene: '#8b949e'
};

const SEVERITY_COLORS: Record<KeystoneFinding['severity'], string> = {
  blocker: '#f85149',
  major: '#d29922',
  minor: '#58a6ff',
  info: '#8b949e'
};

const shortSha = (sha?: string | null) => (sha ? sha.slice(0, 7) : '???????');

const FreshnessBadge: React.FC<{ artifact: KeystoneArtifact }> = ({ artifact }) => {
  const style: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 'bold',
    padding: '2px 10px',
    borderRadius: '12px',
    border: '1px solid',
    whiteSpace: 'nowrap'
  };
  if (artifact.fresh) {
    return (
      <span style={{ ...style, color: '#3fb950', backgroundColor: '#23863622', borderColor: '#238636' }}>
        ● fresh
      </span>
    );
  }
  return (
    <span style={{ ...style, color: '#d29922', backgroundColor: '#d2992222', borderColor: '#d29922' }}>
      ● stale @ {shortSha(artifact.source_sha)}
    </span>
  );
};

const FindingRow: React.FC<{ finding: KeystoneFinding }> = ({ finding }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '6px 10px', borderTop: '1px solid #21262d', fontSize: '12px' }}>
    <span style={{ color: '#8b949e', fontFamily: 'monospace', minWidth: '42px' }}>{finding.id}</span>
    <span style={{
      color: SEVERITY_COLORS[finding.severity] || '#8b949e',
      fontWeight: 'bold',
      fontSize: '11px',
      textTransform: 'uppercase',
      minWidth: '58px'
    }}>
      {finding.severity}
    </span>
    <span style={{ color: '#c9d1d9', flex: 1, textDecoration: finding.status === 'resolved' ? 'line-through' : 'none' }}>
      {finding.title}
    </span>
    <span style={{ color: '#58a6ff', fontFamily: 'monospace', fontSize: '11px' }}>
      {finding.file}:{finding.line}
    </span>
  </div>
);

// wiki/1 is codex-wiki's CodexResponse (SPEC.md §3): an analysis, wiki pages, diagrams.
// The dashboard produces none of it — that is the point of the round-one exit test.
const WikiBody: React.FC<{ wiki: KeystoneWikiEnvelope }> = ({ wiki }) => {
  const { analysis, wikiPages, diagrams } = wiki.payload;
  const sections = analysis?.sections || [];
  return (
    <div style={{ borderTop: '1px solid #21262d' }}>
      <div style={{ padding: '8px 12px', fontSize: '12px', color: '#c9d1d9' }}>
        <span style={{ fontWeight: 'bold' }}>{analysis?.title || 'Untitled analysis'}</span>
        <span style={{ color: '#8b949e', marginLeft: '8px' }}>
          {sections.length} section{sections.length === 1 ? '' : 's'} · {wikiPages.length} page
          {wikiPages.length === 1 ? '' : 's'} · {diagrams.length} diagram{diagrams.length === 1 ? '' : 's'}
        </span>
      </div>
      {wikiPages.map((page, idx) => (
        <div
          key={`${page.title}-${idx}`}
          style={{ display: 'flex', alignItems: 'baseline', gap: '10px', padding: '6px 12px', borderTop: '1px solid #21262d', fontSize: '12px' }}
        >
          <span style={{ color: '#3fb950', fontSize: '11px', minWidth: '96px', textTransform: 'uppercase' }}>
            {page.category}
          </span>
          <span style={{ color: '#c9d1d9', fontWeight: 'bold', minWidth: '140px' }}>{page.title}</span>
          <span style={{ color: '#8b949e', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {page.summary}
          </span>
        </div>
      ))}
      {diagrams.length > 0 && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid #21262d', fontSize: '11px', color: '#d29922' }}>
          diagrams: {diagrams.map(d => `${d.title} (${d.type})`).join(' · ')}
        </div>
      )}
    </div>
  );
};

const ArtifactCard: React.FC<{ artifact: KeystoneArtifact }> = ({ artifact }) => {
  const findings = artifact.review?.payload?.findings || [];
  return (
    <div style={{ backgroundColor: '#161b22', border: '1px solid #30363d', borderRadius: '6px', marginBottom: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px' }}>
        <span style={{
          fontSize: '11px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          color: KIND_COLORS[artifact.kind] || '#8b949e',
          backgroundColor: `${KIND_COLORS[artifact.kind] || '#8b949e'}22`,
          border: `1px solid ${KIND_COLORS[artifact.kind] || '#8b949e'}88`,
          padding: '2px 8px',
          borderRadius: '12px'
        }}>
          {artifact.kind}
        </span>
        <span style={{ color: '#c9d1d9', fontFamily: 'monospace', fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {artifact.path}
        </span>
        {artifact.producer && (
          <span style={{ color: '#8b949e', fontSize: '11px' }}>by {artifact.producer}</span>
        )}
        <span style={{ color: '#8b949e', fontFamily: 'monospace', fontSize: '11px' }} title={artifact.source_sha}>
          {shortSha(artifact.source_sha)}
        </span>
        <FreshnessBadge artifact={artifact} />
      </div>
      {artifact.format === 'review-findings/0.1' && (
        findings.length > 0 ? (
          <div>{findings.map(f => <FindingRow key={f.id} finding={f} />)}</div>
        ) : (
          <div style={{ padding: '6px 12px', borderTop: '1px solid #21262d', color: '#8b949e', fontSize: '12px' }}>
            {artifact.review ? 'No findings.' : 'Could not read review-findings file.'}
          </div>
        )
      )}
      {artifact.format === 'wiki/1' && (
        artifact.wiki ? (
          <WikiBody wiki={artifact.wiki} />
        ) : (
          <div style={{ padding: '6px 12px', borderTop: '1px solid #21262d', color: '#8b949e', fontSize: '12px' }}>
            Could not read wiki file.
          </div>
        )
      )}
    </div>
  );
};

export const KeystoneView: React.FC<Props> = ({ repoPath }) => {
  const [manifest, setManifest] = useState<KeystoneManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setManifest(null);
    setError(null);
    fetch(`/api/keystone/manifest?path=${encodeURIComponent(repoPath)}`)
      .then(async res => {
        const data = await res.json().catch(() => null);
        // Preserve the server's {error} body; fall back to the status line.
        if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
        return data;
      })
      .then(data => {
        if (cancelled) return;
        if (data?.error) {
          setError(data.error);
        } else if (data) {
          setManifest(data);
        } else {
          setError('Empty or unparseable response from server');
        }
      })
      .catch(e => {
        if (!cancelled) setError(e.message);
      });
    return () => { cancelled = true; };
  }, [repoPath]);

  if (error) {
    return <div style={{ padding: '20px', color: '#f85149', fontSize: '13px' }}>Failed to load Keystone manifest: {error}</div>;
  }
  if (!manifest) {
    return <div style={{ padding: '20px', color: '#8b949e', fontSize: '13px' }}>Loading Keystone manifest...</div>;
  }
  if (!manifest.enabled) {
    return (
      <div style={{ padding: '20px', color: '#8b949e', fontSize: '13px' }}>
        No <span style={{ fontFamily: 'monospace' }}>.aidev/manifest.yaml</span> found in this repo — Keystone handshake not enabled.
      </div>
    );
  }

  const artifacts = manifest.artifacts || [];

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px', marginBottom: '14px' }}>
        <span style={{ fontSize: '15px', fontWeight: 'bold', color: '#c9d1d9' }}>
          {manifest.project?.id || 'Unknown project'}
        </span>
        <span style={{ fontSize: '11px', color: '#8b949e' }}>
          handshake {manifest.handshake || '?'}
        </span>
        <span style={{ fontSize: '11px', color: '#8b949e', fontFamily: 'monospace' }}>
          HEAD {shortSha(manifest.headSha)}
        </span>
        {manifest.project?.repo && (
          <span style={{ fontSize: '11px', color: '#8b949e' }}>{manifest.project.repo}</span>
        )}
      </div>
      {artifacts.length === 0 && (
        <div style={{ color: '#8b949e', fontSize: '13px' }}>Manifest has no artifacts.</div>
      )}
      {artifacts.map((a, idx) => <ArtifactCard key={`${a.kind}-${a.path}-${idx}`} artifact={a} />)}
    </div>
  );
};
