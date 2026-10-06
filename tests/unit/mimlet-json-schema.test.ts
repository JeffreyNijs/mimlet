import { describe, expect, it } from 'vitest';
import { fromJsonSchema, jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
import { createSession, restoreSession } from '../../packages/core/src/index.js';
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
