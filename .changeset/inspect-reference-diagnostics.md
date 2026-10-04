---
'@mimlet/codegen': patch
---

`mimlet inspect` only prepares the references the inspected schema reaches, so an
unrelated reference with an OpenAPI `discriminator` no longer fails it or blames
`/discriminator` of the root schema. `SCHEMA_PREPARATION_FAILED` diagnostics gain two
optional fields: `reference` names the supplied reference that `schemaPath` points
into, and `missingReference` names a `$ref` that was not supplied. A missing
reference is named in the message, with a hint to add it to the references map.
