import { expect, expectTypeOf, it } from 'vitest';
import { createBuilder, createSession, fluent } from '../../packages/core/src/index.js';
import {
  fromZod,
  fromZodFactory,
  fromZodFactoryAsync,
  zodFields,
} from '../../packages/zod/src/index.js';
import {
  arkTypeFields,
  fromArkType,
  fromArkTypeFactory,
} from '../../packages/arktype/src/index.js';
import { fromValibot, valibotAdapter, valibotFields } from '../../packages/valibot/src/index.js';
import { effectFields, fromEffect } from '../../packages/effect/src/index.js';
import {
  fromStandardJsonSchema,
  standardJsonSchemaFields,
} from '../../packages/json-schema/src/index.js';
import { fromTypeBox, typeBoxFields } from '../../packages/typebox/src/index.js';
import {
  fromTypeBox as fromLegacy,
  typeBoxFields as legacyFields,
} from '../../packages/typebox-legacy/src/index.js';
import { z } from 'zod';
import { type, type Type as ArkType } from 'arktype';
import * as v from 'valibot';
import * as S from 'effect/Schema';
import Type, { type TObject } from 'typebox';
import { Type as Legacy, type TObject as LegacyObject } from '@sinclair/typebox';

it('adds input-typed setters to native Zod and ArkType builders', async () => {
  const zod = fluent(
    fromZodFactory(z.object({ age: z.string().transform(Number) }), (age: string) => ({ age })),
    ['age']
  );
  const ark = fluent(
    fromArkTypeFactory(type({ age: 'string.numeric.parse' }), (age: string) => ({ age })),
    ['age']
  );
  expectTypeOf(zod.withAge('42').buildValidated('7')).toEqualTypeOf<{ age: number }>();
  expectTypeOf(ark.withAge('42').buildValidated('7')).toEqualTypeOf<{ age: number }>();
  expect(zod.withAge('42').buildValidated('7')).toEqual({ age: 42 });
  expect(ark.withAge('42').buildValidated('7')).toEqual({ age: 42 });
  const asynchronous = fluent(
    fromZodFactoryAsync(z.object({ name: z.string() }), () => ({ name: '' })),
    ['name']
  );
  expect(await asynchronous.withName('Ada').buildValidatedAsync()).toEqual({ name: 'Ada' });
});

it('accepts undefined in setters only where the property itself does', () => {
  interface Note {
    title: string;
    body?: string;
    draft?: string | undefined;
    due: Date | undefined;
  }
  const notes = fluent(
    createBuilder((): Note => ({ title: 'Plan', due: undefined })),
    ['title', 'body', 'draft', 'due']
  );
  // The exact-optional case (`withBody(undefined)` rejected) needs exactOptionalPropertyTypes,
  // so it is type-checked in the packed Zod fixture; this project compiles without it.
  expectTypeOf(notes.withTitle).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(notes.withDraft).parameter(0).toEqualTypeOf<string | undefined>();
  expectTypeOf(notes.withDue).parameter(0).toEqualTypeOf<Date | undefined>();
  expect(notes.withDraft(undefined).withBody('Notes').build()).toEqual({
    title: 'Plan',
    due: undefined,
    draft: undefined,
    body: 'Notes',
  });
});

it('adds a setter per schema field from generic helpers for every adapter', () => {
  // One helper per adapter; none lists fields and no call site needs a cast.
  const typeBoxRows = <S extends TObject>(schema: S) =>
    fluent(fromTypeBox(schema), typeBoxFields(schema));
  const legacyRows = <S extends LegacyObject>(schema: S) =>
    fluent(fromLegacy(schema), legacyFields(schema));
  const zodRows = <S extends z.ZodObject>(schema: S) => fluent(fromZod(schema), zodFields(schema));
  const valibotRows = <S extends v.ObjectSchema<v.ObjectEntries, undefined>>(schema: S) =>
    fluent(fromValibot(schema), valibotFields(schema));
  const arkRows = <S extends ArkType<object>>(schema: S) =>
    fluent(fromArkType(schema), arkTypeFields(schema));
  const effectRows = <A, I extends object>(schema: S.Codec<A, I>) =>
    fluent(fromEffect(schema), effectFields(schema));

  const modern = typeBoxRows(Type.Object({ id: Type.String(), total: Type.Number() }));
  expectTypeOf(modern.withTotal).parameter(0).toEqualTypeOf<number>();
  expect(modern.withId('a').withTotal(2).buildValidated()).toEqual({ id: 'a', total: 2 });
  const legacy = legacyRows(Legacy.Object({ id: Legacy.String() }));
  expect(legacy.withId('b').buildValidated()).toEqual({ id: 'b' });
  const zod = zodRows(z.object({ age: z.string().transform(Number) }));
  expectTypeOf(zod.withAge).parameter(0).toEqualTypeOf<string>();
  expect(zod.withAge('42').buildValidated()).toEqual({ age: 42 });
  const valibot = valibotRows(v.object({ age: v.pipe(v.string(), v.transform(Number)) }));
  expect(valibot.withAge('7').buildValidated()).toEqual({ age: 7 });
  const ark = arkRows(type({ age: 'string.numeric.parse' }));
  expectTypeOf(ark.withAge).parameter(0).toEqualTypeOf<string>();
  expect(ark.withAge('3').buildValidated()).toEqual({ age: 3 });
  const session = createSession({ seed: 1, fingerprint: 'fluent/v1', provider: 'effect@4.0.0' });
  const effect = effectRows(S.Struct({ age: S.NumberFromString }));
  expectTypeOf(effect.withAge).parameter(0).toEqualTypeOf<string>();
  expect(effect.withAge('5').buildValidated(session)).toEqual({ age: 5 });
  const standard = valibotAdapter(v.object({ name: v.string() })).standard;
  const json = fluent(fromStandardJsonSchema(standard), standardJsonSchemaFields(standard));
  expect(json.withName('Ada').buildValidated()).toEqual({ name: 'Ada' });
});
