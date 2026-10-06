---
'@mimlet/zod': minor
---

`fromZod(z.void())` builds `undefined` instead of throwing Zod's
`Void cannot be represented in JSON Schema`. Hey API's `zod` plugin emits `z.void()`
for empty responses such as `204 No Content`. `z.undefined()` and
`z.literal(undefined)` build `undefined` too.

Other Zod input that has no JSON form, such as `z.date()`, `z.bigint()`, `z.map()`,
`z.set()`, `z.symbol()`, `z.function()` or `z.custom()`, now fails with a
`SchemaPreparationError` (code `SCHEMA_PREPARATION_FAILED`) instead of a plain Zod
`Error`. Its `schemaPath` points at the input in the converted schema, for example
`/properties/createdAt`, its message suggests `fromZodFactory(schema, factory)`, and
Zod's error is the `cause`.
