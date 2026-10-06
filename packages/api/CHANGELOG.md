# Changelog

## 0.1.0-beta.5

### Minor Changes

- 276c37c: `openApiComponents(document).schema(name, direction)` now also checks data against the
  projected component: `check(value)` returns a boolean and `issues(value)` the JSON Schema
  issues, with the same validator as `openApi().schema(pointer)` and the operation fixtures. A
  response projection rejects write-only properties and a request projection rejects read-only
  ones. The validator is compiled on the first call.

### Patch Changes

- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
- Updated dependencies [eca2898]
  - @mimlet/core@0.1.0-beta.5
  - @mimlet/json-schema@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- ae36328: Add `openApiComponents(document, options?)`, which projects named component schemas
  as standalone JSON Schemas without reading the operations. `names()` lists the
  components and `schema(name, direction)` applies the same OpenAPI 3.0 and 3.1 rules as
  the operation fixtures, including `readOnly` and `writeOnly` for the `request` and
  `response` directions. Referenced components become definitions named after the
  component. `@mimlet/codegen` uses it to emit builders from an OpenAPI document.

  In OpenAPI 3.0, `nullable: true` beside `allOf`, `anyOf` or `oneOf` without a `type`
  now also accepts `null`. This is the form NestJS uses for a nullable reference,
  `{ nullable: true, allOf: [{ $ref }] }`. Fixtures for operations that use it can now be
  `null` there, and their replay identity changes, so a saved replay for such an
  operation is rejected instead of producing different values. Other documents keep
  their identities and values.

  The new `realistic` profile also includes optional parameters and an optional request
  body, as `boundary` does.

### Patch Changes

- ae36328: `openApi()` and `asyncApi()` accept a document that a framework builds in memory, such
  as the result of NestJS's `SwaggerModule.createDocument()`. A property whose value is
  `undefined` (for example `servers[0].description`) is now left out, as
  `JSON.stringify` would leave it out, instead of failing with
  `Expected acyclic JSON data`. Other values that are not JSON fail with an error that
  names their location and kind, such as
  `Expected JSON data, found a function at /info/x-handler` or
  `Expected a plain JSON object, found an instance of Date at /info/x-released`. A cycle
  is reported as `Expected acyclic JSON data, found a reference back to an enclosing value`
  at the place it closes. Fixture values passed to `check()`, `issues()` and `serialize()`
  still reject `undefined` properties.
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
- Updated dependencies [ae36328]
- Updated dependencies [ae36328]
- Updated dependencies [c1282f7]
  - @mimlet/core@0.1.0-beta.4
  - @mimlet/json-schema@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- @mimlet/core@0.1.0-beta.3
  - @mimlet/json-schema@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

## 0.1.0-beta.1

### Patch Changes

- c7bd391: Type serialized bytes as `Uint8Array<ArrayBuffer>`, so `SerializedRequest` and
  `SerializedResponse` bodies, `SerializedMessage` payloads and `encodeContent()` results
  can be passed to `new Request()`, `new Response()` and `new Blob()` with the DOM
  library. TypeScript 6 rejected the previous `Uint8Array<ArrayBufferLike>` as
  `BodyInit`. A custom codec may still return any `Uint8Array`; bytes backed by a
  `SharedArrayBuffer`, which Fetch rejects at runtime, are now copied. If you build one
  of these serialized objects yourself, its bytes must own an ordinary `ArrayBuffer`
  (copy them with `new Uint8Array(bytes)` when they may not).
- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Honour `readOnly` and `writeOnly` written beside `$ref` in OpenAPI 3.1, as other `$ref`
  siblings already were. Request fixtures and checks no longer require server-assigned
  fields declared as `{ $ref, readOnly: true }`, and response checks drop `writeOnly` ones.
  OpenAPI 3.0 still ignores `$ref` siblings, as its specification requires.
- Updated dependencies
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0
  - @mimlet/json-schema@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

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

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/api.

Offline OpenAPI operation fixtures with direction-aware schemas and explicit HTTP serialization.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
