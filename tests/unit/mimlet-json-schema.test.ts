import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { z } from 'zod';
import {
  clearGeneratorCache,
  configureGeneratorCache,
  fromJsonSchema,
  jsonSchemaAdapter,
} from '../../packages/json-schema/src/index.js';
import type {
  JsonSchema,
  JsonSchemaOptions,
  SchemaDialect,
} from '../../packages/json-schema/src/index.js';
import type * as JsonSchemaModule from '../../packages/json-schema/src/index.js';
import { packageVersion } from '../../packages/json-schema/src/version.js';
import { certainlyValidSchema } from '../../packages/json-schema/src/meta.js';
import { fingerprint } from '../../packages/json-schema/src/schema.js';
import { createSession, restoreSession } from '../../packages/core/src/index.js';
import { fromZod } from '../../packages/zod/src/index.js';
import * as api from './fixtures/zod-crm.gen.js';
import manifest from '../../packages/json-schema/package.json' with { type: 'json' };
it.each(['draft-07', 'draft-2019-09', 'draft-2020-12'] as const)(
  'keeps %s generation bounded and reproducible',
  (dialect) => {
    const schema = { type: 'integer', minimum: 2, maximum: 5 } as const;
    const adapter = jsonSchemaAdapter(schema, { dialect, profile: 'boundary' });
    const values = Array.from({ length: 12 }, () => adapter.create(adapter.session(42)));
    expect(
      values.every((v) => typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= 5)
    ).toBe(true);
    expect(new Set(values).size).toBe(1);
    expect(() => adapter.negative(adapter.session(1), () => 3)).toThrow();
  }
);

it('shares one default session across a session-less builder list', () => {
  const schema = { type: 'integer', minimum: 1, maximum: 1_000_000 } as const;
  const adapter = jsonSchemaAdapter(schema);
  const builder = fromJsonSchema(schema);
  const list = builder.buildList(4);
  expect(new Set(list).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, adapter.session()));
  expect(builder.buildValidatedList(4)).toEqual(list);
  // A single session-less build keeps its documented seed-1 value.
  expect(builder.build()).toBe(adapter.create());
  expect(builder.build()).toBe(list[0]);
});

it('generates every string enum value, including values longer than the sampling hint', () => {
  const status = fromJsonSchema({ type: 'string', enum: ['IN_TRANSIT', 'DELIVERED_ON_TIME'] });
  expect(new Set(status.buildList(40))).toEqual(new Set(['IN_TRANSIT', 'DELIVERED_ON_TIME']));
  const event = fromJsonSchema({ type: 'string', enum: ['SHIPMENT_DELIVERED_TO_RECIPIENT'] });
  expect(event.build()).toBe('SHIPMENT_DELIVERED_TO_RECIPIENT');
  expect(fromJsonSchema({ type: 'string', const: 'A_VERY_LONG_CONSTANT_VALUE' }).build()).toBe(
    'A_VERY_LONG_CONSTANT_VALUE'
  );
  // An explicit maxLength is an original constraint and still applies.
  const bounded = fromJsonSchema({
    type: 'string',
    enum: ['short', 'much_too_long_value'],
    maxLength: 5,
  });
  expect(new Set(bounded.buildList(20))).toEqual(new Set(['short']));
});

it('generates varied UTC date-times near the reference instant, independent of time zone', () => {
  const schema = {
    type: 'object',
    required: ['startsAt', 'endsAt'],
    properties: {
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
    },
  } as const;
  const adapter = jsonSchemaAdapter(schema);
  const referenceTime = '2026-06-01T02:00:00.000Z'; // Still 31 May in New York.
  const sample = () =>
    Array.from({ length: 8 }, (_, seed) =>
      adapter.create(createSession({ ...adapter.identity, seed, referenceTime }))
    ) as { startsAt: string; endsAt: string }[];
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/New_York';
    const west = sample();
    process.env.TZ = 'Asia/Tokyo';
    expect(sample()).toEqual(west);
    const values = west.flatMap(({ startsAt, endsAt }) => [startsAt, endsAt]);
    expect(new Set(values).size).toBeGreaterThan(values.length / 2);
    for (const value of values) {
      expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      expect(Math.abs(Date.parse(value) - Date.parse(referenceTime))).toBeLessThanOrEqual(
        366 * 24 * 60 * 60 * 1000
      );
    }
    expect(fromJsonSchema(schema).buildValidated()).toEqual(fromJsonSchema(schema).build());
  } finally {
    if (original === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = original;
    }
  }
});

it('changes the replay identity only for schemas that use built-in date-times', () => {
  const plain = jsonSchemaAdapter({ type: 'string', format: 'email' }).identity.configuration;
  const dated = jsonSchemaAdapter({ type: 'string', format: 'date-time' }).identity.configuration;
  const custom = jsonSchemaAdapter(
    { type: 'string', format: 'date-time' },
    {
      formats: { 'date-time': { validate: () => true, generate: () => '2026-01-01T00:00:00Z' } },
      formatsIdentity: 'fixed-date-time/v1',
    }
  ).identity.configuration;
  expect(dated).not.toBe(plain);
  expect(custom).not.toBe(dated);
  expect(jsonSchemaAdapter({ type: 'string', format: 'uuid' }).identity.configuration).toBe(plain);
});

