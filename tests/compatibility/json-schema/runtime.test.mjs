import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fromJsonSchema,
  fromStandardJsonSchema,
  jsonSchemaAdapter,
  standardJsonSchemaFields,
  SchemaGenerationError,
  SchemaPreparationError,
} from '@mimlet/json-schema';
import {
  createSession,
  fluent,
  restoreSession,
  BuilderValidationError,
  SessionBudgetError,
} from '@mimlet/core';

const object = {
  type: 'object',
  properties: {
    id: { type: 'integer', minimum: 1, maximum: 10 },
    name: { type: 'string', minLength: 1, maxLength: 10 },
  },
  required: ['id', 'name'],
  additionalProperties: false,
};
const D7 = 'http://json-schema.org/draft-07/schema#';
const D20 = 'https://json-schema.org/draft/2020-12/schema';

describe('JSON Schema generation contract', () => {
  it('generates and validates declared types, collections, constraints and booleans', () => {
    const corpus = [
      true,
      { type: 'null' },
      { type: 'boolean' },
      { const: 'fixed' },
      { enum: [1, 'x', null] },
      { type: ['number', 'null'] },
      { type: 'number', minimum: 1, maximum: 5, multipleOf: 0.25 },
      { type: 'integer', exclusiveMinimum: 1, exclusiveMaximum: 5 },
      { type: 'string', pattern: '^[A-Z]{3}$', minLength: 3, maxLength: 3 },
      { type: 'array', items: { enum: [1, 2, 3] }, minItems: 2, maxItems: 3, uniqueItems: true },
      { type: 'array', prefixItems: [{ const: 1 }, { const: 'x' }], items: false, minItems: 2 },
      object,
      {
        type: 'object',
        patternProperties: { '^x': { type: 'integer' } },
        minProperties: 1,
        maxProperties: 2,
        additionalProperties: false,
      },
      {
        type: 'object',
        propertyNames: { pattern: '^[a-z]+$' },
        additionalProperties: { type: 'boolean' },
        minProperties: 1,
      },
      {
        type: 'array',
        contains: { const: 2 },
        minContains: 1,
        maxContains: 1,
        items: { enum: [1, 2] },
        minItems: 1,
        maxItems: 3,
      },
    ];
    for (const schema of corpus) {
      const adapter = jsonSchemaAdapter(schema, { profile: 'random' });
      const session = adapter.session(123);
      for (let n = 0; n < 5; n++)
        assert.equal(adapter.check(adapter.create(session)), true, JSON.stringify(schema));
    }
  });
  it('validates compositions against the original schema, not a permissive merged approximation', () => {
    const corpus = [
      { anyOf: [{ const: 'a' }, { const: 2 }] },
      { oneOf: [{ type: 'integer' }, { type: 'string' }] },
      { type: 'integer', minimum: 0, maximum: 10, not: { const: 3 } },
      {
        allOf: [
          { type: 'object', properties: { a: { const: 'x' } }, required: ['a'] },
          { properties: { b: { type: 'integer' } }, required: ['b'] },
        ],
      },
      {
        type: 'object',
        properties: { kind: { enum: ['a', 'b'] }, value: { type: 'integer' } },
        required: ['kind', 'value'],
        if: { properties: { kind: { const: 'a' } } },
        then: { properties: { value: { minimum: 1 } } },
        else: { properties: { value: { maximum: 0 } } },
      },
      {
        type: 'object',
        properties: { a: { type: 'integer' }, b: { type: 'integer' } },
        required: ['a'],
        dependentRequired: { a: ['b'] },
      },
      {
        type: 'object',
        properties: { a: { type: 'integer' } },
        required: ['a'],
        dependentSchemas: { a: { properties: { b: { const: 1 } }, required: ['b'] } },
      },
    ];
    for (const schema of corpus) {
      const a = jsonSchemaAdapter(schema);
      assert.equal(a.check(a.create()), true);
    }
  });
  it('normalizes draft-07 tuples, definitions, ignored ref siblings and both dependency forms', () => {
    const corpus = [
      {
        $schema: D7,
        type: 'array',
        items: [{ type: 'integer' }, { const: 'x' }],
        additionalItems: false,
        minItems: 2,
      },
      { $schema: D7, type: 'array', items: [{ const: 1 }], minItems: 1, maxItems: 1 },
      {
        $schema: D7,
        type: 'array',
        items: { type: 'integer' },
        additionalItems: false,
        minItems: 1,
      },
      { $schema: D7, definitions: { a: { const: 'x' } }, $ref: '#/definitions/a', type: 'number' },
      {
        $schema: D7,
        type: 'object',
        properties: { a: { const: 1 }, b: { type: 'integer' } },
        required: ['a'],
        dependencies: { a: ['b'], b: { properties: { c: { const: 'x' } }, required: ['c'] } },
      },
    ];
    for (const schema of corpus) {
      const a = jsonSchemaAdapter(schema);
      assert.equal(a.check(a.create()), true);
    }
  });
  it('resolves local and explicit external references without installing a network resolver', () => {
    const local = jsonSchemaAdapter({ $defs: { id: { const: 'local' } }, $ref: '#/$defs/id' });
    assert.equal(local.create(), 'local');
    const remote = jsonSchemaAdapter(
      { $ref: 'https://example.invalid/User' },
      { references: { 'https://example.invalid/User': object } }
    );
    assert.equal(remote.check(remote.create()), true);
    assert.throws(
      () => jsonSchemaAdapter({ $ref: 'https://example.invalid/missing' }),
      SchemaPreparationError
    );
    assert.throws(
      () => jsonSchemaAdapter(true, { references: { 'x#fragment': true } }),
      SchemaPreparationError
    );
  });
  it('prepares only the references a schema reaches and attributes their failures', () => {
    const base = 'https://shop.example.test/';
    const references = {
      [`${base}Product.json`]: {
        type: 'object',
        required: ['price'],
        properties: { price: { $ref: `${base}Money.json` } },
      },
      [`${base}Money.json`]: { type: 'integer', minimum: 1, maximum: 9 },
      // An OpenAPI component set: one unrelated schema uses an unsupported keyword,
      // one is not valid JSON Schema at all.
      [`${base}PaymentMethod.json`]: {
        oneOf: [{ $ref: `${base}Money.json` }],
        discriminator: { propertyName: 'type' },
      },
      [`${base}Broken.json`]: { type: 'bad' },
      [`${base}Order.json`]: {
        type: 'object',
        properties: { payment: { $ref: `${base}PaymentMethod.json` } },
      },
      [`${base}Aliased.json`]: { $id: `${base}aliases/Card.json`, not: {}, discriminator: {} },
    };
    const product = jsonSchemaAdapter({ $ref: `${base}Product.json` }, { references });
    assert.equal(product.check(product.create()), true);
    const failure = (schema, options = { references }) => {
      try {
        jsonSchemaAdapter(schema, options);
      } catch (error) {
        assert.ok(error instanceof SchemaPreparationError);
        assert.equal(error.code, 'SCHEMA_PREPARATION_FAILED');
        return error;
      }
      assert.fail('Expected preparation to fail');
    };
    // Directly, and through another reference, the failure names the reference it is in.
    for (const schema of [
      { $ref: `${base}PaymentMethod.json` },
      { properties: { order: { $ref: `${base}Order.json` } } },
    ]) {
      const error = failure(schema);
      assert.equal(error.schemaPath, '/discriminator');
      assert.equal(error.reference, `${base}PaymentMethod.json`);
      assert.equal(error.missingReference, undefined);
      assert.equal(
        error.message,
        `Unsupported schema keyword discriminator at /discriminator in reference ${base}PaymentMethod.json`
      );
    }
    const aliased = failure({ $ref: `${base}aliases/Card.json` });
    assert.equal(aliased.reference, `${base}Aliased.json`);
    const broken = failure({ $ref: `${base}Broken.json` });
    assert.equal(broken.message, `Invalid referenced schema at / in reference ${base}Broken.json`);
    assert.equal(broken.schemaPath, '');
    assert.ok(broken.cause instanceof Error);
    // The root schema keeps its own diagnostics without a reference.
    const root = failure({ discriminator: {} });
    assert.equal(root.reference, undefined);
    assert.equal(root.schemaPath, '/discriminator');
  });
  it('names a missing reference and where it is used', () => {
    const base = 'https://shop.example.test/';
    const failure = (schema, options) => {
      try {
        jsonSchemaAdapter(schema, options);
      } catch (error) {
        assert.ok(error instanceof SchemaPreparationError);
        return error;
      }
      assert.fail('Expected preparation to fail');
    };
    const order = failure({
      type: 'object',
      properties: { id: { type: 'string' }, customer: { $ref: `${base}Customer.json` } },
    });
    assert.equal(order.missingReference, `${base}Customer.json`);
    assert.equal(order.schemaPath, '/properties/customer/$ref');
    assert.equal(order.reference, undefined);
    assert.equal(
      order.message,
      `Unresolved reference ${base}Customer.json at /properties/customer/$ref`
    );
    // Inside a supplied reference, the path is relative to that reference.
    const nested = failure(
      { items: { $ref: `${base}LineItem.json` } },
      {
        references: {
          [`${base}LineItem.json`]: {
            properties: { product: { default: { $ref: 'x' }, $ref: 'Product.json' } },
          },
        },
      }
    );
    assert.equal(nested.missingReference, `${base}Product.json`);
    assert.equal(nested.reference, `${base}LineItem.json`);
    assert.equal(nested.schemaPath, '/properties/product/$ref');
    // Relative and local references resolve against the schema's own base.
    const relative = failure(
      { $id: `${base}Root.json`, items: [{ $ref: 'Customer.json' }] },
      {
        dialect: 'draft-07',
      }
    );
    assert.equal(relative.missingReference, `${base}Customer.json`);
    assert.equal(relative.schemaPath, '/items/0/$ref');
    const local = failure({ $defs: { a: true }, $ref: '#/$defs/b' });
    assert.equal(local.missingReference, '#/$defs/b');
    assert.equal(local.schemaPath, '/$ref');
    const long = `${base}${'x'.repeat(300)}`;
    const clipped = failure({ $ref: long });
    assert.equal(clipped.missingReference, long);
    assert.ok(clipped.message.length < 260);
  });
  it('uses examples and defaults as validated candidates with fallback', () => {
    assert.equal(
      fromJsonSchema({ type: 'string', default: 'default' }, { profile: 'defaults' }).build(),
      'default'
    );
    assert.equal(
      fromJsonSchema({ type: 'string', examples: ['example'] }, { profile: 'examples' }).build(),
      'example'
    );
    const a = jsonSchemaAdapter(
      { type: 'integer', minimum: 0, maximum: 2, default: -4 },
      { profile: 'defaults' }
    );
    assert.equal(a.check(a.create()), true);
    const b = jsonSchemaAdapter({ type: 'integer', examples: ['bad'] }, { profile: 'examples' });
    assert.equal(b.check(b.create()), true);
  });
  it('never repairs explicit overrides, and separates validation from unchecked builds', () => {
    const builder = fromJsonSchema(object).with({ id: -1 });
    assert.equal(builder.build().id, -1);
    assert.throws(() => builder.buildValidated(), BuilderValidationError);
    assert.throws(
      () => fromJsonSchema(object).with({ other: 1 }).buildValidated(),
      BuilderValidationError
    );
    assert.throws(() => fromJsonSchema(object).omit('id').buildValidated(), BuilderValidationError);
  });
  it('copies preparation inputs, output defaults and inspected schemas', () => {
    const s = { type: 'object', default: { a: [] } };
    const a = jsonSchemaAdapter(s, { profile: 'defaults' });
    s.default.a.push(1);
    const x = a.create();
    x.a.push(2);
    assert.deepEqual(a.create(), { a: [] });
    a.source.default.a.push(3);
    assert.deepEqual(a.create(), { a: [] });
  });
  it('replays sequences exactly, isolates unrelated session scopes, and identifies configuration', () => {
    const a = jsonSchemaAdapter(object, { profile: 'random' });
    const session = a.session('test');
    const snapshot = session.snapshot();
    const first = Array.from({ length: 10 }, () => a.create(session));
    const restored = restoreSession(snapshot, a.identity);
    restored.scope('unrelated').random();
    assert.deepEqual(
      Array.from({ length: 10 }, () => a.create(restored)),
      first
    );
    assert.deepEqual(a.create(), a.create());
    assert.notEqual(a.identity.configuration, jsonSchemaAdapter(object).identity.configuration);
    assert.equal(
      a.identity.fingerprint,
      jsonSchemaAdapter({
        ...object,
        properties: { name: object.properties.name, id: object.properties.id },
      }).identity.fingerprint
    );
  });
  it('retains list budgets and async fluent behavior', async () => {
    const b = fromJsonSchema({ type: 'integer' }, { maxListSize: 2 }).transformAsync(
      async (value) => value
    );
    assert.equal((await b.buildValidatedListAsync(2)).length, 2);
    await assert.rejects(b.buildValidatedListAsync(3), RangeError);
  });
  it('returns native issue paths and keyword details including escaped property names', () => {
    const a = jsonSchemaAdapter({
      type: 'object',
      properties: { 'a/b~c': { type: 'integer' } },
      required: ['a/b~c'],
      additionalProperties: false,
    });
    assert.deepEqual(a.issues({ 'a/b~c': 'x' })[0].path, ['a/b~c']);
    assert.deepEqual(a.issues({})[0].path, ['a/b~c']);
    assert.deepEqual(a.issues({ 'a/b~c': 1, extra: 2 })[0].path, ['extra']);
    assert.deepEqual(a.issues({ 'a/b~c': 1 }), []);
    assert.equal(a.issues({ 'a/b~c': 'x' })[0].keyword, 'type');
    assert.equal(jsonSchemaAdapter({ type: 'integer' }).issues('x')[0].path.length, 0);
  });
  it('supports paired custom formats without touching global registries', () => {
    const a = jsonSchemaAdapter(
      { type: 'string', format: 'app-id' },
      {
        formatsIdentity: 'app-id-v1',
        formats: {
          'app-id': { validate: (v) => /^APP-\d+$/.test(v), generate: (r) => `APP-${r.int(1, 9)}` },
        },
      }
    );
    assert.match(a.create(), /^APP-\d$/);
    assert.equal(a.check('bad'), false);
    assert.throws(
      () => jsonSchemaAdapter({ type: 'string', format: 'app-id' }),
      SchemaPreparationError
    );
  });
  it('generates standard formats with a fixed reference date', () => {
    for (const format of ['email', 'uuid', 'date-time', 'ipv4', 'uri']) {
      const a = jsonSchemaAdapter({ type: 'string', format });
      assert.equal(a.check(a.create()), true);
    }
  });
  it('rejects provider-unsafe schema keys before invoking generation or validation', () => {
    const s = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"const":"ok"}},"required":["__proto__"],"additionalProperties":false}'
    );
    assert.throws(() => jsonSchemaAdapter(s), SchemaPreparationError);
    assert.equal({}.polluted, undefined);
  });
});

