# Changelog

## 0.1.0-beta.1

### Patch Changes

- c6613de: Type generated `withX()` helpers with exactly what `.with()` accepts for that property,
  as core `fluent()` setters already are. This covers builders from `mimlet generate`,
  `emitBuilders()` and `emitJsonSchemaBuilders()`. Under `exactOptionalPropertyTypes`, an
  optional property such as `couponCode?: string` no longer accepts
  `withCouponCode(undefined)`, which built a present-but-undefined field that the type
  forbids. Leave the property out or call `omit('couponCode')` instead. Properties that
  include `undefined` explicitly still accept it. A generated file with helpers gains a
  local, unexported `BuilderSetterValue` type.

  The generated code changes, so after upgrading, `mimlet generate --check` reports
  `GENERATED_FILES_OUTDATED` until you regenerate. Run your usual `mimlet generate`
  command once without `--check` and commit the result. It rewrites the generated files it
  owns that you have not edited, and still refuses to overwrite a hand-edited one.

- 864bacb: Export `reportStatus()` as a callable function. It was re-exported with `export type`,
  so TypeScript showed it but rejected calls to it and the JavaScript entry point did not
  export it. The diagnostic types are still exported. `reportStatus(diagnostics)` returns
  `false` when any diagnostic has severity `error`, the rule that sets a report's `ok`.
- 21315c1: `mimlet inspect` only prepares the references the inspected schema reaches, so an
  unrelated reference with an OpenAPI `discriminator` no longer fails it or blames
  `/discriminator` of the root schema. `SCHEMA_PREPARATION_FAILED` diagnostics gain two
  optional fields: `reference` names the supplied reference that `schemaPath` points
  into, and `missingReference` names a `$ref` that was not supplied. A missing
  reference is named in the message, with a hint to add it to the references map.
- Updated dependencies [536ca1e]
- Updated dependencies [21315c1]
- Updated dependencies [3cd081a]
- Updated dependencies [a69850d]
  - @mimlet/core@0.1.0-beta.1
  - @mimlet/json-schema@0.1.0-beta.1

## 0.1.0-beta.0

### Patch Changes

- eba145d: Report hand-edited generated files as drift in `mimlet generate --check`: exit 1 with
  `GENERATED_FILES_OUTDATED` naming the edited files, instead of exit 2 with
  `COMMAND_FAILED`. A normal `generate` still refuses to overwrite them. `writeGenerated()`
  results gain a `modified` list.
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

### Minor Changes

- b24be90: Add local dependency diagnostics, schema inspection without sampling, version output and opt-in versioned JSON reports. Preserve legacy generation syntax and non-mutating drift checks.

### Patch Changes

- Updated dependencies [7fbd5f2]
  - @mimlet/core@0.1.0-alpha.2
  - @mimlet/json-schema@0.1.0-alpha.2

## 0.1.0-alpha.1

### Patch Changes

- @mimlet/core@0.1.0-alpha.1
  - @mimlet/json-schema@0.1.0-alpha.1

## 0.1.0-alpha.0

Initial prerelease source for @mimlet/codegen.

Deterministic schema-independent builder classes, owned output and CLI.

The package README defines supported behavior, tested dependency versions, and
explicit limitations. This changelog does not assert that the version has been
published or that every schema can be generated automatically.
