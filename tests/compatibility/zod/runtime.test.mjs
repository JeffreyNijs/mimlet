import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';
import * as mini from 'zod/mini';
import { BuilderValidationError, fluent, restoreSession } from '@mimlet/core';
import {
  fromStandardJsonSchema,
  SchemaGenerationError,
  SchemaPreparationError,
} from '@mimlet/json-schema';
import { defineAdapter } from '@mimlet/adapter';
import { assertAdapterConformance } from '@mimlet/adapter/testing';
import {
  fromZod,
  fromZodAsync,
  fromZodFactory,
  fromZodFactoryAsync,
  zodAdapter,
  zodFields,
} from '@mimlet/zod';

test('generates native inputs in supported dialects without changing existing session behavior', () => {
  const schema = z.object({ name: z.string().min(1), age: z.number().int().min(18).max(90) });
  for (const dialect of ['draft-07', 'draft-2020-12']) {
    const adapter = zodAdapter(schema, { dialect, profile: 'random' });
    const execution = adapter.generation().session('same-stream');
    const snapshot = execution.snapshot();
    const values = fromZod(schema, { dialect, profile: 'random' }).buildValidatedList(4, execution);
    assert.deepEqual(
      values,
      fromStandardJsonSchema(schema, { dialect, profile: 'random' }).buildValidatedList(
        4,
        restoreSession(snapshot, adapter.generation().identity)
      )
    );
    for (const value of values) assert(schema.safeParse(value).success);
    assert.equal(adapter.generation(), adapter.generation());
  }
  assert.throws(() => fromZod(schema, { dialect: 'draft-2019-09' }), /draft-07/);
});

test('native codecs retain encoded input, decoded output and native reverse validation', async () => {
  let decodes = 0;
  const schema = z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => {
      decodes++;
      return new Date(value);
    },
    encode: (value) => value.toISOString(),
  });
  const input = '2026-01-01T00:00:00.000Z';
  const adapter = zodAdapter(schema);
  assert.equal(adapter.source, schema);
  const builder = fromZod(schema).replace(input);
  assert.equal(builder.build(), input);
  assert.equal(decodes, 0);
  assert.equal(builder.buildValidated().toISOString(), input);
  assert.equal(decodes, 1);
  assert.equal(adapter.encode(adapter.decode(input)), input);
  assert.equal(await adapter.encodeAsync(await adapter.decodeAsync(input)), input);
  assert.throws(() => zodAdapter(z.string().transform(Number)).encode(42), /unidirectional/i);
});

test('async refinements and codecs execute through the async parser exactly once', async () => {
  let checks = 0;
  const schema = z.string().refine(async (value) => {
    checks++;
    return value === 'ok';
  });
  const builder = fromZodAsync(schema).replace('ok');
  assert.equal(await builder.buildAsync(), 'ok');
  assert.equal(checks, 0);
  assert.equal(await builder.buildValidatedAsync(), 'ok');
  assert.equal(checks, 1);
  await assert.rejects(builder.replace('no').buildValidatedAsync(), BuilderValidationError);
  assert.equal(checks, 2);
  const codec = z.codec(z.string(), z.number(), {
    decode: async (value) => Number(value),
    encode: async (value) => String(value),
  });
  const adapter = zodAdapter(codec);
  assert.equal(await adapter.decodeAsync('42'), 42);
  assert.equal(await adapter.encodeAsync(42), '42');
});

test('factory helpers retain tuples, async capabilities and values that JSON cannot represent', async () => {
  const schema = z.object({ when: z.date(), ids: z.set(z.bigint()) });
  // Conversion waits for the first build, which names the input and suggests a factory.
  const automatic = fromZod(schema);
  assert.throws(
    () => automatic.build(),
    (error) =>
      error instanceof SchemaPreparationError &&
      error.code === 'SCHEMA_PREPARATION_FAILED' &&
      error.schemaPath === '/properties/when' &&
      error.message.includes('fromZodFactory(schema, factory)') &&
      error.cause instanceof Error
  );
  const builder = fromZodFactory(schema, (time, id = 1n) => ({
    when: new Date(time),
    ids: new Set([id]),
  }));
  assert.equal(builder.buildValidated(42, 2n).when.getTime(), 42);
  assert.deepEqual(builder.buildValidated(42).ids, new Set([1n]));
  const asyncFactory = fromZodFactory(schema, async (time) => ({
    when: new Date(time),
    ids: new Set(),
  }));
  assert.equal((await asyncFactory.buildValidatedAsync(7)).when.getTime(), 7);
  const asyncSchema = z.string().transform(async (value) => Number(value));
  const explicit = fromZodFactoryAsync(asyncSchema, (id, prefix = '') => `${prefix}${id}`);
  assert.equal(await explicit.buildValidatedAsync(42), 42);
  assert.equal(
    await fromZodFactoryAsync(asyncSchema, async (id) => String(id)).buildValidatedAsync(3),
    3
  );
});

