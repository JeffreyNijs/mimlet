---
'@mimlet/core': patch
---

`createInstanceBuilder(Class, factory)` now reports a key the class does not declare, such as
a misspelled field, as a compile error in a factory without a return type annotation:
`createInstanceBuilder(User, () => ({ ...base, isSystemAdmn: true }))` fails with
`Type 'boolean' is not assignable to type '"isSystemAdmn is not a field of the class"'`.
TypeScript does not check extra keys of a returned object literal on its own, so these keys
used to compile and were copied onto the instance. Literal fields still keep their types
without `as const`, and the check covers async factories, factories with arguments or a
session, and spreads. Methods and private fields are reported the same way. The check is
compile-time only; at runtime every key of the record is still copied.
