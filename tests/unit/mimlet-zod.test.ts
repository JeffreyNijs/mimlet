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
  expect((caught as Error).message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by the Zod transform at (root)'
  );
  expect((caught as BuilderValidationError).issues).toEqual([
    { message: 'The Zod transform at (root) threw Error: unsupported source', path: [] },
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

/** The error a validated build throws, for asserting on its message, issues and cause. */
function rejection(build: () => unknown): BuilderValidationError {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(BuilderValidationError);
    return error as BuilderValidationError;
  }
  throw new Error('Expected the build to throw');
}

it('names the transform whose stricter inner parse rejected a generated value', () => {
  // A generated API schema allows any source; the application only supports one.
  const zLeadDeal = z.object({ id: z.string(), title: z.string(), source: z.string() });
  const StrictLeadDeal = zLeadDeal.extend({ source: z.literal('teamleader') });
  class LeadDealTransformer {
    /** Parses the whole DTO again, so Zod's paths are relative to the DTO. */
    static fromDto(dto: z.output<typeof zLeadDeal>) {
      const strict = StrictLeadDeal.parse(dto);
      return { ...strict, label: `${strict.title} (${strict.source})` };
    }
    /** Parses one field, so Zod has no path for it. */
    static fromDtoSource(dto: z.output<typeof zLeadDeal>) {
      return { ...dto, source: z.literal('teamleader').parse(dto.source) };
    }
  }

  const whole = zLeadDeal.transform(LeadDealTransformer.fromDto);
  const wholeError = rejection(() =>
    fluent(fromZod(whole, { name: 'lead' }), zodFields(whole))
      .withSource('hubspot')
      .buildValidated()
  );
  expect(wholeError.message).toBe(
    'Schema validation failed: 1 issue at source; thrown by the Zod transform fromDto'
  );
  expect(wholeError.cause).toBeInstanceOf(z.ZodError);
  expect(wholeError.issues).toMatchObject([{ code: 'invalid_value', path: ['source'] }]);

  const single = zLeadDeal.transform(LeadDealTransformer.fromDtoSource);
  const singleError = rejection(() =>
    fluent(fromZod(single), zodFields(single)).withSource('hubspot').buildValidated()
  );
  // Zod reports no path for a single-value parse. The value is not matched back to a field:
  // the issue stays at the root, keeps Zod's message, and the error names the transform.
  expect(singleError.message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by the Zod transform fromDtoSource'
  );
  expect(singleError.cause).toBeInstanceOf(z.ZodError);
  expect(formatValidationIssues(singleError, { messages: true })).toBe(
    '(root): Invalid input: expected "teamleader"'
  );
  expect(
    fluent(fromZod(single), zodFields(single)).withSource('teamleader').buildValidated()
  ).toMatchObject({ source: 'teamleader' });
});

it('places errors thrown by a nested transform at its field when the schema has one callback', () => {
  const failure = new Error('not a date');
  function parseDate(value: string): Date {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw failure;
    }
    return date;
  }
  const Lead = z.object({ id: z.string(), createdAt: z.string().transform(parseDate) });
  const dated = fromZod(Lead).replace({ id: '1', createdAt: 'yesterday' });
  const error = rejection(() => dated.buildValidated());
  expect(error.message).toBe(
    'Schema validation failed: 1 issue at createdAt; thrown by the Zod transform parseDate'
  );
  expect(error.cause).toBe(failure);
  expect(error.issues).toEqual([
    { message: 'The Zod transform parseDate threw Error: not a date', path: ['createdAt'] },
  ]);

  // A ZodError from the nested transform gets the field prefix too.
  const Nested = z.object({
    deal: z
      .object({ source: z.string() })
      .transform((dto) => z.object({ source: z.literal('teamleader') }).parse(dto)),
  });
  const nested = rejection(() =>
    fromZod(Nested)
      .replace({ deal: { source: 'hubspot' } })
      .buildValidated()
  );
  expect(nested.message).toBe(
    'Schema validation failed: 1 issue at deal.source; thrown by the Zod transform at deal'
  );

  // With several callbacks the one that threw is unknown: no prefix, and all are listed.
  const Both = Lead.refine(function knownLead(lead) {
    return lead.id !== '';
  }).transform(function toLead(lead) {
    return lead;
  });
  const both = rejection(() =>
    fromZod(Both).replace({ id: '1', createdAt: 'yesterday' }).buildValidated()
  );
  expect(both.message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by one of the Zod callbacks transform parseDate, refinement knownLead, transform toLead'
  );
  expect(both.issues).toEqual([
    { message: 'A Zod transform or refinement threw Error: not a date', path: [] },
  ]);
  expect(both.cause).toBe(failure);

  // The same function in a list is named, but its index is unknown.
  const Leads = z.object({ items: z.array(z.string().transform(parseDate)) });
  const list = rejection(() =>
    fromZod(Leads)
      .replace({ items: ['2026-01-01', 'yesterday'] })
      .buildValidated()
  );
  expect(list.message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by the Zod transform parseDate'
  );

  // An anonymous refinement is named by its location, also on the async entry points and in
  // Zod Mini.
  const refined = z.object({
    email: z.string().superRefine(() => {
      throw new TypeError('lookup failed');
    }),
  });
  const message =
    'Schema validation failed: 1 issue at email; thrown by the Zod refinement at email';
  expect(rejection(() => fromZod(refined).buildValidated()).message).toBe(message);
  return expect(fromZodAsync(refined).buildValidatedAsync()).rejects.toMatchObject({
    message,
    issues: [{ message: 'The Zod refinement at email threw TypeError: lookup failed' }],
  });
});

