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
