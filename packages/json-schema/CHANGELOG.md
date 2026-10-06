# Changelog

## 0.1.0-beta.5

### Minor Changes

- eca2898: Prepared generators are now shared within a process by content. Two adapters whose
  schema and reference map have the same JSON text, with the same dialect, profile,
  limits and extension or format identities, reuse one compiled validator instead of
  compiling it again. This covers different schema objects with equal content, such as
  `zLead.transform(a)` and `zLead.transform(b)` in `@mimlet/zod`, and a schema module
  that a test runner or dev server evaluates again in the same process. Generated values,
  sessions, replay identities and validation issues are unchanged.

  Ajv instances are also shared per dialect, limits, annotations and reference map, so
  the JSON Schema meta-schema is compiled once per process instead of once per schema.
  For five first builds of generated Hey API schemas in a new process this took about
  145 ms before and 118 ms now. Loading the same generated schema module again in one
  process and building five schemas took about 65 ms before and 12 ms now. Vitest's
  default isolation runs each spec file in a new worker, which starts with an empty
  cache, so there only the first improvement applies.

  The store keeps the 256 most recently used generators, lives on `globalThis` under
  `Symbol.for('mimlet.generators.v1')` with one store per package version, and never
  shares adapters with custom `keywords` or `formats`. Set `MIMLET_GENERATOR_CACHE=off`
  to turn it off, or a number to change the limit. `configureGeneratorCache({ maxEntries })`
  and `clearGeneratorCache()` do the same at runtime.

### Patch Changes

- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
  - @mimlet/core@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- ae36328: Add the opt-in `realistic` generation profile for values that read like test data.
  It includes optional properties, gives nullable fields a value, keeps arrays at one to
  three items, draws numbers with no bounds or bounds wider than 1000 from 1 to 100 inside
  the declared bounds, rounds decimals to two places, writes plain strings as one to three
  readable words and prefers schema `examples`. Properties that lead back into a `$ref`
  cycle are not added, so recursive schemas stay finite. Every value is still checked
  against the original schema, and when the hints cannot be satisfied the remaining
  attempts sample as `minimal` does.

  The profile and the version of its rules are part of the replay identity. The default
  `minimal` profile and the other profiles produce the same values and identities as
  before. The Zod, Valibot and ArkType adapters accept the same `profile` option.

### Patch Changes

- ae36328: A schema property whose value is `undefined` is now left out, as `JSON.stringify` does,
  instead of failing preparation. Other values that are not JSON fail with their kind
  instead of `Expected acyclic JSON data`, for example
  `Expected JSON data, found a function at /default` or
  `Expected a plain JSON record, found an instance of Date at /default`. Generated and
  overridden values still reject `undefined` properties.
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

- Updated dependencies [62b95de]
- Updated dependencies [c1282f7]
  - @mimlet/core@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- @mimlet/core@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 21315c1: Only the `references` a schema reaches are prepared and compiled. A reference map that
  holds a whole OpenAPI component set no longer fails an unrelated schema because one
  component uses an unsupported keyword such as `discriminator`. When a reference the
  schema does use fails, `SchemaPreparationError` names it in the new `reference` field
  and in the message (`... at /discriminator in reference <uri>`), and `schemaPath` is
  relative to that reference. A `$ref` that resolves to nothing now fails with
  `Unresolved reference <uri> at <path to the $ref>` and the new `missingReference`
  field, instead of `Schema compilation failed at /`. The error code is unchanged and
  the replay fingerprint still covers every supplied reference.
- 3cd081a: Add `standardJsonSchemaFields(schema, { dialect })`, which lists the top-level
  `properties` of a Standard JSON Schema's input projection for `fluent()` from
  `@mimlet/core`: `fluent(fromStandardJsonSchema(schema), standardJsonSchemaFields(schema))`
  has a `withX()` setter per field, typed with the schema's input. Inputs without top-level
  `properties` throw a `TypeError`.

### Patch Changes

- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Generate every value of a string `enum` or `const`. A 16-character sampling hint for
  unbounded strings also applied to enums, so longer values were never generated and a
  single long value (a typical event type or discriminator) failed with
  `SCHEMA_GENERATION_FAILED`. An explicit `maxLength` still applies. Saved sessions for
  such schemas can now produce the previously missing values.
- eba145d: Generate `format: date-time` values as varied UTC instants within a year of the session
  reference time. Previously every value was the reference day at `01:01:01.0Z`, and the
  day came from the machine's local time zone, so the same seed produced different
  fixtures in different time zones. Schemas that use the built-in date-time generator get
  a new replay configuration, so sessions recorded with the old values fail explicitly
  instead of replaying different data; other schemas keep their identity.
- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4

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

## 0.1.0-alpha.2

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/json-schema.

Offline, validated, reproducible JSON Schema fixture generation with Standard Schema interoperability.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
