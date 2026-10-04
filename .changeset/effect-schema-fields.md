---
'@mimlet/effect': minor
---

Add `effectFields(schema)`, which lists a struct's top-level encoded keys for `fluent()`
from `@mimlet/core`: `fluent(fromEffect(schema), effectFields(schema))` has a `withX()`
setter per field, also in a generic helper. Keys renamed with `Schema.encodeKeys` are
listed by their encoded name, because builders take encoded input. Non-struct schemas
throw a `TypeError`.
