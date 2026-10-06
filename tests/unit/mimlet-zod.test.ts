import { expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import * as mini from 'zod/mini';
import { version as zodVersion } from 'zod/v4/core';
import {
  fromZod,
  fromZodAsync,
  fromZodFactory,
  fromZodFactoryAsync,
  zodAdapter,
  zodFields,
} from '../../packages/zod/src/index.js';
import {
  BuilderValidationError,
  fluent,
  formatValidationIssues,
} from '../../packages/core/src/index.js';
import { SchemaPreparationError } from '../../packages/json-schema/src/index.js';

it('keeps generated input separate from native transformed output', () => {
  let calls = 0;
  const schema = z.object({ age: z.literal('42') }).transform(({ age }) => {
    calls++;
    return { age: Number(age) };
  });
  const builder = fromZod(schema);
  expectTypeOf(builder.build).returns.toEqualTypeOf<{ age: '42' }>();
  expectTypeOf(builder.buildValidated).returns.toEqualTypeOf<{ age: number }>();
  expect(builder.build()).toEqual({ age: '42' });
  expect(calls).toBe(0);
  expect(builder.buildValidated()).toEqual({ age: 42 });
  expect(calls).toBe(1);
});

it('runs explicit async refinements once and preserves factory arguments', async () => {
  let calls = 0;
  const schema = z.object({
    name: z.string().refine(async () => {
      calls++;
      return true;
    }),
  });
  const builder = fromZodFactoryAsync(schema, (id: number, prefix = 'user') => ({
    name: `${prefix}-${id}`,
  }));
  expectTypeOf(builder.buildValidatedAsync).parameters.toEqualTypeOf<
    [id: number, prefix?: string]
  >();
  expect(await builder.buildValidatedAsync(42)).toEqual({ name: 'user-42' });
  expect(calls).toBe(1);
  const automatic = fromZodAsync(schema);
  await automatic.buildValidatedAsync();
  expect(calls).toBe(2);
});

it('reports callback exceptions once, without the native Standard entry retrying them', () => {
  let calls = 0;
  const error = new Error('caller failure');
  const schema = z.string().transform(() => {
    calls++;
    throw error;
  });
  expect(() => fromZodFactory(schema, () => 'input').buildValidated()).toThrow(
    expect.objectContaining({ name: 'BuilderValidationError', cause: error })
  );
  expect(calls).toBe(1);
});

it('supports Zod Mini through the shared native Zod core API', () => {
  const builder = fromZod(mini.object({ name: mini.literal('Ada') }));
  expectTypeOf(builder.buildValidated).returns.toEqualTypeOf<{ name: 'Ada' }>();
  expect(builder.buildValidated()).toEqual({ name: 'Ada' });
});

it('keeps native-only factory values and useful validation paths', () => {
  const schema = z.object({ created: z.date() });
  // Conversion waits for the first build.
  const automatic = fromZod(schema);
  expect(() => automatic.build()).toThrow(SchemaPreparationError);
  const builder = fromZodFactory(schema, (time: number) => ({ created: new Date(time) }));
  expect(builder.buildValidated(42).created.getTime()).toBe(42);
  expect(() =>
    fromZodFactory(z.object({ count: z.number().min(1) }), () => ({ count: 0 })).buildValidated()
  ).toThrow(BuilderValidationError);
});

it('delegates reversible codecs to the native encoder and decoder', async () => {
  const schema = z.codec(z.iso.datetime(), z.date(), {
    decode: (value) => new Date(value),
    encode: (value) => value.toISOString(),
  });
  const adapter = zodAdapter(schema);
  const input = '2026-01-01T00:00:00.000Z';
  expect(adapter.encode(adapter.decode(input))).toBe(input);
  expect(await adapter.encodeAsync(await adapter.decodeAsync(input))).toBe(input);
});

it('draws session-less list items from one default session', async () => {
  const Person = z.object({ name: z.string(), age: z.number().int().min(18).max(99) });
  const people = fromZod(Person);
  const list = people.buildList(3);
  expect(new Set(list.map((person) => JSON.stringify(person))).size).toBe(3);
  expect(list).toEqual(people.buildList(3, zodAdapter(Person).generation().session()));
  expect(people.buildList(3)).toEqual(list);
  expect(people.build()).toEqual(list[0]);
  expect(people.buildValidatedList(3)).toEqual(list);
  expect(await fromZodAsync(Person).buildValidatedListAsync(3)).toEqual(list);
});

it('types the loaded Zod version as any release in the supported range', () => {
  const { version } = zodAdapter(z.string()).metadata;
  expectTypeOf(version).toEqualTypeOf<string>();
  expect(version).toBe(`${zodVersion.major}.${zodVersion.minor}.${zodVersion.patch}`);
});

it('builds undefined for schemas that accept only undefined', async () => {
  for (const schema of [z.void(), z.undefined(), z.literal(undefined), mini.void()]) {
    const builder = fromZod(schema);
    expect(builder.build()).toBeUndefined();
    expect(builder.buildValidated()).toBeUndefined();
    expect(builder.buildList(2)).toEqual([undefined, undefined]);
    expect(await fromZodAsync(schema).buildValidatedAsync()).toBeUndefined();
    expect(zodAdapter(schema).create()).toBeUndefined();
    // There is no JSON Schema, so there is no generator, session or replay identity.
    expect(() => zodAdapter(schema).generation()).toThrow(SchemaPreparationError);
  }
  expectTypeOf(fromZod(z.void()).build()).toEqualTypeOf<void>();
  expectTypeOf(fromZod(z.undefined()).buildValidated()).toEqualTypeOf<undefined>();
  expect(() =>
    fromZod(z.void())
      .replace('value' as never)
      .buildValidated()
  ).toThrow(BuilderValidationError);
});

it('names the location of input without a JSON form and suggests a factory', () => {
  const cases: [z.ZodType, string, RegExp][] = [
    [z.date(), '', /Date/],
    [
      z.object({ name: z.string(), created: z.date(), id: z.bigint() }),
      '/properties/created',
      /Date/,
    ],
    [
      z.object({ items: z.array(z.object({ at: z.date() })) }),
      '/properties/items/items/properties/at',
      /Date/,
    ],
    [z.union([z.string(), z.object({ key: z.symbol() })]), '/anyOf/1/properties/key', /Symbol/],
    [z.object({ reply: z.void() }), '/properties/reply', /Void/],
    [z.object({ gone: z.undefined().optional() }), '/properties/gone', /Undefined/],
    [z.object({ id: z.coerce.bigint() }), '/properties/id', /BigInt/],
    [z.tuple([z.string(), z.set(z.string())]), '/prefixItems/1', /Set/],
    [z.record(z.string(), z.map(z.string(), z.number())), '/additionalProperties', /Map/],
    [z.object({ check: z.custom<string>(() => true) }), '/properties/check', /Custom/],
    [z.object({ run: z.function() }), '/properties/run', /Function/],
    [z.object({ value: z.nan() }), '/properties/value', /NaN/],
    [z.object({ big: z.literal(1n) }), '/properties/big', /BigInt literal/],
  ];
  for (const [schema, schemaPath, reason] of cases) {
    // Creating the builder does not convert the schema.
    const builder = fromZod(schema);
    let caught: unknown;
    try {
      builder.build();
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SchemaPreparationError);
    const error = caught as SchemaPreparationError;
    expect(error).toMatchObject({ code: 'SCHEMA_PREPARATION_FAILED', schemaPath });
    expect(error.message).toMatch(reason);
    expect(error.message).toContain('fromZodFactory(schema, factory)');
    expect(error.message.endsWith(` at ${schemaPath || '/'}`)).toBe(true);
    expect(error.cause).toBeInstanceOf(Error);
    // A failed conversion is not cached: every build reports it.
    expect(() => builder.buildValidated()).toThrow(SchemaPreparationError);
    expect(() => fromZodAsync(schema)).not.toThrow();
  }
});

it('reports errors thrown inside a transform as a validation failure with the cause', async () => {
  const Lead = z.object({ id: z.string(), source: z.string() });
  const sources = z.enum(['teamleader']);
  const failure = new Error('unsupported source');
  // An application transformer that throws for a value the API type allows.
  const throwing = Lead.transform((lead) => {
    if (lead.source !== 'teamleader') {
      throw failure;
    }
    return lead;
  });
  const leads = fluent(fromZod(throwing), zodFields(throwing));
  let caught: unknown;
  try {
    leads.withSource('hubspot').buildValidated();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BuilderValidationError);
  expect((caught as Error).cause).toBe(failure);
  expect((caught as BuilderValidationError).issues).toEqual([
    { message: 'A Zod transform or refinement threw Error: unsupported source', path: [] },
  ]);
  await expect(
    fromZodFactoryAsync(throwing, () => ({ id: '1', source: 'hubspot' })).buildValidatedAsync()
  ).rejects.toMatchObject({ name: 'BuilderValidationError', cause: failure });
  expect(() =>
    fromZodFactory(
      z.string().transform(() => {
        throw 'text';
      }),
      () => 'x'
    ).buildValidated()
  ).toThrow(expect.objectContaining({ issues: [expect.objectContaining({ path: [] })] }));

  // A ZodError thrown by a nested parse keeps its issues, relative to that parse.
  const parsing = Lead.transform((lead) => ({ ...lead, source: sources.parse(lead.source) }));
  try {
    fluent(fromZod(parsing), zodFields(parsing)).withSource('hubspot').buildValidated();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(BuilderValidationError);
  expect((caught as Error).cause).toBeInstanceOf(z.ZodError);
  expect((caught as BuilderValidationError).issues).toMatchObject([
    { code: 'invalid_value', path: [] },
  ]);

  // Reporting through ctx.addIssue() lets Zod record the path of the rejected field.
  const reporting = Lead.transform((lead, ctx) => {
    const source = sources.safeParse(lead.source);
    if (!source.success) {
      ctx.addIssue({ code: 'custom', path: ['source'], message: 'Unsupported lead source' });
      return z.NEVER;
    }
    return { ...lead, source: source.data };
  });
  try {
    fluent(fromZod(reporting), zodFields(reporting)).withSource('hubspot').buildValidated();
  } catch (error) {
    caught = error;
  }
  expect((caught as Error).message).toBe('Schema validation failed: 1 issue at source');
  expect(formatValidationIssues(caught as BuilderValidationError, { messages: true })).toBe(
    'source: Unsupported lead source'
  );
  expect(
    fluent(fromZod(reporting), zodFields(reporting)).withSource('teamleader').buildValidated()
  ).toMatchObject({ source: 'teamleader' });
});

it('keeps the native error for async callbacks on the synchronous entry points', () => {
  const schema = z.string().refine(async () => true);
  expect(() => fromZodFactory(schema, () => 'x').buildValidated()).toThrow(z.core.$ZodAsyncError);
});

it('converts on the first build and shares the generator per schema and options', () => {
  const Person = z.object({ name: z.string(), age: z.number().int().min(18) });
  // Builder, list and parse options do not change generation, so they share one generator.
  const shared = zodAdapter(Person).generation();
  expect(
    zodAdapter(Person, { maxListSize: 5, parseOptions: { reportInput: true } }).generation()
  ).toBe(shared);
  expect(zodAdapter(Person, { profile: 'random' }).generation()).not.toBe(shared);
  expect(zodAdapter(Person, { profile: 'random', maxAttempts: 5 }).generation()).toBe(
    zodAdapter(Person, { maxAttempts: 5, profile: 'random' }).generation()
  );
  expect(zodAdapter(Person.extend({})).generation()).not.toBe(shared);
  // Options holding callbacks are not compared, so each adapter prepares its own.
  const provider = { id: 'fixed/v1', generate: () => ({ name: 'Ada', age: 30 }) };
  expect(zodAdapter(Person, { provider }).generation()).not.toBe(
    zodAdapter(Person, { provider }).generation()
  );
  expect(fromZod(Person, { provider }).buildValidated()).toEqual({ name: 'Ada', age: 30 });
  expect(fromZod(Person).buildList(2)).toEqual(fromZod(Person).buildList(2, shared.session()));
  // Errors found while preparing the generator also wait for the first build.
  const pattern = fromZod(z.string().regex(/^]$/));
  expect(() => pattern.build()).toThrow(SchemaPreparationError);
  const options = fromZod(Person, { profile: 'unknown' as 'random' });
  expect(() => options.build()).toThrow(/Unknown generation profile/);
  // The dialect is a builder option and is still checked when the builder is created.
  expect(() => fromZod(Person, { dialect: 'draft-2019-09' })).toThrow(/draft-07/);
  expect(() => fromZodAsync(Person, { dialect: 'draft-2019-09' })).toThrow(/draft-07/);
});

it('documents that build() returns the input and buildValidated() the output', () => {
  const Price = z
    .object({ cents: z.string() })
    .transform(({ cents }) => Number(cents))
    .pipe(z.number().transform((cents) => cents / 100));
  const builder = fromZod(Price).replace({ cents: '1250' });
  expectTypeOf(builder.build()).toEqualTypeOf<{ cents: string }>();
  expectTypeOf(builder.buildValidated()).toEqualTypeOf<number>();
  expect(builder.build()).toEqual({ cents: '1250' });
  expect(builder.buildValidated()).toBe(12.5);
});
