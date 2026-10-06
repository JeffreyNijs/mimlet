# Sessions and replay

A builder is an immutable recipe. A generation session owns mutable execution
state for one test or scenario. Do not share a session across independent tests,
except deliberately, such as tests that write to one database and must not repeat
values (see [Share one session in a test](#share-one-session-in-a-test)).

```ts
import { createBuilder, createSession, restoreSession } from '@mimlet/core';
import type { GenerationSession } from '@mimlet/core';

const identity = {
  fingerprint: 'users/v1',
  provider: 'application-fixtures@1',
  configuration: 'adults',
};
const session = createSession({ ...identity, seed: 'regression-123' });
const users = createBuilder((session: GenerationSession) => ({
  id: session.sequence('user-id', 1),
  age: session.scope('age').integer(18, 80),
}));

const before = session.snapshot();
const original = users.buildList(3, session);
const replay = restoreSession(JSON.parse(JSON.stringify(before)), identity);
const repeated = users.buildList(3, replay);
// original and repeated contain the same values.
```

Scopes are shared views into a session: repeated `scope('age')` calls continue
that named stream. Different scope paths do not consume each other's counters.
Numeric and string names, negative zero, and names containing separators remain
distinct across JSON round-trips. There is no process-global RNG or ambient clock.
`referenceDate()` returns a fresh Date at the configured canonical ISO UTC time;
the default is `2000-01-01T00:00:00.000Z`.

The public operations are `scope`, `random`, inclusive `integer`, `boolean`,
`pick`, `sequence`, `unique`, `referenceDate`, and `snapshot`. Integer generation
uses rejection sampling, not modulo-biased range reduction. Scopes are limited
to 64 components and components to 4096 characters. The generator is for fixture
variation, not secrets, cryptographic use, or guaranteed non-overlapping streams.

`unique(name, factory, { keyOf, attempts })` is synchronous and session-scoped.
Primitive values work directly; objects require a primitive key from `keyOf`.
Duplicate attempts consume the operation budget. Failed generation is not proof
that the domain is empty. Defaults limit operations to 1,000,000, tracked keys
to 10,000, stored unique values to 100,000, and attempts per unique value to 100.
Limits are explicit session configuration and are retained by replay.

Take a snapshot **before** the operation to reproduce it, or afterward to resume
subsequent generation. Snapshots copy RNG positions, sequence state, uniqueness
keys, reference time, budgets, and the scope. Consumers must assert the same
fingerprint, provider/version, and configuration when restoring. These identities
are supplied by the application; the library cannot fingerprint an arbitrary
closure or make global third-party randomness replayable. Snapshots are not
cryptographically authenticated, and uniqueness keys can contain sensitive data.
Treat saved replays like fixtures; nothing is transmitted by the library.

Only randomness and state accessed through the session receive these guarantees.
Async callers must establish ordering themselves; automatic parallel execution,
fixture capture, and provider-derived fingerprints are separate capabilities.

## What decides the values

A session's values depend on two things: its seed and the scope path you draw from.
The fingerprint, provider and configuration identify the producer. `restoreSession()`
compares them and rejects a snapshot from another producer with
`INVALID_SESSION_REPLAY`, but they do not change any value: two sessions with the same
seed draw the same streams, whatever identity they carry. Changing the identity is not
a way to get different data; change the seed or the scope.

Schema adapters scope their own draws by their generation identity (the converted
schema, the generator version and its configuration). Builders over different schemas
therefore draw from different streams of one session. Builders over schemas that
convert to the same JSON Schema share a stream. That includes Zod brands: `brand()`
only changes the TypeScript type and returns the same schema at runtime, so
`z.uuid().brand('LeadUuid')` and `z.uuid().brand('DealUuid')` are one schema to the
generator.

## Omitted sessions

Builders whose session argument is optional (JSON Schema, Zod, ArkType, Valibot,
TypeBox, Avro, Protobuf, GraphQL and the API contract packages) start each session-less
call from their adapter's `session()`, seeded with `1`. One default session spans
a whole session-less list, so `builder.buildList(3)` returns three successive values
and equals `builder.buildList(3, adapter.session())`. Since only the seed and scope
matter, that is also `builder.buildList(3, createTestSession())`.

Repeating a session-less call repeats its values. Two builders over the same schema
return the same values, and two separate builds of one builder return the same value,
including `session.sequence()` results. When values must differ, share one session
across the builds of a test, or give the builders names.

### Share one session in a test

`createTestSession(seed?)` from `@mimlet/core` creates a session with a fixed generic
identity, so a test needs no fingerprint or provider. The seed defaults to `1`.
Create one for each test and pass it to every build:

<!-- recipe:sessions-test -->

[View the tested sessions recipe](../examples/recipes/sessions-test.ts).

Builds that share a session continue its streams and sequences, so values differ
between builders and between repeated builds of one builder. A new session for each
test keeps every test's values independent of the other tests.

A database that keeps rows between tests needs values that differ across tests too.
Give each test its own seed, such as `createTestSession(context.task.name)` from
Vitest's `beforeEach((context) => ...)`, so random values such as uuids differ.
Sequences restart in every new session, so for a unique column filled from
`sequence()`, create one session for the file in `beforeAll()` instead. A file-wide
session makes a test's values depend on the tests that ran before it in that file.

Restore a test session with `restoreSession(snapshot, testSessionIdentity)`. Every
test session has that identity, so use `createSession()` with your own fingerprint
when a saved replay must fail after your recipe changes.

### Name a builder

The `name` option gives a builder its own session-less values:

```ts
const leads = fromZod(LeadUuid, { name: 'LeadUuid' });
const deals = fromZod(DealUuid, { name: 'DealUuid' });
// leads.build() and deals.build() are different uuids.
```

A named builder draws its session-less builds from `scope('builder', name)` of its
default session, so `leads.build()` equals
`leads.build(createTestSession().scope('builder', 'LeadUuid'))`. The same name over the
same schema gives the same values, in any builder and in any order. A session you pass
to a build is used unchanged, so a name never changes explicit-session values or a
replay. Every builder accepts a name and `describe()` reports it; it changes values
only where the builder has a default session.

### Why session-less builds do not advance

A builder could keep a hidden session and continue it on every call. A test's values
would then depend on which tests ran before it in the same process, and running a
test on its own (`it.only`, a name filter or a retry) would produce other data.
Session-less builds stay pure instead: the same call returns the same values in any
order. Pass a session when builds should continue each other.

### Factory builders

Factory builders opt in with the core `defaultSession` option. `createBuilder`,
`createSchemaBuilder`, the builder classes, `fromZodFactory`, `fromZodFactoryAsync`,
`fromArkTypeFactory`, both `fromTypeBoxFactory` entry points, `fromEffect`,
`fromEffectAsync`, `fromEffectFactory`, `fromFaker`, `fromFakerSchema`,
`fromArbitrary`, `fromSchemaArbitrary`, `fromAdapter` and an adapter's `fromFactory`
accept it as a typed option. With a default session the factory may declare its
session as required: builds may omit it, and the factory always receives one.

```ts
const rows = fromZodFactory(Row, (session: GenerationSession) => ({ uuid: uuid.create(session) }), {
  defaultSession: () => createTestSession(),
  name: 'rows',
});
const [first, second] = rows.buildValidatedList(2); // two different uuids
```

Patch factories and transforms of any builder with a default session, including
`fromZod(schema).withFactory((session) => ...)`, receive a `GenerationSession`, not
`GenerationSession | undefined`. Callbacks that declare `session?` still compile.

TypeBox native creation does not draw from the session, so rows differ only through
patch factories and transforms, which receive it. The TypeBox creation fill takes its
dates from `referenceDate()`. A TypeBox fingerprint covers the schema data, not codec
or transform callbacks.

Native Effect builders have no default of their own because the adapter cannot derive
a replay identity for native schemas and annotations. Their types require a session,
and a missing session raises a `TypeError` before any generation, unless you pass
your own `defaultSession`.
