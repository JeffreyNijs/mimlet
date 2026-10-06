import {
  builderClass,
  createBuilder,
  createBuilderClass,
  createScenario,
  createSchemaBuilder,
  createSchemaBuilderClass,
  createSession,
  createTestSession,
  fluent,
  restoreSession,
  testSessionIdentity,
  type Builder,
  type BuiltList,
  type GenerationSession,
  type Scenario,
  type SchemaBuilder,
  type StandardSchemaV1,
} from '../src/index.js';

declare function expectType<T>(value: T): void;
type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
declare function assertEqual<A, B>(...check: Equal<A, B> extends true ? [] : [never]): void;

const defaultSession = () => createTestSession();
interface Person {
  id: string;
}
declare const personSchema: StandardSchemaV1<Person, Person>;

// Test sessions need no identity; restoring one asserts the shared test identity.
const test = createTestSession();
createTestSession('leads.test');
createTestSession(7, { referenceTime: '2024-01-01T00:00:00.000Z', maxOperations: 10 });
expectType<GenerationSession>(restoreSession(test.snapshot(), testSessionIdentity));
// @ts-expect-error The identity of a test session is fixed.
createTestSession(1, { fingerprint: 'other' });

// A configured default session: callbacks receive a session, builds may omit it.
const people = createSchemaBuilder(
  personSchema,
  (session: GenerationSession) => ({ id: `p-${session.sequence('id')}` }),
  { defaultSession, name: 'person' }
);
assertEqual<
  typeof people,
  SchemaBuilder<
    { id: string },
    { id: string },
    [session?: GenerationSession],
    [session: GenerationSession]
  >
>();
expectType<{ id: string }>(people.build());
expectType<{ id: string }>(people.build(test));
people.withFactory((session) => ({ id: `w-${session.integer(1, 9)}` }));
people.replaceFactory((session) => ({ id: session.pick(['a', 'b']) }));
people.transform((value, session) => ({ id: `${value.id}-${session.random()}` }));
// Existing callbacks that declare an optional session keep compiling.
people.withFactory((session?: GenerationSession) => ({ id: String(session?.random()) }));
// @ts-expect-error A callback cannot require more than the builder passes.
people.withFactory((session: GenerationSession, extra: string) => ({ id: extra }));

// An optional-session factory gets the same callback types once a default is configured.
const optional = createBuilder((session?: GenerationSession) => session?.integer(0, 9) ?? -1, {
  defaultSession,
});
optional.withFactory((session) => session.integer(1, 2));
// Without a default the session stays optional for callbacks.
const undefaulted = createBuilder((session?: GenerationSession) => session?.integer(0, 9) ?? -1);
undefaulted.withFactory((session) => {
  // @ts-expect-error No default session: callbacks may receive undefined.
  return session.integer(1, 2);
});
// Unannotated factory parameters are typed from the default session.
const inferred = createBuilder((session) => session.sequence('n'), { defaultSession });
expectType<number>(inferred.build());
// Trailing optional parameters are kept.
const labelled = createBuilder(
  (session: GenerationSession, label = 'x') => `${label}${session.sequence('n')}`,
  { defaultSession }
);
expectType<string>(labelled.build(undefined, 'y'));
labelled.withFactory((session, label) => `${label ?? ''}${session.random()}`);
const asyncDefaulted = createSchemaBuilder(
  personSchema,
  async (session: GenerationSession) => ({ id: String(session.random()) }),
  { defaultSession }
);
expectType<Promise<{ id: string }>>(asyncDefaulted.buildValidatedAsync());
// @ts-expect-error Known async factories still expose async methods only.
asyncDefaulted.build();
expectType<{ id: string }>(
  new (createSchemaBuilderClass(
    personSchema,
    (session: GenerationSession) => ({
      id: String(session.random()),
    }),
    { defaultSession }
  ))().build()
);
const Counter = createBuilderClass((session: GenerationSession) => session.sequence('c'), {
  defaultSession,
});
expectType<number>(new Counter().build());
new Counter().withFactory((session) => session.sequence('d'));
const classed = new (builderClass(() => people))();
classed.withFactory((session) => ({ id: session.pick(['c']) }));
// @ts-expect-error A default session is a session factory, not a session.
createBuilder((session: GenerationSession) => session.random(), { defaultSession: test });
// @ts-expect-error A name must be a string.
createBuilder(() => 1, { name: 1 });

