import { defineAdapter, fromAdapter } from '@mimlet/adapter';
import type { StandardSchemaV1 } from '@mimlet/core';
declare function expectType<T>(value: T): void;
declare const standard: StandardSchemaV1<{ age: string }, { age: number }>;
const adapter = defineAdapter({
  id: 'demo',
  version: '1',
  standard,
  operations: {
    create: (age: string) => ({ age }),
    encode: (value: { age: number }) => ({ age: String(value.age) }),
  },
});
expectType<{ age: string }>(fromAdapter(adapter).build('42'));
expectType<{ age: number }>(fromAdapter(adapter).buildValidated('42'));
expectType<{ age: number }>(adapter.fromFactory(() => ({ age: '1' })).buildValidated());
// @ts-expect-error Required factory arguments remain required.
fromAdapter(adapter).build();
// @ts-expect-error Patches target input, not decoded output.
fromAdapter(adapter).with({ age: 42 });
// @ts-expect-error Custom factories cannot violate schema input.
adapter.fromFactory(() => ({ age: 42 }));
const asynchronous = defineAdapter({
  id: 'async',
  version: '1',
  standard,
  operations: { create: async () => ({ age: '1' }) },
});
expectType<Promise<{ age: number }>>(fromAdapter(asynchronous).buildValidatedAsync());
// @ts-expect-error The SDK preserves async-only factory capabilities.
fromAdapter(asynchronous).buildValidated();
const validationOnly = defineAdapter({ id: 'check', version: '1', standard, operations: {} });
// @ts-expect-error Validation is not automatic data generation.
fromAdapter(validationOnly);
// @ts-expect-error An incompatible create operation is not accepted.
defineAdapter({ id: 'wrong', version: '1', standard, operations: { create: () => ({ age: 1 }) } });
// @ts-expect-error Encoding receives decoded output.
adapter.operations.encode({ age: '42' });

// A typed defaultSession lets builds omit the session; callbacks always receive one.
import { createTestSession, type GenerationSession } from '@mimlet/core';
const sessions = defineAdapter({
  id: 'sessions',
  version: '1',
  standard,
  operations: { create: (session: GenerationSession) => ({ age: String(session.random()) }) },
});
const defaulted = fromAdapter(sessions, { defaultSession: () => createTestSession(), name: 'a' });
expectType<{ age: number }>(defaulted.buildValidated());
const [firstAge, secondAge] = defaulted.buildValidatedList(2);
expectType<{ age: number }>(firstAge);
expectType<{ age: number }>(secondAge);
defaulted.withFactory((session) => ({ age: String(session.integer(1, 9)) }));
const factoryDefaulted = adapter.fromFactory(
  (session: GenerationSession) => ({ age: String(session.sequence('age')) }),
  { defaultSession: () => createTestSession() }
);
expectType<{ age: string }>(factoryDefaulted.build());
// @ts-expect-error Without a default, a session-requiring create must receive one.
fromAdapter(sessions).build();
// @ts-expect-error A default session would replace an unrelated first argument.
fromAdapter(adapter, { defaultSession: () => createTestSession() });

// A generative adapter without checkInput still satisfies the common suite.
import { assertAdapterConformance } from '@mimlet/adapter/testing';
const generatorOnly = defineAdapter({
  id: 'generator-only',
  version: '1',
  standard,
  operations: { create: () => ({ age: '42' }) },
});
void assertAdapterConformance(generatorOnly, [
  { name: 'valid', input: () => ({ age: '42' }), valid: true },
]);

// Unrelated capabilities are allowed, but an advertised input checker stays typed.
void assertAdapterConformance(
  {
    ...generatorOnly,
    operations: {
      // @ts-expect-error Pure input checkers must be functions.
      checkInput: true,
    },
  },
  [{ name: 'valid', input: () => ({ age: '42' }), valid: true }]
);

// Third-party adapters may expose named interfaces rather than index signatures.
interface CreationOperations {
  create(): { age: string };
}
interface CheckingOperations {
  checkInput(value: unknown): boolean;
}
declare const creationOperations: CreationOperations;
declare const checkingOperations: CheckingOperations;
void assertAdapterConformance({ ...generatorOnly, operations: creationOperations }, [
  { name: 'valid', input: () => ({ age: '42' }), valid: true },
]);
void assertAdapterConformance({ ...generatorOnly, operations: checkingOperations }, [
  { name: 'valid', input: () => ({ age: '42' }), valid: true },
]);
