---
'@mimlet/zod': patch
---

`@mimlet/zod` now supports and tests Zod 4.3: the peer range is `zod >=4.3.0 <5`, and
every release from 4.3.0 through 4.6.5 is tested. With Zod 4.3, async validation,
`decode()` and `encode()` failed with `Cannot add property async, object is not
extensible`, because Zod 4.3 writes to the parse options object it receives. Each
parse now gets its own copy of `parseOptions`.
