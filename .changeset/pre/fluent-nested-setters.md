---
'@mimlet/core': patch
---

`fluent()` keeps the setters of a builder that `fluent()` already wrapped, so
`fluent(fluent(builder, typeBoxFields(schema)), { withKey: 'id' })` has the setters of
both calls, in the types and at runtime. Before, the outer call silently dropped the inner
setters. They survive every builder operation and async transitions, and return the outer
builder. Repeating an inner setter for the same field is allowed and adds nothing. An
explicit tuple or alias map that reuses an inner setter's name for another field throws a
`TypeError`; a schema field list skips that name. Methods of generated and hand-written
class facades are kept too. An explicit name that matches one of them still replaces it,
as before, and a schema field list skips it.
