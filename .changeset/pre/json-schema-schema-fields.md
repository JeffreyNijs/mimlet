---
'@mimlet/json-schema': minor
---

Add `standardJsonSchemaFields(schema, { dialect })`, which lists the top-level
`properties` of a Standard JSON Schema's input projection for `fluent()` from
`@mimlet/core`: `fluent(fromStandardJsonSchema(schema), standardJsonSchemaFields(schema))`
has a `withX()` setter per field, typed with the schema's input. Inputs without top-level
`properties` throw a `TypeError`.
