import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Type from 'typebox';
import { Type as Legacy, FormatRegistry, Kind, TypeRegistry } from '@sinclair/typebox';
import * as NativeValue from 'typebox/value';
import * as LegacyValue from '@sinclair/typebox/value';
import { BuilderGenerationError, createSession } from '@mimlet/core';
import * as modern from '@mimlet/typebox';
import * as legacy from '@mimlet/typebox-legacy';

const reference = '2000-01-01T00:00:00.000Z';
/** Legacy TypeBox ships no formats; register common ones only for the duration of a test. */
function withFormats(run) {
  const formats = {
    'date-time': (value) => !Number.isNaN(Date.parse(value)) && value.includes('T'),
    date: (value) => /^\d{4}-\d{2}-\d{2}$/.test(value),
    time: (value) => /^\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value),
    email: (value) => /^[^@\s]+@[^@\s]+$/.test(value),
    uuid: (value) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),
    uri: (value) => /^https?:\/\/\S+$/.test(value),
    url: (value) => /^https?:\/\/\S+$/.test(value),
    ipv4: (value) => /^(?:\d{1,3}\.){3}\d{1,3}$/.test(value),
    ipv6: (value) => value.includes(':'),
    hostname: (value) => /^[a-z0-9.-]+$/.test(value),
  };
  const previous = Object.keys(formats).filter((name) => FormatRegistry.Has(name));
  for (const [name, check] of Object.entries(formats)) {
    if (!previous.includes(name)) FormatRegistry.Set(name, check);
  }
  try {
    return run();
  } finally {
    for (const name of Object.keys(formats)) {
      if (!previous.includes(name)) FormatRegistry.Delete(name);
    }
  }
}
const generationError = (pattern) => (error) => {
  assert.ok(error instanceof BuilderGenerationError);
  assert.equal(error.code, 'GENERATION_FAILED');
  assert.match(error.message, pattern);
  assert.match(error.message, /supply fromTypeBoxFactory\(\)/);
  assert.ok(error.cause, 'the native creation error is kept as the cause');
  return true;
};

