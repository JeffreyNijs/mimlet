---
'@mimlet/typebox': patch
'@mimlet/typebox-legacy': patch
---

Type `fromTypeBox()` and `fromTypeBoxVariant()` as a synchronous `SchemaBuilder`, as
the Zod, ArkType and JSON Schema entry points already are. Native creation is always
synchronous, but the previous conditional type could not be resolved for a schema
type parameter, so a generic helper such as
`<S extends TObject>(schema: S) => fromTypeBox(schema).withFactory(...)` lost `build()`
and `buildValidated()`, even at concrete call sites. A helper that typed a
`fromTypeBoxFactory()` result as `ReturnType<typeof fromTypeBox<S>>` should leave its
return type inferred instead.
