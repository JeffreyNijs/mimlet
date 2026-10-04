import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';
import { type } from 'arktype';
import * as v from 'valibot';
import { fromStandardJsonSchema } from '@mimlet/json-schema';
import { fromValibot, valibotAdapter, valibotFields } from '@mimlet/valibot';
import { createSchemaBuilder, createSession, fluent, BuilderValidationError } from '@mimlet/core';
const session = () =>
  createSession({ seed: 42, fingerprint: 'library-corpus/v1', provider: 'test' });

describe('real schema library generation and parsing', () => {
  for (const [name, schema, build] of [
    [
      'Zod',
      z.object({
        name: z.string().min(1),
        count: z.number().int().min(0).max(10),
        tag: z.string().optional(),
      }),
      fromStandardJsonSchema,
    ],
    [
      'ArkType',
      type({ name: 'string >= 1', count: '0 <= number.integer <= 10', 'tag?': 'string' }),
      fromStandardJsonSchema,
    ],
    [
      'Valibot',
      v.object({
        name: v.pipe(v.string(), v.minLength(1)),
        count: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(10)),
        tag: v.optional(v.string()),
      }),
      fromValibot,
    ],
  ]) {
    it(`${name}: generates native-compatible values in both declared dialects`, () => {
      for (const dialect of ['draft-07', 'draft-2020-12']) {
        const b = build(schema, { dialect, profile: 'random' });
        const values = b.buildValidatedList(10, session());
        assert.equal(values.length, 10);
        for (const value of values) {
          assert.ok(value.name.length > 0);
          assert.ok(Number.isInteger(value.count) && value.count >= 0 && value.count <= 10);
        }
        assert.equal(b.with({ name: 'Ada' }).omit('tag').buildValidated(session()).name, 'Ada');
        assert.throws(
          () => b.with({ count: -1 }).buildValidated(session()),
          BuilderValidationError
        );
      }
    });
  }
  it('Zod: generates input rather than output and executes transformations once', () => {
    let calls = 0;
    const schema = z.object({ age: z.literal('42') }).transform(({ age }) => {
      calls++;
      return { age: Number(age) };
    });
    const b = fromStandardJsonSchema(schema);
    assert.deepEqual(b.build(), { age: '42' });
    assert.equal(calls, 0);
    assert.deepEqual(b.buildValidated(), { age: 42 });
    assert.equal(calls, 1);
  });
  it('ArkType: keeps native morphs and errors without reconstructing a validator', () => {
    let calls = 0;
    const schema = type({ age: "'42'" }).pipe(({ age }) => {
      calls++;
      return { age: Number(age) };
    });
    const b = fromStandardJsonSchema(schema);
    assert.deepEqual(b.build(), { age: '42' });
    assert.deepEqual(b.buildValidated(), { age: 42 });
    assert.equal(calls, 1);
    assert.throws(() => b.replace({ age: 'bad' }).buildValidated(), BuilderValidationError);
  });
  it('Valibot: combines the converter with the original schema parser', () => {
    let calls = 0;
    const schema = v.object({
      age: v.pipe(
        v.literal('42'),
        v.transform((age) => {
          calls++;
          return Number(age);
        })
      ),
    });
    const adapter = valibotAdapter(schema);
    assert.equal(adapter.source, schema);
    assert.equal(adapter.metadata.conversion, 'input');
    const b = fromValibot(schema);
    assert.deepEqual(b.build(), { age: '42' });
    assert.equal(calls, 0);
    assert.deepEqual(b.buildValidated(), { age: 42 });
    assert.equal(calls, 1);
  });
  it('Valibot: exposes the generation session that session-less builds use', () => {
    const schema = v.object({ id: v.pipe(v.string(), v.uuid()), seats: v.number() });
    const generation = valibotAdapter(schema).generation();
    const list = fromValibot(schema).buildList(3);
    assert.deepEqual(list, fromValibot(schema).buildList(3, generation.session()));
    assert.equal(new Set(list.map((item) => item.id)).size, 3);
    assert.deepEqual(valibotAdapter(schema).generation().identity, generation.identity);
  });
  it('Valibot: generates ISO and base64 strings that the native actions accept', () => {
    const schema = v.object({
      local: v.pipe(v.string(), v.isoDateTime()),
      seconds: v.pipe(v.string(), v.isoDateTimeSecond()),
      time: v.optional(v.pipe(v.string(), v.isoTime())),
      times: v.array(v.pipe(v.string(), v.isoTime())),
      blob: v.pipe(v.string(), v.base64(), v.maxLength(12)),
    });
    for (const dialect of ['draft-07', 'draft-2020-12']) {
      for (const profile of ['minimal', 'random', 'boundary']) {
        for (const value of fromValibot(schema, { dialect, profile }).buildValidatedList(20)) {
          assert.equal(v.is(schema, value), true);
        }
      }
    }
    const { jsonSchema } = valibotAdapter(v.pipe(v.string(), v.base64())).standard['~standard'];
    const converted = jsonSchema.output({ target: 'openapi-3.0' });
    assert.equal(converted.contentEncoding, 'base64');
    assert.equal(new RegExp(converted.pattern, 'u').test('QUJD'), true);
    assert.equal(new RegExp(converted.pattern, 'u').test('abc'), false);
  });
  it('Valibot: keeps the converter rule of one regex action per string', () => {
    const combined = v.pipe(v.string(), v.regex(/^2/), v.isoDateTime());
    assert.throws(() => fromValibot(combined), /iso_date_time.*another regex action/);
    assert.throws(
      () => fromValibot(v.pipe(v.string(), v.isoTime(), v.startsWith('1'))),
      /another regex action/
    );
    const { jsonSchema } = valibotAdapter(combined).standard['~standard'];
    const lenient = (errorMode) =>
      jsonSchema.input({ target: 'draft-2020-12', libraryOptions: { errorMode } });
    // Lenient modes keep the converter's own (broader) result, as for its other actions.
    assert.equal(lenient('ignore').pattern, '^2');
    const warn = console.warn;
    const warnings = [];
    console.warn = (message) => warnings.push(message);
    try {
      assert.equal(lenient('warn').format, 'date-time');
    } finally {
      console.warn = warn;
    }
    assert.equal(warnings.length, 1);
    const described = valibotAdapter(v.pipe(v.string(), v.isoTime())).standard[
      '~standard'
    ].jsonSchema.input({
      target: 'draft-2020-12',
      libraryOptions: {
        overrideAction: ({ jsonSchema: converted }) => ({ ...converted, description: 'local' }),
      },
    });
    assert.equal(described.description, 'local');
    assert.equal(described.format, undefined);
    assert.match(described.pattern, /^\^/);
  });
  it('uses native invalid paths, defaults and optional semantics', () => {
    const schema = v.object({
      age: v.pipe(v.number(), v.minValue(18)),
      role: v.optional(v.string(), 'reader'),
    });
    const b = fromValibot(schema);
    assert.equal(b.buildValidated().role, 'reader');
    try {
      b.with({ age: 1 }).buildValidated();
      assert.fail();
    } catch (error) {
      assert.deepEqual(
        error.issues[0].path.map((part) => (typeof part === 'object' ? part.key : part)),
        ['age']
      );
    }
  });
  it('fails unrepresentable generation while native-value factory builders remain usable', () => {
    assert.throws(() => fromValibot(v.date()));
    const value = new Date(1);
    assert.equal(createSchemaBuilder(v.date(), () => value).buildValidated(), value);
    assert.equal(
      createSchemaBuilder(z.date(), () => value)
        .buildValidated()
        .getTime(),
      1
    );
  });
  it('invokes each native standard entry once; native implementations retain their own probing semantics', async () => {
    let calls = 0,
      entries = 0;
    const schemas = [
      z.string().refine(async () => {
        calls++;
        return false;
      }),
      v.pipeAsync(
        v.string(),
        v.checkAsync(async () => {
          calls++;
          return false;
        })
      ),
    ];
    for (const schema of schemas) {
      const native = schema['~standard'];
      const wrapped = {
        '~standard': {
          ...native,
          validate(value) {
            entries++;
            return native.validate(value);
          },
        },
      };
      await assert.rejects(
        createSchemaBuilder(wrapped, async () => 'bad').buildValidatedAsync(),
        BuilderValidationError
      );
    }
    assert.equal(entries, 2);
    // Pinned Zod probes sync first, then retries async internally. We do not add another invocation.
    assert.equal(calls, 3);
  });
  it('retains schema-specific object parsing rather than globally forbidding native normalization', () => {
    const b = fromValibot(v.object({ x: v.number() }));
    assert.deepEqual(b.replace({ x: 1, extra: 'kept only in input' }).buildValidated(), { x: 1 });
    const strict = fromValibot(v.strictObject({ x: v.number() }));
    assert.throws(
      () => strict.replace({ x: 1, extra: true }).buildValidated(),
      BuilderValidationError
    );
  });
  it('lists object entries for a setter per field, through pipes and factory builders', () => {
    const Order = v.object({
      id: v.pipe(v.string(), v.minLength(1)),
      total: v.pipe(v.string(), v.transform(Number)),
    });
    assert.deepEqual([...valibotFields(Order)], ['id', 'total']);
    const piped = v.pipe(
      Order,
      v.transform((value) => ({ ...value, paid: value.total > 0 }))
    );
    assert.deepEqual([...valibotFields(piped)], ['id', 'total']);
    for (const schema of [v.strictObject({ a: v.string() }), v.looseObject({ a: v.string() })])
      assert.deepEqual([...valibotFields(schema)], ['a']);
    const orders = fluent(fromValibot(piped), valibotFields(piped));
    assert.deepEqual(orders.withId('o-1').withTotal('3').buildValidated(), {
      id: 'o-1',
      total: 3,
      paid: true,
    });
    const Dated = v.object({ id: v.string(), at: v.date() });
    const dated = fluent(
      createSchemaBuilder(valibotAdapter(Dated).standard, () => ({ id: 'x', at: new Date(0) })),
      valibotFields(Dated)
    );
    assert.equal(dated.withId('y').buildValidated().id, 'y');
    for (const schema of [v.string(), v.union([Order, v.object({ b: v.string() })]), null])
      assert.throws(() => valibotFields(schema), /Valibot object schema/);
  });
});