describe('Standard JSON Schema interoperability', () => {
  it('converts INPUT, invokes native parsing once, and forwards native options separately', () => {
    let conversions = 0,
      calls = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        jsonSchema: {
          input(options) {
            assert.equal(options.target, 'draft-07');
            conversions++;
            return { type: 'string', const: '42' };
          },
          output() {
            assert.fail('output conversion must not run');
          },
        },
        validate(value, options) {
          calls++;
          assert.equal(options.libraryOptions.x, 1);
          return { value: Number(value) };
        },
      },
    };
    const b = fromStandardJsonSchema(schema, { dialect: 'draft-07' }).usingValidation({
      libraryOptions: { x: 1 },
    });
    assert.equal(b.build(), '42');
    assert.equal(calls, 0);
    assert.equal(b.buildValidated(), 42);
    assert.equal(calls, 1);
    assert.equal(conversions, 1);
  });
  it('does not retry opaque refinements or codec failures', async () => {
    let calls = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'custom',
        jsonSchema: { input: () => ({ const: 1 }) },
        validate: async () => {
          calls++;
          return { issues: [{ message: 'external rule failed' }] };
        },
      },
    };
    await assert.rejects(
      fromStandardJsonSchema(schema).buildValidatedAsync(),
      BuilderValidationError
    );
    assert.equal(calls, 1);
    const failure = new Error('native');
    schema['~standard'].jsonSchema.input = () => {
      throw failure;
    };
    assert.throws(
      () => fromStandardJsonSchema(schema),
      (e) => e === failure
    );
  });
  it('rejects missing or malformed capabilities', () => {
    for (const s of [
      null,
      {},
      { '~standard': { version: 2 } },
      { '~standard': { version: 1, validate() {} } },
    ])
      assert.throws(() => fromStandardJsonSchema(s), TypeError);
  });
  it('lists the input projection properties for a setter per field', () => {
    const targets = [];
    const standard = (input) => ({
      '~standard': {
        version: 1,
        vendor: 'custom',
        jsonSchema: {
          input(options) {
            targets.push(options.target);
            return input;
          },
          output: () => assert.fail('output conversion must not run'),
        },
        validate: (value) => ({ value: { ...value, age: Number(value.age) } }),
      },
    });
    const schema = standard({
      type: 'object',
      properties: {
        name: { type: 'string', const: 'Ada' },
        age: { type: 'string', const: '42' },
      },
      required: ['name', 'age'],
    });
    assert.deepEqual([...standardJsonSchemaFields(schema)], ['name', 'age']);
    assert.deepEqual(
      [...standardJsonSchemaFields(schema, { dialect: 'draft-07' })],
      ['name', 'age']
    );
    assert.deepEqual(targets, ['draft-2020-12', 'draft-07']);
    const users = fluent(fromStandardJsonSchema(schema), standardJsonSchemaFields(schema));
    assert.deepEqual(users.withAge('7').buildValidated(), { name: 'Ada', age: 7 });
    for (const s of [null, {}, { '~standard': { version: 1, validate() {} } }])
      assert.throws(() => standardJsonSchemaFields(s), /Standard JSON Schema/);
    for (const input of [{ type: 'string' }, { properties: [] }, null, true])
      assert.throws(() => standardJsonSchemaFields(standard(input)), /top-level properties/);
  });
});

