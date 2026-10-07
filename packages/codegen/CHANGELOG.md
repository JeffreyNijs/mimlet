# Changelog

## 0.1.0-beta.8

### Patch Changes

- Updated dependencies [f9f37ba]
- Updated dependencies [f9f37ba]
  - @mimlet/core@0.1.0-beta.8
  - @mimlet/api@0.1.0-beta.8
  - @mimlet/json-schema@0.1.0-beta.8

## 0.1.0-beta.7

### Patch Changes

- Updated dependencies [d1d3fd6]
- Updated dependencies [d1d3fd6]
- Updated dependencies [d1d3fd6]
  - @mimlet/core@0.1.0-beta.7
  - @mimlet/api@0.1.0-beta.7
  - @mimlet/json-schema@0.1.0-beta.7

## 0.1.0-beta.6

### Patch Changes

- Updated dependencies [feada79]
- Updated dependencies [feada79]
- Updated dependencies [53d28b9]
  - @mimlet/core@0.1.0-beta.6
  - @mimlet/json-schema@0.1.0-beta.6
  - @mimlet/api@0.1.0-beta.6

## 0.1.0-beta.5

### Minor Changes

- e166346: Add `closedObjects: true` to an OpenAPI selection (and to JSON builder targets). It types each
  object schema that declares properties but not `additionalProperties` without the
  `[k: string]: unknown` index signature, so builders generated from a NestJS document, which
  never closes its objects, fit the application's own types, and a misspelled key in `.with()`
  is a type error. Only the types change: generation and `buildValidated()` keep the
  document's rules. Generated setters no longer cast their patch when the input type is a
  plain object without an index signature.

  An OpenAPI `schemas` entry of the wrong shape is now reported with its position and the entry
  it most likely means, for example `schemas[0] is {"name":"DealDto","direction":"request"}.
Did you mean {"schema":"DealDto","direction":"request"}?`. An unknown component written as a
  `#/components/schemas/...` reference or with other letter case names the component.

### Patch Changes

- Updated dependencies [276c37c]
- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
- Updated dependencies [eca2898]
  - @mimlet/api@0.1.0-beta.5
  - @mimlet/core@0.1.0-beta.5
  - @mimlet/json-schema@0.1.0-beta.5

## 0.1.0-beta.4

### Minor Changes

- ae36328: Generate builders from the component schemas of an OpenAPI 3.0, 3.1 or 3.2 document.
  In a `mimlet generate` configuration, add
  `"openapi": { "document": "./openapi.json", "schemas": "all" }` or list the components,
  optionally with a builder `name` and a `direction`. The path is relative to the
  configuration file. From code, use `emitOpenApiBuilders(document, selection)`, which
  also accepts the document a NestJS application builds in memory, or
  `openApiBuilderTargets()` with `emitJsonSchemaBuilders()`.

  The projection comes from `@mimlet/api`: OpenAPI 3.0 `nullable`, references between
  components, and `readOnly`/`writeOnly` for requests (`"direction": "request"`) and
  responses (the default). Builder classes are named after the component, such as
  `CreateDealCommandBuilder`, and the generated types name referenced components, such as
  `facade: FacadeDto | null`. `--check`, `--select` and file ownership work as before. An
  unreadable document, an unknown component or a schema that cannot be prepared exits
  with code 2 and a `CLI_USAGE_ERROR` that names the document and the component.

  Generated JSON Schema builders no longer get a `withX()` helper for a property whose
  schema is `false`, such as a read-only property of a request, because it cannot be set.

  `@mimlet/codegen` now depends on `@mimlet/api` for this projection.

### Patch Changes

- Updated dependencies [ae36328]
- Updated dependencies [ae36328]
- Updated dependencies [62b95de]
- Updated dependencies [ae36328]
- Updated dependencies [ae36328]
- Updated dependencies [c1282f7]
  - @mimlet/api@0.1.0-beta.4
  - @mimlet/core@0.1.0-beta.4
  - @mimlet/json-schema@0.1.0-beta.4

## 0.1.0-beta.3

### Patch Changes

- 6d167f1: `mimlet doctor` warns when a native library is newer than the versions an adapter was
  tested with. The new `PEER_VERSION_UNTESTED` warning covers a version inside the
  adapter's supported peer range but outside its tested range, read from the adapter's
  `mimlet.testedPeers` field. A warning keeps the report `ok` and the exit code 0; the
  hint says newer versions usually work, where to report a problem, and which range to
  pin for a tested setup. A version outside the supported range is still the error
  `PEER_VERSION_UNSUPPORTED`. Each `packages[].peers` entry now also lists `tested` when
  the package declares it.
- @mimlet/core@0.1.0-beta.3
  - @mimlet/json-schema@0.1.0-beta.3

## 0.1.0-beta.2

### Patch Changes

- Updated dependencies [f430f44]
  - @mimlet/core@0.1.0-beta.2
  - @mimlet/json-schema@0.1.0-beta.2

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