for (const [name, T, api, Value, check] of [
  ['typebox', Type, modern, NativeValue, (schema, value) => NativeValue.Check(schema, value)],
  [
    '@sinclair/typebox',
    Legacy,
    legacy,
    LegacyValue,
    (schema, value) => LegacyValue.Check(schema, value),
  ],
]) {
  describe(`${name}: deterministic creation fill`, () => {
    it('fills date, time and common string formats from the reference time', () =>
      withFormats(() => {
        const Strings = T.Object({
          at: T.String({ format: 'date-time' }),
          day: T.String({ format: 'date' }),
          time: T.String({ format: 'time' }),
          email: T.String({ format: 'email' }),
          id: T.String({ format: 'uuid' }),
          uri: T.String({ format: 'uri' }),
          url: T.String({ format: 'url' }),
          ipv4: T.String({ format: 'ipv4' }),
          ipv6: T.String({ format: 'ipv6' }),
          host: T.String({ format: 'hostname' }),
          note: T.Optional(T.String({ pattern: '^never$' })),
        });
        assert.throws(() => Value.Create(Strings), /default/);
        const builder = api.fromTypeBox(Strings);
        const value = builder.buildValidated();
        assert.equal(check(Strings, value), true);
        assert.deepEqual(value, {
          at: reference,
          day: '2000-01-01',
          time: '00:00:00Z',
          email: 'user@example.com',
          id: '00000000-0000-4000-8000-000000000000',
          uri: 'https://example.com/',
          url: 'https://example.com/',
          ipv4: '192.0.2.1',
          ipv6: '2001:db8::1',
          host: 'example.com',
        });
        assert.deepEqual(builder.buildValidated(), value);
        const later = createSession({
          seed: 1,
          fingerprint: 'fill',
          provider: 'tests',
          referenceTime: '2026-03-04T05:06:07.000Z',
        });
        assert.equal(builder.build(later).at, '2026-03-04T05:06:07.000Z');
        assert.equal(builder.build(later).day, '2026-03-04');
        const fixed = api.fromTypeBox(Strings, { fill: { now: '2027-01-01T00:00:00.000Z' } });
        assert.equal(fixed.build(later).at, '2027-01-01T00:00:00.000Z');
      }));
    it('uses fill.formats and fill.patterns candidates checked against the original string', () => {
      const Sku = T.String({ format: 'x-sku', minLength: 8 });
      assert.throws(
        () => api.fromTypeBox(T.Object({ sku: Sku })).build(),
        generationError(/at \/sku: no sample for format "x-sku"/)
      );
      FormatRegistry.Set('x-sku', (value) => value.startsWith('SKU-'));
      try {
        const skus = api.fromTypeBox(Sku, { fill: { formats: { 'x-sku': 'SKU-0001' } } });
        assert.equal(skus.buildValidated(), 'SKU-0001');
        // A sample that fails minLength is not used.
        assert.throws(
          () => api.fromTypeBox(Sku, { fill: { formats: { 'x-sku': 'SKU-1' } } }).build(),
          generationError(/at the root: no sample for format "x-sku"/)
        );
      } finally {
        FormatRegistry.Delete('x-sku');
      }
      const Code = T.String({ pattern: '^APP-[0-9]+$', maxLength: 6 });
      const patterns = ['fixture', 'APP-12345', 'APP-1'];
      assert.equal(api.fromTypeBox(Code, { fill: { patterns } }).buildValidated(), 'APP-1');
      const Order = T.Object({
        lines: T.Array(T.Object({ 'code/~x': Code }), { minItems: 1 }),
      });
      assert.throws(
        () => api.fromTypeBox(Order).build(),
        generationError(/at \/lines\/\*\/code~1~0x: no fill\.patterns candidate/)
      );
      assert.throws(
        () => api.fromTypeBox(Order, { fill: { patterns: ['nope'] } }).buildValidated(),
        (error) => !error.message.includes('nope')
      );
    });
    it('creates unique arrays from literal values or a single created item', () => {
      const Letters = T.Array(T.Union([T.Literal('a'), T.Literal('b'), T.Literal('a')]), {
        uniqueItems: true,
        minItems: 2,
      });
      assert.throws(() => Value.Create(Letters), /unique/i);
      assert.deepEqual(api.fromTypeBox(Letters).buildValidated(), ['a', 'b']);
      const Flags = T.Array(T.Boolean(), { uniqueItems: true, minItems: 2 });
      assert.deepEqual(api.fromTypeBox(Flags).buildValidated(), [false, true]);
      const One = T.Array(T.Literal('only'), { uniqueItems: true, minItems: 1 });
      assert.deepEqual(api.fromTypeBox(One).buildValidated(), ['only']);
      const Items = T.Array(T.Object({ id: T.Number({ exclusiveMinimum: 0 }) }), {
        uniqueItems: true,
        minItems: 1,
      });
      assert.deepEqual(api.fromTypeBox(Items).buildValidated(), [{ id: 1 }]);
      assert.deepEqual(
        api.fromTypeBox(T.Array(T.String(), { uniqueItems: true })).buildValidated(),
        []
      );
      const Tags = T.Object({ tags: T.Array(T.String(), { uniqueItems: true, minItems: 2 }) });
      assert.throws(
        () => api.fromTypeBox(Tags).build(),
        generationError(/at \/tags: fewer than 2 distinct literal values/)
      );
      const Mixed = T.Array(T.Union([T.Literal('a'), T.String()]), {
        uniqueItems: true,
        minItems: 2,
      });
      assert.throws(() => api.fromTypeBox(Mixed).build(), generationError(/distinct/));
    });
    it('tries union members in order and keeps the first value the whole union accepts', () => {
      const Seat = T.Object({
        seat: T.Union([T.String({ pattern: '^[A-Z][0-9]{1,3}$' }), T.Null()]),
        flag: T.Union([T.Boolean(), T.Null()]),
      });
      assert.deepEqual(api.fromTypeBox(Seat).buildValidated(), { seat: null, flag: false });
      // The first member is used whenever it works, including after its own fill.
      const Code = T.Union([T.String({ pattern: '^A$' }), T.Null()]);
      assert.equal(api.fromTypeBox(Code, { fill: { patterns: ['A'] } }).buildValidated(), 'A');
      const Never = T.Object({ code: T.Union([T.String({ pattern: '^A$' }), T.Never()]) });
      assert.throws(() => api.fromTypeBox(Never).build(), generationError(/at \/code: no fill/));
      assert.throws(
        () => api.fromTypeBox(T.Union([T.Never(), T.Never()])).build(),
        (error) =>
          error instanceof BuilderGenerationError &&
          /could not create a valid default fixture/.test(error.message)
      );
    });
    it('creates unions with a Null member as null with fill.nullable', () => {
      // Elysia's t.Nullable(x), recreated from TypeBox primitives: the Null member comes last.
      const Nullable = (schema, options) =>
        T.Union([schema, T.Null()], { ...options, nullable: true });
      const Profile = T.Object({
        name: Nullable(T.String()),
        age: Nullable(T.Integer({ minimum: 18 })),
        address: Nullable(T.Object({ street: T.String() })),
        nullFirst: T.Union([T.Null(), T.String()]),
        role: T.Union([T.Literal('admin'), T.Null()]),
        empty: T.Union([T.String(), T.Null(), T.Undefined()]),
        nested: T.Union([T.String(), Nullable(T.Number())]),
        none: T.Null(),
        skipped: T.Optional(Nullable(T.String())),
        chosen: Nullable(T.String(), { default: 'kept' }),
        member: Nullable(T.String({ default: 'member' })),
        code: Nullable(T.String({ pattern: '^A$' })),
        list: T.Array(Nullable(T.String()), { minItems: 2 }),
        noItems: T.Array(Nullable(T.String())),
        keys: T.Record(T.Union([T.Literal('a'), T.Literal('b')]), Nullable(T.Number())),
        open: T.Record(T.String(), Nullable(T.Number())),
        pair: T.Tuple([Nullable(T.String()), T.Number()]),
        both: T.Intersect([
          T.Object({ note: Nullable(T.String()) }),
          T.Object({ count: T.Number() }),
        ]),
      });
      const values = {
        name: '',
        age: 18,
        address: { street: '' },
        nullFirst: null,
        role: 'admin',
        empty: '',
        nested: '',
        none: null,
        chosen: 'kept',
        member: 'member',
        code: null,
        list: ['', ''],
        noItems: [],
        keys: { a: 0, b: 0 },
        open: {},
        pair: ['', 0],
        both: { note: '', count: 0 },
      };
      // The default keeps member order, as before the option existed.
      assert.deepEqual(api.fromTypeBox(Profile).buildValidated(), values);
      assert.deepEqual(api.fromTypeBox(Profile, { fill: { nullable: 'value' } }).build(), values);
      const nulls = { fill: { nullable: 'null' } };
      const value = api.fromTypeBox(Profile, nulls).buildValidated();
      assert.equal(check(Profile, value), true);
      assert.deepEqual(value, {
        name: null,
        age: null,
        address: null,
        nullFirst: null,
        role: null,
        empty: null,
        nested: null,
        none: null,
        // A union's own default wins; a default on the other member does not.
        chosen: 'kept',
        member: null,
        code: null,
        list: [null, null],
        noItems: [],
        keys: { a: null, b: null },
        open: {},
        pair: [null, 0],
        both: { note: null, count: 0 },
      });
      assert.equal(Object.hasOwn(value, 'skipped'), false, 'optional properties stay absent');
      // Overrides are checked against the original schema, not the creation copy.
      assert.equal(
        api.fromTypeBox(Profile, nulls).with({ name: 'Ada' }).buildValidated().name,
        'Ada'
      );
      // fill: false is plain native creation, which uses the first member.
      const Owner = Nullable(T.Object({ name: Nullable(T.String()) }));
      assert.deepEqual(api.fromTypeBox(Owner, { fill: false }).build(), { name: '' });
      assert.equal(api.fromTypeBox(Owner, nulls).buildValidated(), null);
      // An explicit variant still builds that member, with null inside it.
      assert.deepEqual(api.fromTypeBoxVariant(Owner, 0, nulls).buildValidated(), { name: null });
      assert.equal(api.fromTypeBoxVariant(Owner, 1, nulls).buildValidated(), null);
    });
    it('chooses values inside exclusive and one-sided bounds', () => {
      const Bounds = T.Object({
        between: T.Number({ exclusiveMinimum: 0, exclusiveMaximum: 1 }),
        negative: T.Integer({ exclusiveMaximum: 0 }),
        below: T.Number({ maximum: -5 }),
        step: T.Integer({ exclusiveMinimum: 0, multipleOf: 5 }),
        plain: T.Integer({ minimum: 3 }),
      });
      const value = api.fromTypeBox(Bounds).buildValidated();
      assert.equal(check(Bounds, value), true);
      assert.deepEqual(value, { between: 0.5, negative: -1, below: -5, step: 5, plain: 3 });
      assert.throws(
        () => api.fromTypeBox(T.Integer({ minimum: 1, maximum: 0 })).build(),
        BuilderGenerationError
      );
    });
    it('fills tuples, intersections and referenced schemas', () =>
      withFormats(() => {
        const Pair = T.Tuple([T.String({ format: 'uuid' }), T.Number()]);
        assert.deepEqual(api.fromTypeBox(Pair).buildValidated(), [
          '00000000-0000-4000-8000-000000000000',
          0,
        ]);
        assert.deepEqual(api.fromTypeBox(T.Tuple([])).buildValidated(), []);
        const Both = T.Intersect([
          T.Object({ email: T.String({ format: 'email' }) }),
          T.Object({ count: T.Number() }),
        ]);
        assert.deepEqual(api.fromTypeBox(Both).buildValidated(), {
          email: 'user@example.com',
          count: 0,
        });
        assert.deepEqual(api.fromTypeBox(T.Intersect([T.Object({})])).build(), {});
        const Ips = T.Array(T.String({ format: 'ipv4' }), { minItems: 2 });
        assert.deepEqual(api.fromTypeBox(Ips).buildValidated(), ['192.0.2.1', '192.0.2.1']);
        assert.deepEqual(api.fromTypeBox(T.Array(T.String(), { minItems: 1 })).build(), ['']);
      }));
    it('keeps defaults, optional properties and fill: false on plain native creation', () => {
      const Defaults = T.Object({
        at: T.String({ pattern: '^k', default: 'kept' }),
        missing: T.Optional(T.String({ format: 'date-time' })),
      });
      assert.deepEqual(api.fromTypeBox(Defaults).build(), { at: 'kept' });
      const Plain = T.String({ format: 'date-time' });
      assert.throws(
        () => api.fromTypeBox(Plain, { fill: false }).build(),
        (error) =>
          error instanceof BuilderGenerationError &&
          /could not create a valid default fixture/.test(error.message) &&
          /default/.test(String(error.cause))
      );
      assert.notEqual(
        api.typeBoxAdapter(Plain, { fill: false }).identity.configuration,
        api.typeBoxAdapter(Plain).identity.configuration
      );
      assert.notEqual(
        api.typeBoxAdapter(Plain, { fill: { patterns: ['x'] } }).identity.configuration,
        api.typeBoxAdapter(Plain).identity.configuration
      );
    });
    it('validates fill options when the adapter is created', () => {
      for (const fill of [
        null,
        'yes',
        { now: '2000-01-01' },
        { now: 'not a date' },
        { now: 1 },
        { formats: null },
        { formats: { uuid: 1 } },
        { patterns: 'x' },
        { patterns: [1] },
        { nullable: true },
        { nullable: null },
        { nullable: 'first' },
      ]) {
        assert.throws(() => api.fromTypeBox(T.String(), { fill }), TypeError);
      }
    });
    it('fingerprints native schema data, including symbols, dates and callbacks', () => {
      const meta = {
        date: new Date(0),
        bytes: new Uint8Array([1, 2]),
        big: 1n,
        symbol: Symbol('s'),
        callback: () => 1,
        pattern: /x/g,
        nothing: undefined,
        empty: null,
        zero: -0,
        list: [1, 'two'],
      };
      meta.self = meta;
      Object.defineProperty(meta, 'computed', { get: () => 1, enumerable: true });
      const annotated = (value) => Object.assign(T.String(), { meta: value });
      const first = api.typeBoxAdapter(annotated(meta)).identity;
      assert.match(first.fingerprint, /^typebox-fnv1a64-v1:[0-9a-f]{16}$/);
      assert.equal(api.typeBoxAdapter(annotated(meta)).identity.fingerprint, first.fingerprint);
      assert.notEqual(api.typeBoxAdapter(T.Number()).identity.fingerprint, first.fingerprint);
      assert.notEqual(
        api.typeBoxAdapter(annotated({ ...meta, zero: 0 })).identity.fingerprint,
        first.fingerprint
      );
    });
  });
}

