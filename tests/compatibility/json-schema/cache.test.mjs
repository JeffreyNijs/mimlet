import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';
import { URL } from 'node:url';
import {
  clearGeneratorCache,
  configureGeneratorCache,
  jsonSchemaAdapter,
} from '@mimlet/json-schema';

const manifest = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.resolve('@mimlet/json-schema')), 'utf8')
);
const schema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    tags: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 8 }, maxItems: 3 },
    count: { type: 'integer', minimum: 0, maximum: 99 },
  },
  required: ['id', 'tags', 'count'],
  additionalProperties: false,
};
const observe = (options = {}) => {
  const adapter = jsonSchemaAdapter(globalThis.structuredClone(schema), options);
  const session = adapter.session('stream');
  return {
    identity: adapter.identity,
    values: [adapter.create(), adapter.create(session), adapter.create(session)],
  };
};
/** Runs a module in a fresh process with the given environment and returns its output. */
const child = (code, env) =>
  execFileSync(process.execPath, ['--input-type=module', '--eval', code], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

describe('shared generator preparation in the packed package', () => {
  afterEach(() => {
    configureGeneratorCache({ maxEntries: 256 });
    clearGeneratorCache();
  });

  it('reuses equal content with the same values and replay identity as an unshared run', () => {
    configureGeneratorCache({ maxEntries: 0 });
    const unshared = [observe(), observe({ profile: 'realistic' })];
    configureGeneratorCache({ maxEntries: 256 });
    assert.deepEqual([observe(), observe({ profile: 'realistic' })], unshared);
    assert.deepEqual([observe(), observe({ profile: 'realistic' })], unshared);
    assert.deepEqual(configureGeneratorCache(), { maxEntries: 256, entries: 2 });
    configureGeneratorCache({ maxEntries: 1 });
    assert.equal(configureGeneratorCache().entries, 1);
    assert.throws(() => configureGeneratorCache({ maxEntries: -1 }), RangeError);
  });

  it('keeps a versioned store on globalThis', () => {
    observe();
    const registry = globalThis[Symbol.for('mimlet.generators.v1')];
    assert.ok(registry instanceof Map);
    assert.ok(registry.has(`@mimlet/json-schema@${manifest.version}`));
  });

  it('reads MIMLET_GENERATOR_CACHE when the store is created', () => {
    const read = `import { configureGeneratorCache, jsonSchemaAdapter } from '@mimlet/json-schema';
jsonSchemaAdapter({ type: 'integer', minimum: 1, maximum: 1 }).create();
console.log(JSON.stringify(configureGeneratorCache()));`;
    assert.deepEqual(JSON.parse(child(read, { MIMLET_GENERATOR_CACHE: 'off' })), {
      maxEntries: 0,
      entries: 0,
    });
    assert.deepEqual(JSON.parse(child(read, { MIMLET_GENERATOR_CACHE: ' 12 ' })), {
      maxEntries: 12,
      entries: 1,
    });
    assert.throws(
      () => child(read, { MIMLET_GENERATOR_CACHE: 'many' }),
      /MIMLET_GENERATOR_CACHE must be off or a number of prepared generators/
    );
  });

  it('falls back to a store of its own when the registry is not usable', () => {
    const occupied = `globalThis[Symbol.for('mimlet.generators.v1')] = 'taken';
const { configureGeneratorCache, jsonSchemaAdapter } = await import('@mimlet/json-schema');
console.log(jsonSchemaAdapter({ type: 'integer', minimum: 5, maximum: 5 }).create(), configureGeneratorCache().entries);`;
    assert.equal(child(occupied, {}), '5 1');
    const frozen = `Object.freeze(globalThis);
const { jsonSchemaAdapter } = await import('@mimlet/json-schema');
console.log(jsonSchemaAdapter({ type: 'integer', minimum: 6, maximum: 6 }).create());`;
    assert.equal(child(frozen, {}), '6');
  });
});