describe('schema and generation boundaries', () => {
  it('rejects unknown, executable, dynamic, and dialect-mismatched vocabulary', () => {
    for (const s of [
      { faker: 'name' },
      { $dynamicRef: '#x' },
      { $anchor: 'x' },
      { unexpected: true },
      { $schema: 'http://json-schema.org/draft-04/schema#' },
      { $schema: 12 },
    ])
      assert.throws(() => jsonSchemaAdapter(s), SchemaPreparationError);
    assert.throws(
      () => jsonSchemaAdapter({ $schema: D7 }, { dialect: 'draft-2020-12' }),
      SchemaPreparationError
    );
    assert.throws(
      () => jsonSchemaAdapter({ $schema: D20, properties: { a: { $schema: D7 } } }),
      SchemaPreparationError
    );
  });
  it('rejects malformed schemas and unsupported nested shapes', () => {
    for (const s of [
      null,
      [],
      3,
      'string',
      { type: 'made-up' },
      { type: 'number', minimum: 'x' },
      { properties: [] },
      { properties: { a: null } },
      { allOf: {} },
      { items: [true] },
      { $ref: 1 },
      { dependencies: [] },
    ])
      assert.throws(() => jsonSchemaAdapter(s), SchemaPreparationError);
    assert.throws(
      () => jsonSchemaAdapter({ $ref: 'x' }, { references: { x: { type: 'bad' } } }),
      SchemaPreparationError
    );
  });
  it('rejects non-JSON data without invoking getters', () => {
    const accessor = {};
    Object.defineProperty(accessor, 'type', {
      enumerable: true,
      get() {
        return assert.fail();
      },
    });
    const cyclic = {};
    cyclic.self = cyclic;
    const hidden = Object.defineProperty({}, 'hidden', { value: 1 });
    const symbol = { [Symbol('x')]: 1 };
    const sparse = Array(2);
    for (const s of [
      accessor,
      cyclic,
      { default: () => 1 },
      { default: [undefined] },
      { default: NaN },
      { default: new Date() },
      { default: 1n },
      hidden,
      symbol,
      { default: sparse },
    ])
      assert.throws(() => jsonSchemaAdapter(s), SchemaPreparationError);
  });
  it('enforces preparation and output allocation budgets', () => {
    for (const options of [
      { maxSchemaNodes: 0 },
      { maxSchemaDepth: 0 },
      { maxSchemaCharacters: 1 },
    ])
      assert.throws(() => jsonSchemaAdapter(object, options), SchemaPreparationError);
    for (const s of [
      { type: 'array', minItems: 1001 },
      { type: 'string', minLength: 10001 },
      { type: 'object', minProperties: 100001 },
    ])
      assert.throws(() => jsonSchemaAdapter(s), SchemaPreparationError);
    for (const options of [
      { maxAttempts: -1 },
      { maxAttempts: NaN },
      { maxValueDepth: 65 },
      { maxSchemaDepth: 129 },
      { maxSchemaNodes: 10000001 },
    ])
      assert.throws(() => jsonSchemaAdapter(true, options), RangeError);
    assert.throws(
      () => jsonSchemaAdapter(false, { maxAttempts: 2 }).create(),
      (e) => e instanceof SchemaGenerationError && e.attempts === 2 && e.cause !== undefined
    );
    assert.throws(
      () => jsonSchemaAdapter(true, { maxAttempts: 0 }).create(),
      (e) => e.attempts === 0
    );
    assert.throws(
      () =>
        jsonSchemaAdapter({ const: 'too long' }, { maxStringLength: 2, maxAttempts: 1 }).create(),
      SchemaGenerationError
    );
    assert.throws(
      () => jsonSchemaAdapter({ const: [1, 2] }, { maxArrayLength: 1, maxAttempts: 1 }).create(),
      SchemaGenerationError
    );
    assert.throws(
      () => jsonSchemaAdapter({ const: { x: 1 } }, { maxValueNodes: 1, maxAttempts: 1 }).create(),
      SchemaGenerationError
    );
    assert.throws(
      () => jsonSchemaAdapter({ const: { x: {} } }, { maxValueDepth: 0, maxAttempts: 1 }).create(),
      SchemaGenerationError
    );
  });
  it('rejects invalid profile or format configuration', () => {
    assert.throws(() => jsonSchemaAdapter(true, { profile: 'magic' }), TypeError);
    assert.throws(() => jsonSchemaAdapter(true, { formats: { x: {} } }), TypeError);
    assert.throws(
      () => jsonSchemaAdapter(true, { formats: { x: {} }, formatsIdentity: 'x' }),
      TypeError
    );
    const invalid = jsonSchemaAdapter(
      { type: 'string', format: 'x' },
      {
        formatsIdentity: 'x',
        maxAttempts: 1,
        formats: { x: { validate: () => false, generate: () => 42 } },
      }
    );
    assert.throws(() => invalid.create(), SchemaGenerationError);
    const validation = jsonSchemaAdapter(
      { type: 'string', format: 'x' },
      {
        formatsIdentity: 'x',
        maxAttempts: 1,
        formats: { x: { validate: () => 1, generate: () => '' } },
      }
    );
    assert.throws(() => validation.create(), SchemaGenerationError);
  });
  it('propagates session exhaustion without disguising it as schema impossibility', () => {
    const a = jsonSchemaAdapter(true);
    const session = createSession({ ...a.identity, seed: 1, maxOperations: 0 });
    assert.throws(() => a.create(session), SessionBudgetError);
  });
  it('does not accept non-JSON and oversized values through validated builds', () => {
    const b = fromJsonSchema(true, { maxStringLength: 2 });
    assert.equal(jsonSchemaAdapter(true).check(new Date()), false);
    assert.equal(jsonSchemaAdapter(true).issues(new Date())[0].keyword, 'jsonData');
    for (const value of [new Date(), () => 1, 'too long', NaN])
      assert.throws(() => b.replace(value).buildValidated(), BuilderValidationError);
  });
  it('leaves undefined schema properties out and names non-JSON schema values', () => {
    const adapter = jsonSchemaAdapter({ type: 'integer', title: undefined, minimum: 1 });
    assert.deepEqual(adapter.source, { type: 'integer', minimum: 1 });
    assert.equal(adapter.check({ id: undefined }), false);
    class Shape {}
    for (const [schema, message] of [
      [{ enum: [1, undefined] }, /^Expected JSON data, found undefined at \/enum\/1$/],
      [{ default: () => 1 }, /^Expected JSON data, found a function at \/default$/],
      [{ default: Symbol('x') }, /^Expected JSON data, found a symbol at \/default$/],
      [{ maximum: -Infinity }, /^Expected JSON data, found -Infinity at \/maximum$/],
      [{ const: new Shape() }, /found an instance of Shape at \/const$/],
      [{ const: Object.create(Object.create(null)) }, /found an object that is not a plain record/],
    ])
      assert.throws(() => jsonSchemaAdapter(schema), { name: 'SchemaPreparationError', message });
  });
});

