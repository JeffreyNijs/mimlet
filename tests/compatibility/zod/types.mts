import { z } from 'zod';
import * as mini from 'zod/mini';
import {
  fromZod,
  fromZodAsync,
  fromZodFactory,
  fromZodFactoryAsync,
  zodAdapter,
  zodFields,
} from '@mimlet/zod';
import { createBuilder, createTestSession, fluent } from '@mimlet/core';
import type { GenerationSession } from '@mimlet/core';
declare function expectType<T>(value: T): void;

const schema = z.object({ age: z.string() }).transform(({ age }) => ({ age: Number(age) }));
const builder = fromZod(schema);
expectType<{ age: string }>(builder.build());
expectType<{ age: number }>(builder.buildValidated());
// @ts-expect-error Input overrides cannot use the decoded output type.
builder.with({ age: 42 });
// @ts-expect-error Unknown keys do not widen the schema.
builder.with({ extra: true });
// @ts-expect-error Output must not become any.
expectType<string>(builder.buildValidated().age);

const dates = fromZodFactory(z.date(), (time: number, offset = 0) => new Date(time + offset));
expectType<Date>(dates.buildValidated(42));
// @ts-expect-error Required factory arguments remain required.
dates.buildValidated();
// @ts-expect-error Factory argument types remain specific.
dates.buildValidated('wrong');
// @ts-expect-error An incompatible factory cannot widen schema input.
fromZodFactory(z.number(), () => 'wrong');
const asyncFactory = fromZodFactory(z.string(), async (id: number) => String(id));
expectType<Promise<string>>(asyncFactory.buildValidatedAsync(1));
// @ts-expect-error Known async factories expose async methods only.
asyncFactory.build();

const asyncSchema = z.string().transform(async (value) => Number(value));
const asyncBuilder = fromZodAsync(asyncSchema);
expectType<Promise<string>>(asyncBuilder.buildAsync());
expectType<Promise<number>>(asyncBuilder.buildValidatedAsync());
// @ts-expect-error Explicit async validation cannot advertise a synchronous validated build.
asyncBuilder.buildValidated();
const explicit = fromZodFactoryAsync(asyncSchema, (id: number, prefix = '') => `${prefix}${id}`);
expectType<Promise<number>>(explicit.buildValidatedAsync(42));
// @ts-expect-error Factory tuples are retained in the explicit async helper.
explicit.buildValidatedAsync();
// @ts-expect-error Async wrappers still constrain factory output to schema input.
fromZodFactoryAsync(z.number(), () => 'wrong');

const codec = z.codec(z.string(), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});
const native = zodAdapter(codec);
expectType<Date>(native.decode('2026-01-01'));
expectType<string>(native.encode(new Date()));
expectType<Promise<Date>>(native.decodeAsync('2026-01-01'));
// @ts-expect-error Encoding consumes native schema output, not input.
native.encode('wrong');
const small = fromZod(mini.object({ name: mini.string() }));
expectType<{ name: string }>(small.buildValidated());

const union = fromZod(
  z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('cat'), lives: z.number() }),
    z.object({ kind: z.literal('dog'), bark: z.boolean() }),
  ])
);
union.replace({ kind: 'dog', bark: true });
// @ts-expect-error A partial discriminant switch cannot leave stale variant fields.
union.with({ kind: 'dog' });

// Named setters accept exactly what .with() accepts under exactOptionalPropertyTypes.
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
notes.withBody('Notes').withDraft(undefined).withDue(undefined);
// @ts-expect-error An exact optional key is omitted, never set to undefined.
notes.withBody(undefined);
// @ts-expect-error .with() rejects the same patch.
notes.with({ body: undefined });
const nicknames = fluent(fromZod(z.object({ nickname: z.string().optional() })), ['nickname']);
nicknames.withNickname(undefined);

// A setter per schema field, also from a generic helper.
function rows<S extends z.ZodObject>(schema: S) {
  return fluent(fromZod(schema), zodFields(schema));
}
const Account = z.object({
  id: z.string(),
  age: z.string().transform(Number),
  note: z.string().optional(),
  exact: z.exactOptional(z.string()),
});
const accounts = rows(Account);
expectType<number>(accounts.withId('a').withAge('42').buildValidated().age);
accounts.withNote(undefined);
// @ts-expect-error Setters take input, not parsed output.
accounts.withAge(42);
// @ts-expect-error An exact optional key is omitted, never set to undefined.
accounts.withExact(undefined);
// @ts-expect-error Fields that are not in the schema have no setter.
accounts.withOther(1);
const transformed = Account.transform((value) => ({ ...value, label: value.id }));
expectType<string>(
  fluent(fromZod(transformed), zodFields(transformed)).withId('a').buildValidated().label
);
const loose = z.looseObject({ id: z.string() });
// @ts-expect-error Index signatures require complete patches, so there is no setter.
fluent(fromZod(loose), zodFields(loose)).withId('a');
// @ts-expect-error Only object schemas list fields.
zodFields(z.string());
// @ts-expect-error A nullable root has no single field list.
zodFields(Account.nullable());

// Named builder types give a generic helper an explicit return type that is exactly what
// the entry point returns, for lint rules such as explicit-function-return-type.
import type { BuilderPatch, FluentFieldsBuilder } from '@mimlet/core';
import type { ZodBuilder, ZodFactoryBuilder } from '@mimlet/zod';
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare function exact<T extends true>(): T;
type AccountInput = z.input<typeof Account>;
type AccountOutput = z.output<typeof Account>;

