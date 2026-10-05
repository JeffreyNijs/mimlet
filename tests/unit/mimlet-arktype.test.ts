import { expect, expectTypeOf, it } from 'vitest';
import { scope, type } from 'arktype';
import {
  arkTypeAdapter,
  fromArkType,
  fromArkTypeFactory,
} from '../../packages/arktype/src/index.js';
import { BuilderValidationError } from '../../packages/core/src/index.js';
import arkTypePackage from '../../packages/arktype/package.json' with { type: 'json' };

it('reports the published peer range as its supported versions', () => {
  // ArkType has no runtime version, so the metadata cannot drift from the peer range unnoticed.
  expect(arkTypeAdapter(type('string')).metadata.supportedVersions).toBe(
    arkTypePackage.peerDependencies.arktype
  );
});

it('generates native input and runs a morph only during validation', () => {
  let calls = 0;
  const schema = type({ age: "'42'" }).pipe(({ age }) => {
    calls++;
    return { age: Number(age) };
  });
  const builder = fromArkType(schema);
  expectTypeOf(builder.build).returns.toEqualTypeOf<{ age: '42' }>();
  expectTypeOf(builder.buildValidated).returns.toEqualTypeOf<{ age: number }>();
  expect(builder.build()).toEqual({ age: '42' });
  expect(calls).toBe(0);
  expect(builder.buildValidated()).toEqual({ age: 42 });
  expect(calls).toBe(1);
});

it('keeps native input checks distinct from morph execution', () => {
  let calls = 0;
  const schema = type('string').pipe((value) => {
    calls++;
    return Number(value);
  });
  const adapter = arkTypeAdapter(schema);
  expect(adapter.source).toBe(schema);
  expect(adapter.checkInput('42')).toBe(true);
  expect(adapter.checkInput(null)).toBe(false);
  expect(calls).toBe(0);
  expect(adapter.decode('42')).toBe(42);
  expect(calls).toBe(1);
});

it('retains typed async factories and native values without JSON conversion', async () => {
  const schema = type({ created: 'Date' });
  expect(() => fromArkType(schema)).toThrow();
  const builder = fromArkTypeFactory(schema, async (time: number) => ({ created: new Date(time) }));
  expectTypeOf(builder.buildValidatedAsync).parameters.toEqualTypeOf<[time: number]>();
  expect((await builder.buildValidatedAsync(42)).created.getTime()).toBe(42);
});

it('accepts scoped recursive schemas and preserves native rejection', () => {
  const schemas = scope({ User: { name: 'string', 'children?': 'User[]' } }).export();
  const builder = fromArkType(schemas.User);
  expect(builder.with({ name: 'Ada' }).buildValidated().name).toBe('Ada');
  expect(() =>
    fromArkTypeFactory(type({ age: 'number >= 18' }), () => ({ age: 1 })).buildValidated()
  ).toThrow(BuilderValidationError);
});

it('draws session-less list items from one default session', () => {
  const Person = type({ name: 'string', age: '18 <= number.integer <= 99' });
  const people = fromArkType(Person);
  const list = people.buildList(3);
  expect(new Set(list.map((person) => JSON.stringify(person))).size).toBe(3);
  expect(list).toEqual(people.buildList(3, arkTypeAdapter(Person).generation().session()));
  expect(people.buildList(3)).toEqual(list);
  expect(people.build()).toEqual(list[0]);
  expect(people.buildValidatedList(3)).toEqual(list);
});