// Literal list counts give tuples; a number gives an array.
const [first, second] = people.buildValidatedList(2);
expectType<{ id: string }>(first);
expectType<{ id: string }>(second);
assertEqual<ReturnType<typeof people.buildList<3>>, [Person, Person, Person]>();
assertEqual<ReturnType<typeof people.buildList<0>>, []>();
declare const count: number;
assertEqual<ReturnType<typeof people.buildList<typeof count>>, { id: string }[]>();
expectType<{ id: string }[]>(people.buildList(count));
assertEqual<BuiltList<string, 2 | 3>, [string, string] | [string, string, string]>();
assertEqual<BuiltList<string, 65>, string[]>();
assertEqual<BuiltList<string, 1.5>, string[]>();
async function lists(): Promise<void> {
  const [a, b] = await people.buildListAsync(2);
  expectType<{ id: string }>(a);
  expectType<{ id: string }>(b);
  const [c] = await people.buildValidatedListAsync(1);
  expectType<{ id: string }>(c);
}
void lists;
const plain: Builder<number> = createBuilder(() => 1);
const [one, two] = plain.buildList(2);
expectType<number>(one);
expectType<number>(two);
// @ts-expect-error A two-item tuple has no third element.
void plain.buildList(2)[2];
const named = fluent(people, ['id']);
const [fluentFirst] = named.withId('x').buildValidatedList(1);
expectType<{ id: string }>(fluentFirst);
named.withFactory((session) => ({ id: session.pick(['z']) }));
// After an async transition the facade keeps setters and literal-count tuples.
const delayed = named.transformAsync(async (value) => value);
async function delayedLists(): Promise<void> {
  const [one, two] = await delayed.withId('y').buildValidatedListAsync(2);
  expectType<Person>(one);
  expectType<Person>(two);
}
void delayedLists;
// @ts-expect-error An async transition removes synchronous builds.
delayed.build();

// Scenarios: default sessions, typed dependencies for overrides and traits, tuple lists.
const deals = createScenario({ name: 'deals' })
  .node('deal', [], (_deps, session) => ({ uuid: `deal-${session.sequence('deal')}` }))
  .node('summary', ['deal'], ({ deal }) => ({ uuid: deal.uuid, total: 1 }));
expectType<string>(deals.build().summary.uuid);
expectType<string>(deals.build(test).deal.uuid);
const [x, y] = deals.buildList(2);
expectType<string>(x.deal.uuid);
expectType<string>(y.summary.uuid);
const varied = deals.override('summary', (session, { deal }) => ({
  uuid: deal.uuid,
  total: session.integer(1, 9),
}));
expectType<number>(varied.build().summary.total);
deals.override('summary', (_session, dependencies) => {
  // @ts-expect-error A replacement only receives the node's declared dependencies.
  void dependencies.summary;
  return { uuid: dependencies.deal.uuid, total: 0 };
});
deals.override('deal', (_session, dependencies) => {
  // @ts-expect-error A node without dependencies receives none.
  void dependencies.deal;
  return { uuid: 'fixed' };
});
deals.trait('zero', { summary: (_session, { deal }) => ({ uuid: deal.uuid, total: 0 }) });
// Old single-parameter replacements keep compiling.
deals.override('deal', () => ({ uuid: 'fixed' }));
deals.trait('fixed', { deal: (session) => ({ uuid: String(session.random()) }) });
async function scenarios(): Promise<void> {
  const delayed = deals.override('summary', async (_session, { deal }) => ({
    uuid: deal.uuid,
    total: 2,
  }));
  expectType<string>((await delayed.buildAsync()).summary.uuid);
  const [only] = await delayed.buildListAsync(1);
  expectType<number>(only.summary.total);
}
void scenarios;
// A declared scenario type without its dependency map receives every node as optional.
interface DealNodes {
  deal: { uuid: string };
  summary: { uuid: string; total: number };
}
const declared: Scenario<DealNodes> = deals;
declared.override('summary', (_session, { deal }) => ({ uuid: deal?.uuid ?? '', total: 0 }));
const precise: Scenario<DealNodes, false, { deal: never; summary: 'deal' }> = deals;
precise.override('summary', (_session, { deal }) => ({ uuid: deal.uuid, total: 0 }));
expectType<GenerationSession>(createSession({ seed: 1, fingerprint: 'f', provider: 'p' }));
