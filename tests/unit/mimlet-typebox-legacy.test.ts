import { expect, it, expectTypeOf } from 'vitest';
import { Kind, Type, TypeRegistry } from '@sinclair/typebox';
import type { GenerationSession } from '../../packages/core/src/index.js';
import { fromTypeBox, typeBoxAdapter } from '../../packages/typebox-legacy/src/index.js';
import { defineAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
it('keeps legacy Transform semantics separate from modern TypeBox', async () => {
  const schema = Type.Transform(Type.Number())
    .Decode((v) => new Date(v))
    .Encode((v) => v.getTime());
  const native = typeBoxAdapter(schema);
  const b = fromTypeBox(schema).replace(1000);
  expectTypeOf(b.build()).toEqualTypeOf<number>();
  expectTypeOf(b.buildValidated()).toEqualTypeOf<Date>();
  expect(b.buildValidated().getTime()).toBe(1000);
  await assertAdapterConformance(
    defineAdapter({
      id: 'legacy-typebox',
      version: '0.34.52',
      standard: native.standard,
      operations: {},
    }),
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
  expect(rows.buildValidatedList(3)).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  expect(rows.buildList(3)).toEqual(rows.buildValidatedList(3));
  expect(rows.buildList(3, typeBoxAdapter(S).session())).toEqual(rows.buildList(3));
});

it('creates dates and Elysia t.Date()/t.Uint8Array() shapes deterministically (#60)', () => {
  TypeRegistry.Set('ArrayBuffer', (_schema, value) => value instanceof ArrayBuffer);
  try {
    const ElysiaDate = Type.Transform(
      Type.Union([Type.Date(), Type.String({ format: 'date-time' }), Type.Number()])
    )
      .Decode((value) => new Date(value))
      .Encode((date) => date);
    const ElysiaBytes = Type.Transform(
      Type.Union([Type.Unsafe({ [Kind]: 'ArrayBuffer', default: [1, 2, 3] }), Type.Uint8Array()])
    )
      .Decode((value) => value)
      .Encode((value) => value);
    const Upload = Type.Object({
      at: Type.Date(),
      sent: ElysiaDate,
      file: ElysiaBytes,
      tags: Type.Array(Type.Union([Type.Literal('a'), Type.Literal('b')]), {
        uniqueItems: true,
        minItems: 2,
      }),
    });
    const uploads = fromTypeBox(Upload);
    const upload = uploads.buildValidated();
    expect(upload.at.toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(upload.sent.toISOString()).toBe('2000-01-01T00:00:00.000Z');
    expect(upload.file).toEqual(new Uint8Array(0));
    expect(upload.tags).toEqual(['a', 'b']);
    expect(uploads.buildValidated()).toEqual(upload);
  } finally {
    TypeRegistry.Delete('ArrayBuffer');
  }
});
