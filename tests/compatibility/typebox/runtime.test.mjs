import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import Type from 'typebox';
import { Type as Legacy, FormatRegistry } from '@sinclair/typebox';
import * as NativeValue from 'typebox/value';
import * as LegacyValue from '@sinclair/typebox/value';
import { createBuilder, BuilderValidationError, BuilderGenerationError } from '@mimlet/core';
import * as modern from '@mimlet/typebox';
import * as legacy from '@mimlet/typebox-legacy';

for (const [name, T, api, Value] of [
  ['typebox', Type, modern, NativeValue],
  ['@sinclair/typebox', Legacy, legacy, LegacyValue],
]) {
  describe(`${name}: native adapter conformance`, () => {
    it('generates, overrides and validates a native object schema', () => {
      const User = T.Object({
        id: T.String({ default: 'user-1' }),
        age: T.Integer({ minimum: 18, default: 20 }),
        note: T.Optional(T.String()),
      });
      const builder = api.fromTypeBox(User);
      assert.deepEqual(builder.with({ age: 25 }).buildValidated(), { id: 'user-1', age: 25 });
      assert.equal(builder.build().age, 20);
      assert.equal(Value.Check(User, builder.build()), true);
    });
    it('creates fresh values instead of sharing mutable schema defaults between builds', () => {
      const S = T.Object({ values: T.Array(T.String(), { default: ['a'] }) });
      const first = api.fromTypeBox(S).build();
      first.values.push('changed');
      assert.deepEqual(api.fromTypeBox(S).build().values, ['a']);
    });
    it('shares patched objects in build() but returns a decoded copy from buildValidated()', () => {
      const S = T.Object({ tags: T.Array(T.String()), owner: T.Object({ id: T.String() }) });
      const tags = ['a'];
      const owner = { id: 'user-1' };
      const builder = api.fromTypeBox(S).with({ tags, owner });
      const input = builder.build();
      assert.equal(input.tags, tags);
      assert.equal(input.owner, owner);
      const output = builder.buildValidated();
      assert.deepEqual(output, { tags: ['a'], owner: { id: 'user-1' } });
      assert.notEqual(output.tags, tags);
      assert.notEqual(output.owner, owner);
    });
    it('supports scalar, array, tuple, literal, nullable, union, intersection and record schemas', () => {
      const candidates = [
        T.String(),
        T.Number(),
        T.Boolean(),
        T.Null(),
        T.Literal('x'),
        T.Array(T.Integer(), { minItems: 1 }),
        T.Tuple([T.String(), T.Number()]),
        T.Union([T.Null(), T.String()]),
        T.Union([
          T.Object({ kind: T.Literal('a'), a: T.Number() }),
          T.Object({ kind: T.Literal('b'), b: T.String() }),
        ]),
        T.Intersect([T.Object({ a: T.Number() }), T.Object({ b: T.String() })]),
        T.Record(T.String(), T.Number()),
      ];
      for (const candidate of candidates) {
        const builder = api.fromTypeBox(candidate);
        assert.equal(Value.Check(candidate, builder.build()), true);
        assert.equal(Value.Check(candidate, builder.buildValidated()), true);
      }
    });
    it('validates a patched fixture once through the schema entry and runs a codec exactly once', () => {
      let decodes = 0;
      const codec = name === 'typebox' ? T.Codec(T.Number()) : T.Transform(T.Number());
      const Timestamp = codec
        .Decode((value) => {
          decodes++;
          return new Date(value);
        })
        .Encode((value) => value.getTime());
      const Event = T.Object({ at: Timestamp });
      const events = api.fromTypeBox(Event).with({ at: 1000 });
      assert.deepEqual(events.build(), { at: 1000 });
      assert.equal(decodes, 0);
      assert.equal(events.buildValidated().at.getTime(), 1000);
      assert.equal(decodes, 1);
      const adapter = api.typeBoxAdapter(Event);
      assert.equal(adapter.source, Event);
      assert.deepEqual(adapter.encode({ at: new Date(2000) }), { at: 2000 });
      assert.equal(decodes, 1);
    });
    it('does not coerce a string override into a number or strip extra properties', () => {
      const S = T.Object({ age: T.Number() }, { additionalProperties: false });
      const builder = api.fromTypeBox(S);
      assert.throws(() => builder.with({ age: '42' }).buildValidated(), BuilderValidationError);
      assert.throws(() => builder.with({ extra: true }).buildValidated(), BuilderValidationError);
      assert.deepEqual(builder.with({ age: '42' }).build(), { age: '42' });
    });
    it('does not reinsert omitted required fields from defaults', () => {
      const S = T.Object({ required: T.String({ default: 'default' }) });
      const builder = api.fromTypeBox(S).omit('required');
      assert.deepEqual(builder.build(), {});
      assert.throws(() => builder.buildValidated(), BuilderValidationError);
    });
    it('preserves escaped property locations in errors without logging the fixture', () => {
      const S = T.Object({ 'a/b~c': T.Integer() });
      const builder = api.fromTypeBox(S).with({ 'a/b~c': 'do-not-log-value' });
      assert.throws(
        () => builder.buildValidated(),
        (error) => {
          assert.ok(error instanceof BuilderValidationError);
          assert.ok(
            error.issues.some((issue) => JSON.stringify(issue.path) === JSON.stringify(['a/b~c']))
          );
          assert.equal(error.message.includes('do-not-log-value'), false);
          return true;
        }
      );
    });
    it('preserves sync and async custom factory arguments', async () => {
      const S = T.Object({ id: T.String() });
      assert.deepEqual(api.fromTypeBoxFactory(S, (id) => ({ id })).buildValidated('a'), {
        id: 'a',
      });
      assert.deepEqual(
        await api.fromTypeBoxFactory(S, async (id) => ({ id })).buildValidatedListAsync(2, 'b'),
        [{ id: 'b' }, { id: 'b' }]
      );
    });
    it('reports unsupported native creation with a cause and permits a custom provider', () => {
      const S = T.String({ pattern: '^hello-world$' });
      const builder = api.fromTypeBox(S);
      try {
        assert.equal(Value.Check(S, builder.build()), true);
      } catch (error) {
        assert.ok(error instanceof BuilderGenerationError);
        assert.ok(error.cause);
      }
      assert.equal(api.fromTypeBoxFactory(S, () => 'hello-world').buildValidated(), 'hello-world');
      assert.throws(() => api.fromTypeBox(T.Never()).build(), BuilderGenerationError);
    });
    it('forwards allocation budgets and retains them through the fluent API', () => {
      const builder = api.fromTypeBox(T.String(), { maxListSize: 1 }).replace('x');
      assert.deepEqual(builder.buildValidatedList(1), ['x']);
      assert.throws(() => builder.buildValidatedList(2), RangeError);
    });
    it('preserves codec failures rather than treating them as a reason to regenerate', () => {
      const failure = new Error('codec failed');
      const codec = name === 'typebox' ? T.Codec(T.Number()) : T.Transform(T.Number());
      const S = codec
        .Decode(() => {
          throw failure;
        })
        .Encode(() => 0);
      assert.throws(
        () => api.fromTypeBox(S).buildValidated(),
        (error) =>
          error === failure || error.cause === failure || error.message.includes('codec failed')
      );
    });
  });
}