describe('typebox: modern-only shapes', () => {
  it('falls back from a refined first member and fills cyclic and named references', () => {
    const Big = Type.Union([Type.Refine(Type.Number(), (value) => value > 5), Type.Null()]);
    assert.equal(modern.fromTypeBox(Big).buildValidated(), null);
    const Choice = Type.Array(Type.Enum(['x', 'y', 'z']), { uniqueItems: true, minItems: 3 });
    assert.deepEqual(modern.fromTypeBox(Choice).buildValidated(), ['x', 'y', 'z']);
    const Node = Type.Cyclic(
      {
        Node: Type.Object({
          id: Type.String({ format: 'uuid' }),
          children: Type.Array(Type.Ref('Node')),
        }),
        Unused: Type.Object({ code: Type.String({ pattern: '^x$' }) }),
      },
      'Node'
    );
    assert.deepEqual(modern.fromTypeBox(Node).buildValidated(), {
      id: '00000000-0000-4000-8000-000000000000',
      children: [],
    });
    const List = Type.Cyclic(
      { List: Type.Union([Type.Object({ next: Type.Ref('List') }), Type.Null()]) },
      'List'
    );
    assert.equal(modern.fromTypeBox(List).buildValidated(), null);
    const context = {
      User: Type.Object({ email: Type.String({ format: 'email' }) }),
      Bad: Type.Object({ code: Type.String({ pattern: '^x$' }) }),
    };
    assert.deepEqual(modern.fromTypeBox(Type.Ref('User'), { context }).buildValidated(), {
      email: 'user@example.com',
    });
    assert.throws(
      () => modern.fromTypeBox(Type.Object({ bad: Type.Ref('Bad') }), { context }).build(),
      generationError(/at \/code of reference "Bad": no fill\.patterns candidate/)
    );
  });
});

