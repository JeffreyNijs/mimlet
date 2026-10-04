import { describe, expect, it } from 'vitest';
import { type } from 'arktype';
import { Schema } from 'effect';
import Type from 'typebox';
import { Type as LegacyType } from '@sinclair/typebox';
import * as v from 'valibot';
import { z } from 'zod';
import {
  BuilderGenerationError,
  BuilderValidationError,
  createSchemaBuilder,
  formatValidationIssues,
} from '../../packages/core/src/index.js';
import type { StandardSchemaV1 } from '../../packages/core/src/index.js';
import { fromArkTypeFactory } from '../../packages/arktype/src/index.js';
import { fromEffectFactory } from '../../packages/effect/src/index.js';
import { jsonSchemaAdapter } from '../../packages/json-schema/src/index.js';
import { fromTypeBox, fromTypeBoxFactory } from '../../packages/typebox/src/index.js';
import { fromTypeBoxFactory as fromLegacyTypeBoxFactory } from '../../packages/typebox-legacy/src/index.js';
import { valibotAdapter } from '../../packages/valibot/src/index.js';
import { fromZodFactory } from '../../packages/zod/src/index.js';

// Every adapter rejects the same two fields. Native messages repeat the rejected
// values in different ways; the error message must name only the paths.
const SECRET = 'PRIVATE_FIXTURE_SENTINEL';
const fixture = () => ({ owner: { email: SECRET }, items: [{ price: SECRET }] });
// ArkType sorts its issues by path; the other adapters keep schema order.
const expected =
  /^Schema validation failed: \d+ issues at (owner\.email, items\[0\]\.price|items\[0\]\.price, owner\.email)$/;
const jsonSchema = {
  type: 'object',
  required: ['owner', 'items'],
  properties: {
    owner: {
      type: 'object',
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['price'],
        properties: { price: { type: 'number', exclusiveMinimum: 0 } },
      },
    },
  },
} as const;
const builders: ReadonlyArray<readonly [string, () => { buildValidated(): unknown }]> = [
  [
    'zod',
    () =>
      fromZodFactory(
        z.object({
          owner: z.object({ email: z.email() }),
          items: z.array(z.object({ price: z.number().positive() })),
        }),
        fixture as never
      ),
  ],
  [
    'valibot',
    () =>
      createSchemaBuilder(
        valibotAdapter(
          v.object({
            owner: v.object({ email: v.pipe(v.string(), v.email()) }),
            items: v.array(v.object({ price: v.pipe(v.number(), v.minValue(1)) })),
          })
        ).standard,
        fixture as never
      ),
  ],
  [
    'arktype',
    () =>
      fromArkTypeFactory(
        type({ owner: { email: 'string.email' }, items: type({ price: 'number > 0' }).array() }),
        fixture as never
      ),
  ],
  [
    'typebox',
    () =>
      fromTypeBoxFactory(
        Type.Object({
          owner: Type.Object({ email: Type.String({ format: 'email' }) }),
          items: Type.Array(Type.Object({ price: Type.Number({ exclusiveMinimum: 0 }) })),
        }),
        fixture as never
      ),
  ],
  [
    '@sinclair/typebox',
    () =>
      fromLegacyTypeBoxFactory(
        LegacyType.Object({
          owner: LegacyType.Object({ email: LegacyType.String({ minLength: 64 }) }),
          items: LegacyType.Array(
            LegacyType.Object({ price: LegacyType.Number({ exclusiveMinimum: 0 }) })
          ),
        }),
        fixture as never
      ),
  ],
  ['json-schema', () => createSchemaBuilder(jsonSchemaAdapter(jsonSchema).standard, fixture)],
  [
    'effect',
    () =>
      fromEffectFactory(
        Schema.Struct({
          owner: Schema.Struct({ email: Schema.String.check(Schema.isPattern(/^[^@]+@[^@]+$/)) }),
          items: Schema.Array(
            Schema.Struct({ price: Schema.Number.check(Schema.isGreaterThan(0)) })
          ),
        }),
        fixture as never,
        { parseOptions: { errors: 'all' } }
      ),
  ],
];

describe('BuilderValidationError names failing paths for every adapter', () => {
  for (const [name, create] of builders) {
    it(name, () => {
      let caught: unknown;
      try {
        create().buildValidated();
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(BuilderValidationError);
      const error = caught as BuilderValidationError;
      expect(error.message).toMatch(expected);
      expect(String(error)).not.toContain(SECRET);
      expect(error.stack).not.toContain(SECRET);
      expect(JSON.stringify(error)).not.toContain(SECRET);
      expect(formatValidationIssues(error)).not.toContain(SECRET);
      expect(formatValidationIssues(error, { messages: true })).toContain('owner.email: ');
    });
  }
});

describe('nested and asynchronous validation failures', () => {
  it('names the path when native TypeBox creation produces an invalid default', () => {
    const builder = fromTypeBox(Type.Object({ age: Type.Integer({ minimum: 18, default: 1 }) }));
    let caught: unknown;
    try {
      builder.build();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(BuilderGenerationError);
    const cause = (caught as Error).cause;
    expect(cause).toBeInstanceOf(BuilderValidationError);
    expect((cause as Error).message).toBe('Schema validation failed: 1 issue at age');
  });

  it('summarizes asynchronous validation in the same way', async () => {
    const standard: StandardSchemaV1<unknown> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => Promise.resolve({ issues: [{ message: SECRET, path: [{ key: 'name' }] }] }),
      },
    };
    await expect(createSchemaBuilder(standard, () => SECRET).buildValidatedAsync()).rejects.toThrow(
      /^Schema validation failed: 1 issue at name$/
    );
  });
});
