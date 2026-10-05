# Changelog

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
