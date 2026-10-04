---
'@mimlet/arktype': minor
---

Add `arkTypeFields(schema)`, which lists an object type's top-level input props for
`fluent()` from `@mimlet/core`: `fluent(fromArkType(schema), arkTypeFields(schema))` has
a `withX()` setter per field, also in a generic helper over `S extends Type<object>`. It
reads the native `schema.in.props`, so a morph lists the keys of its input. Unions and
non-object types throw a `TypeError`.
