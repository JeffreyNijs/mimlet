---
'@mimlet/typebox': minor
---

Give `fromTypeBox()` and `fromTypeBoxVariant()` builders an optional generation
session, and fill what native creation cannot create.

- Builders now take `[session?: GenerationSession]`, like the Zod, Valibot, ArkType and
  JSON Schema builders. A session-less build or list uses one seed-1 session from the
  new `typeBoxAdapter(schema).session()`, so `withFactory()` and transforms can give list
  items distinct values with `session.sequence()` instead of a `.with({ id })` per item.
  Native creation itself ignores the session. The adapters gain `identity` and
  `session()` for replay, and `create()` accepts a session. Code that names the builder
  as `SchemaBuilder<Input, Output>` still compiles.
- `Value.Create` cannot create strings with a `format` or `pattern`, unique arrays, or a
  union whose first member creates a value the union rejects. Creation now fills these on
  a creation-only copy of the schema: built-in samples for common formats (dates come
  from the session's reference time), candidates from the new `fill.formats` and
  `fill.patterns` options, distinct literals for unique arrays, the first union member
  whose value passes the union, and numbers inside exclusive or one-sided bounds.
  Validation still uses the original schema. Schemas that built before keep their
  values; schemas that failed with `BuilderGenerationError` now build. A value that
  still cannot be created fails with a `BuilderGenerationError` that names its location.
  Pass `fill: false` for plain native creation.
