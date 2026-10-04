---
'@mimlet/codegen': patch
---

Type generated `withX()` helpers with exactly what `.with()` accepts for that property,
as core `fluent()` setters already are. This covers builders from `mimlet generate`,
`emitBuilders()` and `emitJsonSchemaBuilders()`. Under `exactOptionalPropertyTypes`, an
optional property such as `couponCode?: string` no longer accepts
`withCouponCode(undefined)`, which built a present-but-undefined field that the type
forbids. Leave the property out or call `omit('couponCode')` instead. Properties that
include `undefined` explicitly still accept it. A generated file with helpers gains a
local, unexported `BuilderSetterValue` type.

The generated code changes, so after upgrading, `mimlet generate --check` reports
`GENERATED_FILES_OUTDATED` until you regenerate. Run your usual `mimlet generate`
command once without `--check` and commit the result. It rewrites the generated files it
owns that you have not edited, and still refuses to overwrite a hand-edited one.