describe('reference and native-type differences', () => {
  it('resolves modern named contexts without fetching references', () => {
    const User = Type.Object({ id: Type.String({ default: 'a' }) });
    const builder = modern.fromTypeBox(Type.Ref('User'), { context: { User } });
    assert.deepEqual(builder.buildValidated(), { id: 'a' });
  });
  it('resolves legacy external references without fetching them', () => {
    const User = Legacy.Object({ id: Legacy.String({ default: 'a' }) }, { $id: 'User' });
    assert.deepEqual(
      legacy.fromTypeBox(Legacy.Ref(User), { references: [User] }).buildValidated(),
      { id: 'a' }
    );
  });
  it('supports legacy recursive schemas through native value creation', () => {
    const Node = Legacy.Recursive((Self) =>
      Legacy.Object({ id: Legacy.String(), children: Legacy.Array(Self) })
    );
    const result = legacy.fromTypeBox(Node).buildValidated();
    assert.equal(LegacyValue.Check(Node, result), true);
    assert.deepEqual(result.children, []);
  });
  it('supports legacy native Date values without converting them to plain objects', () => {
    const builder = legacy.fromTypeBox(Legacy.Date());
    assert.ok(builder.build() instanceof Date);
    assert.ok(builder.buildValidated() instanceof Date);
    assert.equal(builder.replace(new Date(100)).buildValidated().getTime(), 100);
  });
  it('uses the native legacy format registry without modifying its configuration', () => {
    const key = 'test-builders-custom';
    const previous = FormatRegistry.Get(key);
    try {
      FormatRegistry.Set(key, (value) => value === 'APP-42');
      const S = Legacy.String({ format: key });
      assert.equal(legacy.fromTypeBoxFactory(S, () => 'APP-42').buildValidated(), 'APP-42');
      assert.throws(
        () => legacy.fromTypeBoxFactory(S, () => 'other').buildValidated(),
        BuilderValidationError
      );
    } finally {
      if (previous) FormatRegistry.Set(key, previous);
      else FormatRegistry.Delete(key);
    }
  });
  it('still supports a schema-free consumer with no native-library coupling in core', () => {
    assert.deepEqual(createBuilder(() => ({ x: 1 })).build(), { x: 1 });
  });
});
