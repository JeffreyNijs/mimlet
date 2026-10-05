import { expect, it, expectTypeOf } from 'vitest';
import * as S from 'effect/Schema';
import * as A from 'effect/Arbitrary';
import * as E from 'effect/Effect';
import * as SAST from 'effect/SchemaAST';
import * as ST from 'effect/SchemaTransformation';
import effectPackage from 'effect/package.json' with { type: 'json' };
import {
  fromEffect,
  fromEffectAsync,
  fromEffectFactory,
  effectAdapter,
} from '../../packages/effect/src/index.js';
import { createSession } from '../../packages/core/src/index.js';
import { defineAdapter } from '../../packages/adapter/src/index.js';
import { assertAdapterConformance } from '../../packages/adapter/src/testing.js';
const session = (seed = 123) =>
  createSession({ seed, fingerprint: 'user/v1', provider: 'effect@4.0.0' });
it('retains native Effect decoding and shared conformance', async () => {
  const schema = S.NumberFromString;
  const native = effectAdapter(schema);
  const builder = fromEffectFactory(schema, () => '42');
  expectTypeOf(builder.build()).toEqualTypeOf<string>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.buildValidated()).toBe(42);
  await assertAdapterConformance(
    defineAdapter({ id: 'effect', version: '4.0.0', standard: native.standard, operations: {} }),
    [
      { name: 'encoded number', input: () => '42', valid: true, output: (v) => v === 42 },
      { name: 'invalid input', input: () => null, valid: false },
    ]
  );
});

it('rejects a missing session with an explicit error instead of a native crash', async () => {
  const missing = /requires an explicit GenerationSession/;
  const people = fromEffect(S.Struct({ name: S.String })).with({ name: 'Ada' });
  // @ts-expect-error Native Effect generation has no default session.
  expect(() => people.buildValidated()).toThrow(missing);
  // @ts-expect-error Lists require the same explicit session.
  expect(() => people.buildList(2)).toThrow(TypeError);
  // @ts-expect-error Asynchronous encoding requires the same explicit session.
  await expect(fromEffectAsync(S.Int).buildAsync()).rejects.toThrow(missing);
  expect(people.buildValidated(session())).toEqual({ name: 'Ada' });
});

it('samples the native arbitrary deterministically from the session, not Effect globals', () => {
  const people = fromEffect(S.Struct({ age: S.NumberFromString, name: S.NonEmptyString }));
  const first = people.buildList(3, session());
  expect(people.buildList(3, session())).toEqual(first);
  expect(people.buildList(3, session(124))).not.toEqual(first);
  expect(first.every((person) => typeof person.age === 'string' && person.name.length > 0)).toBe(
    true
  );
  A.configureGlobal({ sample: { seed: 11, size: 50, count: 5, maxDiscards: 0 } });
  try {
    expect(people.buildList(3, session())).toEqual(first);
  } finally {
    A.configureGlobal({});
  }
  // The loaded release, not a fixed claim: Effect does not promise identical samples across releases.
  expect(effectAdapter(S.Int).metadata).toMatchObject({
    version: effectPackage.version,
    arbitraryVersion: effectPackage.version,
    shrinking: 'native-effect-arbitrary-4',
  });
});

it('keeps parse options per adapter and leaves the caller schema untouched', () => {
  const schema = S.Struct({ age: S.Number });
  const strict = effectAdapter(schema);
  const loose = effectAdapter(schema, { parseOptions: { onExcessProperty: 'ignore' } });
  expect('~standard' in schema).toBe(false);
  expect(strict.checkOutput({ age: 1, extra: true })).toBe(false);
  expect(loose.checkOutput({ age: 1, extra: true })).toBe(true);
  expect(strict.standard['~standard'].validate({ age: 1, extra: true })).toHaveProperty('issues');
  expect(loose.standard['~standard'].validate({ age: 1, extra: true })).toEqual({
    value: { age: 1 },
  });
  const codec = effectAdapter(S.Struct({ age: S.NumberFromString }));
  expect(codec.checkInput({ age: '1' })).toBe(true);
  expect(codec.checkInput({ age: 1 })).toBe(false);
  expect(codec.checkOutput({ age: 1 })).toBe(true);
});

it('shrinks with the native Effect runner and re-encodes each shrink', () => {
  const schema = S.NumberFromString.check(S.isInt(), S.isBetween({ minimum: 0, maximum: 100 }));
  const adapter = effectAdapter(schema);
  const result = E.runSync(
    A.checkEffect(adapter.inputArbitrary(), (input) => Number(input) < 5, { seed: 1, runs: 100 })
  );
  expect(result._tag).toBe('Falsified');
  if (result._tag !== 'Falsified') {
    return;
  }
  expect(result.shrunkInput).toBe('5');
  expect(result.shrinks).toBeGreaterThan(0);
  expect(adapter.decode(result.shrunkInput)).toBe(5);
});

it('routes natively asynchronous generation through the async builder', async () => {
  const Box = S.declare(
    (u): u is { readonly box: number } => typeof u === 'object' && u !== null && 'box' in u,
    {
      toCodecArbitrary: () =>
        new SAST.Link(
          S.Number.ast,
          ST.transformEffect({
            decode: (n: number) => E.promise(async () => ({ box: n })),
            encode: (b: { readonly box: number }) => E.succeed(b.box),
          })
        ),
    }
  );
  expect(() => fromEffect(Box).build(session())).toThrow(/asynchronous; use fromEffectAsync/);
  const boxed = await fromEffectAsync(Box).buildAsync(session());
  expect(typeof boxed.box).toBe('number');
  expect(await fromEffectAsync(Box).buildAsync(session())).toEqual(boxed);
});

it('points synchronous builds over an asynchronous encoder to fromEffectAsync', async () => {
  const slow = ST.transformEffect({
    decode: (value: string) => E.promise(async () => value),
    encode: (value: string) => E.promise(async () => value),
  });
  const Signed = S.String.pipe(S.decodeTo(S.String, slow));
  expect(() => fromEffect(Signed).build(session())).toThrow(
    /encoding for this schema is asynchronous; use fromEffectAsync/
  );
  expect(typeof (await fromEffectAsync(Signed).buildAsync(session()))).toBe('string');
  // Ordinary schema failures still surface as Effect's own SchemaError.
  const unit = effectAdapter(S.Number.check(S.isBetween({ minimum: 0, maximum: 1 })));
  expect(() => unit.encode(5)).toThrow(expect.objectContaining({ name: 'SchemaError' }));
});
