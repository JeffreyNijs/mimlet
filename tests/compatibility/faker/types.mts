import { fromFaker, fromFakerSchema, fakerAdapter } from '@mimlet/faker';
import type { StandardSchemaV1 } from '@mimlet/core';
declare function expectType<T>(value: T): void;
const options = { fingerprint: 'people/v1' };
const provider = fakerAdapter(options);
const session = provider.session(42);
const users = fromFaker((f) => ({ name: f.person.fullName(), age: f.number.int() }), options);
expectType<{ name: string; age: number }>(users.build(session));
users.with({ name: 'Ada' }).build(session);
// @ts-expect-error Sessions are explicit, never hidden process state.
users.build();
// @ts-expect-error Inferred properties do not degrade to any.
users.with({ age: '42' });
// @ts-expect-error Required fields cannot be omitted.
users.omit('name');
const asynchronous = fromFaker(async (f) => ({ name: f.person.firstName() }), options);
expectType<Promise<{ name: string }>>(asynchronous.buildAsync(session));
// @ts-expect-error Known asynchronous factories have no synchronous build capability.
asynchronous.build(session);
declare const schema: StandardSchemaV1<{ age: string }, { age: number }>;
const b = fromFakerSchema(schema, (f) => ({ age: String(f.number.int()) }), options);
expectType<{ age: number }>(b.buildValidated(session));
expectType<{ age: string }>(b.build(session));
// @ts-expect-error Factory must produce schema input, not output.
fromFakerSchema(schema, () => ({ age: 42 }), options);
// @ts-expect-error Patches remain input typed.
b.with({ age: 42 });
// @ts-expect-error Versioned application fingerprint is required.
fakerAdapter({});
// @ts-expect-error Identity is computed by the adapter, not overridden by session settings.
provider.session(42, { provider: 'other' });

// An explicit defaultSession lets builds omit the session; callbacks always receive one.
const defaulted = fromFaker((f) => ({ name: f.person.firstName() }), {
  ...options,
  defaultSession: () => provider.session(),
  name: 'people',
});
expectType<{ name: string }>(defaulted.build());
const [firstPerson, secondPerson] = defaulted.buildList(2);
expectType<{ name: string }>(firstPerson);
expectType<{ name: string }>(secondPerson);
defaulted.withFactory((run) => ({ name: String(run.integer(1, 9)) }));
expectType<{ age: number }>(
  fromFakerSchema(schema, (f) => ({ age: String(f.number.int()) }), {
    ...options,
    defaultSession: () => provider.session(),
  }).buildValidated()
);