describe('the realistic profile', () => {
  const realistic = (schema, options = {}) =>
    jsonSchemaAdapter(schema, { profile: 'realistic', ...options });
  const sample = (adapter, count = 8) =>
    Array.from({ length: count }, (_, seed) => {
      const value = adapter.create(adapter.session(seed));
      assert.equal(adapter.check(value), true, JSON.stringify(value));
      return value;
    });
  const between = (value, low, high) =>
    assert.ok(value >= low && value <= high, `${value} is not within ${low}..${high}`);

  it('narrows wide or open number ranges and keeps declared bounds', () => {
    const cases = [
      [{ type: 'integer' }, 1, 100],
      [{ type: 'number', minimum: 0 }, 1, 100],
      [
        { type: ['integer', 'null'], minimum: -9007199254740991, maximum: 9007199254740991 },
        1,
        100,
      ],
      [{ type: 'integer', minimum: 0, maximum: 10 }, 0, 10],
      [{ type: 'number', maximum: -5 }, -104, -5],
      [{ type: 'integer', exclusiveMaximum: 1 }, -98, 0],
      [{ type: 'integer', minimum: 5000 }, 5000, 5099],
      [{ type: 'number', exclusiveMinimum: 200, exclusiveMaximum: 100000 }, 200, 299],
      [{ type: 'number', exclusiveMinimum: 0, maximum: 1e9 }, 1, 100],
      [{ type: 'integer', multipleOf: 7 }, 7, 98],
      // No multiple of 1000 lies in the preferred window, so the declared range is kept.
      [{ type: 'integer', multipleOf: 1000, minimum: 0, maximum: 1e7 }, 0, 1e7],
    ];
    for (const [schema, low, high] of cases)
      for (const value of sample(realistic(schema))) between(value, low, high);
    for (const value of sample(realistic({ type: 'number', multipleOf: 0.5 })))
      assert.equal(value % 0.5, 0);
    // Decimals have two places unless rounding would leave the declared range.
    for (const value of sample(realistic({ type: 'number' })))
      assert.equal(Math.round(value * 100) / 100, value);
    for (const value of sample(realistic({ type: 'number', minimum: 0.001, maximum: 0.004 })))
      between(value, 0.001, 0.004);
    for (const value of sample(realistic({ type: 'number', exclusiveMinimum: 0, maximum: 0.004 })))
      assert.ok(value > 0 && value <= 0.004);
  });

  it('generates readable strings and leaves formats, patterns and enums to the provider', () => {
    for (const value of sample(realistic({ type: 'string' })))
      assert.match(value, /^[A-Z][a-z]+(?: [a-z]+){0,2}$/);
    for (const value of sample(realistic({ type: 'string', minLength: 40 }))) {
      assert.equal(value.length >= 40, true);
      assert.match(value, /^[A-Z][a-z ]+$/);
    }
    for (const value of sample(realistic({ type: 'string', maxLength: 2 })))
      assert.match(value, /^[A-Z][a-z]?$/);
    assert.deepEqual(sample(realistic({ type: 'string', maxLength: 0 }), 2), ['', '']);
    for (const value of sample(realistic({ type: 'string', minLength: 7, maxLength: 7 })))
      assert.equal(value.length, 7);
    for (const value of sample(realistic({ type: 'string', format: 'uuid' })))
      assert.match(value, /^[0-9a-f-]{36}$/);
    for (const value of sample(realistic({ type: 'string', pattern: '^[0-9]{4}$' })))
      assert.match(value, /^[0-9]{4}$/);
    for (const value of sample(realistic({ enum: ['lower_case', 'x'] })))
      assert.ok(['lower_case', 'x'].includes(value));
    for (const value of sample(realistic({ type: 'string', contentMediaType: 'text/plain' })))
      assert.equal(typeof value, 'string');
    for (const value of sample(realistic({ type: ['integer', 'string'] }), 16))
      assert.ok(typeof value === 'number' || /^[A-Z][a-z]+(?: [a-z]+)*$/.test(value));
  });

  it('fills optional fields, nullable values and short arrays without unbounded recursion', () => {
    const schema = {
      $id: 'https://example.test/order.json',
      type: 'object',
      properties: {
        note: { type: ['string', 'null'] },
        status: { oneOf: [{ enum: ['open', 'closed'] }, { type: ['null'] }] },
        hidden: false,
        lines: { type: 'array', items: { $ref: '#/$defs/line' } },
        tuple: { type: 'array', prefixItems: [{ type: 'boolean' }], items: false },
        empty: { type: 'array', items: false },
        tags: { type: 'array', items: { type: 'string' }, maxItems: 0 },
        found: { type: 'array', contains: { const: 1 } },
        parent: { $ref: '#' },
        enum: { $ref: '#/$defs/line' },
      },
      $defs: {
        line: { type: 'object', properties: { label: { type: 'string', maxLength: 12 } } },
      },
    };
    for (const value of sample(realistic(schema))) {
      assert.deepEqual(Object.keys(value).sort(), [
        'empty',
        'enum',
        'found',
        'lines',
        'note',
        'status',
        'tags',
        'tuple',
      ]);
      assert.equal(typeof value.note, 'string');
      assert.ok(['open', 'closed'].includes(value.status));
      between(value.lines.length, 1, 3);
      for (const line of value.lines) assert.equal(typeof line.label, 'string');
      assert.equal(value.tuple.length, 1);
      assert.deepEqual(value.empty, []);
      assert.deepEqual(value.tags, []);
    }
    // Too many optional properties for maxProperties: only the required ones are forced.
    for (const value of sample(
      realistic({
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' } },
        required: ['a'],
        maxProperties: 1,
      })
    ))
      assert.deepEqual(Object.keys(value), ['a']);
    // A nested $id changes reference resolution, so its references are never forced.
    const nested = realistic({
      type: 'object',
      properties: { item: { $ref: 'https://example.test/item.json' } },
      $defs: { item: { $id: 'https://example.test/item.json', type: 'object' } },
    });
    for (const value of sample(nested)) assert.deepEqual(value, {});
    // Reference documents get the same hints; a cycle through them stays optional.
    const references = {
      'https://example.test/a.json': {
        type: 'object',
        properties: { name: { type: 'string' }, b: { $ref: 'b.json' } },
      },
      'https://example.test/b.json': {
        $id: 'https://example.test/b.json',
        type: 'object',
        properties: { a: { $ref: 'https://example.test/a.json' }, size: { type: 'integer' } },
      },
    };
    for (const value of sample(realistic({ $ref: 'https://example.test/a.json' }, { references })))
      assert.deepEqual(Object.keys(value), ['name']);
    for (const value of sample(realistic({ $ref: 'https://example.test/b.json' }, { references })))
      between(value.size, 1, 100);
  });

  it('uses examples first, then falls back to unhinted candidates', () => {
    const examples = realistic({ type: 'integer', examples: [12345] });
    assert.deepEqual(sample(examples, 3), [12345, 12345, 12345]);
    const invalid = realistic({ type: 'integer', maximum: 10, examples: [12345] });
    for (const value of sample(invalid)) assert.ok(value <= 10);
    const conflicting = realistic({
      type: 'object',
      properties: { a: { type: 'boolean' }, b: { type: 'boolean' } },
      oneOf: [{ required: ['a'] }, { required: ['b'] }],
    });
    for (const value of sample(conflicting)) assert.equal(Object.keys(value).length, 1);
    const single = realistic(
      { type: 'object', properties: { a: { type: 'string' } } },
      { maxAttempts: 1 }
    );
    assert.deepEqual(Object.keys(single.create()), ['a']);
  });

  it('records the profile in the replay identity without changing other profiles', () => {
    const schema = { type: 'object', properties: { id: { type: 'integer' } } };
    const minimal = jsonSchemaAdapter(schema);
    const lifelike = realistic(schema);
    assert.equal(lifelike.identity.fingerprint, minimal.identity.fingerprint);
    assert.notEqual(lifelike.identity.configuration, minimal.identity.configuration);
    assert.equal(
      minimal.identity.configuration,
      jsonSchemaAdapter(schema, { profile: 'minimal' }).identity.configuration
    );
    const session = lifelike.session(3);
    const snapshot = session.snapshot();
    const value = lifelike.create(session);
    assert.deepEqual(lifelike.create(restoreSession(snapshot, lifelike.identity)), value);
    assert.throws(() => restoreSession(snapshot, minimal.identity));
    assert.deepEqual(
      fromJsonSchema(schema, { profile: 'realistic' }).buildList(3),
      fromJsonSchema(schema, { profile: 'realistic' }).buildList(3)
    );
  });
});