describe('typebox: fill.nullable through references', () => {
  it('creates nullable unions in context and cyclic definitions as null', () => {
    const nulls = { fill: { nullable: 'null' } };
    const context = {
      Address: Type.Object({ street: Type.Union([Type.String(), Type.Null()]) }),
      MaybeAddress: Type.Union([Type.Ref('Address'), Type.Null()]),
    };
    const Person = Type.Object({
      home: Type.Ref('Address'),
      work: Type.Ref('MaybeAddress'),
      billing: Type.Union([Type.Ref('Address'), Type.Null()]),
    });
    assert.deepEqual(modern.fromTypeBox(Person, { context }).buildValidated(), {
      home: { street: '' },
      work: { street: '' },
      billing: { street: '' },
    });
    assert.deepEqual(modern.fromTypeBox(Person, { context, ...nulls }).buildValidated(), {
      home: { street: null },
      work: null,
      billing: null,
    });
    const Node = Type.Cyclic(
      {
        Node: Type.Object({
          note: Type.Union([Type.String(), Type.Null()]),
          parent: Type.Union([Type.Ref('Node'), Type.Null()]),
        }),
      },
      'Node'
    );
    assert.deepEqual(modern.fromTypeBox(Node).buildValidated(), { note: '', parent: null });
    assert.deepEqual(modern.fromTypeBox(Node, nulls).buildValidated(), {
      note: null,
      parent: null,
    });
  });
});

