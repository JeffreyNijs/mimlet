import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scope, type } from 'arktype';
import { BuilderValidationError, fluent, restoreSession } from '@mimlet/core';
import { fromStandardJsonSchema, SchemaGenerationError } from '@mimlet/json-schema';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import { fromArkType, fromArkTypeFactory, arkTypeAdapter, arkTypeFields } from '@mimlet/arktype';

test('generates input in both native dialects and preserves standards-path replay', () => {
  const schema = type({ name: 'string >= 1', count: '0 <= number.integer <= 10' });
  for (const dialect of ['draft-07', 'draft-2020-12']) {
    const adapter = arkTypeAdapter(schema, { dialect, profile: 'random' });
    assert.equal(adapter.source, schema);
    assert.equal(adapter.standard, schema);
    assert.equal(adapter.generation(), adapter.generation());
    const execution = adapter.generation().session(42);
    const snapshot = execution.snapshot();
    const values = fromArkType(schema, { dialect, profile: 'random' }).buildValidatedList(
      5,
      execution
    );
    assert.deepEqual(
      values,
      fromStandardJsonSchema(schema, { dialect, profile: 'random' }).buildValidatedList(
        5,
        restoreSession(snapshot, adapter.generation().identity)
      )
    );
    for (const value of values) assert(schema.allows(value));
  }
});

test('checks input without running morphs and decodes through the original Type once', () => {
  let calls = 0;
  const schema = type({ age: "'42'" }).pipe(({ age }) => {
    calls++;
    return { age: Number(age) };
  });
  const adapter = arkTypeAdapter(schema);
  assert(adapter.checkInput({ age: '42' }));
  assert.equal(adapter.checkInput({ age: 42 }), false);
  assert.equal(calls, 0);
  const builder = fromArkType(schema);
  assert.deepEqual(builder.build(), { age: '42' });
  assert.equal(calls, 0);
  assert.deepEqual(builder.buildValidated(), { age: 42 });
  assert.equal(calls, 1);
  assert.deepEqual(adapter.decode({ age: '42' }), { age: 42 });
  assert.equal(calls, 2);
});

test('supports typed factory arguments, async input production and native Date/bigint values', async () => {
  const schema = type({ created: 'Date', id: 'bigint' });
  assert.throws(() => fromArkType(schema));
  const factory = (time, id = 1n) => ({ created: new Date(time), id });
  const builder = fromArkTypeFactory(schema, factory);
  assert.equal(builder.buildValidated(42, 2n).created.getTime(), 42);
  assert.equal(builder.buildValidated(42).id, 1n);
  const asyncBuilder = fromArkTypeFactory(schema, async (...args) => factory(...args));
  assert.equal((await asyncBuilder.buildValidatedAsync(7, 3n)).id, 3n);
});

test('retains defaults and each native undeclared-key policy without mutating inputs', () => {
  const input = { name: 'Ada', extra: true };
  const base = type({ name: 'string', count: 'number = 1' });
  assert.deepEqual(fromArkTypeFactory(base, () => input).buildValidated(), {
    name: 'Ada',
    extra: true,
    count: 1,
  });
  assert.deepEqual(
    fromArkTypeFactory(base.onUndeclaredKey('delete'), () => input).buildValidated(),
    { name: 'Ada', count: 1 }
  );
  assert.deepEqual(input, { name: 'Ada', extra: true });
  assert.throws(
    () => fromArkTypeFactory(base.onUndeclaredKey('reject'), () => input).buildValidated(),
    BuilderValidationError
  );
});

test('keeps scoped recursion, branded output and complete union replacement usable', () => {
  const schemas = scope({ User: { name: 'string', 'children?': 'User[]' } }).export();
  assert.equal(fromArkType(schemas.User).with({ name: 'Ada' }).buildValidated().name, 'Ada');
  assert.equal(
    fromArkTypeFactory(type('string').brand('Name'), () => 'Ada').buildValidated(),
    'Ada'
  );
  const union = type({ kind: "'cat'", lives: 'number' }).or({ kind: "'dog'", bark: 'boolean' });
  assert.deepEqual(fromArkType(union).replace({ kind: 'dog', bark: false }).buildValidated(), {
    kind: 'dog',
    bark: false,
  });
});

