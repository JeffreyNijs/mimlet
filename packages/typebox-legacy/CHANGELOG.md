# Changelog

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
- Updated dependencies [c1282f7]
  - @mimlet/core@0.1.0-beta.4

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
- a998d86: Add a `fill.nullable` option for unions with a `Null` member. The fill creates a union
  from the first member whose value passes it, so `Type.Union([x, Type.Null()])` and
  Elysia's `t.Nullable(x)`, which put `Null` last, are created as `x`'s value: `''`, `0`, a
  date or a whole object. Prismabox schemas put `Null` first and get `null`. With
  `fill: { nullable: 'null' }`, every union with a `Null` member is created as `null`, as if
  `Null` came first: in properties, array items, tuples, records with fixed keys,
  intersections, nested unions and referenced, cyclic or recursive schemas. A union's own
  `default` still wins, optional properties stay absent, and `fromTypeBoxVariant()` still
  builds the selected member. Validation uses the original schema.

  The default, `'value'`, keeps the current values and replay identities. `'null'` is part
  of the adapter's replay identity, so a session recorded with one setting does not replay
  with the other.

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 4783161: Give `fromTypeBox()` and `fromTypeBoxVariant()` builders an optional generation
  session, and fill what native creation cannot create, as in `@mimlet/typebox`.

  - Builders now take `[session?: GenerationSession]`. A session-less build or list uses
    one seed-1 session from the new `typeBoxAdapter(schema).session()`, so `withFactory()`
    and transforms can give list items distinct values. Native creation itself ignores the
    session. The adapters gain `identity` and `session()` for replay, and `create()`
    accepts a session. Code that names the builder as `SchemaBuilder<Input, Output>` still
    compiles.
  - Creation fills format and pattern strings, unique arrays, union members and number
    bounds on a creation-only copy of the schema, with the new `fill.formats` and
    `fill.patterns` options. Built-in format samples are used only for formats registered
    with `FormatRegistry`. Elysia's `t.Uint8Array()` now builds. Validation still uses the
    original schema, and a value that still cannot be created fails with a
    `BuilderGenerationError` that names its location. Pass `fill: false` for plain native
    creation.

  **Changed output:** `Type.Date()` without `minimumTimestamp` is now created at the
  session's reference time, `2000-01-01T00:00:00.000Z` by default, instead of the current
  time, so rows with dates no longer differ between runs. This includes Elysia's
  `t.Date()`. Use `fill.now` or an explicit session with another `referenceTime` to
  choose the instant, or `fill: false` for the previous native behavior. Other schemas
  that built before keep their values.

- 3cd081a: Add `typeBoxFields(schema)`, which lists an object schema's top-level properties for
  `fluent()` from `@mimlet/core`: `fluent(fromTypeBox(schema), typeBoxFields(schema))` has
  a `withX()` setter per field, typed with the encoded input. It reads only
  `schema.properties`, so a generic helper over `S extends TObject` gets setters for every
  schema it is called with. Schemas without properties, such as unions, throw a `TypeError`.

### Patch Changes

- 7a0a273: Type `fromTypeBox()` and `fromTypeBoxVariant()` as a synchronous `SchemaBuilder`, as
  the Zod, ArkType and JSON Schema entry points already are. Native creation is always
  synchronous, but the previous conditional type could not be resolved for a schema
  type parameter, so a generic helper such as
  `<S extends TObject>(schema: S) => fromTypeBox(schema).withFactory(...)` lost `build()`
  and `buildValidated()`, even at concrete call sites. A helper that typed a
  `fromTypeBoxFactory()` result as `ReturnType<typeof fromTypeBox<S>>` should leave its
  return type inferred instead.
- Updated dependencies [536ca1e]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- Updated dependencies
- Updated dependencies [eba145d]
  - @mimlet/core@0.1.0-beta.0

## 0.1.0-alpha.4

### Patch Changes

- @mimlet/core@0.1.0-alpha.4

## 0.1.0-alpha.3

### Patch Changes

- Updated dependencies [5bf6cd2]
  - @mimlet/core@0.1.0-alpha.3

## 0.1.0-alpha.2

### Patch Changes

- 332085a: Expand native peer ranges only across installed-tarball conformance targets. Record the actual Zod runtime version in provider metadata. Modern TypeBox stays pinned to 1.3.34 because earlier tested patches lose escaped validation paths.
- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/typebox-legacy.

Native @sinclair/typebox fixtures, strict validation and codecs for test-builders.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
