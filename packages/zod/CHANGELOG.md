# @mimlet/zod

## 0.1.0-beta.8

### Patch Changes

- Updated dependencies [f9f37ba]
- Updated dependencies [f9f37ba]
  - @mimlet/core@0.1.0-beta.8
  - @mimlet/json-schema@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- Updated dependencies [d1d3fd6]
- Updated dependencies [d1d3fd6]
- Updated dependencies [d1d3fd6]
  - @mimlet/core@0.1.0-beta.7
  - @mimlet/json-schema@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- 53d28b9: The error for a throwing Zod transform or refinement now shows the callback's name
  whatever it is. Before, only plain identifiers were shown, so a transform named
  `LeadIndex.toModel` (a name set with `Object.defineProperty()`, for example) was
  reported by location as `thrown by the Zod transform at (root)`. It now reads
  `thrown by the Zod transform LeadIndex.toModel`. Names that are not an identifier or a
  dotted path of identifiers are shown as a JSON string, such as
  `thrown by the Zod transform "to model"`. Control, line-break and invisible formatting
  characters are removed, names are cut to 100 characters, and a function without a
  usable name is still named by its location. When the list of callbacks is longer than
  the message keeps, it now ends in `...` and is never cut inside a character.
- Updated dependencies [feada79]
- Updated dependencies [feada79]
- Updated dependencies [53d28b9]
  - @mimlet/core@0.1.0-beta.6
  - @mimlet/json-schema@0.1.0-beta.6

## 0.1.0-beta.5

### Minor Changes

- eca2898: When a Zod `.transform()`, refinement or other callback throws during
  `buildValidated()`, the `BuilderValidationError` message now says which callback threw:
  `Schema validation failed: 1 issue at (root); thrown by the Zod transform fromDto`.
  The callback is named by its function name, or by its location when it is anonymous.

  A `ZodError` thrown by a stricter parse of the whole DTO inside an application
  transformer keeps its paths, as before, so the message names the field
  (`1 issue at source`). A parse of a single value, such as
  `z.literal('teamleader').parse(dto.source)`, has no path in Zod; the issue stays at the
  root with Zod's message, and the field is not guessed from the rejected value.

  When the schema has exactly one callback at a fixed location, such as
  `z.object({ createdAt: z.string().transform(parseDate) })`, an error thrown there now
  gets that location as its path (`createdAt`), and a `ZodError` from a transform on
  `deal` gets it as a prefix (`deal.source`). With several callbacks the one that threw is
  unknown, so nothing is prefixed and the message lists them. The original error is still
  the `cause`.

  `BuilderValidationError` accepts a second argument, `{ cause, detail }`. The detail is
  appended to the message after a semicolon and is cut at 200 characters.

  The builder `name` option no longer gives a Zod builder a generator of its own, so
  `fromZod(schema, { name })` builders of one schema share it. Values are unchanged.

### Patch Changes

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

- 819e5b8: `fromZod()` and `fromZodAsync()` no longer prepare generation when the builder is
  created. The first build converts the schema to JSON Schema and compiles its
  generator, and every builder of the same schema object with the same generation
  options reuses that work. A test-support module that creates a builder for each
  generated API schema at load time is now cheap. For 75 schemas generated by Hey API,
  creating the builders took about 0.75 s in a fresh Node process and now takes under
  1 ms; a 12-file Vitest suite that imports such a module went from about 4 s to about
  1 s. Generated values, default sessions and replay identities are unchanged.

  Because conversion waits for the first build, so do its errors: a schema with input
  that has no JSON form, or an option such as an unknown `profile`, now fails on the
  first build instead of in `fromZod()`. An unsupported `dialect` still fails in
  `fromZod()`.

- 819e5b8: An error thrown inside a Zod `.transform()`, `.refine()` or other callback now makes
  `buildValidated()` throw a `BuilderValidationError` with the original error as its
  `cause`, instead of the bare error. A thrown `ZodError`, for example from `.parse()`
  inside an application transformer, keeps its issues; any other error becomes one issue
  at the root. Issues added with `ctx.addIssue({ path })` keep their path, so reporting
  a rejected value that way names the field in the error message. Zod's own error for an
  async callback in a synchronous build is still thrown unchanged.
- 819e5b8: `fromZod(z.void())` builds `undefined` instead of throwing Zod's
  `Void cannot be represented in JSON Schema`. Hey API's `zod` plugin emits `z.void()`
  for empty responses such as `204 No Content`. `z.undefined()` and
  `z.literal(undefined)` build `undefined` too.

  Other Zod input that has no JSON form, such as `z.date()`, `z.bigint()`, `z.map()`,
  `z.set()`, `z.symbol()`, `z.function()` or `z.custom()`, now fails with a
  `SchemaPreparationError` (code `SCHEMA_PREPARATION_FAILED`) instead of a plain Zod
  `Error`. Its `schemaPath` points at the input in the converted schema, for example
  `/properties/createdAt`, its message suggests `fromZodFactory(schema, factory)`, and
  Zod's error is the `cause`.

### Patch Changes

- 819e5b8: `@mimlet/zod` now supports and tests Zod 4.3: the peer range is `zod >=4.3.0 <5`, and
  every release from 4.3.0 through 4.6.5 is tested. With Zod 4.3, async validation,
  `decode()` and `encode()` failed with `Cannot add property async, object is not
extensible`, because Zod 4.3 writes to the parse options object it receives. Each
  parse now gets its own copy of `parseOptions`.
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

### Minor Changes

- 1145c96: Export named builder types for generic helpers that need an explicit return type,
  for example under `@typescript-eslint/explicit-function-return-type`.
  `TypeBoxBuilder<S>`, `TypeBoxFactoryBuilder<S, F>` and `TypeBoxVariantBuilder<S, I>`
  (with an optional context type in `@mimlet/typebox`), `ZodBuilder<S>` and
  `ZodFactoryBuilder<S, F>`, and `EffectBuilder<A, I>` and `EffectFactoryBuilder<A, I, F>`
  are exactly what `fromTypeBox()`, `fromTypeBoxFactory()`, `fromTypeBoxVariant()`,
  `fromZod()`, `fromZodFactory()`, `fromEffect()` and `fromEffectFactory()` return,
  also for a schema type parameter. A factory builder still gets its sync or async
  methods where the helper is called. This replaces the advice to leave such return
  types inferred or to write `ReturnType<typeof fromTypeBoxFactory<...>>`.

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `zodFields(schema)`, which lists an object schema's top-level input keys for
  `fluent()` from `@mimlet/core`: `fluent(fromZod(schema), zodFields(schema))` has a
  `withX()` setter per field, also in a generic helper over `S extends z.ZodObject`. It
  follows `.transform()` and other pipes to the object that receives the input and works
  with the factory and async entry points. Non-object schemas throw a `TypeError`.

### Patch Changes

- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- 25de9f6: Type `zodAdapter().metadata.version` as `string`. It reports the loaded Zod release,
  but its type was narrowed to the compile-time `4.4.x`, which mistyped Zod 4.5 and 4.6
  consumers.
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

- 332085a: Expand native peer ranges only across installed-tarball conformance targets. Record the actual Zod runtime version in provider metadata. Modern TypeBox stays pinned to 1.3.34 because earlier tested patches lose escaped validation paths.
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
