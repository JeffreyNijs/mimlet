# Changelog

## 0.1.0-beta.5

### Minor Changes

- 659949f: Add `scenario.patch(name, patcher)` to change the value a scenario node built while keeping
  its factory and dependencies: `crm.patch('deal', (deal) => ({ ...deal, status: 'lost' }))`
  keeps the deal's lead key and generated values, and nodes that depend on the deal see the
  patched value. The patcher receives `(value, dependencies, session)` and returns a value of
  the node's type. Patches run in order after the node's factory, override or trait. A later
  override replaces the node and its patches, and a trait that would replace a patched node
  fails with `SCENARIO_CONFLICT` unless it passes `{ replaceConflicts: true }`. An async
  patcher makes the scenario async-only. `describe()` reports each node's `patches` count.
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

- 659949f: `createInstanceBuilder(Class, factory)` now reports a key the class does not declare, such as
  a misspelled field, as a compile error in a factory without a return type annotation:
  `createInstanceBuilder(User, () => ({ ...base, isSystemAdmn: true }))` fails with
  `Type 'boolean' is not assignable to type '"isSystemAdmn is not a field of the class"'`.
  TypeScript does not check extra keys of a returned object literal on its own, so these keys
  used to compile and were copied onto the instance. Literal fields still keep their types
  without `as const`, and the check covers async factories, factories with arguments or a
  session, and spreads. Methods and private fields are reported the same way. The check is
  compile-time only; at runtime every key of the record is still copied.

## 0.1.0-beta.4

### Minor Changes

- 62b95de: Build class instances, such as TypeORM entities, and change what builds return.
  `createInstanceBuilder(Class, factory, config)` patches the class's plain record
  (`InstanceInput<T>`: data fields, no methods, readonly properties optional) and creates a new
  instance on every build, with `new Class()` or, with `construct: 'prototype'`, without running
  the constructor. A record value for a getter without a setter throws, and a transform added
  after the mapping must return an instance of the class. `builder.map(mapper)` is a transform
  whose result may have another type: patches keep the input type, builds return the mapped
  value, and `fluent()` setters stay typed. `intoClass(Class)` is the mapper on its own.

  `Builder` and `AsyncBuilder` get an `Output` type parameter, `Builder<T, Args, Output = T,
Received = Args>`, and the facades follow; `Received` (new in this train) moves after it.
  Schema builders have no `map()`. `describe().operations` lists `'map'`. A `fluent()` alias or
  generated method named `map` now collides with the builder capability.

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

## 0.1.0-beta.3

No changes in this release.

## 0.1.0-beta.2

### Patch Changes

- f430f44: `fluent()` keeps the setters of a builder that `fluent()` already wrapped, so
  `fluent(fluent(builder, typeBoxFields(schema)), { withKey: 'id' })` has the setters of
  both calls, in the types and at runtime. Before, the outer call silently dropped the inner
  setters. They survive every builder operation and async transitions, and return the outer
  builder. Repeating an inner setter for the same field is allowed and adds nothing. An
  explicit tuple or alias map that reuses an inner setter's name for another field throws a
  `TypeError`; a schema field list skips that name. Methods of generated and hand-written
  class facades are kept too. An explicit name that matches one of them still replaces it,
  as before, and a schema field list skips it.

## 0.1.0-beta.1

### Minor Changes

- 536ca1e: `fluent()` also accepts a schema field list, such as `typeBoxFields(schema)` or
  `zodFields(schema)`, and adds a setter for every listed field. This works inside generic
  helpers such as `<S extends TObject>(schema: S) => fluent(fromTypeBox(schema), typeBoxFields(schema))`,
  with no field list to maintain and no casts at the call site. The setters follow the
  same typing rules as a field tuple, including `exactOptionalPropertyTypes`. A list
  cannot take aliases, so names that two fields share, names of builder methods (a field
  named `factory`) and fields longer than 64 characters get no setter, in the types and
  at runtime. Field tuples, alias maps and their checks are unchanged; plain arrays are
  still rejected. Adapter authors can create a list with the new `schemaFields(names)`.
- a69850d: `BuilderValidationError` now names the failing fields in its message, so test-runner
  output shows which values were rejected without catching the error:
  `Schema validation failed: 2 issues at owner.email, items[0].price`. The message lists
  the issue count and up to three distinct paths, shortens long keys and deep paths,
  and also appears when the error is the `cause` of a `BuilderGenerationError`. Native
  issue messages are still left out, because Valibot, ArkType and custom refinements
  can repeat the rejected value. A key of a data-keyed record or an unexpected property
  name can appear in a path.

  The new `formatValidationIssues(errorOrIssues, { messages, limit })` prints one line
  per issue for deliberate inspection, including native messages only when
  `messages: true` is passed.

## 0.1.0-beta.0

### Patch Changes

- Promote the coordinated train from alpha to beta for structured evaluation. The beta
  scope, known limits and feedback workflows are recorded in the beta readiness checklist.
- eba145d: Type `fluent()` setters with exactly what `.with()` accepts for that field. Under
  `exactOptionalPropertyTypes`, an optional key such as `body?: string` no longer accepts
  `withBody(undefined)`, which built a present-but-undefined field the type forbids.
  Properties that include `undefined` explicitly still accept it.

## 0.1.0-alpha.4

No changes in this release.

## 0.1.0-alpha.3

### Minor Changes

- 5bf6cd2: Draw session-less list items from one default session instead of repeating the
  first item. `buildList(n)` without a session now equals `buildList(n, adapter.session())`
  for JSON Schema, Zod, ArkType, Valibot, Avro, Protobuf, GraphQL and API contract
  builders. A single session-less build keeps its seed-1 value, and explicit sessions,
  snapshots and replay are unchanged. Factory builders can opt in through the new
  type-checked `defaultSession` option.

## 0.1.0-alpha.2

### Minor Changes

- 7fbd5f2: Add `fluent(builder, fields)` for opt-in, input-typed named setters across factory
  and native schema builders. Explicit field tuples and method aliases retain factory
  arguments, immutable branches, native validation and async capability transitions.
  Configuration never invokes factories to discover fields. Ambiguous names and
  capability collisions are rejected instead of overriding existing methods.

## 0.1.0-alpha.1

Version aligned with the coordinated Zod and ArkType adapter release; no core runtime changes.

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/core.

Schema-independent immutable test-data builders with Standard Schema validation.

Validation failures expose a stable `VALIDATION_FAILED` code and a generic message.
Native diagnostics remain available through the non-enumerable `error.issues` property.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
