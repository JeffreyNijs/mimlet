---
'@mimlet/valibot': minor
---

Add `valibotFields(schema)`, which lists an object schema's top-level entries for
`fluent()` from `@mimlet/core`: `fluent(fromValibot(schema), valibotFields(schema))` has
a `withX()` setter per field, also in a generic helper. A `v.pipe()` that starts with an
object keeps its entries. Non-object schemas throw a `TypeError`.