test('preserves native object policies, defaults, issue paths and parse options', () => {
  const original = { count: 1, extra: true };
  const strip = fromZodFactory(
    z.object({ count: z.number(), role: z.string().default('reader') }),
    () => original
  );
  assert.deepEqual(strip.build(), original);
  assert.deepEqual(strip.buildValidated(), { count: 1, role: 'reader' });
  assert.deepEqual(original, { count: 1, extra: true });
  assert.throws(
    () => fromZodFactory(z.strictObject({ count: z.number() }), () => original).buildValidated(),
    BuilderValidationError
  );
  const invalid = fromZodFactory(z.object({ count: z.number() }), () => ({ count: 'wrong' }), {
    parseOptions: { error: () => 'native custom message', reportInput: true },
  });
  assert.throws(
    () => invalid.buildValidated(),
    (error) => {
      assert(error instanceof BuilderValidationError);
      assert.deepEqual(error.issues[0].path, ['count']);
      assert.equal(error.issues[0].message, 'native custom message');
      assert.equal(error.issues[0].input, 'wrong');
      return true;
    }
  );
});

test('does not retry user callback failures and applies clone/list configuration once', async () => {
  const failure = new Error('caller-owned failure');
  let calls = 0;
  const broken = z.string().transform(() => {
    calls++;
    throw failure;
  });
  const reported = (error) =>
    error instanceof BuilderValidationError &&
    error.cause === failure &&
    error.issues.length === 1 &&
    error.issues[0].path.length === 0 &&
    error.issues[0].message.includes('caller-owned failure');
  assert.throws(() => fromZodFactory(broken, () => 'x').buildValidated(), reported);
  assert.equal(calls, 1);
  await assert.rejects(fromZodFactoryAsync(broken, () => 'x').buildValidatedAsync(), reported);
  assert.equal(calls, 2);
  let clones = 0,
    factories = 0;
  const builder = fromZodFactory(
    z.object({ id: z.number() }),
    () => {
      factories++;
      return { id: 1 };
    },
    {
      maxListSize: 1,
      cloneInput: (value) => {
        clones++;
        return globalThis.structuredClone(value);
      },
    }
  );
  builder.buildValidated();
  assert.equal(clones, 1);
  assert.equal(factories, 1);
  assert.throws(() => builder.buildList(2), RangeError);
  assert.equal(factories, 1);
});

test('keeps generation exhaustion bounded and does not weaken opaque refinements', () => {
  let attempts = 0;
  const builder = fromZod(z.number().min(1), {
    maxAttempts: 2,
    provider: {
      id: 'always-invalid/v1',
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
  const refined = z.string().refine((value) => value === 'domain-specific');
  assert.throws(() => fromZod(refined).replace('other').buildValidated(), BuilderValidationError);
  assert.equal(
    fromZodFactory(refined, () => 'domain-specific').buildValidated(),
    'domain-specific'
  );
});

test('supports Mini, complete union replacement and the public adapter conformance suite', async () => {
  assert.deepEqual(fromZod(mini.object({ name: mini.literal('Ada') })).buildValidated(), {
    name: 'Ada',
  });
  const union = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('cat'), lives: z.number() }),
    z.object({ kind: z.literal('dog'), bark: z.boolean() }),
  ]);
  assert.deepEqual(fromZod(union).replace({ kind: 'dog', bark: false }).buildValidated(), {
    kind: 'dog',
    bark: false,
  });
  const native = zodAdapter(z.string().transform(Number));
  await assertAdapterConformance(
    defineAdapter({ id: 'zod', version: '4.4.3', standard: native.standard, operations: {} }),
    [
      {
        name: 'transformed input',
        input: () => '42',
        valid: true,
        output: (value) => value === 42,
      },
      { name: 'invalid null', input: () => null, valid: false },
    ]
  );
});

test('draws session-less list items from one default session', () => {
  const Person = z.object({ name: z.string(), age: z.number().int().min(18).max(99) });
  const people = fromZod(Person);
  const list = people.buildList(3);
  assert.equal(new Set(list.map((person) => JSON.stringify(person))).size, 3);
  assert.deepEqual(list, people.buildList(3, zodAdapter(Person).generation().session()));
  assert.deepEqual(people.buildList(3), list);
  assert.deepEqual(people.build(), list[0]);
});

