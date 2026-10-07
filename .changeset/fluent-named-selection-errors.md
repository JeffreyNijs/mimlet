---
'@mimlet/core': patch
---

A mistyped field or path in a `fluent()` selection now reports one compile error, and that
error names the mistake. For `fluent(builder, { withPaginationKey: ['pagination', 'kye'] })`
the first error used to be about schema field lists
(`Object literal may only specify known properties, and 'withPaginationKey' does not exist in type 'SchemaFields<string>'`),
followed by the useful one. Now the only error is
`Type 'string[]' is not assignable to type '"pagination.kye is not a path of plain records and arrays in the builder input"'`.

A field name that is not in the builder's input, in a tuple (`['serach']`) or as an alias
target (`{ withTerm: 'serach' }`), used to report
`Argument of type ... is not assignable to parameter of type 'never'`. It now reports
`"serach is not a field of the builder input"` on that entry. Two mistakes that already
threw a `TypeError` at runtime are compile errors too: an alias name that is a builder
method (`"withFactory is a builder method: choose another setter name"`) and a tuple field
whose setter would be one (`['factory']`).

Editors now complete field names in tuples and alias targets. The two-argument signatures of
`fluent()` are one signature now, so that TypeScript has a single candidate to report on; the
setters, their types and the result types (`FluentBuilder`, `FluentFieldsBuilder`) do not change.