describe('the realistic profile', () => {
  const order = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      quantity: { type: 'integer' },
      price: { type: 'number', minimum: 0 },
      id: { type: 'integer', minimum: -9007199254740991, maximum: 9007199254740991 },
      rating: { type: 'number', minimum: 0, maximum: 5 },
      offset: { type: 'integer', maximum: -10 },
      above: { type: 'integer', minimum: 1_000_000 },
      positive: { type: 'number', exclusiveMinimum: 0 },
      even: { type: 'integer', multipleOf: 2 },
      code: { type: 'string', minLength: 2, maxLength: 4 },
      note: { type: ['string', 'null'] },
      choice: { anyOf: [{ type: 'string', maxLength: 6 }, { type: 'null' }] },
      email: { type: 'string', format: 'email' },
      sku: { type: 'string', pattern: '^[A-Z]{3}-[0-9]{2}$' },
      status: { enum: ['OPEN', 'CLOSED'] },
      lines: {
        type: 'array',
        items: { type: 'object', properties: { label: { type: 'string', maxLength: 12 } } },
      },
    },
    required: ['title'],
    additionalProperties: false,
  } as const;
  type Order = Record<string, number | string> & { lines: Array<{ label: string }> };

  it('fills optional fields with small, readable values inside the declared constraints', () => {
    const adapter = jsonSchemaAdapter(order, { profile: 'realistic' });
    const values = Array.from(
      { length: 12 },
      (_, seed) => adapter.create(adapter.session(seed)) as Order
    );
    for (const value of values) {
      expect(adapter.check(value)).toBe(true);
      expect(Object.keys(value).sort()).toEqual(Object.keys(order.properties).sort());
      expect(value.title).toMatch(/^[A-Z][a-z]+(?: [a-z]+){0,2}$/);
      expect(value.quantity).toBeGreaterThanOrEqual(1);
      expect(value.quantity).toBeLessThanOrEqual(100);
      expect(value.price).toBeLessThanOrEqual(100);
      expect(Math.round(Number(value.price) * 100) / 100).toBe(value.price);
      expect(value.id).toBeGreaterThanOrEqual(1);
      expect(value.id).toBeLessThanOrEqual(100);
      // A declared range that is already small is kept as it is.
      expect(value.rating).toBeGreaterThanOrEqual(0);
      expect(value.rating).toBeLessThanOrEqual(5);
      expect(value.offset).toBeGreaterThanOrEqual(-109);
      expect(value.offset).toBeLessThanOrEqual(-10);
      expect(value.above).toBeGreaterThanOrEqual(1_000_000);
      expect(value.above).toBeLessThanOrEqual(1_000_099);
      expect(value.positive).toBeGreaterThan(0);
      expect(Number(value.even) % 2).toBe(0);
      expect(String(value.code).length).toBeGreaterThanOrEqual(2);
      expect(String(value.code).length).toBeLessThanOrEqual(4);
      expect(value.note).toEqual(expect.any(String));
      expect(value.choice).toEqual(expect.any(String));
      expect(value.email).toMatch(/@/);
      expect(value.sku).toMatch(/^[A-Z]{3}-[0-9]{2}$/);
      expect(value.lines.length).toBeGreaterThanOrEqual(1);
      expect(value.lines.length).toBeLessThanOrEqual(3);
      for (const line of value.lines) {
        expect(line.label).toMatch(/^[A-Z][a-z]+(?: [a-z]+)*$/);
      }
    }
    expect(new Set(values.map((value) => value.title)).size).toBeGreaterThan(6);
  });

  it('prefers schema examples and falls back when the hints cannot be satisfied', () => {
    const titled = fromJsonSchema(
      { type: 'object', properties: { title: { type: 'string', examples: ['Acme renewal'] } } },
      { profile: 'realistic' }
    );
    expect(titled.build()).toEqual({ title: 'Acme renewal' });
    // An invalid example is not repeated: later candidates generate readable text instead.
    const invalid = fromJsonSchema(
      { type: 'string', maxLength: 5, examples: ['far too long'] },
      { profile: 'realistic' }
    );
    expect(invalid.build()).toMatch(/^[A-Z][a-z]{0,4}$/);
    // Filling every optional property breaks this oneOf, so it ends on unmodified candidates.
    const exclusive = jsonSchemaAdapter(
      {
        type: 'object',
        properties: { a: { type: 'boolean' }, b: { type: 'boolean' } },
        oneOf: [{ required: ['a'] }, { required: ['b'] }],
      },
      { profile: 'realistic' }
    );
    const value = exclusive.create() as Record<string, boolean>;
    expect(exclusive.check(value)).toBe(true);
    expect(Object.keys(value)).toHaveLength(1);
  });

  it('keeps recursive and reference cycles finite', () => {
    const tree = {
      $defs: {
        node: {
          type: 'object',
          properties: {
            label: { type: 'string' },
            parent: { $ref: '#/$defs/node' },
            children: { type: 'array', items: { $ref: '#/$defs/node' } },
            meta: { $ref: '#/$defs/meta' },
          },
          required: ['label'],
        },
        meta: { type: 'object', properties: { owner: { type: 'string' } } },
      },
      $ref: '#/$defs/node',
    };
    const nodes = fromJsonSchema(tree, { profile: 'realistic' }).buildValidatedList(5) as Array<
      Record<string, unknown>
    >;
    for (const node of nodes) {
      expect(Object.keys(node).sort()).toEqual(['label', 'meta']);
      expect(node.meta).toEqual({ owner: expect.any(String) });
    }
    // References into supplied documents follow the same rule.
    const company = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        deals: { type: 'array', items: { $ref: 'https://example.test/deal.json' } },
      },
    };
    const deal = {
      type: 'object',
      properties: {
        title: { type: 'string' },
        company: { $ref: 'https://example.test/company.json' },
        owner: { $ref: 'https://example.test/user.json' },
      },
    };
    const user = { type: 'object', properties: { email: { type: 'string', format: 'email' } } };
    const value = fromJsonSchema(
      { $ref: 'https://example.test/deal.json' },
      {
        profile: 'realistic',
        references: {
          'https://example.test/deal.json': deal,
          'https://example.test/company.json': company,
          'https://example.test/user.json': user,
        },
      }
    ).buildValidated() as Record<string, unknown>;
    expect(Object.keys(value).sort()).toEqual(['owner', 'title']);
    expect(value.owner).toEqual({ email: expect.stringContaining('@') });
  });

  it('is part of the replay identity and leaves the default profile unchanged', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        count: { type: 'integer' },
        price: { type: 'number' },
        note: { type: 'string' },
      },
      required: ['name', 'count', 'price'],
    };
    // Recorded with 0.1.0-beta.3: a change here would silently change saved replays.
    const minimal = jsonSchemaAdapter(schema);
    expect(minimal.identity).toEqual({
      fingerprint: 'json-fnv1a64-v1:70d76ff290aa20f0',
      provider: 'json-schema-faker@0.6.3+ajv@8.20.0',
      configuration: 'json-fnv1a64-v1:39abfb6d9d5533d3',
    });
    expect(fromJsonSchema(schema).buildList(2)).toEqual([
      { name: 'DtMqgJI5kCSH', count: 409, price: 633.6916880682111 },
      { name: 'FrJx3o9Pl', count: -181, price: -663.1166185252368 },
    ]);
    expect(jsonSchemaAdapter(schema, { profile: 'random' }).identity.configuration).toBe(
      'json-fnv1a64-v1:84fc212b3101f593'
    );
    const realistic = jsonSchemaAdapter(schema, { profile: 'realistic' });
    expect(realistic.identity.fingerprint).toBe(minimal.identity.fingerprint);
    expect(realistic.identity.configuration).not.toBe(minimal.identity.configuration);
    expect(realistic.metadata.profile).toBe('realistic');
    const session = realistic.session(7);
    const snapshot = session.snapshot();
    const first = realistic.create(session);
    expect(realistic.create(restoreSession(snapshot, realistic.identity))).toEqual(first);
    expect(() => restoreSession(snapshot, minimal.identity)).toThrow();
    // A custom provider receives the profile and decides what it means.
    const seen: string[] = [];
    jsonSchemaAdapter(
      { type: 'string' },
      {
        profile: 'realistic',
        provider: {
          id: 'fixed/v1',
          generate: (request) => {
            seen.push(request.profile);
            return 'fixed';
          },
        },
      }
    ).create();
    expect(seen).toEqual(['realistic']);
  });
});

