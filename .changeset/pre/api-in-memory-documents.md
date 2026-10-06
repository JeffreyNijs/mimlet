---
'@mimlet/api': patch
---

`openApi()` and `asyncApi()` accept a document that a framework builds in memory, such
as the result of NestJS's `SwaggerModule.createDocument()`. A property whose value is
`undefined` (for example `servers[0].description`) is now left out, as
`JSON.stringify` would leave it out, instead of failing with
`Expected acyclic JSON data`. Other values that are not JSON fail with an error that
names their location and kind, such as
`Expected JSON data, found a function at /info/x-handler` or
`Expected a plain JSON object, found an instance of Date at /info/x-released`. A cycle
is reported as `Expected acyclic JSON data, found a reference back to an enclosing value`
at the place it closes. Fixture values passed to `check()`, `issues()` and `serialize()`
still reject `undefined` properties.
