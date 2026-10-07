import { expect, expectTypeOf, it } from 'vitest';
import {
  createBuilder,
  createBuilderClass,
  createSession,
  fluent,
} from '../../packages/core/src/index.js';
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

it('combines the setters of a shared helper with per-builder tuples and aliases', async () => {
  // The shared helper gives every model a setter per field; each builder adds its own names.
  const rows = <S extends TObject>(schema: S) => fluent(fromTypeBox(schema), typeBoxFields(schema));
  const User = Type.Object({ id: Type.String(), user_name: Type.String(), age: Type.Number() });
  const users = fluent(rows(User), { withKey: 'id', withLogin: 'user_name' });
  expectTypeOf(users.withAge).parameter(0).toEqualTypeOf<number>();
  expectTypeOf(users.withLogin).parameter(0).toEqualTypeOf<string>();
  expectTypeOf(users.withAge(1)).toEqualTypeOf(users);
  const built = users.withKey('u-1').withLogin('ada').withAge(36).buildValidated();
  expect(built).toEqual({ id: 'u-1', user_name: 'ada', age: 36 });
  expect(fluent(rows(User), ['id']).withId('a').withAge(1).buildValidated()).toEqual({
    id: 'a',
    user_name: '',
    age: 1,
  });
  // A generic helper can nest schema field lists.
  const legacyRows = <S extends LegacyObject>(schema: S) =>
    fluent(fluent(fromLegacy(schema), legacyFields(schema)), legacyFields(schema));
  expect(
    legacyRows(Legacy.Object({ id: Legacy.String() }))
      .withId('b')
      .buildValidated()
  ).toEqual({
    id: 'b',
  });
  const zod = fluent(fluent(fromZod(z.object({ age: z.string().transform(Number) })), ['age']), {
    withYears: 'age',
  });
  expectTypeOf(zod.withYears).parameter(0).toEqualTypeOf<string>();
  expect(
    await zod
      .withAge('3')
      .transformAsync(async (value) => value)
      .withYears('4')
      .buildValidatedAsync()
  ).toEqual({ age: 4 });
  expect(() => fluent(rows(User), { withAge: 'id' })).toThrow(TypeError);
});

it('lets an explicit setter replace a generated class method, with its own type', async () => {
  class Users extends createBuilderClass((id: number) => ({ id, name: '', admin: false })) {
    withName(name: string) {
      return this.with({ name: name.toUpperCase() });
    }
    promoted() {
      return this.with({ admin: true });
    }
  }
  const users = fluent(new Users(), { withName: 'admin' });
  // The setter's signature replaces the class method's; there is no overload of both.
  expectTypeOf(users.withName).toEqualTypeOf<(value: boolean) => typeof users>();
  expectTypeOf(users.promoted).toEqualTypeOf<() => typeof users>();
  expect(users.withName(true).with({ name: 'ada' }).build(1)).toEqual({
    id: 1,
    name: 'ada',
    admin: true,
  });
  const asynchronous = users.transformAsync(async (value) => value).withName(false);
  expect(await asynchronous.promoted().withName(false).buildAsync(2)).toEqual({
    id: 2,
    name: '',
    admin: false,
  });
  // A list leaves the class method in place.
  expect(fluent(new Users(), ['id']).withName('ada').build(3).name).toBe('ADA');
});

it('adds path setters on top of schema field lists of every adapter', () => {
  const zodQuery = z.object({
    search: z.string().optional(),
    pagination: z.object({ limit: z.coerce.number().max(100), offset: z.number() }).optional(),
  });
  const zodRows = fluent(
    fluent(
      fromZodFactory(zodQuery, () => ({ pagination: { limit: 10, offset: 0 } })),
      zodFields(zodQuery)
    ),
    { withLimit: ['pagination', 'limit'] }
  );
  // The setter takes the input type at the path: z.coerce.number() accepts unknown input.
  expectTypeOf(zodRows.withLimit).parameter(0).toEqualTypeOf<unknown>();
  expect(zodRows.withSearch('ramp').withLimit('5').buildValidated()).toEqual({
    search: 'ramp',
    pagination: { limit: 5, offset: 0 },
  });
  expect(() => zodRows.withLimit(500).buildValidated()).toThrow(/at pagination\.limit/);
  const boxQuery = Type.Object({
    pagination: Type.Object({ limit: Type.Number(), offset: Type.Number() }),
  });
  const boxRows = fluent(fluent(fromTypeBox(boxQuery), typeBoxFields(boxQuery)), {
    withOffset: ['pagination', 'offset'],
  });
  expectTypeOf(boxRows.withOffset).parameter(0).toEqualTypeOf<number>();
  expect(boxRows.withOffset(7).buildValidated().pagination.offset).toBe(7);
  const valibotQuery = v.object({ page: v.object({ size: v.number() }) });
  const valibotRows = fluent(fluent(fromValibot(valibotQuery), valibotFields(valibotQuery)), {
    withSize: ['page', 'size'],
  });
  expect(valibotRows.withSize(3).withPage({ size: 4 }).withSize(5).buildValidated()).toEqual({
    page: { size: 5 },
  });
});
