---
'@mimlet/json-schema': minor
---

Only the `references` a schema reaches are prepared and compiled. A reference map that
holds a whole OpenAPI component set no longer fails an unrelated schema because one
component uses an unsupported keyword such as `discriminator`. When a reference the
schema does use fails, `SchemaPreparationError` names it in the new `reference` field
and in the message (`... at /discriminator in reference <uri>`), and `schemaPath` is
relative to that reference. A `$ref` that resolves to nothing now fails with
`Unresolved reference <uri> at <path to the $ref>` and the new `missingReference`
field, instead of `Schema compilation failed at /`. The error code is unchanged and
the replay fingerprint still covers every supplied reference.
