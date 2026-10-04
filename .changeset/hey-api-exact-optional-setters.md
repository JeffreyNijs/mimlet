---
'hey-api-builders': patch
---

Type generated `withX()` helpers with exactly what `.with()` accepts for that
property, as core `fluent()` setters already are. Under `exactOptionalPropertyTypes`,
an optional property such as `notes?: string` no longer accepts `withNotes(undefined)`,
which built a present-but-undefined field that the model type forbids. Properties that
include `undefined` explicitly still accept it. Regenerate the client to pick up the
change; the generated file gains a local, unexported `BuilderSetterValue` type.
