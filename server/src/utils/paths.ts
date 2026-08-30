import path from 'path';
import fs from 'fs';

// Shell-metacharacter denylist shared by the REST surface
// (openspecController) and the socket surface (AgentService.set_repo_path).
export const SHELL_METACHAR_PATTERN = /[$`;&|<>()\n\r"'\\]/;

// S6: central path-traversal guards.
//
// Two input domains, two guards:
// - isSafeName/assertSafeName for change-name-style inputs that must be a
//   SINGLE path segment: no separators, never '.'/'..', no leading '-'
//   (a leading dash would be re-read as a flag by a downstream CLI parser).
// - resolveUnder for manifest-style RELATIVE paths that legitimately contain
//   '/' (e.g. '.aidev/artifacts/review.json') — those get a containment check
//   against their intended root instead of the no-separator regex.
//
// Distinct from repoService's isSafeCliName, whose domain is CLI argv elements
// (schema/engine/artifact names) where '_' is not accepted by the openspec CLI.

const SAFE_NAME_RE = /^[a-zA-Z0-9._-]+$/;

export function isSafeName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    SAFE_NAME_RE.test(value) &&
    value !== '.' &&
    value !== '..' &&
    !value.startsWith('-')
  );
}

export function assertSafeName(value: unknown, label = 'name'): asserts value is string {
  if (!isSafeName(value)) {
    throw new Error(`Invalid ${label}: must be a single safe path segment (got ${JSON.stringify(value)})`);
  }
}

/**
 * Resolve relPath against root and verify the result stays under root.
 * path.resolve semantics: an absolute relPath overrides root and is then
 * caught by the containment check. Returns null when the path escapes.
 * Note: this is a string-level check — it does not follow symlinks.
 */
export function resolveUnder(root: string, relPath: unknown): string | null {
  if (typeof relPath !== 'string' || relPath.length === 0) return null;
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relPath);
  if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep)) {
    return null;
  }
  return resolved;
}

/**
 * resolveUnder + symlink resolution, for WRITE targets: a symlink inside
 * root pointing outside would pass the string-level check and then be
 * followed by writeFileSync. Both root and the target's nearest existing
 * ancestor are canonicalized with realpath before the containment check.
 * Returns the canonical target path, or null when it escapes (or root does
 * not exist). Note: still subject to TOCTOU between check and write — the
 * window is acceptable for a local single-user dashboard.
 */
export function resolveUnderReal(root: string, relPath: unknown): string | null {
  const resolved = resolveUnder(root, relPath);
  if (!resolved) return null;
  let realRoot: string;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    return null;
  }
  // Walk up to the nearest existing ancestor (the target itself may not
  // exist yet) and canonicalize it.
  let ancestor = resolved;
  const missing: string[] = [];
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return null;
    ancestor = parent;
  }
  let realAncestor: string;
  try {
    realAncestor = fs.realpathSync(ancestor);
  } catch {
    return null;
  }
  const realTarget = path.join(realAncestor, ...missing);
  if (realTarget !== realRoot && !realTarget.startsWith(realRoot + path.sep)) {
    return null;
  }
  return realTarget;
}

