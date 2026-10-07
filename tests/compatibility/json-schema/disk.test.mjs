import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath, pathToFileURL, URL } from 'node:url';
import { promisify } from 'node:util';
import {
  clearGeneratorCache,
  configureGeneratorCache,
  jsonSchemaAdapter,
} from '@mimlet/json-schema';

const posix = typeof process.getuid === 'function';
const root = posix && process.getuid() === 0;
const installed = fileURLToPath(new URL('..', import.meta.resolve('@mimlet/json-schema')));
const item = 'https://example.test/item';
/** Schemas a child process prepares; the last uses a supplied reference. */
const schemas = [
  {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      at: { type: 'string', format: 'date-time' },
      tags: { type: 'array', items: { type: 'string', pattern: '^[a-z]+$' }, uniqueItems: true },
      kind: { enum: ['a', 'b', { c: [1] }] },
      next: { $ref: '#' },
    },
    required: ['id', 'at', 'tags', 'kind'],
    additionalProperties: false,
  },
  { type: 'array', items: { $ref: item }, minItems: 2 },
  ...Array.from({ length: 8 }, (_, n) => ({ type: 'string', minLength: n, maxLength: n + 2 })),
];
/** Prints the values, identities and issues of every schema, then the disk cache state. */
const script = (module = '@mimlet/json-schema', setup = '') => `
import { configureGeneratorCache, jsonSchemaAdapter } from ${JSON.stringify(module)};
${setup}
const schemas = ${JSON.stringify(schemas)};
const results = schemas.map((schema) => {
  const adapter = jsonSchemaAdapter(schema, { references: { ${JSON.stringify(item)}: { type: 'string', format: 'email' } }, profile: 'random' });
  const session = adapter.session(5);
  return { identity: adapter.identity, values: [adapter.create(), adapter.create(session), adapter.create(session)], issues: adapter.issues({ id: 'x', tags: ['A', 'A'], kind: 1 }) };
});
console.log(JSON.stringify({ results, disk: configureGeneratorCache().disk ?? null }));`;
const options = (cwd, env) => ({
  cwd,
  encoding: 'utf8',
  env: {
    ...Object.fromEntries(
      Object.entries(process.env).filter(([name]) => !name.startsWith('MIMLET_GENERATOR_CACHE'))
    ),
    ...env,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  timeout: 60_000,
});
const child = (env, code = script(), cwd = process.cwd()) =>
  JSON.parse(
    execFileSync(process.execPath, ['--input-type=module', '--eval', code], options(cwd, env))
  );
const spawn = (env, code = script()) =>
  promisify(execFile)(
    process.execPath,
    ['--input-type=module', '--eval', code],
    options(process.cwd(), env)
  ).then(({ stdout }) => JSON.parse(stdout));

let directory;
const entries = () =>
  readdirSync(directory)
    .filter((name) => name.endsWith('.entry'))
    .sort();
const disk = () => configureGeneratorCache().disk;
const onDisk = (settings = {}) =>
  configureGeneratorCache({ maxEntries: 0, disk: { directory, ...settings } });

describe('generator disk cache in the packed package', () => {
  beforeEach(() => {
    // The real path, as the working directory of a child process reports it.
    directory = realpathSync(mkdtempSync(join(tmpdir(), 'mimlet-disk-')));
  });
  afterEach(() => {
    configureGeneratorCache({ maxEntries: 256, disk: false });
    clearGeneratorCache();
    if (posix) chmodSync(directory, 0o700);
    rmSync(directory, { recursive: true, force: true });
  });

  it('is off unless MIMLET_GENERATOR_CACHE=disk or MIMLET_GENERATOR_CACHE_DIR is set', (t) => {
    // A project inside the installed consumer, so it resolves the packed package.
    const project = mkdtempSync(join(realpathSync(process.cwd()), 'project-'));
    t.after(() => rmSync(project, { recursive: true, force: true }));
    mkdirSync(join(project, 'src'), { recursive: true });
    writeFileSync(join(project, 'package.json'), '{}');
    const cache = join(project, 'node_modules/.cache/mimlet');
    const plain = child({}, script(), join(project, 'src'));
    assert.equal(plain.disk, null);
    assert.equal(existsSync(join(project, 'node_modules')), false);
    // The default directory is in the nearest directory with a package.json.
    const cold = child({ MIMLET_GENERATOR_CACHE: 'disk' }, script(), join(project, 'src'));
    assert.deepEqual(cold.results, plain.results);
    // The same directory, however the platform spells the path.
    const same = (left, right) =>
      assert.equal(
        realpathSync.native(left).toLowerCase(),
        realpathSync.native(right).toLowerCase()
      );
    same(cold.disk.directory, cache);
    assert.deepEqual(cold.disk, {
      directory: cold.disk.directory,
      maxEntries: 2000,
      maxBytes: 128 * 1024 * 1024,
      hits: 0,
      misses: schemas.length,
    });
    assert.equal(readdirSync(cache).filter((name) => name.endsWith('.entry')).length, 10);
    const warm = child({ MIMLET_GENERATOR_CACHE: ' Disk ' }, script(), join(project, 'src'));
    assert.deepEqual(warm.results, plain.results);
    assert.deepEqual([warm.disk.hits, warm.disk.misses], [schemas.length, 0]);
    // A relative directory is resolved against the working directory.
    const explicit = child({ MIMLET_GENERATOR_CACHE_DIR: 'cache' }, script(), project);
    same(explicit.disk.directory, join(project, 'cache'));
    assert.deepEqual(explicit.results, plain.results);
    // The programmatic setting wins, also to turn it off.
    const off = child(
      { MIMLET_GENERATOR_CACHE_DIR: directory },
      script('@mimlet/json-schema', 'configureGeneratorCache({ disk: false });')
    );
    assert.equal(off.disk, null);
    assert.deepEqual(entries(), []);
  });

  it('shares entries between processes and concurrent workers', { timeout: 120_000 }, async () => {
    const env = { MIMLET_GENERATOR_CACHE_DIR: directory };
    const workers = await Promise.all(Array.from({ length: 8 }, () => spawn(env)));
    for (const worker of workers) {
      assert.deepEqual(worker.results, workers[0].results);
      assert.equal(worker.disk.hits + worker.disk.misses, schemas.length);
    }
    assert.equal(entries().length, schemas.length);
    assert.deepEqual(
      readdirSync(directory).filter((name) => !name.endsWith('.entry')),
      ['key']
    );
    const warm = child(env);
    assert.deepEqual(warm.results, workers[0].results);
    assert.deepEqual([warm.disk.hits, warm.disk.misses], [schemas.length, 0]);
    // The same in memory, without the cache.
    assert.deepEqual(child({}).results, warm.results);
  });

  it('keeps entries of another package version apart', () => {
    const env = { MIMLET_GENERATOR_CACHE_DIR: directory };
    const current = child(env);
    // An installed copy that reports another version.
    const next = join(installed, '..', 'json-schema-next');
    rmSync(next, { recursive: true, force: true });
    cpSync(installed, next, { recursive: true });
    try {
      const version = join(next, 'dist/version.js');
      writeFileSync(
        version,
        readFileSync(version, 'utf8').replace(
          /packageVersion = '[^']+'/,
          "packageVersion = '0.0.0-next'"
        )
      );
      const code = script(pathToFileURL(join(next, 'dist/index.js')).href);
      const other = child(env, code);
      assert.deepEqual(other.results, current.results);
      assert.deepEqual([other.disk.hits, other.disk.misses], [0, schemas.length]);
      assert.equal(entries().length, 2 * schemas.length);
      assert.deepEqual([child(env, code).disk.misses, child(env).disk.misses], [0, 0]);
    } finally {
      rmSync(next, { recursive: true, force: true });
    }
  });

  it('recompiles corrupt and tampered entries and writes them again', () => {
    onDisk();
    const schema = schemas[0];
    const expected = jsonSchemaAdapter(schema).create();
    const [name] = entries();
    const file = join(directory, name);
    const valid = readFileSync(file, 'utf8');
    const secret = readFileSync(join(directory, 'key'), 'utf8');
    const header = valid.split('\n')[2];
    const code = valid.slice(valid.indexOf(header) + header.length + 1);
    const sign = (text, signed = header) => {
      const body = `${signed}\n${text}`;
      return `mimlet-generator-cache 1\n${createHmac('sha256', secret).update(body).digest('hex')}\n${body}`;
    };
    const damaged = [
      '',
      valid.slice(0, 200),
      valid.replace(/^mimlet-generator-cache 1/, 'other'),
      valid.replace(header, header.replace('"formats":[', '"formats":["x",')),
      sign('require("node:child_process"); module.exports = () => true;'),
      sign('module.exports = "not a function";'),
      sign('throw new Error("broken")'),
      // Signed, but for another key: an entry copied to this name.
      sign(code, header.replace(name.slice(0, 64), '0'.repeat(64))),
      sign(code, header.replace('"references":[]', '"references":{}')),
      sign(code, 'null'),
    ];
    for (const content of damaged) {
      writeFileSync(file, content);
      const before = disk();
      assert.deepEqual(jsonSchemaAdapter(schema).create(), expected);
      assert.deepEqual([disk().hits, disk().misses], [before.hits, before.misses + 1]);
      assert.equal(readFileSync(file, 'utf8'), valid);
      assert.deepEqual(jsonSchemaAdapter(schema).create(), expected);
      assert.equal(disk().hits, before.hits + 1);
    }
    assert.deepEqual(jsonSchemaAdapter(schema).create(), expected);
  });

  it('only uses a private key file', { skip: !posix || root }, () => {
    const warnings = [];
    const emit = process.emitWarning;
    process.emitWarning = (warning) => warnings.push(String(warning));
    try {
      onDisk();
      jsonSchemaAdapter({ type: 'integer', minimum: 8, maximum: 8 });
      const key = join(directory, 'key');
      assert.equal(statSync(key).mode & 0o777, 0o600);
      chmodSync(key, 0o640);
      onDisk();
      assert.equal(jsonSchemaAdapter({ type: 'integer', minimum: 8, maximum: 8 }).create(), 8);
      assert.equal(disk(), undefined);
      assert.match(warnings[0], /key must belong to the current user and be readable only by them/);
      // Unreadable and unwritable: compiled in memory.
      chmodSync(key, 0o600);
      chmodSync(directory, 0o500);
      onDisk();
      assert.equal(jsonSchemaAdapter({ type: 'integer', minimum: 9, maximum: 9 }).create(), 9);
      assert.equal(jsonSchemaAdapter({ type: 'integer', minimum: 8, maximum: 8 }).create(), 8);
      assert.deepEqual([disk().hits, disk().misses], [1, 1]);
      chmodSync(directory, 0o700);
      // A key this cache did not write is replaced.
      writeFileSync(key, 'other');
      onDisk();
      assert.equal(jsonSchemaAdapter({ type: 'integer', minimum: 8, maximum: 8 }).create(), 8);
      assert.match(readFileSync(key, 'utf8'), /^[0-9a-f]{64}$/);
      assert.deepEqual([disk().hits, disk().misses], [0, 1]);
      // A file where the directory should be.
      configureGeneratorCache({ disk: { directory: key } });
      assert.equal(jsonSchemaAdapter({ type: 'integer', minimum: 7, maximum: 7 }).create(), 7);
      assert.equal(disk(), undefined);
      assert.equal(warnings.length, 2);
    } finally {
      process.emitWarning = emit;
    }
  });

  it('prunes the least recently used entries and stale temporary files', () => {
    const old = new Date(Date.now() - 60 * 60 * 1000);
    const fake = (index, size = 10) => {
      const file = join(directory, `${index.toString(16).padStart(64, '0')}.entry`);
      writeFileSync(file, 'x'.repeat(size));
      const time = new Date(old.getTime() + index * 1000);
      utimesSync(file, time, time);
      return file;
    };
    const files = [fake(1), fake(2), fake(3)];
    const stale = join(directory, `key.1.abcdefabcdef.tmp`);
    writeFileSync(stale, '');
    utimesSync(stale, old, old);
    onDisk({ maxEntries: 2, maxBytes: 1_000_000 });
    jsonSchemaAdapter({ type: 'null' });
    assert.deepEqual(
      files.map((file) => existsSync(file)),
      [false, false, true]
    );
    assert.equal(existsSync(stale), false);
    assert.equal(entries().length, 2);
  });

  it('checks its settings and never stores validators with callbacks', () => {
    assert.throws(() => configureGeneratorCache({ disk: 'on' }), TypeError);
    assert.throws(() => configureGeneratorCache({ disk: { directory: ' ' } }), TypeError);
    assert.throws(() => configureGeneratorCache({ disk: { maxEntries: -1 } }), RangeError);
    assert.throws(() => configureGeneratorCache({ disk: { maxBytes: 0 } }), RangeError);
    // No project directory for the default location, and no Node built-ins.
    const warnings = [];
    const { cwd, emitWarning } = process;
    const getBuiltinModule = Object.getOwnPropertyDescriptor(process, 'getBuiltinModule');
    try {
      process.emitWarning = (warning) => warnings.push(String(warning));
      process.cwd = () => directory;
      assert.equal(configureGeneratorCache({ disk: true }).disk, undefined);
      assert.match(warnings[0], /no package\.json was found above the working directory/);
      process.cwd = cwd;
      delete process.getBuiltinModule;
      assert.equal(configureGeneratorCache({ disk: { directory } }).disk, undefined);
    } finally {
      process.cwd = cwd;
      process.emitWarning = emitWarning;
      Object.defineProperty(process, 'getBuiltinModule', getBuiltinModule);
    }
    onDisk();
    jsonSchemaAdapter(
      { type: 'string', format: 'code' },
      {
        formats: { code: { validate: (value) => value === 'a', generate: () => 'a' } },
        formatsIdentity: 'codes/v1',
      }
    ).create();
    assert.deepEqual(entries(), []);
    assert.deepEqual([disk().hits, disk().misses], [0, 0]);
  });
});
