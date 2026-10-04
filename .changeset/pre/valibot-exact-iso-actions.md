---
'@mimlet/valibot': patch
---

Generate values that Valibot accepts for `v.isoDateTime()`, `v.isoTime()` and
`v.base64()`, and support `v.isoDateTimeSecond()`. These actions now convert to
Valibot's own regular expression as a JSON Schema `pattern`, as `v.isoTimeSecond()`
already did. The pinned converter mapped `v.isoDateTime()` and `v.isoTime()` to the
`date-time` and `time` formats, so every generated value carried seconds and a time
zone and failed `buildValidated()`, and most generated `v.base64()` values were not
base64.

Builders for schemas that use these actions get a new generation fingerprint, so a
session replay saved with 0.1.0-beta.0 fails with `INVALID_SESSION_REPLAY` instead of
producing different values. Schemas without these actions keep their fingerprint and
values. Like the converter's other regex actions, these actions cannot share a pipe
with another regex action such as `v.regex()` or `v.startsWith()`; that schema now
throws a conversion error instead of generating values Valibot rejects.
