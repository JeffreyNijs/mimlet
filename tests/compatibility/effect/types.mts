import * as S from 'effect/Schema';
import { fromEffect, fromEffectAsync, fromEffectFactory, effectAdapter } from '@mimlet/effect';
import type { GenerationSession } from '@mimlet/core';
declare const session: GenerationSession;
declare function expectType<T>(value: T): void;
const schema = S.Struct({ age: S.NumberFromString });
const b = fromEffect(schema);
expectType<{ readonly age: string }>(b.build(session));
expectType<{ readonly age: number }>(b.buildValidated(session));
// @ts-expect-error Factory sessions are explicit.
b.build();
// @ts-expect-error Input patch is not parsed output.
b.with({ age: 42 });
// @ts-expect-error Parsed output is not any or string.
expectType<string>(b.buildValidated(session).age);
// @ts-expect-error Required fields cannot be omitted.
b.omit('age');
const c = fromEffectFactory(schema, (age: string) => ({ age }));
expectType<{ readonly age: number }>(c.buildValidated('42'));
// @ts-expect-error Custom factory must produce encoded input.
fromEffectFactory(schema, () => ({ age: 42 }));
// @ts-expect-error Required arguments are retained.
c.buildValidated();
const asyncB = fromEffectAsync(schema);
expectType<Promise<{ readonly age: number }>>(asyncB.buildValidatedAsync(session));
// @ts-expect-error Async encoder is not synchronously callable.
asyncB.build(session);
const asyncC = fromEffectFactory(schema, async (age: string) => ({ age }));
// @ts-expect-error Async factories preserve async-only capability.
asyncC.buildValidated('42');
const adapter = effectAdapter(schema);
expectType<{ readonly age: string }>(adapter.encode({ age: 42 }));
// @ts-expect-error Encoding takes decoded output.
adapter.encode({ age: '42' });
declare const decodingService: S.Codec<string, string, { readonly service: unique symbol }>;
// @ts-expect-error Effect decoding requirements must be provided explicitly, not ignored.
fromEffect(decodingService);
declare const encodingService: S.Codec<string, string, never, { readonly service: unique symbol }>;
// @ts-expect-error Effect encoding requirements must be provided explicitly, not ignored.
fromEffect(encodingService);

// A setter per encoded struct key, also from a generic helper.
import { fluent } from '@mimlet/core';
import { effectFields } from '@mimlet/effect';
function rows<A, I extends object>(source: S.Codec<A, I>) {
  return fluent(fromEffect(source), effectFields(source));
}
const Invoice = S.Struct({
  customerId: S.String,
  total: S.NumberFromString,
  note: S.optionalKey(S.String),
}).pipe(S.encodeKeys({ customerId: 'customer_id' }));
const invoices = rows(Invoice);
expectType<number>(invoices.withCustomerId('c').withTotal('3').buildValidated(session).total);
// @ts-expect-error Setters take encoded input, not decoded output.
invoices.withTotal(3);
// @ts-expect-error An exact optional key is omitted, never set to undefined.
invoices.withNote(undefined);
// @ts-expect-error Renamed keys are set by their encoded name.
invoices.with({ customerId: 'c' });
// @ts-expect-error Only struct schemas list fields.
effectFields(S.String);
// @ts-expect-error A nullable root has no single field list.
effectFields(S.NullOr(Invoice));

// Named builder types give a generic helper an explicit return type that is exactly what
// the entry point returns, for lint rules such as explicit-function-return-type.
import type { BuilderPatch } from '@mimlet/core';
import type { EffectBuilder, EffectFactoryBuilder } from '@mimlet/effect';
type Equal<X, Y> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? true : false;
declare function exact<T extends true>(): T;

function patchedRows<A, I extends object>(
  source: S.Codec<A, I>,
  defaults: () => BuilderPatch<I>
): EffectBuilder<A, I> {
  return fromEffect(source).withFactory(defaults);
}
expectType<{ readonly age: number }>(
  patchedRows(schema, () => ({ age: '1' })).buildValidated(session)
);
function dtoBuilder<A, I>(
  source: S.Codec<A, I>,
  create: (session: GenerationSession) => I
): EffectFactoryBuilder<A, I, (session: GenerationSession) => I> {
  return fromEffectFactory(source, create);
}
function inferredDtoBuilder<A, I>(
  source: S.Codec<A, I>,
  create: (session: GenerationSession) => I
) {
  return fromEffectFactory(source, create);
}
exact<
  Equal<
    ReturnType<typeof dtoBuilder<{ readonly age: number }, { readonly age: string }>>,
    ReturnType<typeof inferredDtoBuilder<{ readonly age: number }, { readonly age: string }>>
  >
>();
const dtos = dtoBuilder(schema, () => ({ age: '1' }));
expectType<{ readonly age: number }>(dtos.with({ age: '2' }).buildValidated(session));
expectType<{ readonly age: number }>(
  fluent(dtos, effectFields(schema)).withAge('3').buildValidated(session)
);
// @ts-expect-error Patches stay encoded-input typed.
dtos.with({ age: 2 });
function loadedDtos<A, I>(
  source: S.Codec<A, I>,
  load: () => Promise<I>
): EffectFactoryBuilder<A, I, () => Promise<I>> {
  return fromEffectFactory(source, load);
}
const loaded = loadedDtos(schema, async () => ({ age: '1' }));
expectType<Promise<{ readonly age: number }>>(loaded.buildValidatedAsync());
// @ts-expect-error An async factory never advertises synchronous builds.
loaded.buildValidated();
function bothWays<A, I>(source: S.Codec<A, I>, create: () => I): void {
  const inferred = fromEffectFactory(source, create);
  const named: EffectFactoryBuilder<A, I, () => I> = inferred;
  const back: typeof inferred = named;
  exact<Equal<typeof inferred, EffectFactoryBuilder<A, I, () => I>>>();
  exact<Equal<ReturnType<typeof fromEffect<A, I>>, EffectBuilder<A, I>>>();
  void back;
}
void bothWays;

// Your own defaultSession makes the session optional; callbacks always receive one.
import { createTestSession } from '@mimlet/core';
const defaulted = fromEffect(schema, { defaultSession: () => createTestSession(), name: 'ages' });
exact<
  Equal<typeof defaulted, EffectBuilder<{ readonly age: number }, { readonly age: string }, true>>
>();
expectType<{ readonly age: number }>(defaulted.buildValidated());
const [firstAge, secondAge] = defaulted.buildValidatedList(2);
expectType<{ readonly age: number }>(firstAge);
expectType<{ readonly age: number }>(secondAge);
defaulted.withFactory((run) => ({ age: String(run.integer(1, 9)) }));
expectType<Promise<{ readonly age: number }>>(
  fromEffectAsync(schema, { defaultSession: () => createTestSession() }).buildValidatedAsync()
);
const defaultedFactory = fromEffectFactory(
  schema,
  (run: GenerationSession) => ({ age: String(run.sequence('age')) }),
  { defaultSession: () => createTestSession() }
);
expectType<{ readonly age: number }>(defaultedFactory.buildValidated());
// @ts-expect-error Without a default, Effect builders still require a session.
fromEffect(schema).build();
