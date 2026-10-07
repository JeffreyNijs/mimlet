# @mimlet/class-validator

## 0.1.0-beta.6

### Minor Changes

- feada79: Add `withClassValidatorDefaults(options)`, which binds options once and returns
  `fromClassValidator`, `fromClassValidatorAsync` and `classValidatorSchema` with them applied:
  `const query = withClassValidatorDefaults({ ...validationPipeOptions, wire: qs })`, then
  `query.fromClassValidator(ViewOrdersQuery, () => ({}))`. A call's own options override the
  defaults key by key. The builders have the same types as the unbound functions return, and
  `transform: false` in the defaults types `buildValidated()` as the payload. `async`, `name` and
  `defaultSession` stay per call and throw as defaults.

  The builder option `name` now reaches the builder (`describe().name`). Before, it was passed to
  class-validator as a validator option, which also made `transform: false` return
  `classToPlain()` output instead of the payload.

- feada79: `classValidatorFields(Dto)` (experimental) and its type now agree on fields typed `never`. The
  runtime cannot see TypeScript types, so a decorated field such as `sort?: never` with
  `@Equals(undefined)` is in the list; its type, `ClassValidatorFieldNames<Dto>`, now includes such
  fields too (`fluent()` still gives them no typed setter). The new `exclude` option leaves fields
  out of both, and its names are checked against the class:
  `classValidatorFields(ViewOrdersQuery, { exclude: ['sort'] })`. A field that holds a function on
  `new Dto()` is no longer listed, as in `DtoInput`. When no field is found at all, as for an
  undecorated DTO compiled with `useDefineForClassFields` off, the function throws instead of
  returning an empty list that `fluent()` would reject anyway.

### Patch Changes

- feada79: `fromClassValidator(Dto, factory)` and `fromClassValidatorAsync(Dto, factory)` now report a key
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

- Updated dependencies [feada79]
- Updated dependencies [feada79]
  - @mimlet/core@0.1.0-beta.6

## 0.1.0-beta.5

### Minor Changes

- f282b74: Add `@mimlet/class-validator`: builders for class-validator DTOs that validate the way
  NestJS's `ValidationPipe` validates a request. `build()` returns the payload a client sends;
  `buildValidated()` returns what the pipe hands to the controller, by default the DTO
  instance. `fromClassValidator(Dto, factory, options)` takes the pipe's options unchanged,
  plus `wire` (`JSON` by default, the `qs` module for query strings, or `false`);
  `fromClassValidatorAsync()` runs async constraints; `classValidatorSchema(Dto, options)` is
  the Standard Schema on its own; `DtoInput<T>` types the payload; and
  `classValidatorFields(Dto)` (experimental) lists the fields for `fluent()`. Unlike the pipe,
  `transform` defaults to `true`. Supports class-validator `>=0.14.1 <0.16` (every release
  from 0.14.1 through 0.15.1 tested, including parity with NestJS 11 and 12's
  `ValidationPipe`) and class-transformer `>=0.5.1 <0.6`.

### Patch Changes

- Updated dependencies [659949f]
- Updated dependencies [659949f]
- Updated dependencies [eca2898]
  - @mimlet/core@0.1.0-beta.5
