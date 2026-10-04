---
'@mimlet/core': minor
---

`fluent()` also accepts a schema field list, such as `typeBoxFields(schema)` or
`zodFields(schema)`, and adds a setter for every listed field. This works inside generic
helpers such as `<S extends TObject>(schema: S) => fluent(fromTypeBox(schema), typeBoxFields(schema))`,
with no field list to maintain and no casts at the call site. The setters follow the
same typing rules as a field tuple, including `exactOptionalPropertyTypes`. A list
cannot take aliases, so names that two fields share, names of builder methods (a field
named `factory`) and fields longer than 64 characters get no setter, in the types and
at runtime. Field tuples, alias maps and their checks are unchanged; plain arrays are
still rejected. Adapter authors can create a list with the new `schemaFields(names)`.
