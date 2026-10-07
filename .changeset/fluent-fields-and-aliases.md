---
'@mimlet/core': minor
---

`fluent()` takes an alias map as a third argument, after a field list. Adding one path alias
no longer means writing every other setter as an alias, or nesting `fluent()` calls:

```ts
const listOrders = fluent(builder, ['filter', 'pagination'], {
  withPaginationKey: ['pagination', 'key'],
});
listOrders.withFilter({ status: 'open' }).withPaginationKey('b');
```

The field list is a literal tuple or a schema field list such as `zodFields(schema)` or
`classValidatorFields(Dto)`. The call has the setters of
`fluent(fluent(builder, fields), aliases)`, in the types and at runtime: the alias map may
repeat a tuple name for the same field or give a field another name, and reusing a tuple name
for another field or path is a compile error
(`"withFilter already sets filter in the field list: choose another setter name"`) that also
throws a `TypeError`. A schema field list skips the names the alias map uses, as it skips
builder methods. The result type is `FluentBuilder<FluentBuilder<B, S>, A>` for a tuple and
`FluentBuilder<FluentFieldsBuilder<B, K>, A>` for a schema field list. Mistyped fields and paths
in the alias map get the same named errors as a map passed alone.
