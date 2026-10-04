---
'@mimlet/typebox': minor
'@mimlet/typebox-legacy': minor
---

Add `typeBoxFields(schema)`, which lists an object schema's top-level properties for
`fluent()` from `@mimlet/core`: `fluent(fromTypeBox(schema), typeBoxFields(schema))` has
a `withX()` setter per field, typed with the encoded input. It reads only
`schema.properties`, so a generic helper over `S extends TObject` gets setters for every
schema it is called with. Schemas without properties, such as unions, throw a `TypeError`.