function accountRows<S extends z.ZodObject>(
  schema: S,
  defaults: () => BuilderPatch<z.input<S>>
): ZodBuilder<S> {
  return fromZod(schema).withFactory(defaults);
}
expectType<AccountOutput[]>(accountRows(Account, () => ({ id: 'a' })).buildValidatedList(2));
function dtoBuilder<S extends z.ZodType>(
  schema: S,
  create: () => z.input<S>
): ZodFactoryBuilder<S, () => z.input<S>> {
  return fromZodFactory(schema, create);
}
function inferredDtoBuilder<S extends z.ZodType>(schema: S, create: () => z.input<S>) {
  return fromZodFactory(schema, create);
}
exact<
  Equal<
    ReturnType<typeof dtoBuilder<typeof Account>>,
    ReturnType<typeof inferredDtoBuilder<typeof Account>>
  >
>();
const dtos = dtoBuilder(Account, () => ({ id: 'a', age: '1', exact: 'x' }));
expectType<AccountInput>(dtos.build());
expectType<number>(
  dtos
    .with({ age: '2' })
    .withFactory(() => ({ id: 'b' }))
    .buildValidated().age
);
expectType<number>(fluent(dtos, zodFields(Account)).withAge('3').buildValidated().age);
// @ts-expect-error Patches stay input-typed.
dtos.with({ age: 2 });
function loadedDtos<S extends z.ZodType>(
  schema: S,
  load: (id: string) => Promise<z.input<S>>
): ZodFactoryBuilder<S, (id: string) => Promise<z.input<S>>> {
  return fromZodFactory(schema, load);
}
const loaded = loadedDtos(Account, async (id) => ({ id, age: '1', exact: 'x' }));
expectType<Promise<AccountOutput>>(loaded.with({ age: '2' }).buildValidatedAsync('a'));
// @ts-expect-error An async factory never advertises synchronous builds.
loaded.buildValidated('a');
function bothWays<S extends z.ZodObject>(schema: S, create: () => z.input<S>): void {
  const inferred = fromZodFactory(schema, create);
  const named: ZodFactoryBuilder<S, () => z.input<S>> = inferred;
  const back: typeof inferred = named;
  exact<Equal<typeof inferred, ZodFactoryBuilder<S, () => z.input<S>>>>();
  exact<Equal<ReturnType<typeof fromZod<S>>, ZodBuilder<S>>>();
  void back;
}
void bothWays;
function fieldRows<S extends z.ZodObject>(
  schema: S
): FluentFieldsBuilder<ZodBuilder<S>, Extract<keyof z.input<S>, string>> {
  return fluent(fromZod(schema), zodFields(schema));
}
expectType<number>(fieldRows(Account).withAge('4').buildValidated().age);
function fieldDtos<S extends z.ZodObject>(
  schema: S,
  load: () => Promise<z.input<S>>
): FluentFieldsBuilder<
  ZodFactoryBuilder<S, () => Promise<z.input<S>>>,
  Extract<keyof z.input<S>, string>
> {
  return fluent(fromZodFactory(schema, load), zodFields(schema));
}
const fieldLoaded = fieldDtos(Account, async () => ({ id: 'a', age: '1', exact: 'x' }));
expectType<Promise<AccountOutput>>(fieldLoaded.withAge('5').buildValidatedAsync());
// @ts-expect-error Setters on an async factory builder keep it async-only.
fieldLoaded.withAge('5').buildValidated();

// Patch factories and transforms of a fromZod() builder always receive a session.
const people = fromZod(z.object({ id: z.uuid(), age: z.number() }), { name: 'people' });
people.withFactory((session) => ({ age: session.integer(1, 9) }));
people.transform((value, session) => ({ ...value, id: String(session.random()) }));
people.withFactory((session?: GenerationSession) => ({ age: session ? 1 : 0 }));
// Literal counts give tuples, so destructuring needs no undefined checks.
const [firstPerson, secondPerson] = people.buildValidatedList(2);
expectType<{ id: string; age: number }>(firstPerson);
expectType<{ id: string; age: number }>(secondPerson);
// @ts-expect-error A two-item list has no third item.
void people.buildList(2)[2];
expectType<{ id: string; age: number }[]>(people.buildList(Number('3')));
// A factory builder takes a typed defaultSession; its factory may require the session.
const rowBuilder = fromZodFactory(
  z.object({ id: z.string() }),
  (session: GenerationSession) => ({ id: String(session.sequence('id')) }),
  { defaultSession: () => createTestSession(), name: 'rows' }
);
expectType<{ id: string }>(rowBuilder.buildValidated());
expectType<{ id: string }>(rowBuilder.buildValidated(createTestSession()));
rowBuilder.withFactory((session) => ({ id: String(session.random()) }));
const RowSchema = z.object({ id: z.string() });
const typedRows: ZodFactoryBuilder<
  typeof RowSchema,
  (session: GenerationSession) => { id: string },
  true
> = fromZodFactory(RowSchema, (session: GenerationSession) => ({ id: String(session.random()) }), {
  defaultSession: () => createTestSession(),
});
expectType<{ id: string }>(typedRows.build());
const optionalRows = fromZodFactory(
  RowSchema,
  (session?: GenerationSession) => ({ id: String(session?.random()) }),
  { defaultSession: () => createTestSession() }
);
optionalRows.withFactory((session) => ({ id: String(session.random()) }));
const asyncRows = fromZodFactoryAsync(
  RowSchema,
  (session: GenerationSession) => ({ id: String(session.random()) }),
  { defaultSession: () => createTestSession() }
);
expectType<Promise<{ id: string }>>(asyncRows.buildValidatedAsync());
// @ts-expect-error Without a default, a factory requiring a session must receive it.
fromZodFactory(z.string(), (session: GenerationSession) => String(session.random())).build();
// @ts-expect-error A default session would replace an unrelated first argument.
fromZodFactory(z.string(), (id?: string) => id ?? '', { defaultSession: createTestSession });
