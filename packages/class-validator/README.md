# class-validator DTOs

Builders for the commands and queries of an API that validates requests with
[class-validator](https://github.com/typestack/class-validator) and
[class-transformer](https://github.com/typestack/class-transformer), as NestJS's
`ValidationPipe` does. `build()` returns the payload a client sends, for e2e tests;
`buildValidated()` returns what the pipe hands to the controller, for unit tests. A payload
the API would reject fails with a `BuilderValidationError` that names the rejected fields.

The peer ranges accept class-validator `>=0.14.1 <0.16` and class-transformer
`>=0.5.1 <0.6`. Every class-validator release from 0.14.1 through 0.15.1 and
class-transformer 0.5.1 are tested, including a parity suite against NestJS's own
`ValidationPipe`. A newer release inside the range installs, and `mimlet doctor` reports
it as `PEER_VERSION_UNTESTED`. class-validator 0.14.0 is outside the range: its declarations
need a global `ValidatorJS` namespace that current `@types/validator` releases no longer
declare.

Install from npm's `latest` tag, which includes betas. Pin exact versions when you need to
reproduce fixtures; see [Getting started](https://jeffreynijs.github.io/mimlet/guide/getting-started.html).

```sh
npm install --save-dev @mimlet/class-validator class-validator@0.15.1 class-transformer@0.5.1
```

class-transformer's `@Type()` reads decorator metadata through the `reflect-metadata`
polyfill, which a NestJS application already imports. Import it in the test setup when
tests load DTOs without the application.

```ts
import { fluent } from '@mimlet/core';
import { fromClassValidator } from '@mimlet/class-validator';
import { validationPipeOptions } from '../validation-pipe-options.js';
import { CreateOrderCommand } from './create-order.command.js';

export const createOrderCommandBuilder = fluent(
  fromClassValidator(
    CreateOrderCommand,
    () => ({ title: 'Windows', productCount: 2 }),
    validationPipeOptions
  ),
  ['title', 'productCount']
);

const payload = createOrderCommandBuilder.withTitle('Doors').build(); // send it in an e2e test
const command = createOrderCommandBuilder.buildValidated(); // a CreateOrderCommand instance
```

The factory returns `DtoInput<CreateOrderCommand>`, the payload type: the DTO's data fields,
recursively for nested DTOs, without methods and without fields typed `never`. The type comes
from the class, so the factory needs no annotation. A key that is not a payload field (a
misspelled field, a field typed `never` or a method, also in nested DTOs and arrays) is a
compile error, although TypeScript on its own does not report extra keys of a returned object:
`() => ({ title: 'Windows', titel: 'Doors' })` fails with
`Type 'string' is not assignable to type '"titel is not a field of the class"'`. The message
names the key also when it is the only key and every payload field is optional, as in a query
DTO: `() => ({ sort: 'name' })` fails with
`Type 'string' is not assignable to type '"sort is typed never in the class and cannot be set"'`.
A nested type without known keys (`object`, `Record<string, unknown>`) accepts any key.

## Entry points

| Export                                                            | Contract                                                                                                                                                        |
| ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fromClassValidator(Dto, factory, options)`                       | A schema builder. Validation is synchronous (`validateSync()`), so async constraints are skipped. Factory arguments and async factories are kept.               |
| `fromClassValidatorAsync(Dto, factory, options)`                  | The same with class-validator's async `validate()`, as the pipe runs it, so async constraints apply. Only the async build methods exist.                        |
| `classValidatorSchema(Dto, options)`                              | The Standard Schema on its own: input `DtoInput<Dto>`, output `Dto` (or the payload with `transform: false`). Use it with `createSchemaBuilder()` or elsewhere. |
| `withClassValidatorDefaults(options)`                             | The three functions above with `options` applied first. See [binding options once](#binding-options-once).                                                      |
| `classValidatorFields(Dto, { exclude })`                          | **Experimental.** The DTO's fields, for `fluent(builder, classValidatorFields(Dto))`. See [its limits](#setters-for-every-field).                               |
| `DtoInput<T>`, `DtoClass<T>`                                      | The payload type of a DTO and the class type the functions accept.                                                                                              |
| `ClassValidatorBuilder<T, F>`, `AsyncClassValidatorBuilder<T, F>` | The builder types, to name as a generic helper's return type.                                                                                                   |

## Options mirror the pipe

Pass the options of the application's global `ValidationPipe`. Exporting them next to the
pipe keeps the pipe and the tests in step:

```ts
// validation-pipe-options.ts
export const validationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} satisfies ValidationPipeOptions;

// main.ts
app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
```

| Option                                                                                                        | Behaviour                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class-validator `ValidatorOptions`                                                                            | `whitelist`, `forbidNonWhitelisted`, `groups`, `strictGroups`, `skipMissingProperties`, `stopAtFirstError` and the rest go to class-validator. `forbidUnknownValues` defaults to `false`, as in the pipe. |
| `transform`                                                                                                   | `true` returns the DTO instance, `false` the payload, as in the pipe. **The default is `true` here, while `ValidationPipe` defaults to `false`**: a unit test wants the instance.                         |
| `transformOptions`                                                                                            | Passed to `plainToInstance`, for example `{ enableImplicitConversion: true }`.                                                                                                                            |
| `wire`                                                                                                        | How the payload reaches the pipe. `JSON` (the default) sends it as a JSON body; pass the `qs` module for a query string; `false` validates the built value as it is.                                      |
| `validatorPackage`, `transformerPackage`                                                                      | The application's own copies of the two libraries, as in the pipe. See [package copies](#package-copies).                                                                                                 |
| `exceptionFactory`, `errorHttpStatusCode`, `disableErrorMessages`, `validateCustomDecorators`, `expectedType` | Accepted so the pipe's options object can be passed unchanged; they have no effect. A failed build reports issues, not an HTTP error.                                                                     |

`fromClassValidator()` and `fromClassValidatorAsync()` also take the core builder options
(`cloneInput`, `maxListSize`, `name`, `validationOptions`, `defaultSession`) in the same
object.

## Binding options once

`withClassValidatorDefaults(options)` returns `fromClassValidator`, `fromClassValidatorAsync`
and `classValidatorSchema` with `options` applied first, so the pipe's options and the query
wire are written once:

```ts
export const body = withClassValidatorDefaults(validationPipeOptions);
export const query = withClassValidatorDefaults({ ...validationPipeOptions, wire: qs });

const viewOrders = query.fromClassValidator(ViewOrdersQuery, () => ({}));
const plain = query.fromClassValidator(ViewOrdersQuery, () => ({}), { transform: false });
```

A call's own options override the defaults key by key; an option object such as
`transformOptions` replaces the default one. The builders have the same types as the unbound
functions return, and `transform: false` in the defaults types `buildValidated()` as the
payload. `defaults` holds the bound options, frozen. `async`, `name` and `defaultSession`
belong to one builder and throw as defaults. The returned functions do not use `this`.

Like the pipe, the schema turns an absent payload into `{}`, drops `__proto__`, `prototype`
and `constructor` keys before class-transformer sees the payload, and validates a primitive
payload against an empty instance of the DTO. It drops the keys only from the copy the wire
made; with `wire: false` the built value is never changed.

Choose validation groups per build with
`builder.usingValidation({ libraryOptions: { groups: ['admin'] } })`; the library options
are class-validator options and override the configured ones.

## Query strings

NestJS does not fix the query parser: Express 5 parses `?a[b]=1` as a flat key unless the
app sets `query parser` to `extended`, and Fastify's default parser does the same. If the
app parses queries with `qs`, pass `wire: qs`: numbers and booleans then reach the pipe as
strings, as in a real request, and the DTO's `@Type(() => Number)` converts them back.

```ts
import qs from 'qs';

export const viewOrdersQueryBuilder = fluent(
  fromClassValidator(ViewOrdersQuery, () => ({}), { ...validationPipeOptions, wire: qs }),
  ['search', 'statuses', 'pagination']
);
// or, with the options bound once: query.fromClassValidator(ViewOrdersQuery, () => ({}))

const query = viewOrdersQueryBuilder.withPagination({ limit: 5, offset: 10 });
await request(app.getHttpServer()).get(`/orders?${qs.stringify(query.build())}`);
```

The package does not depend on `qs`; any object with `stringify()` and `parse()` is a wire.

For one nested parameter, add a path alias:
`fluent(viewOrdersQueryBuilder, { withLimit: ['pagination', 'limit'] })`. `withLimit(5)` sets
`pagination.limit` and keeps `offset`. The parent must exist when the setter runs, so with
the `{}` default above, set `pagination` first (`withPagination({ limit: 10, offset: 0 })`) or
default it in the factory; otherwise the build fails with a message that says so. See
[setters for nested fields](https://jeffreynijs.github.io/mimlet/guide/fluent-builders.html#setters-for-nested-fields).

## Validation errors

Each failed constraint is one issue whose path points into the payload, with array indexes
as numbers. `BuilderValidationError` names the paths, and `formatValidationIssues()` from
`@mimlet/core` adds class-validator's messages when you ask for them:

```text
Schema validation failed: 2 issues at roles[1].roleUuid, roles[1].permissions
roles[1].roleUuid: roleUuid must be a UUID
```

## Setters for every field

`classValidatorFields(Dto, { exclude })` is **experimental**. It lists every property that
has a class-validator decorator, inherited ones included, plus the data fields `new Dto()`
defines (not functions), without the names in `exclude`.

The runtime cannot see TypeScript types, so a field typed `never` with a decorator, such as
`sort?: never` with `@Equals(undefined)`, is in the list. The list's type,
`ClassValidatorFieldNames<Dto>`, includes such fields for that reason, and `fluent()` gives
them no typed setter. Name them in `exclude`, which is checked against the class, to leave
them out of both: `classValidatorFields(ViewOrdersQuery, { exclude: ['sort'] })`.

TypeScript cannot compare the list with the class in the other direction either: a DTO field
that has no decorator and is not emitted as a class field (a `declare` field, or any field
when `useDefineForClassFields` is off, as with `target` below ES2022) gets a typed setter that
does not exist at runtime. With `whitelist: true` the API rejects such a field anyway. When
nothing is found at all, as for an undecorated DTO compiled that way, the function throws
instead of returning an empty list. Listing the fields, as in
`fluent(builder, ['title', 'productCount'])`, has none of these gaps.

## Package copies

class-validator keeps its metadata in a global, but class-transformer keeps `@Type()` and
`@Transform()` metadata per copy of the module. A normal install resolves this package's
peer dependencies to the application's copies. A bundler that loads the CommonJS build for
the DTOs and the ESM build for this package can split them; nested DTOs are then not
converted. Pass `transformerPackage` (and `validatorPackage`) to use the application's
imports:

```ts
import * as classTransformer from 'class-transformer';
fromClassValidator(Dto, factory, { transformerPackage: classTransformer });
```

## Limits

- No automatic generation. class-validator metadata does not describe values precisely
  enough (custom constraints, `ValidateIf` conditions), so the factory provides the payload.
- The sync builder skips async constraints, as class-validator's `validateSync()` does. Use
  `fromClassValidatorAsync()` for DTOs with async constraints.
- `buildValidated()` does not replace an e2e test: guards, interceptors and the HTTP layer
  are not involved.
- NestJS 12 also validates with any Standard Schema through `StandardSchemaValidationPipe`.
  DTOs that move to Zod or Valibot can use those adapters instead.

See the [class-validator guide](https://jeffreynijs.github.io/mimlet/guide/class-validator.html)
for a complete NestJS walkthrough.
