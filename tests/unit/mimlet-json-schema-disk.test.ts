import { createHmac } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  clearGeneratorCache,
  configureGeneratorCache,
  jsonSchemaAdapter,
} from '../../packages/json-schema/src/index.js';
import type { JsonSchema, JsonSchemaOptions } from '../../packages/json-schema/src/index.js';
import * as api from './fixtures/zod-crm.gen.js';

const posix = typeof process.getuid === 'function';
const root = posix && process.getuid!() === 0;
let directory: string;
const entries = () =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.entry'))
    .sort();
const disk = () => configureGeneratorCache().disk;
/** Disk cache on, in-memory sharing off: every adapter goes to the disk cache. */
const onDisk = (settings: Record<string, unknown> = {}) =>
  configureGeneratorCache({ maxEntries: 0, disk: { directory, ...settings } });

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'mimlet-disk-'));
});
afterEach(() => {
  vi.restoreAllMocks();
  configureGeneratorCache({ maxEntries: 256, disk: false });
  clearGeneratorCache();
  if (posix) {
    chmodSync(directory, 0o700);
  }
  rmSync(directory, { recursive: true, force: true });
});

/** Values, identity and validation results that must not depend on where the validator came from. */
function observe(schema: JsonSchema, options: JsonSchemaOptions = {}) {
  const adapter = jsonSchemaAdapter(globalThis.structuredClone(schema), options);
  const session = adapter.session(7);
  const values = [1, 2, 3].map((seed) => adapter.create(adapter.session(seed)));
  const list = [adapter.create(session), adapter.create(session)];
  return {
    identity: adapter.identity,
    values,
    list,
    issues: [
      adapter.issues({ unexpected: true }),
      adapter.issues(null),
      ...[...values, ...list].flatMap(mutations).map((value) => adapter.issues(value)),
    ],
  };
}

/** Wrong values near a valid one: each field removed, emptied or given another type. */
function mutations(value: unknown): unknown[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [value === null ? 0 : null, 'text', 12.5, [value]];
  }
  const record = value as Record<string, unknown>;
  const changed: unknown[] = [];
  for (const key of Object.keys(record)) {
    const { [key]: field, ...rest } = record;
    changed.push(rest);
    for (const replacement of [null, 'text', -1, 1.5, true, [], {}]) {
      changed.push({ ...record, [key]: replacement });
    }
    if (field && typeof field === 'object' && !Array.isArray(field)) {
      for (const inner of mutations(field).slice(0, 12)) {
        changed.push({ ...record, [key]: inner });
      }
    }
  }
  changed.push({ ...record, extra: 'unexpected' });
  return changed;
}

const convert = (target: 'draft-07' | 'draft-2020-12') =>
  Object.values(api)
    .filter((schema) => schema._zod.def.type !== 'void')
    .map(
      (schema) =>
        z.toJSONSchema(schema, { io: 'input', target, unrepresentable: 'throw' }) as JsonSchema
    );
// Hey API exports equal schemas under several names.
const distinct = (schemas: JsonSchema[]) =>
  [...new Map(schemas.map((schema) => [JSON.stringify(schema), schema]))].map(
    ([, schema]) => schema
  );
const generated = distinct(convert('draft-2020-12'));
const item = 'https://example.test/item';
const corpus: Array<readonly [JsonSchema, JsonSchemaOptions]> = [
  ...generated.map((schema) => [schema, {}] as const),
  ...generated.slice(0, 6).map((schema) => [schema, { profile: 'realistic' }] as const),
  ...generated.slice(0, 6).map((schema) => [schema, { profile: 'boundary' }] as const),
  ...distinct(convert('draft-07'))
    .slice(0, 6)
    .map((schema) => [schema, { dialect: 'draft-07' }] as const),
  [
    { type: 'array', items: { $ref: item }, minItems: 2, uniqueItems: true },
    {
      references: {
        [item]: { type: 'string', format: 'email' },
        'https://example.test/unused': { type: 'nope' },
      },
    },
  ],
  [
    {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        at: { type: 'string', format: 'date-time' },
        code: { type: 'string', pattern: '^[A-Z]{2}-\\d{3}$' },
        tag: { enum: ['a', { b: [1, 2] }] },
      },
      required: ['at', 'code', 'tag'],
    },
    {},
  ],
  [
    { $id: 'https://example.test/root', type: 'object', properties: { next: { $ref: '#' } } },
    { profile: 'random' },
  ],
  [
    {
      type: 'object',
      $defs: { node: { type: 'object', properties: { child: { $ref: '#/$defs/node' } } } },
      properties: { root: { $ref: '#/$defs/node' }, 'x-label': { type: 'string' } },
      'x-doc': 'annotated',
    },
    { annotations: ['x-doc'], dialect: 'draft-2019-09' },
  ],
  [
    {
      type: 'object',
      properties: {
        kind: { enum: ['a', 'b'] },
        size: { type: 'number', multipleOf: 0.5, exclusiveMinimum: 0, maximum: 10 },
        pair: { type: 'array', prefixItems: [{ type: 'integer' }, { const: { x: [1] } }] },
        word: { type: 'string', not: { const: 'no' }, maxLength: 5 },
      },
      patternProperties: { '^x-': { type: 'boolean' } },
      propertyNames: { maxLength: 8 },
      required: ['kind', 'size'],
      if: { properties: { kind: { const: 'a' } } },
      then: { required: ['word'] },
      else: { oneOf: [{ required: ['pair'] }, { maxProperties: 2 }] },
      unevaluatedProperties: false,
    },
    { profile: 'random' },
  ],
];

