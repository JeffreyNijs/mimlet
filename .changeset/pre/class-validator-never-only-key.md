---
'@mimlet/class-validator': patch
'@mimlet/core': patch
---

A factory that returns only a field typed `never` (or only unknown keys) now gets the named
error message when every field of the payload is optional, as in most query DTOs.
`fromClassValidator(ViewLeadIndexQuery, () => ({ sort: 'x' }))` for a DTO with `sort?: never`
used to fail with a message that named no key:
`Type '{ sort: string; }' is not assignable to type 'NoInfer<{ search?: ...; pagination?: ... }> | PromiseLike<...>'`.
It now fails with
`Type 'string' is not assignable to type '"sort is typed never in the class and cannot be set"'`,
and `() => ({ nmae: 'x' })` with `"nmae is not a field of the class"`. This applies to
`fromClassValidator()`, `fromClassValidatorAsync()`, the builders of
`withClassValidatorDefaults()` and `createInstanceBuilder()`. A DTO or class with a required
field still reports the missing field.

The factory's type parameter now accepts such a factory so that the check can name the key;
`ClassValidatorBuilder<T, F>` and `AsyncClassValidatorBuilder<T, F>` accept the same factory
types. `DtoFactory<T>`, for annotating a factory, is unchanged. `@mimlet/core` exports the
constraint as `KnownFieldsConstraint<Shape>` for adapters that use `KnownFieldsFactory`.
