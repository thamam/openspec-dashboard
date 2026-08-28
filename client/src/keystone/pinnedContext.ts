/**
 * client/src/keystone/pinnedContext.ts
 * Keystone CHROME.md v0.2 §1 — pinned context + drift flag (L1 adoption).
 * Pure: URL search string in, pin out; drift judged against the selected workspace.
 * Mirrors Theia's src/modules/keystone/pinnedContext.ts so both tools agree on
 * what "drifted" means.
 */

export interface PinnedContext {
  /** Normalized project id (manifest project.id shape). */
  project: string;
  /** Pinned commit as given (may be short); compared by prefix. */
  sha?: string;
}

/** Coerce a free-form name into the manifest's project_id shape: ^[a-z0-9][a-z0-9-]*$. */
export function toProjectId(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Last path segment of a repo path or owner/name slug, normalized. */
export function toProjectIdFromSegment(raw: string): string {
  const segments = raw.replace(/\/+$/, '').split('/');
  return toProjectId(segments[segments.length - 1] || raw);
}

/**
 * Read `?project=` (or the `path` alias this dashboard predates `project` with)
 * plus `?sha=`. Returns null when the page was opened without Deck context.
 */
export function readPinnedContext(search: string): PinnedContext | null {
  const params = new URLSearchParams(search);
  const project = params.get('project')?.trim();
  const path = params.get('path')?.trim();
  const sha = params.get('sha')?.trim() || undefined;
  const raw = project || path;
  if (!raw) return null;
  return { project: toProjectIdFromSegment(raw), sha };
}

/**
 * Drifted iff the in-tool selection departs from the pin (CHROME.md §1).
 * Unknown fields on the current selection are not treated as departure —
 * only a known, different value drifts.
 */
export function isDrifted(
  pin: PinnedContext,
  current: { repo?: string | null; headSha?: string | null }
): boolean {
  if (current.repo && toProjectIdFromSegment(current.repo) !== pin.project) return true;
  if (
    pin.sha &&
    current.headSha &&
    !current.headSha.toLowerCase().startsWith(pin.sha.toLowerCase())
  ) {
    return true;
  }
  return false;
}