describe('generator disk cache', () => {
  it('is off by default', () => {
    expect(configureGeneratorCache().disk).toBeUndefined();
    jsonSchemaAdapter({ type: 'integer', minimum: 3, maximum: 3 }).create();
    expect(readdirSync(directory)).toEqual([]);
  });

  it(
    'loads validators that generate, identify and report exactly like compiled ones',
    { timeout: 120_000 },
    () => {
      configureGeneratorCache({ maxEntries: 0 });
      const compiled = corpus.map(([schema, options]) => observe(schema, options));
      // Thousands of rejected values, each with Ajv's issues.
      const reports = compiled.flatMap(({ issues }) => issues);
      expect(reports.filter((issues) => issues.length > 0).length).toBeGreaterThan(5_000);
      onDisk();
      // The first pass compiles and writes, the second loads every validator from disk.
      expect(corpus.map(([schema, options]) => observe(schema, options))).toEqual(compiled);
      // One entry per distinct validator: the realistic and boundary profiles load the one
      // the default profile wrote.
      const written = entries().length;
      expect(written).toBe(corpus.length - 12);
      expect(disk()).toMatchObject({ hits: 12, misses: written });
      expect(corpus.map(([schema, options]) => observe(schema, options))).toEqual(compiled);
      expect(disk()).toMatchObject({ hits: 12 + corpus.length, misses: written });
      expect(entries()).toHaveLength(written);
      expect(readdirSync(directory).filter((name) => name.endsWith('.tmp'))).toEqual([]);
    }
  );

  it('works with in-memory sharing too, and only for preparations it has not kept', () => {
    configureGeneratorCache({ disk: { directory } });
    const schema = { type: 'string', minLength: 4, maxLength: 4 } as const;
    const first = jsonSchemaAdapter(schema).create();
    jsonSchemaAdapter(schema);
    expect(disk()).toMatchObject({ hits: 0, misses: 1 });
    clearGeneratorCache();
    expect(jsonSchemaAdapter(schema).create()).toBe(first);
    expect(disk()).toMatchObject({ hits: 1, misses: 1 });
    expect(configureGeneratorCache()).toMatchObject({ maxEntries: 256, entries: 1 });
  });

  it('keys entries by content, validation options and versions', () => {
    onDisk();
    const schema = { type: 'integer', minimum: 1, maximum: 9 } as const;
    jsonSchemaAdapter(schema);
    jsonSchemaAdapter({ ...schema }, { profile: 'random', name: 'other' } as JsonSchemaOptions);
    expect(entries()).toHaveLength(1);
    expect(disk()).toMatchObject({ hits: 1, misses: 1 });
    // Everything that changes the compiled code or what preparation derives from it.
    jsonSchemaAdapter({ maximum: 9, minimum: 1, type: 'integer' });
    jsonSchemaAdapter(schema, { dialect: 'draft-07' });
    jsonSchemaAdapter(schema, { maxSchemaNodes: 50 });
    jsonSchemaAdapter(schema, { annotations: ['x-unused'] });
    jsonSchemaAdapter(schema, { formatsIdentity: 'formats/v2' });
    jsonSchemaAdapter(schema, { extensionIdentity: 'extensions/v2' });
    jsonSchemaAdapter(schema, { references: { [item]: { type: 'string' } } });
    expect(entries()).toHaveLength(8);
    expect(disk()).toMatchObject({ hits: 1, misses: 8 });

    // Another Ajv or Node major: the same content gets a new entry.
    const ajv = createRequire(new URL('../../packages/json-schema/package.json', import.meta.url))(
      'ajv/package.json'
    ) as { version: string };
    const version = ajv.version;
    try {
      ajv.version = '8.99.0';
      onDisk();
      jsonSchemaAdapter(schema);
    } finally {
      ajv.version = version;
    }
    const node = Object.getOwnPropertyDescriptor(process.versions, 'node')!;
    try {
      Object.defineProperty(process.versions, 'node', { ...node, value: '99.0.0' });
      onDisk();
      jsonSchemaAdapter(schema);
    } finally {
      Object.defineProperty(process.versions, 'node', node);
    }
    expect(entries()).toHaveLength(10);
    onDisk();
    jsonSchemaAdapter(schema);
    expect(disk()).toMatchObject({ hits: 1, misses: 0 });
  });

  it('recompiles and rewrites corrupt, partial, tampered and misplaced entries', () => {
    onDisk();
    const schema = generated[0]!;
    const expected = observe(schema);
    const [name] = entries();
    const file = join(directory, name!);
    const valid = readFileSync(file, 'utf8');
    const lines = valid.split('\n');
    const other = { type: 'boolean' } as const;
    jsonSchemaAdapter(other);
    const foreign = readFileSync(
      join(
        directory,
        entries().find((entry) => entry !== name)!
      )
    );
    const damaged = [
      '',
      valid.slice(0, valid.length >> 1),
      valid.slice(0, valid.indexOf('\n', valid.indexOf('\n') + 1)),
      valid.replace('mimlet-generator-cache 1', 'mimlet-generator-cache 0'),
      [lines[0], '0'.repeat(64), ...lines.slice(2)].join('\n'),
      valid.replace('"use strict"', '"use  strict"'),
      valid.replace('module.exports', 'module.exportz'),
      foreign,
      '\u0000\u0001 binary',
    ];
    for (const content of damaged) {
      writeFileSync(file, content);
      const before = disk()!;
      expect(observe(schema)).toEqual(expected);
      expect(disk()).toMatchObject({ hits: before.hits, misses: before.misses + 1 });
      // Rewritten: the next preparation loads it.
      expect(readFileSync(file, 'utf8')).toBe(valid);
      expect(observe(schema)).toEqual(expected);
      expect(disk()).toMatchObject({ hits: before.hits + 1 });
    }
    // A removed entry is compiled and written again.
    rmSync(file);
    expect(observe(schema)).toEqual(expected);
    expect(existsSync(file)).toBe(true);
  });

  it('runs only signed entries, and lets them load only Ajv runtime helpers', () => {
    onDisk();
    const schema = { type: 'string', format: 'email' } as const;
    const value = jsonSchemaAdapter(schema).create();
    const [name] = entries();
    const file = join(directory, name!);
    const secret = readFileSync(join(directory, 'key'), 'utf8');
    const valid = readFileSync(file, 'utf8');
    const header = valid.split('\n')[2]!;
    const sign = (code: string) => {
      const body = `${header}\n${code}`;
      return `mimlet-generator-cache 1\n${createHmac('sha256', secret).update(body).digest('hex')}\n${body}`;
    };
    const marker = '__mimletDiskCacheTest';
    try {
      // Signed with another key: never run.
      const unsigned = `globalThis.${marker} = 'ran'; module.exports = () => true;`;
      const body = `${header}\n${unsigned}`;
      writeFileSync(
        file,
        `mimlet-generator-cache 1\n${createHmac('sha256', 'f'.repeat(64)).update(body).digest('hex')}\n${body}`
      );
      expect(jsonSchemaAdapter(schema).create()).toBe(value);
      expect(Reflect.get(globalThis, marker)).toBeUndefined();
      // Signed, but loading another module: rejected when it asks for it.
      writeFileSync(file, sign(`require("node:fs"); module.exports = () => true;`));
      expect(jsonSchemaAdapter(schema).create()).toBe(value);
      expect(jsonSchemaAdapter(schema).check('not an email')).toBe(false);
      // Signed code that is not a validator.
      writeFileSync(file, sign(`module.exports = 42;`));
      expect(jsonSchemaAdapter(schema).check('not an email')).toBe(false);
      expect(readFileSync(file, 'utf8')).toBe(valid);
    } finally {
      Reflect.deleteProperty(globalThis, marker);
    }
  });

  it.runIf(posix && !root)('uses only a private key file of the current user', () => {
    const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const schema = { type: 'integer', minimum: 5, maximum: 5 } as const;
    onDisk();
    jsonSchemaAdapter(schema);
    const key = join(directory, 'key');
    expect(statSync(key).mode & 0o777).toBe(0o600);
    expect(readFileSync(key, 'utf8')).toMatch(/^[0-9a-f]{64}$/);
    // Readable by others: the cache is not used, with one warning.
    chmodSync(key, 0o644);
    expect(onDisk().disk).toBeDefined();
    expect(jsonSchemaAdapter(schema).create()).toBe(5);
    expect(jsonSchemaAdapter(schema).create()).toBe(5);
    expect(configureGeneratorCache().disk).toBeUndefined();
    expect(warnings).toHaveBeenCalledTimes(1);
    expect(String(warnings.mock.calls[0]![0])).toMatch(
      /generator disk cache is not used: .*key must belong to the current user and be readable only by them/
    );
    // Not a regular file.
    rmSync(key);
    symlinkSync(join(directory, entries()[0]!), key);
    onDisk();
    expect(jsonSchemaAdapter(schema).create()).toBe(5);
    expect(String(warnings.mock.calls[1]![0])).toMatch(/key is not a regular file/);
    // Content this cache did not write is replaced with a new key, and entries signed with
    // the old key are written again.
    rmSync(key);
    writeFileSync(key, 'not a key', { mode: 0o600 });
    onDisk();
    expect(jsonSchemaAdapter(schema).create()).toBe(5);
    expect(readFileSync(key, 'utf8')).toMatch(/^[0-9a-f]{64}$/);
    expect(disk()).toMatchObject({ hits: 0, misses: 1 });
    expect(jsonSchemaAdapter(schema).create()).toBe(5);
    expect(disk()).toMatchObject({ hits: 1, misses: 1 });
    expect(warnings).toHaveBeenCalledTimes(2);
  });

  it.runIf(posix && !root)('compiles in memory when the directory cannot be used', () => {
    const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const schema = { type: 'integer', minimum: 6, maximum: 6 } as const;
    onDisk();
    jsonSchemaAdapter(schema);
    // Read-only: entries are read but not written.
    chmodSync(directory, 0o500);
    expect(jsonSchemaAdapter(schema).create()).toBe(6);
    expect(jsonSchemaAdapter({ type: 'integer', minimum: 7, maximum: 7 }).create()).toBe(7);
    expect(disk()).toMatchObject({ hits: 1, misses: 2 });
    expect(warnings).not.toHaveBeenCalled();
    chmodSync(directory, 0o700);
    // A file where the directory should be.
    const file = join(directory, 'file');
    writeFileSync(file, '');
    configureGeneratorCache({ maxEntries: 0, disk: { directory: file } });
    expect(jsonSchemaAdapter(schema).create()).toBe(6);
    expect(configureGeneratorCache().disk).toBeUndefined();
    expect(warnings).toHaveBeenCalledTimes(1);
  });

  it('keeps the most recently used entries within the bounds and removes stale temporary files', () => {
    onDisk({ maxEntries: 3 });
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const fake = (index: number, size = 10) => {
      const file = join(directory, `${index.toString(16).padStart(64, '0')}.entry`);
      writeFileSync(file, 'x'.repeat(size));
      const time = new Date(old.getTime() + index * 1000);
      utimesSync(file, time, time);
      return file;
    };
    const kept = [fake(1), fake(2), fake(3), fake(4)];
    const staleTemporary = join(directory, `${'a'.repeat(64)}.entry.123.abcdefabcdef.tmp`);
    const freshTemporary = join(directory, `key.456.abcdefabcdef.tmp`);
    writeFileSync(staleTemporary, '');
    utimesSync(staleTemporary, old, old);
    writeFileSync(freshTemporary, '');
    writeFileSync(join(directory, 'unrelated.txt'), '');
    // The first write of a process prunes: the new entry and the two newest remain.
    jsonSchemaAdapter({ type: 'null' });
    expect(entries()).toHaveLength(3);
    expect(kept.map((file) => existsSync(file))).toEqual([false, false, true, true]);
    expect(existsSync(staleTemporary)).toBe(false);
    expect(existsSync(freshTemporary)).toBe(true);
    expect(existsSync(join(directory, 'unrelated.txt'))).toBe(true);
    // A hit marks an entry as recently used.
    const [entry] = entries().filter((name) => !name.startsWith('0000'));
    utimesSync(join(directory, entry!), old, old);
    jsonSchemaAdapter({ type: 'null' });
    expect(disk()).toMatchObject({ hits: 1 });
    expect(statSync(join(directory, entry!)).mtimeMs).toBeGreaterThan(Date.now() - 60_000);

    // The byte bound counts too.
    for (const name of entries()) {
      rmSync(join(directory, name));
    }
    onDisk();
    jsonSchemaAdapter({ type: 'boolean' });
    const [real] = entries();
    const size = statSync(join(directory, real!)).size;
    rmSync(join(directory, real!));
    const older = fake(5, 20);
    const newer = fake(6, 20);
    onDisk({ maxEntries: 10, maxBytes: size + 25 });
    jsonSchemaAdapter({ type: 'boolean' });
    expect([existsSync(join(directory, real!)), existsSync(newer), existsSync(older)]).toEqual([
      true,
      true,
      false,
    ]);
  });

  it('never stores validators with callbacks', () => {
    onDisk();
    jsonSchemaAdapter(
      { type: 'string', format: 'code' },
      {
        formats: { code: { validate: (value) => value === 'a', generate: () => 'a' } },
        formatsIdentity: 'codes/v1',
      }
    ).create();
    jsonSchemaAdapter(
      { type: 'integer', minimum: 1, maximum: 2, 'x-is': 2 },
      { keywords: { 'x-is': (constraint, value) => value === constraint }, extensionIdentity: 'v1' }
    ).create();
    expect(Object.is(jsonSchemaAdapter({ const: -0 }).create(), -0)).toBe(true);
    expect(entries()).toEqual([]);
    expect(disk()).toMatchObject({ hits: 0, misses: 0 });
  });

  it('checks its settings, and is unavailable without Node built-ins', () => {
    const invalid: [unknown, ErrorConstructor][] = [
      ['yes', TypeError],
      [[], TypeError],
      [null, TypeError],
      [{ directory: '' }, TypeError],
      [{ directory: 3 }, TypeError],
      [{ maxEntries: 0 }, RangeError],
      [{ maxBytes: 1.5 }, RangeError],
      [{ maxEntries: '10' }, RangeError],
    ];
    for (const [value, type] of invalid) {
      expect(() => configureGeneratorCache({ disk: value as never })).toThrow(type);
    }
    // An invalid limit changes nothing.
    expect(() => configureGeneratorCache({ maxEntries: -1, disk: { directory } })).toThrow();
    expect(configureGeneratorCache().disk).toBeUndefined();
    expect(configureGeneratorCache({ disk: { directory: 'relative/cache' } }).disk).toMatchObject({
      directory: join(process.cwd(), 'relative/cache'),
      maxEntries: 2000,
      maxBytes: 128 * 1024 * 1024,
    });
    expect(configureGeneratorCache({ disk: true }).disk?.directory).toBe(
      join(process.cwd(), 'node_modules/.cache/mimlet')
    );
    expect(configureGeneratorCache({ disk: false }).disk).toBeUndefined();
    // A browser has no process; a runtime without getBuiltinModule has no file system here.
    const getBuiltinModule = Object.getOwnPropertyDescriptor(process, 'getBuiltinModule')!;
    try {
      Reflect.deleteProperty(process, 'getBuiltinModule');
      expect(configureGeneratorCache({ disk: { directory } }).disk).toBeUndefined();
    } finally {
      Object.defineProperty(process, 'getBuiltinModule', getBuiltinModule);
    }
  });

  it('needs a project directory for the default location', () => {
    const warnings = vi.spyOn(process, 'emitWarning').mockImplementation(() => undefined);
    const project = join(directory, 'project');
    const nested = join(project, 'src', 'deep');
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(project, 'package.json'), '{}');
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(nested);
    expect(configureGeneratorCache({ disk: true }).disk?.directory).toBe(
      join(project, 'node_modules/.cache/mimlet')
    );
    rmSync(join(project, 'package.json'));
    cwd.mockReturnValue('/');
    expect(existsSync('/package.json')).toBe(false);
    expect(configureGeneratorCache({ disk: true }).disk).toBeUndefined();
    expect(String(warnings.mock.calls[0]?.[0])).toMatch(/no package\.json was found/);
  });
});
