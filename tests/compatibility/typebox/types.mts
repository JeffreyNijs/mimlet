import Type from 'typebox';
import { Type as Legacy } from '@sinclair/typebox';
import { fromTypeBox, fromTypeBoxFactory, typeBoxAdapter } from '@mimlet/typebox';
import {
  fromTypeBox as fromLegacy,
  fromTypeBoxFactory as legacyFactory,
  typeBoxAdapter as legacyAdapter,
} from '@mimlet/typebox-legacy';
declare function expectType<T>(value: T): void;
const Timestamp = Type.Codec(Type.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const Event = Type.Object({
  id: Type.String(),
  timestamp: Timestamp,
  note: Type.Optional(Type.String()),
});
const events = fromTypeBox(Event);
expectType<{ id: string; timestamp: number; note?: string }>(events.build());
expectType<{ id: string; timestamp: Date; note?: string }>(events.buildValidated());
events.with({ timestamp: 1 }).omit('note');
// @ts-expect-error Patches are input-typed, not decoded output.
events.with({ timestamp: new Date() });
// @ts-expect-error Required fields cannot be omitted.
events.omit('id');
// @ts-expect-error Unknown properties are rejected.
events.with({ other: 1 });
const custom = fromTypeBoxFactory(Event, (id: string) => ({ id, timestamp: 1 }));
expectType<{ id: string; timestamp: Date; note?: string }>(custom.buildValidated('1'));
// @ts-expect-error Factory arguments remain required.
custom.build();
// @ts-expect-error The native factory generates encoded input, not decoded output.
fromTypeBoxFactory(Event, () => ({ id: 'x', timestamp: new Date() }));
const asynchronous = fromTypeBoxFactory(Event, async () => ({ id: 'x', timestamp: 1 }));
expectType<Promise<{ id: string; timestamp: Date; note?: string }>>(
  asynchronous.buildValidatedAsync()
);
// @ts-expect-error Async factories cannot advertise sync validation.
asynchronous.buildValidated();
expectType<number>(typeBoxAdapter(Timestamp).encode(new Date()));
// @ts-expect-error Encode receives decoded values.
typeBoxAdapter(Timestamp).encode(1);
const Ref = Type.Ref('User');
const context = { User: Type.Object({ id: Type.String() }) };
expectType<{ id: string }>(fromTypeBox(Ref, { context }).build());
const Pet = Type.Union([
  Type.Object({ kind: Type.Literal('cat'), lives: Type.Number() }),
  Type.Object({ kind: Type.Literal('dog'), bark: Type.Boolean() }),
]);
// @ts-expect-error Union transitions need complete replacement.
fromTypeBox(Pet).with({ kind: 'dog' });
fromTypeBox(Pet).replace({ kind: 'dog', bark: true });

const OldTimestamp = Legacy.Transform(Legacy.Number())
  .Decode((value) => new Date(value))
  .Encode((value) => value.getTime());
const OldEvent = Legacy.Object({ id: Legacy.String(), timestamp: OldTimestamp });
const oldEvents = fromLegacy(OldEvent);
expectType<{ id: string; timestamp: number }>(oldEvents.build());
expectType<{ id: string; timestamp: Date }>(oldEvents.buildValidated());
// @ts-expect-error Legacy Transform retains separate encoded/decoded types.
oldEvents.with({ timestamp: new Date() });
// @ts-expect-error Factories cannot invent missing required fields.
legacyFactory(OldEvent, () => ({ id: 'x' }));
const oldAsync = legacyFactory(OldEvent, async (id: string) => ({ id, timestamp: 1 }));
expectType<Promise<{ id: string; timestamp: Date }>>(oldAsync.buildValidatedAsync('1'));
// @ts-expect-error Async capability is preserved through the legacy adapter.
oldAsync.buildValidated('1');
expectType<number>(legacyAdapter(OldTimestamp).encode(new Date()));

// Property access rejects never; negative member checks reject accidental any.
events.build().timestamp.toFixed(0);
events.buildValidated().timestamp.getTime();
// @ts-expect-error Encoded timestamps are numbers, not dates.
events.build().timestamp.getTime();
// @ts-expect-error Decoded timestamps are dates, not numbers.
events.buildValidated().timestamp.toFixed(0);
oldEvents.build().timestamp.toFixed(0);
oldEvents.buildValidated().timestamp.getTime();
// @ts-expect-error Legacy encoded timestamps are numbers.
oldEvents.build().timestamp.getTime();
// @ts-expect-error Legacy decoded timestamps are dates.
oldEvents.buildValidated().timestamp.toFixed(0);
fromTypeBox(Ref, { context }).build().id.toUpperCase();
// @ts-expect-error A named reference resolves its property's actual type.
fromTypeBox(Ref, { context }).build().id.toFixed(0);
const referenced = fromTypeBoxFactory(Ref, (id: string) => ({ id }), { context });
referenced.buildValidated('user-1').id.toUpperCase();
// @ts-expect-error Reference-aware factory input is not an unchecked assertion.
fromTypeBoxFactory(Ref, () => ({ id: 42 }), { context });

// Explicit native variant selection never manufactures a partial discriminated-union value.
import { fromTypeBoxVariant, typeBoxVariantAdapter } from '@mimlet/typebox';
import { fromTypeBoxVariant as legacyVariant } from '@mimlet/typebox-legacy';
const dogs = fromTypeBoxVariant(Pet, 1);
expectType<{ kind: 'dog'; bark: boolean }>(dogs.build());
dogs.with({ bark: true });
// @ts-expect-error A selected branch cannot change only its discriminator.
dogs.with({ kind: 'cat' });
// @ts-expect-error Fields from another branch are not on the selected input.
dogs.with({ lives: 3 });
// @ts-expect-error Literal tuple indexes are bounded.
fromTypeBoxVariant(Pet, 2);
// @ts-expect-error An object schema is not an anyOf union.
fromTypeBoxVariant(Event, 0);
const wholeCodec = Type.Codec(Pet)
  .Decode((pet) => ({ pet }))
  .Encode(({ pet }) => pet);
const rootCodecDog = fromTypeBoxVariant(wholeCodec, 1);
expectType<{ kind: 'dog'; bark: boolean }>(rootCodecDog.build());
expectType<{ pet: { kind: 'cat'; lives: number } | { kind: 'dog'; bark: boolean } }>(
  rootCodecDog.buildValidated()
);
// @ts-expect-error The original union codec is retained on output.
rootCodecDog.buildValidated().bark;
expectType<boolean>(typeBoxVariantAdapter(Pet, 1).check({ kind: 'dog', bark: true }));
const LegacyPet = Legacy.Union([
  Legacy.Object({ kind: Legacy.Literal('cat'), lives: Legacy.Number() }),
  Legacy.Object({ kind: Legacy.Literal('dog'), bark: Legacy.Boolean() }),
]);
const legacyDogs = legacyVariant(LegacyPet, 1);
expectType<{ kind: 'dog'; bark: boolean }>(legacyDogs.build());
// @ts-expect-error Other branch data is rejected by legacy selection too.
legacyDogs.with({ kind: 'cat' });
// @ts-expect-error Invalid legacy tuple index.
legacyVariant(LegacyPet, -1);
// @ts-expect-error Inputs do not degrade to any/never.
legacyDogs.build().bark.toFixed();

// Generic helpers over an unresolved schema keep the synchronous builder type.
import type { BuilderPatch } from '@mimlet/core';
import type { StaticEncode, TObject } from 'typebox';
import type { StaticEncode as LegacyEncode, TObject as LegacyObject } from '@sinclair/typebox';
function rows<S extends TObject>(schema: S, defaults: () => BuilderPatch<StaticEncode<S>>) {
  const builder = fromTypeBox(schema).withFactory(defaults);
  builder.buildList(2);
  return builder;
}
const generic = rows(Event, () => ({ id: 'event-1' }));
expectType<{ id: string; timestamp: number; note?: string }>(generic.build());
expectType<{ id: string; timestamp: Date; note?: string }>(generic.buildValidated());
// @ts-expect-error The helper's patch factory stays schema-typed.
rows(Event, () => ({ id: 1 }));
function legacyRows<S extends LegacyObject>(
  schema: S,
  defaults: () => BuilderPatch<LegacyEncode<S>>
) {
  const builder = fromLegacy(schema)
    .withFactory(defaults)
    .with({} as BuilderPatch<LegacyEncode<S>>);
  builder.buildValidatedList(2);
  return builder;
}
const legacyGeneric = legacyRows(OldEvent, () => ({ id: 'event-1' }));
expectType<{ id: string; timestamp: number }>(legacyGeneric.build());
expectType<{ id: string; timestamp: Date }>(legacyGeneric.buildValidated());
// @ts-expect-error Legacy helper patches stay schema-typed too.
legacyRows(OldEvent, () => ({ timestamp: new Date() }));

// Native builders take an optional generation session, like the other adapters.
import type { GenerationSession, SchemaBuilder } from '@mimlet/core';
import type { TypeBoxFill } from '@mimlet/typebox';
import type { TypeBoxFill as LegacyFill } from '@mimlet/typebox-legacy';
declare const session: GenerationSession;
type EventInput = { id: string; timestamp: number; note?: string };
type EventOutput = { id: string; timestamp: Date; note?: string };
expectType<SchemaBuilder<EventInput, EventOutput, [session?: GenerationSession]>>(events);
expectType<EventInput>(events.build(session));
expectType<EventOutput[]>(events.buildValidatedList(2, session));
expectType<EventInput[]>(events.buildList(2));
// @ts-expect-error The optional argument is a generation session.
events.build('session');
// @ts-expect-error A list takes at most one session.
events.buildList(2, session, session);
// Helpers typed with the session-less builder type keep compiling.
const sessionless: SchemaBuilder<EventInput, EventOutput> = events;
sessionless.build();
const counted = events.withFactory((execution?: GenerationSession) => ({
  id: `event-${execution?.sequence('event', 1) ?? 0}`,
}));
expectType<EventOutput[]>(counted.buildValidatedList(3));
expectType<GenerationSession>(typeBoxAdapter(Event).session('seed'));
expectType<string>(typeBoxAdapter(Event).identity.fingerprint);
expectType<EventInput>(typeBoxAdapter(Event).create(session));
expectType<{ kind: 'dog'; bark: boolean }>(dogs.build(session));
expectType<{ kind: 'dog'; bark: boolean }[]>(legacyDogs.buildList(2, session));
expectType<GenerationSession>(typeBoxVariantAdapter(Pet, 1).session());
const oldSessionless: SchemaBuilder<
  { id: string; timestamp: number },
  { id: string; timestamp: Date }
> = oldEvents;
oldSessionless.buildValidated();
expectType<{ id: string; timestamp: number }>(oldEvents.build(session));
// @ts-expect-error Legacy builders take a session too, not other arguments.
oldEvents.build(1);
expectType<GenerationSession>(legacyAdapter(OldEvent).session());

// Fill options: samples and candidates are strings; `false` keeps plain native creation.
const fill: TypeBoxFill = {
  now: '2026-01-01T00:00:00.000Z',
  formats: { 'x-sku': 'SKU-0001' },
  patterns: ['APP-1'],
};
fromTypeBox(Event, { fill });
fromTypeBox(Event, { fill: false });
fromTypeBoxVariant(Pet, 1, { fill: { patterns: [] } });
const legacyFill: LegacyFill = { patterns: ['APP-1'] };
fromLegacy(OldEvent, { fill: legacyFill });
legacyVariant(LegacyPet, 0, { fill: false });
// @ts-expect-error Fill takes options or false.
fromTypeBox(Event, { fill: true });
// @ts-expect-error Format samples are strings.
fromTypeBox(Event, { fill: { formats: { uuid: 1 } } });
// @ts-expect-error Pattern candidates are strings.
fromLegacy(OldEvent, { fill: { patterns: [/APP/] } });

// A setter per schema field, from a generic helper, with no field list and no casts.
import { fluent } from '@mimlet/core';
import { typeBoxFields } from '@mimlet/typebox';
import { typeBoxFields as legacyFields } from '@mimlet/typebox-legacy';
function namedRows<S extends TObject>(schema: S) {
  return fluent(fromTypeBox(schema), typeBoxFields(schema));
}
const named = namedRows(Event);
expectType<{ id: string; timestamp: Date; note?: string }>(
  named.withId('event-1').withTimestamp(1).withNote('n').buildValidated()
);
// @ts-expect-error Setters take encoded input, not decoded output.
named.withTimestamp(new Date());
// @ts-expect-error Like with(), an exact optional key is omitted, never set to undefined.
named.withNote(undefined);
// @ts-expect-error Fields that are not in the schema have no setter.
named.withOther(1);
const namedAsync = named.transformAsync(async (value) => value).withId('event-2');
namedAsync.buildValidatedAsync();
// @ts-expect-error Async transitions remove synchronous build methods.
namedAsync.buildValidated();
const Machine = Type.Object({ factory: Type.String(), serial: Type.String() });
const machines = fluent(fromTypeBox(Machine), typeBoxFields(Machine));
machines.withSerial('m-1').withFactory(() => ({ factory: 'plant-1' }));
// @ts-expect-error A field named factory cannot replace the withFactory() builder method.
machines.withFactory('plant-1');
// @ts-expect-error Only object schemas list fields.
typeBoxFields(Type.String());
// @ts-expect-error Unions have no single field list.
typeBoxFields(Pet);
function prismaRows<S extends LegacyObject>(schema: S) {
  return fluent(fromLegacy(schema), legacyFields(schema));
}
const prisma = prismaRows(OldEvent);
expectType<{ id: string; timestamp: Date }>(
  prisma.withId('row-1').withTimestamp(1).buildValidated()
);
prisma.withId('row-1').buildValidatedList(2);
// @ts-expect-error Legacy setters take encoded input.
prisma.withTimestamp(new Date());
// @ts-expect-error Legacy unions have no single field list.
legacyFields(LegacyPet);

// Named builder types give a generic helper an explicit return type that is exactly what
// the entry point returns, for lint rules such as explicit-function-return-type.
import type { FluentFieldsBuilder } from '@mimlet/core';
import type { TSchema } from 'typebox';
import type {
  TypeBoxBuilder,
  TypeBoxFactoryBuilder,
  TypeBoxOptions,
  TypeBoxVariantBuilder,
  TypeBoxVariantIndex,
} from '@mimlet/typebox';
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare function exact<T extends true>(): T;

function dtoBuilder<S extends TSchema>(
  schema: S,
  create: () => StaticEncode<S>
): TypeBoxFactoryBuilder<S, () => StaticEncode<S>> {
  return fromTypeBoxFactory(schema, create);
}
function inferredDtoBuilder<S extends TSchema>(schema: S, create: () => StaticEncode<S>) {
  return fromTypeBoxFactory(schema, create);
}
exact<
  Equal<
    ReturnType<typeof dtoBuilder<typeof Event>>,
    ReturnType<typeof inferredDtoBuilder<typeof Event>>
  >
>();
const dtos = dtoBuilder(Event, () => ({ id: 'event-1', timestamp: 1 }));
expectType<EventInput>(dtos.build());
expectType<EventOutput>(dtos.buildValidated());
expectType<EventOutput[]>(dtos.buildValidatedList(2));
dtos.buildValidated().timestamp.getTime();
// @ts-expect-error A synchronous zero-argument factory takes no build arguments.
dtos.build('extra');
const patchedDtos = dtos.with({ timestamp: 2 }).withFactory(() => ({ id: 'event-2' }));
expectType<EventOutput>(patchedDtos.buildValidated());
// @ts-expect-error Patches stay encoded-input typed.
dtos.with({ timestamp: new Date() });
const namedDtos = fluent(dtos, typeBoxFields(Event));
expectType<EventOutput>(namedDtos.withId('event-3').withTimestamp(3).buildValidated());

function asyncDtoBuilder<S extends TSchema>(
  schema: S,
  load: (id: string) => Promise<StaticEncode<S>>
): TypeBoxFactoryBuilder<S, (id: string) => Promise<StaticEncode<S>>> {
  return fromTypeBoxFactory(schema, load);
}
function inferredAsyncDtoBuilder<S extends TSchema>(
  schema: S,
  load: (id: string) => Promise<StaticEncode<S>>
) {
  return fromTypeBoxFactory(schema, load);
}
exact<
  Equal<
    ReturnType<typeof asyncDtoBuilder<typeof Event>>,
    ReturnType<typeof inferredAsyncDtoBuilder<typeof Event>>
  >
>();
const loaded = asyncDtoBuilder(Event, async (id) => ({ id, timestamp: 1 }));
expectType<Promise<EventOutput>>(loaded.buildValidatedAsync('event-1'));
expectType<Promise<EventOutput>>(
  loaded
    .with({ timestamp: 2 })
    .withFactory(() => ({ note: 'n' }))
    .buildValidatedAsync('event-1')
);
// @ts-expect-error An async factory never advertises synchronous builds.
loaded.build('event-1');
// @ts-expect-error The async builder stays async after with().
loaded.with({ timestamp: 2 }).buildValidated('event-1');
// @ts-expect-error The factory's argument stays required.
void loaded.buildAsync();
const namedLoaded = fluent(loaded, typeBoxFields(Event)).withId('event-2');
expectType<Promise<EventOutput>>(namedLoaded.buildValidatedAsync('event-2'));
// @ts-expect-error Named setters keep the async capability.
namedLoaded.buildValidated('event-2');

// The named and inferred types are assignable both ways, also while S is unresolved.
function bothWays<S extends TObject>(schema: S, create: () => StaticEncode<S>): void {
  const inferred = fromTypeBoxFactory(schema, create);
  const named: TypeBoxFactoryBuilder<S, () => StaticEncode<S>> = inferred;
  const back: typeof inferred = named;
  exact<Equal<typeof inferred, TypeBoxFactoryBuilder<S, () => StaticEncode<S>>>>();
  const native = fromTypeBox(schema);
  const namedNative: TypeBoxBuilder<S> = native;
  const nativeBack: typeof native = namedNative;
  exact<Equal<typeof native, TypeBoxBuilder<S>>>();
  void back;
  void nativeBack;
}
void bothWays;
declare const eventFactory: (session?: GenerationSession) => StaticEncode<typeof Event>;
exact<
  Equal<
    typeof fromTypeBoxFactory<typeof Event, Record<never, never>, typeof eventFactory>,
    (
      schema: typeof Event,
      factory: typeof eventFactory,
      options?: TypeBoxOptions
    ) => TypeBoxFactoryBuilder<typeof Event, typeof eventFactory>
  >
>();
exact<Equal<typeof events, TypeBoxBuilder<typeof Event>>>();
exact<
  Equal<
    ReturnType<typeof fromTypeBox<typeof Ref, typeof context>>,
    TypeBoxBuilder<typeof Ref, typeof context>
  >
>();
exact<Equal<typeof dogs, TypeBoxVariantBuilder<typeof Pet, 1>>>();
// @ts-expect-error The factory type must produce the schema's encoded input.
export type WrongFactory = TypeBoxFactoryBuilder<typeof Event, () => number>;

// Native builders keep their synchronous methods inside the helper, so it can chain first.
function patchedRows<S extends TObject>(
  schema: S,
  defaults: () => BuilderPatch<StaticEncode<S>>
): TypeBoxBuilder<S> {
  return fromTypeBox(schema).withFactory(defaults).usingValidation({});
}
expectType<EventOutput[]>(patchedRows(Event, () => ({ id: 'event-4' })).buildValidatedList(2));
function fieldRows<S extends TObject>(
  schema: S
): FluentFieldsBuilder<TypeBoxBuilder<S>, Extract<keyof S['properties'], string>> {
  return fluent(fromTypeBox(schema), typeBoxFields(schema));
}
expectType<EventOutput>(fieldRows(Event).withId('event-5').withNote('n').buildValidated());
// @ts-expect-error The explicit fluent type keeps encoded setters.
fieldRows(Event).withTimestamp(new Date());
function fieldDtos<S extends TObject>(
  schema: S,
  create: () => StaticEncode<S>
): FluentFieldsBuilder<
  TypeBoxFactoryBuilder<S, () => StaticEncode<S>>,
  Extract<keyof S['properties'], string>
> {
  return fluent(fromTypeBoxFactory(schema, create), typeBoxFields(schema));
}
expectType<EventOutput>(
  fieldDtos(Event, () => ({ id: 'event-6', timestamp: 6 }))
    .withNote('n')
    .buildValidated()
);
function variants<
  S extends TSchema & { readonly anyOf: readonly TSchema[] },
  const I extends TypeBoxVariantIndex<S['anyOf']>,
>(schema: S, index: I): TypeBoxVariantBuilder<S, I> {
  return fromTypeBoxVariant(schema, index);
}
expectType<{ kind: 'dog'; bark: boolean }>(variants(Pet, 1).with({ bark: true }).build());

// The legacy package line exports the same names without a context parameter.
import type {
  TypeBoxBuilder as LegacyBuilder,
  TypeBoxFactoryBuilder as LegacyFactoryBuilder,
  TypeBoxVariantBuilder as LegacyVariantBuilder,
} from '@mimlet/typebox-legacy';
import type { TSchema as LegacySchema } from '@sinclair/typebox';
function legacyDtos<S extends LegacySchema>(
  schema: S,
  create: () => LegacyEncode<S>
): LegacyFactoryBuilder<S, () => LegacyEncode<S>> {
  return legacyFactory(schema, create);
}
function inferredLegacyDtos<S extends LegacySchema>(schema: S, create: () => LegacyEncode<S>) {
  return legacyFactory(schema, create);
}
exact<
  Equal<
    ReturnType<typeof legacyDtos<typeof OldEvent>>,
    ReturnType<typeof inferredLegacyDtos<typeof OldEvent>>
  >
>();
const oldDtos = legacyDtos(OldEvent, () => ({ id: 'row-1', timestamp: 1 }));
expectType<{ id: string; timestamp: Date }>(
  oldDtos
    .with({ timestamp: 2 })
    .withFactory(() => ({ id: 'row-2' }))
    .buildValidated()
);
fluent(oldDtos, legacyFields(OldEvent)).withId('row-3').buildValidatedList(2);
function legacyAsyncDtos<S extends LegacySchema>(
  schema: S,
  load: () => Promise<LegacyEncode<S>>
): LegacyFactoryBuilder<S, () => Promise<LegacyEncode<S>>> {
  return legacyFactory(schema, load);
}
const oldLoaded = legacyAsyncDtos(OldEvent, async () => ({ id: 'row-4', timestamp: 4 }));
expectType<Promise<{ id: string; timestamp: Date }>>(oldLoaded.buildValidatedAsync());
// @ts-expect-error Legacy async factories stay async-only.
oldLoaded.buildValidated();
function legacyRowsNamed<S extends LegacyObject>(
  schema: S,
  defaults: () => BuilderPatch<LegacyEncode<S>>
): LegacyBuilder<S> {
  return fromLegacy(schema).withFactory(defaults);
}
expectType<{ id: string; timestamp: Date }>(
  legacyRowsNamed(OldEvent, () => ({ id: 'row-5' })).buildValidated()
);
function legacyBothWays<S extends LegacyObject>(schema: S, create: () => LegacyEncode<S>): void {
  const inferred = legacyFactory(schema, create);
  const named: LegacyFactoryBuilder<S, () => LegacyEncode<S>> = inferred;
  const back: typeof inferred = named;
  exact<Equal<typeof inferred, LegacyFactoryBuilder<S, () => LegacyEncode<S>>>>();
  exact<Equal<ReturnType<typeof fromLegacy<S>>, LegacyBuilder<S>>>();
  void back;
}
void legacyBothWays;
exact<Equal<typeof oldEvents, LegacyBuilder<typeof OldEvent>>>();
exact<Equal<typeof legacyDogs, LegacyVariantBuilder<typeof LegacyPet, 1>>>();
