# Changelog

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
