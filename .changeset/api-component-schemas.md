---
'@mimlet/api': minor
---

Add `openApiComponents(document, options?)`, which projects named component schemas
as standalone JSON Schemas without reading the operations. `names()` lists the
components and `schema(name, direction)` applies the same OpenAPI 3.0 and 3.1 rules as
the operation fixtures, including `readOnly` and `writeOnly` for the `request` and
`response` directions. Referenced components become definitions named after the
component. `@mimlet/codegen` uses it to emit builders from an OpenAPI document.

In OpenAPI 3.0, `nullable: true` beside `allOf`, `anyOf` or `oneOf` without a `type`
now also accepts `null`. This is the form NestJS uses for a nullable reference,
`{ nullable: true, allOf: [{ $ref }] }`. Fixtures for operations that use it can now be
`null` there, and their replay identity changes, so a saved replay for such an
operation is rejected instead of producing different values. Other documents keep
their identities and values.

The new `realistic` profile also includes optional parameters and an optional request
body, as `boundary` does.
