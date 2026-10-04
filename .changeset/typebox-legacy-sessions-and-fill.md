---
'@mimlet/typebox-legacy': minor
---

Give `fromTypeBox()` and `fromTypeBoxVariant()` builders an optional generation
session, and fill what native creation cannot create, as in `@mimlet/typebox`.

- Builders now take `[session?: GenerationSession]`. A session-less build or list uses
  one seed-1 session from the new `typeBoxAdapter(schema).session()`, so `withFactory()`
  and transforms can give list items distinct values. Native creation itself ignores the
  session. The adapters gain `identity` and `session()` for replay, and `create()`
  accepts a session. Code that names the builder as `SchemaBuilder<Input, Output>` still
  compiles.
- Creation fills format and pattern strings, unique arrays, union members and number
  bounds on a creation-only copy of the schema, with the new `fill.formats` and
  `fill.patterns` options. Built-in format samples are used only for formats registered
  with `FormatRegistry`. Elysia's `t.Uint8Array()` now builds. Validation still uses the
  original schema, and a value that still cannot be created fails with a
  `BuilderGenerationError` that names its location. Pass `fill: false` for plain native
  creation.

**Changed output:** `Type.Date()` without `minimumTimestamp` is now created at the
session's reference time, `2000-01-01T00:00:00.000Z` by default, instead of the current
time, so rows with dates no longer differ between runs. This includes Elysia's
`t.Date()`. Use `fill.now` or an explicit session with another `referenceTime` to
choose the instant, or `fill: false` for the previous native behavior. Other schemas
that built before keep their values.