test('preserves native issues and thrown callback failures without retrying', () => {
  assert.throws(
    () => fromArkTypeFactory(type({ count: 'number >= 1' }), () => ({ count: 0 })).buildValidated(),
    (error) => {
      assert(error instanceof BuilderValidationError);
      assert.equal(error.issues[0].path[0], 'count');
      return true;
    }
  );
  let calls = 0;
  const failure = new Error('native callback failure');
  const schema = type('string').pipe(() => {
    calls++;
    throw failure;
  });
  assert.throws(
    () => fromArkTypeFactory(schema, () => 'x').buildValidated(),
    (error) => error === failure
  );
  assert.equal(calls, 1);
});

test('bounds generation and retains opaque native predicates through factories', () => {
  let attempts = 0;
  const builder = fromArkType(type('number >= 1'), {
    maxAttempts: 2,
    provider: {
      id: 'invalid/v1',
      generate: () => {
        attempts++;
        return -1;
      },
    },
  });
  assert.throws(
    () => builder.build(),
    (error) => error instanceof SchemaGenerationError && error.attempts === 2
  );
  assert.equal(attempts, 2);
  const refined = type('string').narrow((value) => value === 'domain-specific');
  assert.throws(() => fromArkType(refined));
  assert.equal(
    fromArkTypeFactory(refined, () => 'domain-specific').buildValidated(),
    'domain-specific'
  );
  assert.throws(
    () => fromArkTypeFactory(refined, () => 'other').buildValidated(),
    BuilderValidationError
  );
});

test('applies core clone/list configuration once and satisfies public adapter conformance', async () => {
  let clones = 0,
    factories = 0;
  const builder = fromArkTypeFactory(
    type({ id: 'number' }),
    () => {
      factories++;
      return { id: 1 };
    },
    {
      cloneInput: (value) => {
        clones++;
        return globalThis.structuredClone(value);
      },
      maxListSize: 1,
    }
  );
  builder.buildValidated();
  assert.equal(clones, 1);
  assert.equal(factories, 1);
  assert.throws(() => builder.buildList(2), RangeError);
  assert.equal(factories, 1);
  const native = arkTypeAdapter(type('string').pipe(Number));
  await assertAdapterConformance(
    defineAdapter({
      id: 'arktype',
      version: '2.2.5',
      standard: native.standard,
      operations: { checkInput: native.checkInput },
    }),
    [
      { name: 'morphed number', input: () => '42', valid: true, output: (value) => value === 42 },
      { name: 'invalid null', input: () => null, valid: false },
    ]
  );
});

test('draws session-less list items from one default session', () => {
  const Person = type({ name: 'string', age: '18 <= number.integer <= 99' });
  const people = fromArkType(Person);
  const list = people.buildList(3);
  assert.equal(new Set(list.map((person) => JSON.stringify(person))).size, 3);
  assert.deepEqual(list, people.buildList(3, arkTypeAdapter(Person).generation().session()));
  assert.deepEqual(people.buildList(3), list);
  assert.deepEqual(people.build(), list[0]);
});

test('lists input props for a setter per field, through morphs and factory builders', () => {
  const Form = type({ email: 'string', 'tickets?': 'string.numeric.parse' });
  assert.deepEqual([...arkTypeFields(Form)].sort(), ['email', 'tickets']);
  const morphed = Form.pipe((value) => ({ ...value, ok: true }));
  assert.deepEqual([...arkTypeFields(morphed)].sort(), ['email', 'tickets']);
  const symbol = Symbol('hidden');
  assert.deepEqual([...arkTypeFields(type({ [symbol]: 'string', name: 'string' }))], ['name']);
  const forms = fluent(fromArkType(Form), arkTypeFields(Form));
  assert.deepEqual(forms.withEmail('a@b.c').withTickets('2').buildValidated(), {
    email: 'a@b.c',
    tickets: 2,
  });
  const Dated = type({ id: 'string', at: 'Date' });
  const dated = fluent(
    fromArkTypeFactory(Dated, () => ({ id: 'x', at: new Date(0) })),
    arkTypeFields(Dated)
  );
  assert.equal(dated.withId('y').buildValidated().id, 'y');
  for (const schema of [type('string'), Form.or('null'), type({ a: 'string' }).or({ b: 'number' })])
    assert.throws(() => arkTypeFields(schema), /ArkType object type/);
  assert.throws(() => arkTypeFields({ in: { props: 'none' } }), /ArkType object type/);
});
