---
'@mimlet/core': minor
---

`fluent()` alias maps accept a path in place of a field name, for a setter of a nested field:

```ts
const viewOrders = fluent(builder, {
  withLimit: ['pagination', 'limit'],
  withOffset: ['pagination', 'offset'],
});
viewOrders.withLimit(5).build(); // pagination.limit is 5, pagination.offset is kept
```

Each key must exist in the builder's input type, and the setter takes the type at the path,
with the same rules as `.with()` for optional keys under `exactOptionalPropertyTypes`. A wrong
key is a compile error that names the path
(`"pagination.limti is not a path of plain records and arrays in the builder input"`). A path
has 1 to 8 keys: field names, array indexes or symbols. The setter runs in call order with
`.with()`, `.withFactory()` and the other patches, and copies each record and array on the
path, so the factory's value never changes.

The parent must exist when the setter runs. With a query default of `{}`, `withLimit(5)` fails
the build with a `BuilderPathError` (`INVALID_BUILDER_PATH`):
`withLimit() cannot set pagination.limit: pagination is missing; set pagination first (with .with() or its own setter) or give it a default in the factory`.
Path setters work with async builders, schema builders, class facades,
`createInstanceBuilder()` (they patch the record) and the `@mimlet/class-validator` builders,
and nested `fluent()` calls keep them like other setters. Schema field lists stay top level.
`describe()` lists a path setter's step as `'mergePath'`. `BuilderPathError` takes an optional
message.
