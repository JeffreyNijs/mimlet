import * as fc from 'fast-check';
import { createScenario, createSession, createBuilder, type StandardSchemaV1 } from '@mimlet/core';
import {
  fromArbitrary,
  fromSchemaArbitrary,
  mapFixtureArbitrary,
  schemaFixtureArbitrary,
  scenarioArbitrary,
  checkFixtureProperty,
  checkFixturePropertyAsync,
  replayFixtureProperty,
} from '@mimlet/fast-check';
declare function expectType<T>(value: T): void;
const identity = { fingerprint: 'fixture/v1', provider: 'test@1' };
const session = createSession({ ...identity, seed: 1 });
const input = fc.record({ age: fc.integer({ min: 1, max: 100 }), name: fc.string() });
const builder = fromArbitrary(input);
expectType<{ age: number; name: string }>(builder.build(session));
// @ts-expect-error A sampler needs an explicit execution session.
builder.build();
// @ts-expect-error Overrides remain input-typed.
builder.with({ age: 'wrong' });
const promised = fromArbitrary(fc.constant(Promise.resolve(1)));
expectType<Promise<number>>(promised.buildAsync(session));
// @ts-expect-error Promise-producing arbitraries retain async-only capabilities.
promised.build(session);
const mapped = mapFixtureArbitrary(input, (value) =>
  createBuilder(() => value)
    .with({ name: 'fixed' })
    .build()
);
expectType<fc.Arbitrary<{ age: number; name: string }>>(mapped);
// @ts-expect-error Arbitrary mapping does not hide asynchronous execution.
mapFixtureArbitrary(input, async (value) => value);
declare const schema: StandardSchemaV1<{ age: string }, { age: number }>;
const values = fc.record({ age: fc.stringMatching(/^[0-9]+$/) });
expectType<fc.Arbitrary<{ age: number }>>(schemaFixtureArbitrary(schema, values));
// @ts-expect-error The source arbitrary must generate the schema INPUT.
schemaFixtureArbitrary(schema, fc.record({ age: fc.integer() }));
expectType<{ age: number }>(fromSchemaArbitrary(schema, values).buildValidated(session));
const cart = createScenario()
  .node('quantity', [], () => 1)
  .node('total', ['quantity'], ({ quantity }) => quantity * 10);
expectType<fc.Arbitrary<{ quantity: number; total: number }>>(
  scenarioArbitrary(fc.integer(), (n) => cart.override('quantity', () => n), {
    ...identity,
    seed: 42,
  })
);
const result = checkFixtureProperty(input, (value) => value.age > 0, { identity, seed: 1 });
expectType<boolean>(result.details.failed);
expectType<number>(result.details.seed);
// @ts-expect-error Reproducible checks require a seed.
checkFixtureProperty(input, () => true, { identity });
// @ts-expect-error Async predicates use the async wrapper.
checkFixtureProperty(input, async () => true, { identity, seed: 1 });
expectType<Promise<unknown>>(
  checkFixturePropertyAsync(input, async () => true, { identity, seed: 1 })
);
if (result.replay) replayFixtureProperty(input, () => true, result.replay, identity);

// An explicit defaultSession lets builds omit the session that seeds each sample.
const defaulted = fromArbitrary(input, {
  defaultSession: () => createSession({ ...identity, seed: 2 }),
});
const [firstSample, secondSample] = defaulted.buildList(2);
expectType<{ age: number; name: string }>(firstSample);
expectType<{ age: number; name: string }>(secondSample);
defaulted.withFactory((run) => ({ age: run.integer(1, 9) }));
expectType<{ age: number }>(
  fromSchemaArbitrary(schema, values, {
    defaultSession: () => createSession({ ...identity, seed: 2 }),
  }).buildValidated()
);
