import { parse, stringify } from 'yaml';

/**
 * .openspec.yaml change configs are flat string maps (schema, created,
 * description, proposeEngine, agentProvider) written by the openspec CLI and
 * edited by repoService/ProviderResolver. The failsafe schema keeps every
 * scalar a string — no Date/boolean coercion — matching the semantics of the
 * hand-rolled parser this replaced (S14), while stringify() correctly escapes
 * multiline/quoted values instead of corrupting the file.
 */
export function parseChangeConfig(content: string): Record<string, string> {
  const parsed: unknown = parse(content, { schema: 'failsafe' });
  // A non-map document (bare scalar, list, empty file) yields no config keys —
  // same as the old line-based parser, which found no 'key: value' lines.
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as Record<string, string>;
}

export function stringifyChangeConfig(data: Record<string, string | undefined>): string {
  // yaml.stringify drops undefined values, like the old hand-rolled writer.
  return stringify(data);
}
