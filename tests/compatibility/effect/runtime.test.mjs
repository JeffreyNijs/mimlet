import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import * as S from 'effect/Schema';
import * as SAST from 'effect/SchemaAST';
import * as ST from 'effect/SchemaTransformation';
import * as E from 'effect/Effect';
import * as A from 'effect/Arbitrary';
import {
  fromEffect,
  fromEffectAsync,
  fromEffectFactory,
  effectAdapter,
  effectFields,
} from '@mimlet/effect';
import { createSession, fluent, BuilderValidationError } from '@mimlet/core';
const session = () =>
  createSession({ seed: 42, fingerprint: 'effect-corpus/v1', provider: 'effect@4.0.0' });
describe('Effect native adapter', () => {
  it('declares the installed native version it was tested against', () => {
    const installed = createRequire(import.meta.url)('effect/package.json').version;
    assert.equal(effectAdapter(S.Int).metadata.version, installed);
  });
  it('generates input via native output arbitrary and encoder', () => {
    const schema = S.Struct({ age: S.NumberFromString, label: S.NonEmptyString });
    const b = fromEffect(schema);
    const input = b.build(session());
    assert.equal(typeof input.age, 'string');
    const parsed = b.with({ age: '42' }).buildValidated(session());
    assert.equal(parsed.age, 42);
    assert.ok(parsed.label.length > 0);
  });
  it('retains native Date values and codec operations, without JSON conversion', async () => {
    let decode = 0,
      encode = 0;
    const schema = S.Number.pipe(
      S.decodeTo(
        S.Date,
        ST.transform({
          decode: (v) => {
            decode++;
            return new Date(v);
          },
          encode: (v) => {
            encode++;
            return v.getTime();
          },
        })
      )
    );
    const adapter = effectAdapter(schema);
    assert.equal(adapter.source, schema);
    assert.ok(adapter.outputArbitrary() === adapter.outputArbitrary());
    assert.equal(adapter.checkInput(1), true);
    assert.equal(adapter.checkInput('bad'), false);
    assert.equal(adapter.checkOutput(new Date(1)), true);
    assert.equal(adapter.checkOutput('bad'), false);
    assert.equal(adapter.decode(1).getTime(), 1);
    assert.equal((await adapter.decodeAsync(2)).getTime(), 2);
    assert.equal(adapter.encode(new Date(3)), 3);
    assert.equal(await adapter.encodeAsync(new Date(4)), 4);
    decode = 0;
    encode = 0;
    const b = fromEffect(schema);
    const value = b.replace(1000).buildValidated(session());
    assert.equal(value.getTime(), 1000);
    assert.equal(decode, 1);
    assert.equal(encode, 1);
  });
  it('reproduces sessions and respects explicit list budgets', () => {
    const b = fromEffect(S.Int, { maxListSize: 3 });
    assert.deepEqual(b.buildList(3, session()), b.buildList(3, session()));
    assert.throws(() => b.buildList(4, session()), RangeError);
  });
  it('preserves real native shrinking and re-encodes shrunk values', () => {
    const schema = S.NumberFromString.pipe(
      S.decodeTo(S.Int.check(S.isBetween({ minimum: 0, maximum: 100 })))
    );
    const a = effectAdapter(schema);
    const report = E.runSync(
      A.checkEffect(a.inputArbitrary(), (input) => Number(input) < 5, { seed: 1, runs: 100 })
    );
    assert.equal(report._tag, 'Falsified');
    assert.equal(report.shrunkInput, '5');
    assert.ok(report.shrinks > 0);
    assert.equal(a.decode(report.shrunkInput), 5);
    const replay = E.runSync(
      A.checkEffect(a.inputArbitrary(), (input) => Number(input) < 5, { replay: report.replay })
    );
    assert.equal(replay._tag === 'Falsified' && replay.shrunkInput, '5');
    assert.equal(a.metadata.shrinking, 'native-effect-arbitrary-4');
  });
  it('uses custom factories without eagerly requiring an arbitrary or inverse', () => {
    const failure = new Error('one-way encoder');
    const schema = S.String.pipe(
      S.decodeTo(
        S.Number,
        ST.transform({
          decode: (v) => Number(v),
          encode: () => {
            throw failure;
          },
        })
      )
    );
    assert.equal(fromEffectFactory(schema, (n) => String(n)).buildValidated(42), 42);
    assert.throws(
      () => fromEffect(schema).build(session()),
      (e) => e === failure
    );
  });
  it('retains async custom factory arguments and validation', async () => {
    // Effect 4's NumberFromString decodes non-numeric text to NaN; FiniteFromString rejects it.
    const b = fromEffectFactory(S.FiniteFromString, async (value) => value);
    assert.equal(await b.buildValidatedAsync('42'), 42);
    assert.deepEqual(await b.buildValidatedListAsync(2, '7'), [7, 7]);
    await assert.rejects(b.buildValidatedAsync('no'), BuilderValidationError);
  });
  it('supports explicit asynchronous native encoding and decoding', async () => {
    let encodes = 0,
      decodes = 0;
    const schema = S.String.pipe(
      S.decodeTo(
        S.Number,
        ST.transformEffect({
          decode: (value) =>
            E.promise(async () => {
              decodes++;
              return Number(value);
            }),
          encode: (value) =>
            E.promise(async () => {
              encodes++;
              return String(value);
            }),
        })
      )
    );
    const b = fromEffectAsync(schema);
    const result = await b.replace('42').buildValidatedAsync(session());
    assert.equal(result, 42);
    assert.equal(encodes, 1);
    assert.equal(decodes, 1);
    assert.equal(typeof (await b.buildAsync(session())), 'string');
    assert.throws(() => fromEffect(schema).build(session()), Error);
  });
  it('routes asynchronous native generation through the async builder', async () => {
    const Box = S.declare((u) => typeof u === 'object' && u !== null && 'box' in u, {
      toCodecArbitrary: () =>
        new SAST.Link(
          S.Number.ast,
          ST.transformEffect({
            decode: (n) => E.promise(async () => ({ box: n })),
            encode: (b) => E.succeed(b.box),
          })
        ),
    });
    assert.throws(() => fromEffect(Box).build(session()), {
      name: 'TypeError',
      message: /asynchronous; use fromEffectAsync/,
    });
    const boxed = await fromEffectAsync(Box).buildAsync(session());
    assert.deepEqual(await fromEffectAsync(Box).buildAsync(session()), boxed);
  });
  it('rejects invalid overrides and default excess properties without repairing them', () => {
    const schema = S.Struct({ age: S.Number });
    const b = fromEffect(schema);
    assert.throws(() => b.with({ age: 'bad' }).buildValidated(session()), BuilderValidationError);
    assert.throws(() => b.with({ extra: true }).buildValidated(session()), BuilderValidationError);
    // The same schema object must not inherit the first adapter's Standard Schema options.
    const nativeStrip = fromEffect(schema, { parseOptions: { onExcessProperty: 'ignore' } });
    assert.deepEqual(nativeStrip.replace({ age: 1, extra: true }).buildValidated(session()), {
      age: 1,
    });
    assert.equal('~standard' in schema, false);
  });
  it('rejects a missing session with an explicit error instead of a native crash', async () => {
    const missing = { name: 'TypeError', message: /requires an explicit GenerationSession/ };
    const people = fromEffect(S.Struct({ name: S.String })).with({ name: 'Ada' });
    assert.throws(() => people.buildValidated(), missing);
    assert.throws(() => people.build(undefined), missing);
    assert.throws(() => people.buildList(2), missing);
    await assert.rejects(fromEffectAsync(S.Int).buildAsync(), missing);
    assert.deepEqual(people.buildValidated(session()), { name: 'Ada' });
  });
  it('is unaffected by native global sampling defaults and does not mutate them', () => {
    const b = fromEffect(S.Struct({ age: S.Int, name: S.String }));
    const expected = b.build(session());
    A.configureGlobal({ sample: { seed: 11, size: 50, count: 5, maxDiscards: 0 } });
    try {
      assert.deepEqual(b.build(session()), expected);
    } finally {
      A.configureGlobal({});
    }
  });
  it('reports exhausted native sampling instead of returning a partial value', () => {
    const never = S.Int.check(S.makeFilter(() => false));
    assert.throws(() => fromEffect(never).build(session()), RangeError);
  });
  it('lists encoded struct keys for a setter per field', async () => {
    const Invoice = S.Struct({
      customerId: S.String,
      total: S.NumberFromString,
      note: S.optionalKey(S.String),
    }).pipe(S.encodeKeys({ customerId: 'customer_id' }));
    assert.deepEqual([...effectFields(Invoice)], ['customer_id', 'total', 'note']);
    const symbol = Symbol('hidden');
    assert.deepEqual([...effectFields(S.Struct({ [symbol]: S.String, id: S.String }))], ['id']);
    const invoices = fluent(fromEffect(Invoice), effectFields(Invoice));
    assert.deepEqual(
      invoices.withCustomerId('c-1').withTotal('3').withNote('n').buildValidated(session()),
      { customerId: 'c-1', total: 3, note: 'n' }
    );
    const viaFactory = fluent(
      fromEffectFactory(Invoice, () => ({ customer_id: 'c', total: '1' })),
      effectFields(Invoice)
    );
    assert.equal(viaFactory.withTotal('2').buildValidated().total, 2);
    const asynchronous = fluent(fromEffectAsync(Invoice), effectFields(Invoice));
    assert.equal((await asynchronous.withTotal('4').buildValidatedAsync(session())).total, 4);
    for (const schema of [
      S.String,
      S.NullOr(Invoice),
      S.Union([Invoice, S.Struct({ other: S.String })]),
      null,
    ])
      assert.throws(() => effectFields(schema), /Effect struct schema/);
  });
});