it('leaves undefined schema properties out and names non-JSON schema values', () => {
  const adapter = jsonSchemaAdapter({ type: 'string', description: undefined, minLength: 1 });
  expect(adapter.source).toEqual({ type: 'string', minLength: 1 });
  expect(adapter.identity).toEqual(jsonSchemaAdapter({ type: 'string', minLength: 1 }).identity);
  const cyclic: Record<string, unknown> = { type: 'object' };
  cyclic.properties = { self: cyclic };
  const cases: Array<readonly [unknown, string]> = [
    [{ enum: [undefined] }, 'Expected JSON data, found undefined at /enum/0'],
    [{ const: Number.NaN }, 'Expected JSON data, found NaN at /const'],
    [{ maximum: Infinity }, 'Expected JSON data, found Infinity at /maximum'],
    [{ default: () => 1 }, 'Expected JSON data, found a function at /default'],
    [{ default: 1n }, 'Expected JSON data, found a bigint at /default'],
    [
      { default: new Date(0) },
      'Expected a plain JSON record, found an instance of Date at /default',
    ],
    [{ default: new Map() }, 'Expected a plain JSON record, found an instance of Map at /default'],
    [
      cyclic,
      'Expected acyclic JSON data, found a reference back to an enclosing value at /properties/self',
    ],
  ];
  for (const [schema, message] of cases) {
    expect(() => jsonSchemaAdapter(schema as never)).toThrow(message);
  }
  // Generated or overridden values still reject undefined properties.
  expect(jsonSchemaAdapter({ type: 'object' }).check({ note: undefined })).toBe(false);
});

