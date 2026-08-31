import { describe, it, expect } from 'vitest';
import { parseChangeConfig, stringifyChangeConfig } from '../src/utils/yamlConfig.js';

// Legacy hand-rolled parser, embedded verbatim from the pre-S14
// repoService.parseYaml / ProviderResolver.parseSimpleYaml as an oracle for
// the equivalence sweep below. Delete this if the parse semantics ever
// intentionally change — otherwise it becomes a false alarm.
function legacyParseYaml(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const clean = line.trim();
    if (!clean || clean.startsWith('#')) continue;
    const colonIndex = clean.indexOf(':');
    if (colonIndex !== -1) {
      const key = clean.substring(0, colonIndex).trim();
      let value = clean.substring(colonIndex + 1).trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.substring(1, value.length - 1);
      } else if (value.startsWith("'") && value.endsWith("'")) {
        value = value.substring(1, value.length - 1);
      }
      result[key] = value;
    }
  }
  return result;
}

// Shapes observed in the wild: the 7 real .openspec.yaml files under
// openspec/changes/archive/ in this repo (as of the S14 fix) are all flat
// string maps of the first three forms below (plain key: value, fully-quoted
// variant); the rest are synthetic variants of the same shapes.
const WILD_FIXTURES = [
  'schema: spec-driven\ncreated: 2026-07-21\n',
  'schema: spec-driven\ncreated: 2026-06-17\n',
  'schema: "spec-driven"\ncreated: "2026-07-22"\nproposeEngine: "antigravity"\n',
  // Synthetic variants
  'agentProvider: claude\n',
  'agentProvider: codex\n',
  '# comment line\nschema: spec-driven\ncreated: 2026-06-17\n',
  "schema: 'spec-driven'\ncreated: '2026-06-17'\n",
  'schema: spec-driven\ncreated: 2026-06-17\ndescription:\n',
  'description: "quoted value with # hash and: colon"\n',
  '\n\n  \n# only comments\n',
  '',
];

describe('yamlConfig - parseChangeConfig', () => {
  it.each(WILD_FIXTURES.map((f, i) => [i, f] as const))(
    'matches the legacy naive parser on wild fixture #%i',
    (_i, fixture) => {
      expect(parseChangeConfig(fixture)).toEqual(legacyParseYaml(fixture));
    }
  );

  it('keeps date-like scalars as strings (failsafe schema, no Date coercion)', () => {
    const parsed = parseChangeConfig('created: 2026-06-17\n');
    expect(parsed.created).toBe('2026-06-17');
    expect(typeof parsed.created).toBe('string');
  });

  it('yields an empty config for non-map documents (bare scalar, list)', () => {
    expect(parseChangeConfig('just a string\n')).toEqual({});
    expect(parseChangeConfig('- a\n- b\n')).toEqual({});
  });

  it('throws on malformed YAML where the legacy parser silently mangled values', () => {
    // Intentional divergence: 'a: b: c' is invalid YAML (': ' ends a plain
    // scalar). The naive parser returned { a: 'b: c' }; both old writers only
    // ever produced valid YAML, so this shape can only come from hand edits.
    expect(() => parseChangeConfig('description: value with: colon\n')).toThrow();
    expect(legacyParseYaml('description: value with: colon\n')).toEqual({
      description: 'value with: colon',
    });
  });

  it('drops non-string (nested map/list) values so consumers never see objects', () => {
    // Hand-edited nested config — previously the naive parser collapsed it to
    // flat garbage keys; now it parses structurally and the string filter
    // keeps consumers like ProviderResolver's toLowerCase() safe.
    const parsed = parseChangeConfig('schema: spec-driven\nagentProvider:\n  name: claude\n');
    expect(parsed).toEqual({ schema: 'spec-driven' });
  });
});

describe('yamlConfig - stringifyChangeConfig', () => {
  it('round-trips a multiline description without corruption (S14)', () => {
    const data = {
      schema: 'spec-driven',
      created: '2026-08-31',
      description: 'line one\nline two',
      proposeEngine: 'claude',
    };
    expect(parseChangeConfig(stringifyChangeConfig(data))).toEqual(data);
  });

  it('round-trips quotes, backslashes and a trailing backslash', () => {
    const data = {
      description: 'he said "hi" \\ path\\',
      schema: 'spec-driven',
    };
    expect(parseChangeConfig(stringifyChangeConfig(data))).toEqual(data);
  });

  it('drops undefined values like the old hand-rolled writer', () => {
    const written = stringifyChangeConfig({ schema: 'spec-driven', nonExistent: undefined });
    expect(written).not.toContain('nonExistent');
    expect(parseChangeConfig(written)).toEqual({ schema: 'spec-driven' });
  });

  it('keeps date-like and numeric-looking strings as strings through a round-trip', () => {
    const data = { created: '2026-06-17', count: '42', flag: 'true' };
    expect(parseChangeConfig(stringifyChangeConfig(data))).toEqual(data);
  });
});
