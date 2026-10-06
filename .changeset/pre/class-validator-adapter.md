---
'@mimlet/class-validator': minor
---

Add `@mimlet/class-validator`: builders for class-validator DTOs that validate the way
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
