---
'@mimlet/codegen': minor
---

Generate builders from the component schemas of an OpenAPI 3.0, 3.1 or 3.2 document.
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
