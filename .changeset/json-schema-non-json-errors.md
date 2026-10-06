---
'@mimlet/json-schema': patch
---

A schema property whose value is `undefined` is now left out, as `JSON.stringify` does,
instead of failing preparation. Other values that are not JSON fail with their kind
instead of `Expected acyclic JSON data`, for example
`Expected JSON data, found a function at /default` or
`Expected a plain JSON record, found an instance of Date at /default`. Generated and
overridden values still reject `undefined` properties.
