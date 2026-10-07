import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jsonSchemaAdapter } from '@mimlet/json-schema';

// An adapter with a custom format always has its validator check the schema against the
// meta-schema in full, so it is the reference for the quick check that other adapters use.
const fullCheck = {
  formats: { 'x-unused': { validate: () => true, generate: () => 'x' } },
  formatsIdentity: 'unused/v1',
};
const probes = [null, true, 0, 1.5, -1, 'a', 'abc', [], ['a', 1], {}, { a: 'x' }, { a: 1, b: [] }];

/** What preparing the schema produces: an error, or what the validator accepts. */
function outcome(schema, options) {
  try {
    const adapter = jsonSchemaAdapter(globalThis.structuredClone(schema), options);
    return { accepts: probes.map((value) => adapter.check(value)) };
  } catch (error) {
    return {
      name: error.name,
      code: error.code,
      message: error.message,
      schemaPath: error.schemaPath,
      cause: error.cause instanceof Error ? error.cause.message : undefined,
    };
  }
}

const URI = {
  'draft-07': 'http://json-schema.org/draft-07/schema#',
  'draft-2019-09': 'https://json-schema.org/draft/2019-09/schema',
  'draft-2020-12': 'https://json-schema.org/draft/2020-12/schema',
};
const common = [
  { type: 'string', minLength: 1, maxLength: 5, pattern: '^[a-z]+$', title: 't' },
  { type: ['string', 'null'], description: 'd', $comment: 'c', default: null, examples: ['a'] },
  { type: 'number', minimum: 0, maximum: 9, exclusiveMinimum: -1, exclusiveMaximum: 10 },
  { type: 'integer', multipleOf: 2, readOnly: true, writeOnly: false, const: 4 },
  { enum: ['a', 'b', 1, null] },
  { type: 'string', format: 'email', contentEncoding: 'base64', contentMediaType: 'text/plain' },
  {
    type: 'object',
    properties: { a: { type: 'string' }, b: { type: 'array', items: { type: 'integer' } } },
    required: ['a'],
    additionalProperties: false,
    patternProperties: { '^x-': { type: 'integer' } },
    propertyNames: { maxLength: 10 },
    minProperties: 1,
    maxProperties: 4,
  },
  { type: 'array', items: { type: 'string' }, minItems: 0, maxItems: 3, uniqueItems: true },
  { type: 'array', contains: { type: 'integer' } },
  { allOf: [{ type: 'object' }], anyOf: [{ required: ['a'] }, true], oneOf: [{}] },
  { not: { type: 'array' }, if: { type: 'string' }, then: { minLength: 1 }, else: true },
  { anyOf: [{ type: 'string' }, { type: 'null' }], deprecated: false },
  // The meta-schema rejects these; the error must be the validator's own.
  { type: 'string', minLength: -1 },
  { type: 'strin' },
  { type: ['string', 'string'] },
  { type: [] },
  { type: 'object', required: ['a', 'a'] },
  { type: 'object', required: 'a' },
  { anyOf: [] },
  { allOf: [{ type: 'string', maxLength: 1.5 }] },
  { type: 'number', multipleOf: 0 },
  { type: 'object', properties: { a: { type: 'number', minimum: 'x' } } },
  { type: 'string', description: 5, title: 'ok' },
  { type: 'string', examples: 'x' },
  { type: 'string', readOnly: 'yes' },
  { type: 'string', pattern: 'a\\Z' },
  { type: 'string', pattern: '^]$' },
  { type: 'object', patternProperties: { '[': { type: 'string' } } },
  { not: { not: { not: { type: 'object', properties: { a: { maxItems: -2 } } } } } },
  // Left to the validator: identifiers, anchors and data the quick check does not decide.
  { $id: 'https://example.test/item', type: 'string' },
  { $schema: 'https://json-schema.org/draft/2020-12/schema#', type: 'string' },
  { enum: [{ a: 1 }, { a: 1 }] },
];
const byDialect = {
  'draft-07': [
    { definitions: { a: { type: 'string' } }, $ref: '#/definitions/a' },
    { dependencies: { a: ['b'], c: { required: ['d'] } } },
    { dependencies: { a: ['b', 'b'] } },
    { type: 'array', items: [{ type: 'string' }], additionalItems: false },
    { type: 'array', items: [] },
    { enum: [] },
    { enum: ['a', 'a'] },
  ],
  'draft-2019-09': [
    { $defs: { a: { type: 'string' } }, $ref: '#/$defs/a' },
    { type: 'array', items: [{}, { type: 'integer' }], additionalItems: true, minContains: 0 },
    { dependentRequired: { a: ['b'] }, dependentSchemas: { a: { required: ['c'] } } },
    { dependentRequired: { a: 'b' } },
    { type: 'object', unevaluatedProperties: false, properties: { a: true } },
  ],
  'draft-2020-12': [
    { $defs: { a: { type: 'string' } }, $ref: '#/$defs/a' },
    {
      type: 'array',
      prefixItems: [{ type: 'string' }],
      items: { type: 'integer' },
      contains: true,
      minContains: 0,
      maxContains: 2,
      unevaluatedItems: false,
    },
    { type: 'array', prefixItems: [] },
    { dependentRequired: { a: ['b'] }, dependentSchemas: { a: { required: ['c'] } } },
    { type: 'string', contentSchema: { type: 'object' }, contentMediaType: 'application/json' },
    { $defs: { a: { type: 'string', minLength: -1 } } },
  ],
};

describe('the meta-schema check in the packed package', () => {
  for (const dialect of Object.keys(URI)) {
    it(`prepares ${dialect} schemas exactly as a full meta-schema check does`, () => {
      const schemas = [...common, ...byDialect[dialect]];
      for (const schema of [
        ...schemas,
        ...schemas.map((each) => ({ $schema: URI[dialect], ...each })),
      ]) {
        const quick = outcome(schema, { dialect });
        assert.deepEqual(quick, outcome(schema, { dialect, ...fullCheck }), JSON.stringify(schema));
      }
      // Both kinds of outcome were compared.
      assert.ok('accepts' in outcome({ type: 'string' }, { dialect }));
      assert.match(
        outcome({ type: 'string', minLength: -1 }, { dialect }).cause,
        /^schema is invalid: data\/minLength must be >= 0/
      );
    });
  }
});
