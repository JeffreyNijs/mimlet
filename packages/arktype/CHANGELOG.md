# @mimlet/arktype

## 0.1.0-beta.5

### Patch Changes

- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
- Updated dependencies [eca2898]
  - @mimlet/core@0.1.0-beta.5
  - @mimlet/json-schema@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- c1282f7: Make it easier to get different values from different builders and builds, from two
  adoption trials.

  - **Builder names.** Every builder takes a `name` option, for example
    `fromZod(LeadUuid, { name: 'LeadUuid' })`. A builder with a default session draws its
    session-less builds from `defaultSession().scope('builder', name)`, so two builders over
    identical schemas no longer return the same values. Zod's `brand()` is type-only, so
    `z.uuid().brand('LeadUuid')` and `z.uuid().brand('DealUuid')` are the same schema at
    runtime and need a name (or a shared session) to differ. `describe()` reports the name.
  - **`createTestSession(seed = 1)`** and `testSessionIdentity` in `@mimlet/core` create a
    session without an application identity, to share across the builds of one test so
    consecutive builds continue it instead of repeating the first value. Session-less builds
    still repeat the same values on every call, so a test's data never depends on which tests
    ran before it.
  - **Typed default sessions.** `defaultSession` is now a typed option of `fromZodFactory`,
    `fromZodFactoryAsync`, `fromArkTypeFactory`, both `fromTypeBoxFactory` entry points,
    `fromEffect`, `fromEffectAsync`, `fromEffectFactory`, `fromFaker`, `fromFakerSchema`,
    `fromArbitrary`, `fromSchemaArbitrary`, `fromAdapter` and an adapter's `fromFactory`, where
    it already worked at runtime. With a default session the factory may declare its session
    as required.
  - **Callbacks receive a session.** On builders with a default session, including every
    `fromZod()`, `fromTypeBox()` and other schema builder, `withFactory()`, `replaceFactory()`
    and transform callbacks are typed with `session: GenerationSession` instead of
    `session?: GenerationSession`. Callbacks that declare `session?` still compile. The
    builder interfaces take an optional fourth (schema builders) or third type argument for
    these callback arguments; it defaults to the build arguments.
  - **Tuple lists.** `buildList`, `buildValidatedList`, their async variants and scenario
    lists return a tuple for a literal count up to 64, so `const [a, b] = builder.buildList(2)`
    types both items under `noUncheckedIndexedAccess`. A `number` count still returns an
    array. A `let` variable inferred from `buildList(2)` now has a two-item tuple type;
    annotate it as an array if you assign a list of another length to it.
  - **Scenarios.** `build()`, `buildList()` and their async variants take an optional session
    and use a fresh `createTestSession()` without one, where they used to fail with
    `ScenarioError` (cause `Cannot read properties of undefined (reading 'scope')`).
    `override()` and `trait()` factories now receive the node's declared dependencies as a
    second argument, `(session, dependencies)`, so a replaced derived node can keep its
    foreign keys. `Scenario` takes an optional third type argument that maps node names to
    their dependency names.

  Generated values: unnamed builders return the same values as in 0.1.0-beta.3, with or
  without a session, so existing fixtures and snapshots stay valid. Only builders you give a
  `name` produce new session-less values. A name never changes the values of a session you
  pass, and session snapshots recorded with 0.1.0-beta.3 replay identically; restoring one
  under another identity still fails with `INVALID_SESSION_REPLAY`. The documentation now
  states that a session's values depend only on its seed and scope path: the fingerprint,
  provider and configuration are checked by `restoreSession()` but do not change the values.

### Patch Changes

- Updated dependencies [62b95de]
- Updated dependencies [ae36328]
- Updated dependencies [ae36328]
- Updated dependencies [c1282f7]
  - @mimlet/core@0.1.0-beta.4
  - @mimlet/json-schema@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- 6d167f1: Installs no longer fail when a native library ships a compatible release. Each
  adapter's peer range now runs from its oldest tested version up to the library's next
  major release, or the next minor for the 0.x `@sinclair/typebox`: `zod >=4.4.3 <5`,
  `valibot >=1.5.0 <2`, `arktype >=2.2.5 <3`, `effect >=4.0.0 <5`, `typebox >=1.3.34 <2`,
  `@sinclair/typebox >=0.34.48 <0.35`, `@faker-js/faker >=10.5.0 <11` and
  `fast-check >=4.10.2 <5`. Before, the peer range ended at the newest tested version,
  so `npm install effect@4.0.1 @mimlet/effect` failed with `ERESOLVE` as soon as Effect
  4.0.1 was published.

  The versions each release was tested with stay recorded, now in the package's
  `mimlet.testedPeers` field, and `mimlet doctor` warns when an installed version is newer
  than that. Effect 4.0.1 is now tested. `effectAdapter().metadata.version` names the
  loaded Effect release instead of always `4.0.0`, and
  `arkTypeAdapter().metadata.supportedVersions` is the new peer range.

- @mimlet/core@0.1.0-beta.3
  - @mimlet/json-schema@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `arkTypeFields(schema)`, which lists an object type's top-level input props for
  `fluent()` from `@mimlet/core`: `fluent(fromArkType(schema), arkTypeFields(schema))` has
  a `withX()` setter per field, also in a generic helper over `S extends Type<object>`. It
  reads the native `schema.in.props`, so a morph lists the keys of its input. Unions and
  non-object types throw a `TypeError`.

### Patch Changes

- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- Updated dependencies
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0
  - @mimlet/json-schema@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- 62e6669: Accept ArkType 2.2.5 through 2.2.7 and Faker 10.5.0 through 10.6.0, each tested
  against the packed adapter. Faker's replay identity now names the loaded Faker
  release instead of always claiming 10.5.0. ArkType exposes no runtime version, so
  `arkTypeAdapter().metadata` reports `supportedVersions` instead of a fixed `version`;
  its generation identity still comes from the converted input schema.
- @mimlet/core@0.1.0-alpha.4
  - @mimlet/json-schema@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.
- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3
  - @mimlet/json-schema@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Minor Changes

- 4a915ee: Add dedicated Zod 4 (including Mini) and ArkType adapters with native input/output
  types, JSON Schema input generation, factory helpers and preserved native parsing.
  Zod's explicit async builders avoid the synchronous Standard Schema probe and
  retain native codec encoding. ArkType retains scoped Types and input checks that
  do not execute morphs.

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1
