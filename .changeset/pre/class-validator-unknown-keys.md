---
'@mimlet/class-validator': patch
'@mimlet/core': patch
---

`fromClassValidator(Dto, factory)` and `fromClassValidatorAsync(Dto, factory)` now report a key
that is not a payload field as a compile error in a factory without a return type annotation:
`fromClassValidator(CreateRoleCommand, () => ({ name: 'Admin', nmae: 'x' }))` fails with
`Type 'string' is not assignable to type '"nmae is not a field of the class"'`. Before, the
key compiled, `build()` sent it, and only the pipe's `forbidNonWhitelisted` rejected it. The
check covers fields typed `never` (`"search is typed never in the class and cannot be set"`),
methods, nested DTOs and arrays of them, async factories, factories with arguments or a session,
and the builders of `withClassValidatorDefaults()`. Literal fields still need no `as const`. A
nested type without known keys (`object`, `Record<string, unknown>`) accepts any key.

The check comes from `@mimlet/core`, which now exports it as `KnownFieldsFactory` (the check
`createInstanceBuilder()` uses) and `KnownNestedFieldsFactory` (which also checks nested records
and arrays). `createInstanceBuilder()` now names a method
(`"isBlocked is a method of the class, not a field"`) and a field typed `never` in its
messages. A factory declared to return exactly the record type (or a promise of it) is not
checked, so generic helpers such as
`<T extends object>(dto: DtoClass<T>, make: () => DtoInput<T>) => fromClassValidator(dto, make)`
keep compiling: the check cannot decide keys that depend on a type parameter.
