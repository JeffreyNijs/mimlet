---
'@mimlet/class-validator': minor
---

`classValidatorFields(Dto)` (experimental) and its type now agree on fields typed `never`. The
runtime cannot see TypeScript types, so a decorated field such as `sort?: never` with
`@Equals(undefined)` is in the list; its type, `ClassValidatorFieldNames<Dto>`, now includes such
fields too (`fluent()` still gives them no typed setter). The new `exclude` option leaves fields
out of both, and its names are checked against the class:
`classValidatorFields(ViewOrdersQuery, { exclude: ['sort'] })`. A field that holds a function on
`new Dto()` is no longer listed, as in `DtoInput`. When no field is found at all, as for an
undecorated DTO compiled with `useDefineForClassFields` off, the function throws instead of
returning an empty list that `fluent()` would reject anyway.
