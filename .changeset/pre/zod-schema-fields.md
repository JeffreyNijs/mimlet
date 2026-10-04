---
'@mimlet/zod': minor
---

Add `zodFields(schema)`, which lists an object schema's top-level input keys for
`fluent()` from `@mimlet/core`: `fluent(fromZod(schema), zodFields(schema))` has a
`withX()` setter per field, also in a generic helper over `S extends z.ZodObject`. It
follows `.transform()` and other pipes to the object that receives the input and works
with the factory and async entry points. Non-object schemas throw a `TypeError`.