it('names a callback by any function name, quoted unless it is an identifier path', () => {
  const failure = new Error('bad lead');
  const Lead = z.object({ id: z.string() });
  /** A throwing transform whose own `name` property is set to `name`. */
  const named = (descriptor: PropertyDescriptor) => {
    const transform = () => {
      throw failure;
    };
    Object.defineProperty(transform, 'name', { configurable: true, ...descriptor });
    return Lead.transform(transform);
  };
  const thrown = (descriptor: PropertyDescriptor) =>
    rejection(() => fromZod(named(descriptor)).buildValidated());
  const message = (name: unknown) => thrown({ value: name }).message;
  const prefix = 'Schema validation failed: 1 issue at (root); thrown by the Zod transform';

  // A static method reference or a name set with Object.defineProperty.
  const error = thrown({ value: 'LeadIndex.toModel' });
  expect(error.message).toBe(`${prefix} LeadIndex.toModel`);
  expect(error.issues).toEqual([
    { message: 'The Zod transform LeadIndex.toModel threw Error: bad lead', path: [] },
  ]);
  expect(error.cause).toBe(failure);
  expect(message('bound LeadIndex.toModel')).toBe(`${prefix} bound LeadIndex.toModel`);
  expect(message('créerPiste')).toBe(`${prefix} créerPiste`);
  expect(message('x'.repeat(100))).toBe(`${prefix} ${'x'.repeat(100)}`);
  // Any other name is a JSON string, so its quotes, commas and spaces stay inside it.
  expect(message('to model, then "save"')).toBe(`${prefix} "to model, then \\"save\\""`);
  expect(message('get lead')).toBe(`${prefix} "get lead"`);
  expect(message('[Symbol.iterator]')).toBe(`${prefix} "[Symbol.iterator]"`);
  // Control, line-break and invisible formatting characters are removed.
  expect(message('to\u0000Model\n\u202e\u200b')).toBe(`${prefix} toModel`);
  expect(message('\u001b[31mred\u001b[0m')).toBe(`${prefix} "[31mred[0m"`);
  // A long name is cut to 100 characters (UTF-16 code units), never inside a character.
  expect(message(`Lead.${'x'.repeat(150)}`)).toBe(`${prefix} "Lead.${'x'.repeat(92)}..."`);
  expect(message('\u{1F600}'.repeat(60))).toBe(`${prefix} "${'\u{1F600}'.repeat(48)}..."`);
  // A long list is cut before the error's own 200-character limit, also between characters.
  const many = Lead.refine(
    Object.defineProperty(() => true, 'name', { value: '\u{1F600}'.repeat(50) })
  ).transform(
    Object.defineProperty(
      () => {
        throw failure;
      },
      'name',
      { value: `Lead.${'\u{1F600}'.repeat(50)}` }
    )
  );
  const cut = rejection(() => fromZod(many).buildValidated()).message;
  expect(cut).toMatch(/\.\.\.$/);
  // A lone surrogate would make this throw.
  expect(() => encodeURIComponent(cut)).not.toThrow();
  expect(cut.length - cut.indexOf('thrown by')).toBeLessThanOrEqual(200);
  // No usable name: the location names the callback, as for an anonymous function.
  for (const name of ['', '   ', '\u0000\n\u200b', 42, undefined, null]) {
    expect(message(name)).toBe(`${prefix} at (root)`);
  }
  // A name getter is never called.
  expect(
    thrown({
      get() {
        throw new Error('name getter ran');
      },
    }).message
  ).toBe(`${prefix} at (root)`);

  // Several callbacks are listed with the same names.
  const several = Lead.refine(
    Object.defineProperty(() => true, 'name', { value: 'Lead, valid' })
  ).transform(
    Object.defineProperty(
      () => {
        throw failure;
      },
      'name',
      { value: 'LeadIndex.toModel' }
    )
  );
  expect(rejection(() => fromZod(several).buildValidated()).message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by one of the Zod callbacks refinement "Lead, valid", transform LeadIndex.toModel'
  );
});

it('reports no location for a callback inside a recursive schema', () => {
  interface Node {
    name: string;
    children: Node[];
  }
  const Category: z.ZodType<Node> = z.object({
    name: z.string().refine(function knownName(name) {
      if (name === 'unknown') {
        throw new Error('unknown category');
      }
      return true;
    }),
    get children() {
      return z.array(Category);
    },
  });
  const error = rejection(() =>
    fromZodFactory(Category, () => ({
      name: 'root',
      children: [{ name: 'unknown', children: [] }],
    })).buildValidated()
  );
  expect(error.message).toBe(
    'Schema validation failed: 1 issue at (root); thrown by the Zod refinement knownName'
  );
  const Mini = mini.object({
    at: mini.string().check(
      mini.refine(function isDate() {
        throw new Error('no');
      })
    ),
  });
  expect(rejection(() => fromZodFactory(Mini, () => ({ at: 'x' })).buildValidated()).message).toBe(
    'Schema validation failed: 1 issue at at; thrown by the Zod refinement isDate'
  );
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
  // A builder name scopes the builder's own session, not the generator.
  expect(zodAdapter(Person, { name: 'person' }).generation()).toBe(shared);
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
