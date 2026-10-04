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
