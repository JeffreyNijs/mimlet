# Changelog

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

## 0.1.0-beta.1

### Minor Changes

- 3cd081a: Add `valibotFields(schema)`, which lists an object schema's top-level entries for
  `fluent()` from `@mimlet/core`: `fluent(fromValibot(schema), valibotFields(schema))` has
  a `withX()` setter per field, also in a generic helper. A `v.pipe()` that starts with an
  object keeps its entries. Non-object schemas throw a `TypeError`.

### Patch Changes

- 3b6b15a: Generate values that Valibot accepts for `v.isoDateTime()`, `v.isoTime()` and
  `v.base64()`, and support `v.isoDateTimeSecond()`. These actions now convert to
  Valibot's own regular expression as a JSON Schema `pattern`, as `v.isoTimeSecond()`
  already did. The pinned converter mapped `v.isoDateTime()` and `v.isoTime()` to the
  `date-time` and `time` formats, so every generated value carried seconds and a time
  zone and failed `buildValidated()`, and most generated `v.base64()` values were not
  base64.

  Builders for schemas that use these actions get a new generation fingerprint, so a
  session replay saved with 0.1.0-beta.0 fails with `INVALID_SESSION_REPLAY` instead of
  producing different values. Schemas without these actions keep their fingerprint and
  values. Like the converter's other regex actions, these actions cannot share a pipe
  with another regex action such as `v.regex()` or `v.startsWith()`; that schema now
  throws a conversion error instead of generating values Valibot rejects.

- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Add `valibotAdapter(schema, options).generation()`, the JSON Schema generator that
  session-less `fromValibot` builds use, with its `session()` and `identity`, as ArkType
  and Zod already expose. `buildList(n)` now provably equals
  `buildList(n, valibotAdapter(schema).generation().session())`, matching the sessions guide.
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

Initial prerelease source for @mimlet/valibot.

Native schema fixtures preserving input/output semantics and builder capabilities.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