describe('shared preparation', () => {
  afterEach(() => {
    configureGeneratorCache({ maxEntries: 256 });
    clearGeneratorCache();
  });
  const entries = () => configureGeneratorCache().entries;
  /** Values, identity and validation results that must not depend on sharing. */
  const observe = (schema: JsonSchema, options: JsonSchemaOptions = {}) => {
    const adapter = jsonSchemaAdapter(globalThis.structuredClone(schema), options);
    const session = adapter.session(7);
    const values = [1, 2, 3].map((seed) => adapter.create(adapter.session(seed)));
    return {
      identity: adapter.identity,
      values,
      list: [adapter.create(session), adapter.create(session), adapter.create(session)],
      checks: values.map((value) => adapter.check(value)),
      issues: adapter.issues({ unexpected: true }),
    };
  };
  const converted = Object.values(api)
    .filter((schema) => schema._zod.def.type !== 'void')
    .map(
      (schema) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'throw' }) as JsonSchema
    );
  // Hey API exports equal schemas under several names.
  const generated = [...new Map(converted.map((schema) => [JSON.stringify(schema), schema]))].map(
    ([, schema]) => schema
  );
  const item = 'https://example.test/item';
  const corpus: Array<readonly [JsonSchema, JsonSchemaOptions]> = [
    ...generated.map((schema) => [schema, {}] as const),
    ...generated.slice(0, 4).map((schema) => [schema, { profile: 'realistic' }] as const),
    ...generated.slice(0, 4).map((schema) => [schema, { profile: 'random' }] as const),
    [
      { type: 'array', items: { $ref: item }, minItems: 2 },
      { references: { [item]: { type: 'string', format: 'email' } } },
    ],
    [
      {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: { at: { type: 'string', format: 'date-time' } },
        required: ['at'],
      },
      {},
    ],
    [
      { $id: 'https://example.test/root', type: 'object', properties: { next: { $ref: '#' } } },
      { profile: 'boundary' },
    ],
  ];

  it(
    'generates the same values, identities and issues as an unshared preparation',
    {
      timeout: 30_000,
    },
    () => {
      configureGeneratorCache({ maxEntries: 0 });
      const unshared = corpus.map(([schema, options]) => observe(schema, options));
      expect(entries()).toBe(0);
      configureGeneratorCache({ maxEntries: 256 });
      // The first pass prepares, the second reuses; both must match the unshared results.
      expect(corpus.map(([schema, options]) => observe(schema, options))).toEqual(unshared);
      const prepared = entries();
      expect(prepared).toBe(corpus.length);
      expect(corpus.map(([schema, options]) => observe(schema, options))).toEqual(unshared);
      expect(entries()).toBe(prepared);
      // Equal content from the aliases is prepared once.
      converted.forEach((schema) => jsonSchemaAdapter(globalThis.structuredClone(schema)));
      expect(entries()).toBe(prepared);
    }
  );

  it('shares equal content from different objects, also through Zod', () => {
    const lead = z.object({ id: z.uuid(), source: z.string() });
    fromZod(lead.transform((dto) => dto)).build();
    const before = entries();
    // A different schema object (a new transform) with the same input JSON Schema.
    fromZod(lead.transform((dto) => ({ ...dto, label: dto.id }))).build();
    fromZod(z.object({ id: z.uuid(), source: z.string() }), { name: 'lead' }).build();
    expect(entries()).toBe(before);
    fromZod(lead, { profile: 'random' }).build();
    expect(entries()).toBe(before + 1);
  });

  it('keeps references, annotations and options apart', () => {
    const pointer = { $ref: item } as const;
    const strings = jsonSchemaAdapter(pointer, {
      references: { [item]: { type: 'string', minLength: 3, maxLength: 3 } },
    });
    const numbers = jsonSchemaAdapter(pointer, {
      references: { [item]: { type: 'integer', minimum: 7, maximum: 7 } },
    });
    expect(strings.create()).toMatch(/^.{3}$/);
    expect(numbers.create()).toBe(7);
    expect([strings.check(7), numbers.check('abc')]).toEqual([false, false]);
    expect(strings.identity.fingerprint).not.toBe(numbers.identity.fingerprint);
    // A reference map that was never supplied still leaves the reference unresolved.
    expect(() => jsonSchemaAdapter(pointer)).toThrow(/Unresolved reference/);

    const annotated = { type: 'string', 'x-label': 'Name' } as const;
    expect(jsonSchemaAdapter(annotated, { annotations: ['x-label'] }).create()).toEqual(
      expect.any(String)
    );
    expect(() => jsonSchemaAdapter(annotated)).toThrow(/Unsupported schema keyword x-label/);
    const schema = { type: 'integer', minimum: 1, maximum: 1_000 } as const;
    const plain = jsonSchemaAdapter(schema);
    expect(jsonSchemaAdapter(schema, { formatsIdentity: 'formats/v1' }).identity).not.toEqual(
      plain.identity
    );
    expect(jsonSchemaAdapter(schema, { maxAttempts: 3 }).identity).not.toEqual(plain.identity);
    // Key order changes generated objects, so it is part of the key.
    const ordered = (keys: string[]) =>
      jsonSchemaAdapter({
        type: 'object',
        properties: Object.fromEntries(keys.map((key) => [key, { const: key }])),
        required: keys,
      }).create() as object;
    expect(Object.keys(ordered(['a', 'b']))).toEqual(['a', 'b']);
    expect(Object.keys(ordered(['b', 'a']))).toEqual(['b', 'a']);
  });

  it('never shares callbacks, negative zero or a schema identifier', () => {
    const schema = { type: 'string', format: 'code' } as const;
    const formats = (code: string) => ({
      code: { validate: (value: string) => value === code, generate: () => code },
    });
    const before = entries();
    const a = jsonSchemaAdapter(schema, { formats: formats('a'), formatsIdentity: 'codes/v1' });
    const b = jsonSchemaAdapter(schema, { formats: formats('b'), formatsIdentity: 'codes/v1' });
    expect([a.create(), b.create(), a.check('b'), b.check('b')]).toEqual(['a', 'b', false, true]);
    const keyword = (expected: number) =>
      jsonSchemaAdapter(
        { type: 'integer', minimum: 1, maximum: 2, 'x-is': expected },
        {
          keywords: { 'x-is': (constraint, value) => value === constraint },
          extensionIdentity: 'is/v1',
        }
      );
    expect([keyword(1).create(), keyword(2).create()]).toEqual([1, 2]);
    expect(entries()).toBe(before);

    expect(Object.is(jsonSchemaAdapter({ const: 0 }).create(), 0)).toBe(true);
    expect(Object.is(jsonSchemaAdapter({ const: -0 }).create(), -0)).toBe(true);
    expect(Object.is(jsonSchemaAdapter({ const: 0 }).create(), 0)).toBe(true);
    expect(entries()).toBe(before + 1);

    // Each schema with an `$id` gets its own validator, so equal identifiers never collide.
    const first = { $id: 'https://example.test/user', type: 'string', minLength: 2, maxLength: 2 };
    const second = { $id: 'https://example.test/user', type: 'integer', minimum: 3, maximum: 3 };
    expect(jsonSchemaAdapter(first).create()).toMatch(/^.{2}$/);
    expect(jsonSchemaAdapter(second).create()).toBe(3);
    expect(jsonSchemaAdapter(globalThis.structuredClone(first)).create()).toMatch(/^.{2}$/);
  });

  it('drops the least recently used preparation and can be turned off', () => {
    configureGeneratorCache({ maxEntries: 2 });
    const integer = (n: number) => ({ type: 'integer', minimum: n, maximum: n }) as const;
    jsonSchemaAdapter(integer(1));
    jsonSchemaAdapter(integer(2));
    jsonSchemaAdapter(integer(1));
    jsonSchemaAdapter(integer(3));
    expect(configureGeneratorCache()).toEqual({ maxEntries: 2, entries: 2 });
    configureGeneratorCache({ maxEntries: 0 });
    expect(configureGeneratorCache()).toEqual({ maxEntries: 0, entries: 0 });
    expect(jsonSchemaAdapter(integer(3)).create()).toBe(3);
    expect(entries()).toBe(0);
    for (const maxEntries of [-1, 1.5, 2_000_000, Number.NaN, '3' as never]) {
      expect(() => configureGeneratorCache({ maxEntries })).toThrow(RangeError);
    }
    // Many schemas through shared validators: every one still validates its own values.
    configureGeneratorCache({ maxEntries: 8 });
    for (let n = 0; n < 80; n += 1) {
      const adapter = jsonSchemaAdapter({ type: 'string', minLength: n % 9, maxLength: n % 9 });
      expect(String(adapter.create()).length).toBe(n % 9);
      expect(adapter.check('x'.repeat((n % 9) + 1))).toBe(false);
    }
    expect(entries()).toBe(8);
  });

  it('keeps one store per package version on globalThis, also for a module loaded again', async () => {
    expect(packageVersion).toBe(manifest.version);
    const schema = { type: 'integer', minimum: 40, maximum: 40 } as const;
    const registry = Reflect.get(globalThis, Symbol.for('mimlet.generators.v1')) as Map<
      string,
      unknown
    >;
    // Another version's store is never read.
    const unreadable = {
      get() {
        throw new Error('read another version');
      },
    };
    registry.set('@mimlet/json-schema@0.0.0-other', {
      prepared: unreadable,
      validators: unreadable,
    });
    try {
      jsonSchemaAdapter(schema);
      const before = entries();
      expect([...registry.keys()]).toContain(`@mimlet/json-schema@${packageVersion}`);
      // A query makes the module runner evaluate the module again, with new module state.
      const again = '../../packages/json-schema/src/index.js?evaluated-again';
      const copy = (await import(/* @vite-ignore */ again)) as typeof JsonSchemaModule;
      expect(copy.jsonSchemaAdapter).not.toBe(jsonSchemaAdapter);
      expect(copy.jsonSchemaAdapter(schema).create()).toBe(40);
      expect(copy.jsonSchemaAdapter({ type: 'integer', minimum: 41, maximum: 41 }).create()).toBe(
        41
      );
      expect(entries()).toBe(before + 1);
    } finally {
      registry.delete('@mimlet/json-schema@0.0.0-other');
    }
  });
});

