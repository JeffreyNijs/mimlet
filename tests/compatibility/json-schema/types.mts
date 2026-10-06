import {
  fromJsonSchema,
  fromStandardJsonSchema,
  jsonSchemaAdapter,
  type JsonSchema,
} from '@mimlet/json-schema';
import type { StandardSchemaV1, StandardJSONSchemaV1, GenerationSession } from '@mimlet/core';
declare function expectType<T>(value: T): void;
declare const schema: StandardSchemaV1<{ age: string }, { age: number }> &
  StandardJSONSchemaV1<{ age: string }, { age: number }>;
const users = fromStandardJsonSchema(schema);
expectType<{ age: string }>(users.with({ age: '42' }).build());
expectType<{ age: number }>(users.buildValidated());
expectType<Promise<{ age: number }>>(users.buildValidatedAsync());
// @ts-expect-error Input overrides are not decoded outputs.
users.with({ age: 42 });
// @ts-expect-error Unknown fields cannot appear in a typed patch.
users.with({ unknown: true });
// @ts-expect-error Required fields cannot be omitted.
users.omit('age');
// @ts-expect-error Validated output must not degrade to any or string.
expectType<string>(users.buildValidated().age);
const raw = fromJsonSchema({ type: 'integer' });
expectType<unknown>(raw.build());
// @ts-expect-error Runtime schemas do not synthesize inferred application types.
expectType<number>(raw.build());
// @ts-expect-error Raw-schema constructor has no unchecked generic type parameter.
fromJsonSchema<{ id: string }>({ type: 'object' });
expectType<GenerationSession>(jsonSchemaAdapter(true).session());
const asynchronous = users.transformAsync(async (v) => v);
// @ts-expect-error Async transforms remove guaranteed-failing synchronous APIs.
asynchronous.build();
const document: JsonSchema = { type: 'object', properties: { value: { type: 'integer' } } };
jsonSchemaAdapter(document, {
  formatsIdentity: 'v1',
  formats: {
    custom: { validate: (s) => s.startsWith('x'), generate: (random) => String(random.int(1, 2)) },
  },
});
// @ts-expect-error Profiles are explicit, not arbitrary schema mutations.
fromJsonSchema(document, { profile: 'unsafe' });
// @ts-expect-error Asynchronous format checks are not accepted.
jsonSchemaAdapter(document, { formats: { x: { validate: async () => true, generate: () => '' } } });

// A setter per field of the typed input, also from a generic helper.
import { fluent } from '@mimlet/core';
import { standardJsonSchemaFields } from '@mimlet/json-schema';
type Typed<I, O> = StandardSchemaV1<I, O> & StandardJSONSchemaV1<I, O>;
function rows<S extends Typed<object, unknown>>(standard: S) {
  return fluent(fromStandardJsonSchema(standard), standardJsonSchemaFields(standard));
}
declare const person: Typed<{ name: string; age: string; nick?: string }, { age: number }>;
const people = rows(person);
expectType<{ age: number }>(people.withName('Ada').withAge('42').withNick('A').buildValidated());
// @ts-expect-error Setters take input, not validated output.
people.withAge(42);
// @ts-expect-error An exact optional key is omitted, never set to undefined.
people.withNick(undefined);
// @ts-expect-error Only object inputs list fields.
standardJsonSchemaFields({} as Typed<string, string>);
// @ts-expect-error Raw JSON Schema has no typed input to name setters after.
standardJsonSchemaFields(document);

// Names, callbacks that always receive a session, and tuple lists.
const namedUsers = fromStandardJsonSchema(schema, { name: 'users' }).withFactory((run) => ({
  age: String(run.integer(1, 9)),
}));
const [firstUser, secondUser] = namedUsers.buildValidatedList(2);
expectType<{ age: number }>(firstUser);
expectType<{ age: number }>(secondUser);
fromJsonSchema(document, { name: 'raw' }).transform((value, run) => (run.boolean() ? value : 1));
// @ts-expect-error A builder name is a string.
fromJsonSchema(document, { name: 7 });
