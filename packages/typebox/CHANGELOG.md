# Changelog

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `typeBoxFields(schema)`, which lists an object schema's top-level properties for
  `fluent()` from `@mimlet/core`: `fluent(fromTypeBox(schema), typeBoxFields(schema))` has
  a `withX()` setter per field, typed with the encoded input. It reads only
  `schema.properties`, so a generic helper over `S extends TObject` gets setters for every
  schema it is called with. Schemas without properties, such as unions, throw a `TypeError`.
- 4783161: Give `fromTypeBox()` and `fromTypeBoxVariant()` builders an optional generation
  session, and fill what native creation cannot create.

  - Builders now take `[session?: GenerationSession]`, like the Zod, Valibot, ArkType and
    JSON Schema builders. A session-less build or list uses one seed-1 session from the
    new `typeBoxAdapter(schema).session()`, so `withFactory()` and transforms can give list
    items distinct values with `session.sequence()` instead of a `.with({ id })` per item.
    Native creation itself ignores the session. The adapters gain `identity` and
    `session()` for replay, and `create()` accepts a session. Code that names the builder
    as `SchemaBuilder<Input, Output>` still compiles.
  - `Value.Create` cannot create strings with a `format` or `pattern`, unique arrays, or a
    union whose first member creates a value the union rejects. Creation now fills these on
    a creation-only copy of the schema: built-in samples for common formats (dates come
    from the session's reference time), candidates from the new `fill.formats` and
    `fill.patterns` options, distinct literals for unique arrays, the first union member
    whose value passes the union, and numbers inside exclusive or one-sided bounds.
    Validation still uses the original schema. Schemas that built before keep their
    values; schemas that failed with `BuilderGenerationError` now build. A value that
    still cannot be created fails with a `BuilderGenerationError` that names its location.
    Pass `fill: false` for plain native creation.

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

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/typebox.

Native typebox fixtures, strict validation and codecs for test-builders.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
