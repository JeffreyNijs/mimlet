---
'@mimlet/api': minor
---

`openApiComponents(document).schema(name, direction)` now also checks data against the
projected component: `check(value)` returns a boolean and `issues(value)` the JSON Schema
issues, with the same validator as `openApi().schema(pointer)` and the operation fixtures. A
response projection rejects write-only properties and a request projection rejects read-only
ones. The validator is compiled on the first call.
