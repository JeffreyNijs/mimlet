import { expect, it, expectTypeOf } from 'vitest';
import Type from 'typebox';
import { BuilderGenerationError } from '../../packages/core/src/index.js';
import type { GenerationSession } from '../../packages/core/src/index.js';
import { fromTypeBox, typeBoxAdapter } from '../../packages/typebox/src/index.js';
import { defineAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
it('preserves native TypeBox codec input/output and the shared validation contract', async () => {
  const schema = Type.Codec(Type.Number())
    .Decode((v) => new Date(v))
    .Encode((v) => v.getTime());
  const native = typeBoxAdapter(schema);
  const b = fromTypeBox(schema).replace(1000);
  expectTypeOf(b.build()).toEqualTypeOf<number>();
  expectTypeOf(b.buildValidated()).toEqualTypeOf<Date>();
  expect(b.buildValidated().getTime()).toBe(1000);
  await assertAdapterConformance(
    defineAdapter({ id: 'typebox', version: '1.3.34', standard: native.standard, operations: {} }),
    [
      {
        name: 'encoded number',
        input: () => 1000,
        valid: true,
        output: (v) => v instanceof Date && v.getTime() === 1000,
      },
      { name: 'invalid input', input: () => null, valid: false },
    ]
  );
});

it('gives session-less lists a default session so rows can differ (#59)', () => {
  const S = Type.Object({ id: Type.Number() });
  const rows = fromTypeBox(S).withFactory((session?: GenerationSession) => ({
    id: session?.sequence('x', 1) ?? 0,
  }));
  expect(rows.buildList(3)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(rows.buildValidatedList(3)).toEqual(rows.buildList(3));
  expect(rows.buildList(3, typeBoxAdapter(S).session())).toEqual(rows.buildList(3));
  expectTypeOf(rows.build).parameters.toEqualTypeOf<[session?: GenerationSession]>();
});

it('fills formats, patterns, unique arrays, unions and bounds deterministically (#60)', () => {
  const Order = Type.Object({
    at: Type.String({ format: 'date-time' }),
    id: Type.String({ format: 'uuid' }),
    code: Type.String({ pattern: '^APP-[0-9]+$' }),
    tags: Type.Array(Type.Union([Type.Literal('a'), Type.Literal('b')]), {
      uniqueItems: true,
      minItems: 2,
    }),
    big: Type.Union([Type.Refine(Type.Number(), (value) => value > 5), Type.Null()]),
    ratio: Type.Number({ exclusiveMinimum: 0, exclusiveMaximum: 1 }),
  });
  const orders = fromTypeBox(Order, { fill: { patterns: ['fixture', 'APP-1'] } });
  const order = orders.buildValidated();
  expect(order).toEqual({
    at: '2000-01-01T00:00:00.000Z',
    id: '00000000-0000-4000-8000-000000000000',
    code: 'APP-1',
    tags: ['a', 'b'],
    big: null,
    ratio: 0.5,
  });
  expect(orders.buildValidated()).toEqual(order);
  expect(() => fromTypeBox(Order).build()).toThrow(BuilderGenerationError);
  expect(() => fromTypeBox(Order).build()).toThrow(/at \/code: no fill\.patterns candidate/);
});