describe('validator preparation', () => {
  /** The validator classes and formats this package uses, loaded from its own dependencies. */
  interface ReferenceValidator {
    readonly formats: Readonly<Record<string, unknown>>;
    validateSchema(schema: unknown): boolean;
    compile(schema: unknown): ((value: unknown) => boolean) & {
      readonly errors?: ReadonlyArray<Record<string, unknown>> | null;
    };
  }
  type ValidatorClass = new (options: object) => ReferenceValidator;
  const load = createRequire(new URL('../../packages/json-schema/package.json', import.meta.url));
  const classes: Record<SchemaDialect, ValidatorClass> = {
    'draft-07': (load('ajv') as { Ajv: ValidatorClass }).Ajv,
    'draft-2019-09': (load('ajv/dist/2019') as { Ajv2019: ValidatorClass }).Ajv2019,
    'draft-2020-12': (load('ajv/dist/2020') as { Ajv2020: ValidatorClass }).Ajv2020,
  };
  const addFormats = (load('ajv-formats') as { default: (validator: object) => void }).default;
  // The options of packages/json-schema/src/index.ts, with Ajv's default code optimization.
  const reference = (dialect: SchemaDialect) => {
    const validator = new classes[dialect]({
      allErrors: true,
      strict: true,
      strictSchema: false,
      strictTypes: false,
      strictRequired: false,
      strictTuples: false,
      allowUnionTypes: true,
      allowMatchingProperties: true,
      ownProperties: true,
      coerceTypes: false,
      useDefaults: false,
      removeAdditional: false,
      validateFormats: true,
      logger: false,
    });
    addFormats(validator);
    return validator;
  };
  const dialects = ['draft-07', 'draft-2019-09', 'draft-2020-12'] as const;
  const crm = (target: 'draft-07' | 'draft-2020-12') =>
    Object.values(api)
      .filter((schema) => schema._zod.def.type !== 'void')
      .map((schema) => z.toJSONSchema(schema, { io: 'input', target, unrepresentable: 'throw' }))
      .map((schema) => JSON.parse(JSON.stringify(schema)) as JsonSchema);

  it('skips the meta-schema only for schemas the meta-schema accepts', () => {
    const validators = Object.fromEntries(dialects.map((d) => [d, reference(d)])) as Record<
      SchemaDialect,
      ReferenceValidator
    >;
    const metaValid = (schema: unknown, dialect: SchemaDialect) => {
      try {
        return validators[dialect].validateSchema(schema) === true;
      } catch {
        return false;
      }
    };
    // Every schema converted from the generated API takes the quick path.
    for (const target of ['draft-07', 'draft-2020-12'] as const) {
      for (const schema of crm(target)) {
        expect(certainlyValidSchema(schema, target, validators[target].formats)).toBe(true);
        expect(metaValid(schema, target)).toBe(true);
      }
    }
    // Schemas that are mostly well formed, with a wrong kind of value now and then, so that
    // every keyword rule meets both valid and invalid values in nested positions.
    const strings = fc.oneof(
      fc.string({ maxLength: 4 }),
      fc.constantFrom(
        ...['string', 'integer', 'null', 'strin', '^a+$', '[', '^]$', 'a\\Z', '\\p{L}', '\\_'],
        ...['#', '#/$defs/a', '#/definitions/a', 'https://example.test/a', 'a b', ':', '#a'],
        'https://json-schema.org/draft/2020-12/schema',
        'https://json-schema.org/draft/2019-09/schema',
        'http://json-schema.org/draft-07/schema#',
        'http://json-schema.org/draft-07/schema',
        'http://json-schema.org/draft/2020-12/schema',
        'https://json-schema.org/draft/2020-12/schema#'
      )
    );
    const scalars = fc.oneof(
      strings,
      fc.integer({ min: -2, max: 4 }),
      fc.constantFrom(0.5, -0, 1e300, -1.5),
      fc.boolean(),
      fc.constant(null)
    );
    const anything = fc.oneof(
      scalars,
      fc.array(scalars, { maxLength: 2 }),
      fc.dictionary(strings, scalars, { maxKeys: 2 })
    );
    const types = fc.constantFrom('array', 'boolean', 'integer', 'null', 'number', 'object');
    const { schema } = fc.letrec((tie) => {
      const sub = tie('schema');
      const mostly = (arbitrary: fc.Arbitrary<unknown>) =>
        fc.oneof({ weight: 5, arbitrary }, { weight: 1, arbitrary: anything });
      const kinds: Record<string, fc.Arbitrary<unknown>> = {
        $schema: strings,
        $ref: strings,
        $id: strings,
        $anchor: strings,
        default: anything,
        const: anything,
        examples: mostly(fc.array(scalars, { maxLength: 2 })),
        multipleOf: mostly(fc.constantFrom(-1, 0, 0.5, 2)),
        type: mostly(fc.oneof(types, fc.constant('strin'), fc.array(types, { maxLength: 3 }))),
        enum: mostly(
          fc.oneof(
            fc.array(fc.oneof(scalars, fc.constant({ a: 1 })), { maxLength: 3 }),
            fc.constantFrom(['a', 'a'], [1, 1], [null, 'a', null])
          )
        ),
        pattern: strings,
        required: mostly(fc.array(fc.constantFrom('a', 'b', 'c'), { maxLength: 3 })),
        dependentRequired: mostly(
          fc.dictionary(strings, fc.array(fc.constantFrom('a', 'b'), { maxLength: 2 }), {
            maxKeys: 2,
          })
        ),
        dependencies: mostly(
          fc.dictionary(
            strings,
            fc.oneof(sub, fc.array(fc.constantFrom('a', 'b'), { maxLength: 2 })),
            { maxKeys: 2 }
          )
        ),
        items: mostly(fc.oneof(sub, fc.array(sub, { maxLength: 2 }))),
        patternProperties: mostly(fc.dictionary(strings, sub, { maxKeys: 2 })),
        'x-extension': anything,
        ['__proto__']: anything,
      };
      for (const name of ['$comment', 'title', 'description', 'format', 'contentEncoding']) {
        kinds[name] = mostly(strings);
      }
      for (const name of ['readOnly', 'writeOnly', 'deprecated', 'uniqueItems']) {
        kinds[name] = mostly(fc.boolean());
      }
      for (const name of ['maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum']) {
        kinds[name] = mostly(fc.oneof(fc.integer(), fc.double({ noNaN: true })));
      }
      for (const name of ['maxLength', 'minLength', 'maxItems', 'minItems', 'minProperties']) {
        kinds[name] = mostly(fc.oneof(fc.integer({ min: -1, max: 3 }), fc.constant(0.5)));
      }
      for (const name of ['maxProperties', 'minContains', 'maxContains']) {
        kinds[name] = mostly(fc.integer({ min: -1, max: 3 }));
      }
      for (const name of ['additionalItems', 'contains', 'additionalProperties', 'not', 'if']) {
        kinds[name] = mostly(sub);
      }
      for (const name of ['propertyNames', 'then', 'else', 'unevaluatedProperties']) {
        kinds[name] = mostly(sub);
      }
      for (const name of ['unevaluatedItems', 'contentSchema']) {
        kinds[name] = mostly(sub);
      }
      for (const name of ['allOf', 'anyOf', 'oneOf', 'prefixItems']) {
        kinds[name] = mostly(fc.array(sub, { maxLength: 2 }));
      }
      for (const name of ['properties', '$defs', 'definitions', 'dependentSchemas']) {
        kinds[name] = mostly(fc.dictionary(strings, sub, { maxKeys: 2 }));
      }
      const entry = fc.oneof(
        ...Object.entries(kinds).map(([name, value]) =>
          fc.tuple(fc.constant(name), value as fc.Arbitrary<unknown>)
        )
      );
      return {
        schema: fc.oneof(
          { depthSize: 'small', maxDepth: 4 },
          { weight: 1, arbitrary: fc.boolean() },
          {
            weight: 4,
            arbitrary: fc.array(entry, { maxLength: 4 }).map((entries) => {
              const result: Record<string, unknown> = {};
              for (const [name, value] of entries) {
                Object.defineProperty(result, name, { value, enumerable: true, writable: true });
              }
              return result;
            }),
          }
        ),
      };
    });
    let quick = 0;
    fc.assert(
      fc.property(schema, fc.constantFrom(...dialects), (candidate, dialect) => {
        const data = JSON.parse(JSON.stringify(candidate)) as unknown;
        if (certainlyValidSchema(data, dialect, validators[dialect].formats)) {
          quick += 1;
          expect(metaValid(data, dialect)).toBe(true);
        }
      }),
      { numRuns: 4000, seed: 20261006 }
    );
    // The property was exercised, not passed vacuously.
    expect(quick).toBeGreaterThan(400);
  });

  it('reports a schema the meta-schema rejects with the validator message', () => {
    const invalid: Array<readonly [JsonSchema, SchemaDialect]> = [
      [{ type: 'string', minLength: -1 }, 'draft-2020-12'],
      [{ type: 'strin' }, 'draft-2020-12'],
      [{ type: 'string', pattern: 'a\\Z' }, 'draft-2020-12'],
      [{ type: 'object', required: ['a', 'a'] }, 'draft-2020-12'],
      [{ anyOf: [] }, 'draft-2019-09'],
      [{ type: 'number', multipleOf: 0 }, 'draft-2020-12'],
      [{ type: 'object', properties: { a: { type: 'number', minimum: 'x' } } }, 'draft-07'],
      [{ type: 'string', description: 5 }, 'draft-2020-12'],
      [{ type: 'string', examples: 'x' }, 'draft-07'],
      [{ enum: [] }, 'draft-07'],
      [{ enum: ['a', 'a'] }, 'draft-07'],
      [{ type: 'object', patternProperties: { '[': { type: 'string' } } }, 'draft-2020-12'],
    ];
    for (const [schema, dialect] of invalid) {
      let expected: unknown;
      try {
        reference(dialect).compile(schema);
      } catch (error) {
        expected = error;
      }
      expect(expected).toBeInstanceOf(Error);
      expect(() => jsonSchemaAdapter(schema, { dialect })).toThrow(
        expect.objectContaining({
          name: 'SchemaPreparationError',
          code: 'SCHEMA_PREPARATION_FAILED',
          message: 'Schema compilation failed at /',
          cause: expect.objectContaining({ message: (expected as Error).message }),
        })
      );
    }
    // A pattern that only the validator's Unicode mode rejects passes the meta-schema and
    // still fails when the validator compiles it.
    expect(() => jsonSchemaAdapter({ type: 'string', pattern: '^]$' })).toThrow(
      'Schema compilation failed at /'
    );
  });

  it('compiles validators that accept and report exactly as optimized code does', () => {
    const mutations = (value: unknown, depth = 0): unknown[] => {
      if (!value || typeof value !== 'object') {
        return [null, 1, 'x', [], {}];
      }
      const result: unknown[] = [];
      for (const [key, item] of Object.entries(value).slice(0, 8)) {
        for (const replacement of [null, 1.5, 'x', true, {}, []]) {
          result.push(Array.isArray(value) ? [replacement] : { ...value, [key]: replacement });
        }
        if (!Array.isArray(value)) {
          const rest: Record<string, unknown> = { ...value };
          delete rest[key];
          result.push(rest);
        }
        if (depth < 1) {
          for (const nested of mutations(item, depth + 1)) {
            result.push(Array.isArray(value) ? [nested] : { ...value, [key]: nested });
          }
        }
      }
      result.push(Array.isArray(value) ? [...value, { extra: 1 }] : { ...value, extra: 1 });
      return result;
    };
    const summary = (errors: ReadonlyArray<Record<string, unknown>>) =>
      errors.map(({ keyword, instancePath, schemaPath, message }) => ({
        keyword,
        instancePath,
        schemaPath,
        message,
      }));
    let compared = 0;
    for (const target of ['draft-07', 'draft-2020-12'] as const) {
      const optimized = reference(target);
      for (const schema of crm(target)) {
        const adapter = jsonSchemaAdapter(schema);
        const validate = optimized.compile(schema);
        const values = [1, 2, 3].map((seed) => adapter.create(adapter.session(seed)));
        for (const value of [...values, ...values.flatMap((item) => mutations(item))]) {
          const valid = validate(value);
          expect(adapter.check(value)).toBe(valid);
          expect(summary(adapter.issues(value) as never)).toEqual(summary(validate.errors ?? []));
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(5_000);
  });

  it('computes the same fingerprints as 64-bit BigInt arithmetic', () => {
    const canonical = (value: unknown): string =>
      Array.isArray(value)
        ? `[${value.map(canonical).join(',')}]`
        : value && typeof value === 'object'
          ? `{${Object.keys(value)
              .sort()
              .map((key) => `${JSON.stringify(key)}:${canonical(Reflect.get(value, key))}`)
              .join(',')}}`
          : JSON.stringify(value);
    const bigIntFingerprint = (value: unknown) => {
      let hash = 0xcbf29ce484222325n;
      for (const character of canonical(value)) {
        hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0) ?? 0)) * 0x100000001b3n);
      }
      return `json-fnv1a64-v1:${hash.toString(16).padStart(16, '0')}`;
    };
    fc.assert(
      fc.property(fc.jsonValue(), fc.string({ unit: 'binary' }), (value, text) => {
        expect(fingerprint(value)).toBe(bigIntFingerprint(value));
        expect(fingerprint(text)).toBe(bigIntFingerprint(text));
      }),
      { numRuns: 2000, seed: 20261006 }
    );
    for (const schema of crm('draft-2020-12')) {
      expect(fingerprint(schema)).toBe(bigIntFingerprint(schema));
    }
  });
});