describe('@sinclair/typebox: dates and Elysia shapes', () => {
  // Elysia's t.Date() and t.Uint8Array(), recreated from TypeBox primitives.
  const ElysiaDate = Legacy.Transform(
    Legacy.Union([
      Legacy.Date(),
      Legacy.String({ format: 'date-time', default: undefined }),
      Legacy.String({ format: 'date', default: undefined }),
      Legacy.Number({ default: undefined }),
    ])
  )
    .Decode((value) => new Date(value))
    .Encode((date) => date);
  const ElysiaBytes = Legacy.Transform(
    Legacy.Union([
      Legacy.Unsafe({ [Kind]: 'ArrayBuffer', default: [1, 2, 3] }),
      Legacy.Uint8Array(),
    ])
  )
    .Decode((value) => value)
    .Encode((value) => value);
  const register = (run) => {
    TypeRegistry.Set('ArrayBuffer', (_schema, value) => value instanceof ArrayBuffer);
    try {
      return run();
    } finally {
      TypeRegistry.Delete('ArrayBuffer');
    }
  };
  it('creates Type.Date() at the reference time instead of reading the clock', () => {
    const dates = legacy.fromTypeBox(Legacy.Date());
    assert.equal(dates.build().toISOString(), reference);
    assert.equal(dates.buildValidated().toISOString(), reference);
    assert.notEqual(dates.build(), dates.build());
    const bounded = Legacy.Date({ exclusiveMinimumTimestamp: Date.UTC(2020, 0, 1) });
    assert.equal(legacy.fromTypeBox(bounded).build().getTime(), Date.UTC(2020, 0, 1) + 1);
    assert.equal(
      legacy
        .fromTypeBox(Legacy.Date({ minimumTimestamp: 5 }))
        .build()
        .getTime(),
      5,
      'a declared minimum keeps native creation'
    );
    assert.throws(
      () =>
        legacy
          .fromTypeBox(Legacy.Date({ exclusiveMinimumTimestamp: 10, maximumTimestamp: 5 }))
          .build(),
      BuilderGenerationError
    );
    assert.equal(
      legacy
        .fromTypeBox(Legacy.Date(), { fill: { now: '2026-01-01T00:00:00.000Z' } })
        .build()
        .toISOString(),
      '2026-01-01T00:00:00.000Z'
    );
  });
  it('creates Elysia t.Date() and t.Uint8Array() deterministically', () =>
    register(() => {
      // Native creation picks the first member's default, which the union rejects.
      assert.equal(LegacyValue.Check(ElysiaBytes, LegacyValue.Create(ElysiaBytes)), false);
      const Upload = Legacy.Object({ at: ElysiaDate, file: ElysiaBytes });
      const uploads = legacy.fromTypeBox(Upload);
      const input = uploads.build();
      assert.equal(input.at.toISOString(), reference);
      assert.ok(input.file instanceof Uint8Array);
      assert.equal(input.file.length, 0);
      const output = uploads.buildValidated();
      assert.equal(output.at.toISOString(), reference);
      assert.deepEqual(uploads.buildValidated(), output);
      assert.ok(legacy.fromTypeBox(Legacy.Uint8Array()).build() instanceof Uint8Array);
    }));
  it('creates Elysia t.Nullable() shapes as null with fill.nullable', () => {
    // Elysia's t.Nullable(x), recreated from TypeBox primitives: the Null member comes last.
    const Nullable = (schema, options) =>
      Legacy.Union([schema, Legacy.Null()], { ...options, nullable: true });
    const nulls = { fill: { nullable: 'null' } };
    const User = Legacy.Object(
      { id: Legacy.Number(), nick: Nullable(Legacy.String()) },
      { $id: 'User' }
    );
    const Account = Legacy.Object({
      verifiedAt: Nullable(ElysiaDate),
      avatar: Legacy.Optional(Nullable(Legacy.String())),
      owner: Legacy.Ref(User),
      manager: Nullable(Legacy.Ref(User)),
    });
    const account = legacy.fromTypeBox(Account, { references: [User] }).buildValidated();
    assert.equal(account.verifiedAt.toISOString(), reference);
    assert.deepEqual(account.manager, { id: 0, nick: '' });
    assert.deepEqual(
      legacy.fromTypeBox(Account, { references: [User], ...nulls }).buildValidated(),
      { verifiedAt: null, owner: { id: 0, nick: null }, manager: null }
    );
    const Module = Legacy.Module({
      A: Legacy.Object({ b: Legacy.Ref('B'), c: Nullable(Legacy.Ref('B')) }),
      B: Legacy.Object({ note: Nullable(Legacy.String()) }),
    });
    assert.deepEqual(legacy.fromTypeBox(Module.Import('A')).buildValidated(), {
      b: { note: '' },
      c: { note: '' },
    });
    assert.deepEqual(legacy.fromTypeBox(Module.Import('A'), nulls).buildValidated(), {
      b: { note: null },
      c: null,
    });
    const Tree = Legacy.Recursive((Self) =>
      Legacy.Object({ label: Nullable(Legacy.String()), parent: Nullable(Self) })
    );
    assert.deepEqual(legacy.fromTypeBox(Tree, nulls).buildValidated(), {
      label: null,
      parent: null,
    });
  });
  it('fills recursive schemas, modules and references', () =>
    withFormats(() => {
      const Tree = Legacy.Recursive((Self) =>
        Legacy.Object({ id: Legacy.String({ format: 'uuid' }), children: Legacy.Array(Self) })
      );
      assert.deepEqual(legacy.fromTypeBox(Tree).buildValidated(), {
        id: '00000000-0000-4000-8000-000000000000',
        children: [],
      });
      const List = Legacy.Recursive((Self) =>
        Legacy.Union([Legacy.Object({ next: Self }), Legacy.Null()])
      );
      assert.equal(legacy.fromTypeBox(List).buildValidated(), null);
      const Module = Legacy.Module({
        A: Legacy.Object({ id: Legacy.String({ format: 'uuid' }), b: Legacy.Ref('B') }),
        B: Legacy.Object({ when: Legacy.Date() }),
        C: Legacy.Object({ code: Legacy.String({ pattern: '^x$' }) }),
      });
      const value = legacy.fromTypeBox(Module.Import('A')).buildValidated();
      assert.equal(value.b.when.toISOString(), reference);
      const User = Legacy.Object({ id: Legacy.String({ format: 'uuid' }) }, { $id: 'User' });
      const Bad = Legacy.Object({ code: Legacy.String({ pattern: '^x$' }) });
      assert.deepEqual(
        legacy.fromTypeBox(Legacy.Ref(User), { references: [User, Bad] }).buildValidated(),
        { id: '00000000-0000-4000-8000-000000000000' }
      );
      const Contains = Legacy.Array(Legacy.Number(), {
        uniqueItems: true,
        contains: Legacy.Number(),
      });
      assert.throws(() => legacy.fromTypeBox(Contains).build(), BuilderGenerationError);
    }));
});