test('lists object fields for a setter per field, through pipes and factory builders', async () => {
  const Account = z.object({ id: z.string(), age: z.string().transform(Number) });
  assert.deepEqual([...zodFields(Account)], ['id', 'age']);
  const transformed = Account.transform((value) => ({ ...value, label: value.id }));
  assert.deepEqual([...zodFields(transformed)], ['id', 'age']);
  assert.deepEqual([...zodFields(mini.object({ name: mini.string() }))], ['name']);
  const accounts = fluent(fromZod(transformed), zodFields(transformed));
  assert.deepEqual(accounts.withId('a').withAge('42').buildValidated(), {
    id: 'a',
    age: 42,
    label: 'a',
  });
  const dated = z.object({ id: z.string(), at: z.date() });
  const factory = fluent(
    fromZodFactory(dated, () => ({ id: 'x', at: new Date(0) })),
    zodFields(dated)
  );
  assert.equal(factory.withId('y').buildValidated().id, 'y');
  const Checked = z.object({ name: z.string().refine(async () => true) });
  const asynchronous = fluent(fromZodAsync(Checked), zodFields(Checked));
  assert.equal((await asynchronous.withName('Ada').buildValidatedAsync()).name, 'Ada');
  for (const schema of [z.string(), z.union([Account, z.object({ b: z.string() })]), null])
    assert.throws(() => zodFields(schema), /Zod object schema/);
});

test('builds undefined for z.void() and z.undefined() without a generator', async () => {
  for (const schema of [z.void(), z.undefined(), mini.void()]) {
    const builder = fromZod(schema);
    assert.equal(builder.build(), undefined);
    assert.equal(builder.buildValidated(), undefined);
    assert.deepEqual(builder.buildList(2), [undefined, undefined]);
    assert.equal(await fromZodAsync(schema).buildValidatedAsync(), undefined);
    assert.throws(() => zodAdapter(schema).generation(), SchemaPreparationError);
  }
  assert.throws(
    () => fromZod(z.object({ reply: z.void() })).build(),
    (error) => error instanceof SchemaPreparationError && error.schemaPath === '/properties/reply'
  );
});

test('converts on the first build and shares the generator per schema and options', () => {
  const Person = z.object({ name: z.string(), age: z.number().int().min(18) });
  const shared = zodAdapter(Person).generation();
  assert.equal(zodAdapter(Person, { maxListSize: 5 }).generation(), shared);
  assert.notEqual(zodAdapter(Person, { profile: 'random' }).generation(), shared);
  assert.equal(
    zodAdapter(Person, { annotations: ['x-note'], profile: 'random' }).generation(),
    zodAdapter(Person, { profile: 'random', annotations: ['x-note'] }).generation()
  );
  assert.deepEqual(fromZod(Person).buildList(2), fromZod(Person).buildList(2, shared.session()));
  const pattern = fromZod(z.string().regex(/^]$/));
  assert.throws(() => pattern.build(), SchemaPreparationError);
  // A conversion failure without a known location, and a thrown value that is not an Error.
  const opaque = z.string();
  opaque._zod.toJSONSchema = () => {
    throw 'opaque';
  };
  assert.throws(
    () => fromZod(opaque).build(),
    (error) =>
      error instanceof SchemaPreparationError &&
      error.schemaPath === '' &&
      error.cause === 'opaque' &&
      error.message.includes('fromZodFactory(schema, factory)')
  );
});

test('reports thrown ZodErrors and non-Error values from transforms as validation failures', () => {
  const Lead = z.object({ id: z.string(), source: z.string() });
  const parsing = Lead.transform((lead) => ({
    ...lead,
    source: z.enum(['teamleader']).parse(lead.source),
  }));
  assert.throws(
    () => fromZodFactory(parsing, () => ({ id: '1', source: 'hubspot' })).buildValidated(),
    (error) =>
      error instanceof BuilderValidationError &&
      error.cause instanceof z.ZodError &&
      error.issues[0].code === 'invalid_value'
  );
  const reporting = Lead.transform((lead, ctx) => {
    ctx.addIssue({ code: 'custom', path: ['source'], message: 'Unsupported lead source' });
    return z.NEVER;
  });
  assert.throws(
    () => fromZodFactory(reporting, () => ({ id: '1', source: 'hubspot' })).buildValidated(),
    /1 issue at source/
  );
  const text = z.string().transform(() => {
    throw 'text';
  });
  assert.throws(
    () => fromZodFactory(text, () => 'x').buildValidated(),
    (error) => error instanceof BuilderValidationError && error.cause === 'text'
  );
  assert.throws(
    () =>
      fromZodFactory(
        z.string().refine(async () => true),
        () => 'x'
      ).buildValidated(),
    (error) => !(error instanceof BuilderValidationError) && /parseAsync/.test(error.message)
  );
});
