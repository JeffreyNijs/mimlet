# Changelog

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
