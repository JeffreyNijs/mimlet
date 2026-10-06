# Proposal: class instances, output mapping and class-validator DTOs

Status: **proposal with a prototype, not released.** The branch
`design/class-instances-and-class-validator` contains the prototype described in
[Prototype](#7-prototype-on-this-branch). Nothing here is published, and the APIs may
change or be dropped after review.

## Background

A trial in a NestJS 11 + TypeORM 0.3 + class-validator 0.15 backend replaced 46
hand-written builder classes with Mimlet builders (Mimlet `0.1.0-beta.3`). The builders
worked, but four things needed workarounds:

1. **Class instances cannot be patched.** A factory that returns `new User()` fails on
   the first `.with()`: `Cannot merge between record and non-record values; use replace()`.
   All 15 entity builders therefore return a plain record and end with a hand-written
   transform, `asInstanceOf(Entity)` (41 lines), that copies the record into
   `new Entity()`.
2. **Transforms cannot change the type.** `BuilderTransform<T>` returns `T`, so the
   record type had to be the class type. A getter such as `User.fullName` then needs a
   placeholder value in the factory (`fullName: 'John Doe'`) that the transform skips.
3. **No class-validator adapter.** The trial wrote `classValidatorSchema(Dto)` (92 lines):
   a Standard Schema that copies NestJS's `ValidationPipe` (JSON body or query string,
   then `plainToInstance`, then `validateSync`), and a `DtoInput<T>` type that drops
   methods and fields typed `never`. 26 command and query builders use it through
   `createSchemaBuilder(classValidatorSchema(Dto), factory)`: unit tests call
   `buildValidated()` for the DTO instance, e2e tests send `build()`.
4. **Setters are top level only.** `fluent()` adds `withPagination({ limit, offset })` but
   not `withLimit()`, and `setPath()` only works inside a transform, which runs after
   every patch.

The trial is a private application, so this document uses neutral names (orders, imported
customers) in its examples. The measurements and the before/after rewrites were made on
the trial's real code, outside this repository.

## Summary

| Problem            | Proposal                                                                                                    | Prototype                             |
| ------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1. class instances | `createInstanceBuilder(Entity, factory)` and `.map(intoClass(Entity))`: patch a record, build an instance   | `@mimlet/core` (marked)               |
| 2. output type     | `builder.map(fn)`: a transform whose result type may differ; `Builder<Input, Args, Output>`                 | `@mimlet/core` (marked)               |
| 3. class-validator | `@mimlet/class-validator`: `classValidatorSchema`, `fromClassValidator`, `DtoInput`, `classValidatorFields` | `proposals/class-validator` (private) |
| 4. nested setters  | Path aliases in `fluent()` maps (`{ withLimit: ['pagination', 'limit'] }`) over a `withPath()` operation    | design only                           |

## 1. Building into classes

### API

```ts
import {
  createBuilder,
  createInstanceBuilder,
  fluent,
  intoClass,
  type InstanceInput,
} from '@mimlet/core';

// The factory returns a plain record. Its type comes from the class, so it needs no
// annotation and no placeholder for the `fullName` getter.
const userBuilder = fluent(
  createInstanceBuilder(User, () => ({
    uuid: generateUuid<UserUuid>(),
    email: `${randomUUID()}@mail.com`,
    firstName: 'John',
    lastName: 'Doe',
    deletedAt: null,
    // ...every column
  })),
  ['firstName', 'lastName', 'deletedAt']
);

const user = userBuilder.withFirstName('Ada').build(); // a User instance
user.fullName; // 'Ada Doe', computed by the class

// The same, spelled out: map the finished record with intoClass().
const explicit = createBuilder((): InstanceInput<User> => ({ ... })).map(intoClass(User));
```

`createInstanceBuilder(C, factory, config?)` is `createBuilder(factory, config)` followed
by `.map(intoClass(C))` as the first transform, with the factory's return type checked
against `InstanceInput<InstanceType<C>>`. The explicit form is useful when a transform
must see the record before the instance exists.

**Class first, not `{ into }`.** The prototype also implements the option form
`createBuilder(factory, { into: User })`. It works, but TypeScript reads the class after
the factory, so the factory's object literal is typed without the class as context and
string-literal fields widen: a `source: 'import' | 'manual'` column set to `'import'`
fails with `Type 'string' is not assignable to type '"import" | "manual"'` unless it is
written `'import' as const`. The trial has such a column. With the class first, as in
`createSchemaBuilder(schema, factory)` and `fromClassValidator(Dto, factory)`, the
factory is checked against the record as TypeScript reads it, and no `as const` is
needed. Both forms are in the prototype for comparison; the proposal is to ship only the
class-first one.

Other names considered: `.as(Entity)` reads like a type assertion, and `as` is a
TypeScript keyword in the same position; `asInstanceOf()` is the trial's name for a
transform; `createBuilderClass()` already exists and means a class facade. The names
are an [open question](#8-open-questions).

### The record type: `InstanceInput<T>`

`InstanceInput<User>` is the record a builder patches:

- public data fields of the class, with their types and optional modifiers;
- no methods (function-typed properties);
- no fields typed `never` or only `undefined`;
- readonly properties become optional. TypeScript types a getter without a setter
  (`get fullName()`) the same way as a `readonly` field, so the type cannot tell them
  apart. Optional lets a record set a readonly field and leave a getter to the class;
- private, protected and `#private` members are not part of it (`keyof` does not
  include them). Only the constructor can set them.

In the trial, `InstanceInput<User>` is `{ uuid; userId; createdAt; updatedAt; deletedAt;
status; email; firstName; lastName; userRoles?; fullName? }`. None of the trial's
entities has a `readonly` field, and `User.fullName` is the only getter.

### How the instance is created

`intoClass(C, { construct })` creates the instance, then copies the record onto it.

| `construct`       | What runs                                    | Use for                                                                                        |
| ----------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `'new'` (default) | `new C()` without arguments                  | TypeORM entities, class-transformer DTOs, classes with field initializers or `#private` fields |
| `'prototype'`     | `Object.create(C.prototype)`, no constructor | classes whose constructor requires arguments or has side effects, value objects                |

Trade-offs:

- **TypeORM.** TypeORM 0.3 creates entities with `new Entity()` unless the data source
  sets `entitySkipConstructor` (checked in `EntityMetadata.create()` of 0.3.31). `'new'`
  therefore builds what a repository returns. With `useDefineForClassFields` (the
  default for `target: ES2022` and later, which the trial uses), every declared field is
  an own property, `undefined` until the record sets it. `toStrictEqual` treats an own
  `undefined` property as different from a missing one, so `'new'` also matches loaded
  entities in that respect.
- **class-transformer** creates DTOs with `new Dto()` too.
- **Private fields and field initializers** only exist after the constructor ran.
  With `'prototype'`, a method or getter that reads `#secret` throws a `TypeError`, and
  initializers such as `isActive = true` are not applied.
- **Getters.** A record value for a getter without a setter throws
  `fullName is computed by User (a getter without a setter); leave it out of the record`.
  The trial's `asInstanceOf` skipped such values silently; throwing makes a stale
  placeholder or a `.with({ fullName })` visible. An accessor with a setter is assigned,
  so the setter runs.
- **Decorators.** TypeORM, class-validator, class-transformer and Swagger decorators
  store metadata on the class (or a global storage) when the class is defined. Building
  an instance does not touch it. The prototype tests check this with TypeORM-shaped
  decorators.
- **Constructors with arguments.** The types require `construct: 'prototype'` for a class
  whose constructor has required parameters, so `new Money()` is never called by
  accident. A class that needs its arguments to be valid should be created by
  `map((record) => new Money(record.amount, record.currency))` instead.

Copying is shallow. Own enumerable data properties of the record (string and symbol
keys) are defined on the instance; non-enumerable ones are skipped; a record with an
accessor property is rejected. Nested values, such as `userRoles`, are assigned as
they are: build related entities with their own class builders. Deep conversion is
what class-transformer does, and it is not needed when every builder returns its own
class.

### Patches, transforms and fluent setters

- `.with()`, `.withFactory()`, `.replace()`, `.replaceFactory()` and `.omit()` apply to the
  record, in order, before the instance exists. A partial patch onto a class instance
  stays an error, as today.
- `.omit('lastName')` removes the key from the record. With `'new'`, the instance still
  has `lastName` as an own `undefined` property, because the class declares it.
- Transforms run in the order they were added. `createInstanceBuilder()` adds the
  mapping first, so a later `.transform()` receives the instance and must return the
  same type. That is how the trial already uses `withLoadedRoles()` and
  `withPendingUserId()`: they mutate the freshly built instance with `Object.assign`. A
  transform that spreads the instance (`{ ...user }`) returns a plain object; TypeScript
  accepts it when the class has no methods. See [open questions](#8-open-questions) for a
  runtime guard.
- `fluent()` setters patch the record. `fluent()` now reads the record type from the
  builder's `replace()` parameter instead of the build result, so setter value types come
  from `InstanceInput<User>` and methods cannot get setters. The builds still return
  `User`.
- `buildList()`, default sessions, explicit sessions and scenarios work unchanged; each
  build creates a new instance.

### Named types

A class builder is an ordinary builder with a different output type:

```ts
type UserBuilder = Builder<InstanceInput<User>, [], User>; // createInstanceBuilder(User, factory)
```

`typeof userBuilder` keeps working for scenario variants (`readonly customer?: typeof
importedCustomerBuilder`). For helpers that need a written return type, the
proposal adds an alias, not in the prototype:

```ts
export type ClassBuilder<C extends AnyClass, Args extends unknown[] = []> = Builder<
  InstanceInput<InstanceType<C>>,
  Args,
  InstanceType<C>
>;
```

## 2. `map()`: transforms that change the output type

```ts
const labels = createBuilder(() => ({ first: 'Ada', last: 'Lovelace' })).map(
  (name) => `${name.first} ${name.last}`
); // Builder<{ first; last }, [], string>

labels.with({ first: 'Grace' }).build(); // 'Grace Lovelace'
labels.transform((label) => label.toUpperCase()); // transforms after map() see a string
```

- `Builder<T, Args>` gets a third parameter, `Builder<T, Args, Output = T>`. Patches use
  `T`; `build()`, `buildList()` and later transforms use `Output`. Existing types are
  unchanged because `Output` defaults to `T`.
- At runtime `map()` is a transform. It runs in order with the other transforms, after
  every patch, and `describe().operations` lists it as `'map'`.
- `map()` composes: `.map(intoClass(User)).map((user) => user.fullName)`.
- The prototype types `map()` on synchronous builders and their facades. An async
  builder accepts it at runtime but its type does not offer it yet.

### Composition with validation

A schema builder validates its input after the transforms. A `map()` before validation
would hand the validator a value that is not its input, so the prototype rejects
`map()` on schema builders (a type error, and a `TypeError` at runtime). Two options for
later:

- **A. Map the validated output.** `buildValidated()` returns `map(validate(input))` and
  `build()` keeps returning the input. Example: a Zod schema validates an entity record
  and `.mapValidated(intoClass(User))` returns the entity. A separate name avoids
  changing the meaning of transform order.
- **B. Keep it out.** Validators that produce instances (class-validator with
  `transform: true`) already return the class, and a record validator plus a class is
  rare in the trial (no entity builder validates).

The proposal is B for now and A when a user needs it.

## 3. `@mimlet/class-validator`

### API

```ts
import qs from 'qs';
import { fluent } from '@mimlet/core';
import {
  classValidatorFields,
  classValidatorSchema,
  fromClassValidator,
  type DtoInput,
} from '@mimlet/class-validator';
// Exported next to the application's global ValidationPipe, which uses the same object.
import { validationPipeOptions } from '../validation/validation-pipe-options.js';

// A JSON body: build() is the payload, buildValidated() the DTO instance.
export const createOrderCommandBuilder = fluent(
  fromClassValidator(CreateOrderCommand, () => ({}), validationPipeOptions),
  classValidatorFields(CreateOrderCommand)
);

// A query string, parsed by the same parser the API uses.
export const viewOrderIndexQueryBuilder = fluent(
  fromClassValidator(ViewOrderIndexQuery, () => ({}), { ...validationPipeOptions, wire: qs }),
  ['search', 'statuses', 'pagination']
);

// The schema on its own, for createSchemaBuilder() or other Standard Schema consumers.
const schema = classValidatorSchema(UpdateLocationCommand, validationPipeOptions);
```

- `classValidatorSchema(Dto, options)` returns `StandardSchemaV1<DtoInput<Dto>, Dto>`
  (with `transform: false`, the output is `DtoInput<Dto>`). It fits
  `createSchemaBuilder(schema, factory)` unchanged.
- `fromClassValidator(Dto, factory, options)` is that call in one step, like
  `fromZodFactory()`. The factory's return type is checked against `DtoInput<Dto>`, so it
  needs no annotation. `options.builder` passes `SchemaBuilderConfig` (for example a
  default session).
- `DtoInput<T>` is the payload type: data fields, recursively for nested DTOs and arrays,
  without methods and without fields typed `never` (also when optional, as in
  `sort?: never`, which the trial's version kept as `sort?: undefined`). `readonly` is
  removed and the field stays required: DTOs often declare `readonly name: string`.
- `classValidatorFields(Dto)` (experimental) lists the payload fields for `fluent()`:
  every property with a class-validator decorator, inherited ones included, plus the
  fields `new Dto()` defines. TypeScript cannot check the list against the class, so a
  field without a decorator that is not emitted as a class field would get a typed
  setter that does not exist at runtime. With `whitelist: true` such a field is rejected
  anyway.

### Options mirror `ValidationPipe`

The options are NestJS's `ValidationPipeOptions` without the HTTP error options, plus how
the payload travels. The recommendation is to export the global pipe's options from the
application and pass the same object to the pipe and to the builders.

| Option                                   | Behaviour                                                                                                                                                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| class-validator `ValidatorOptions`       | `whitelist`, `forbidNonWhitelisted`, `groups`, `always`, `strictGroups`, `skipMissingProperties`, `stopAtFirstError`, ... passed on. `forbidUnknownValues` defaults to `false`, as in the pipe.                                                              |
| `transform`                              | `true` returns the DTO instance. **Default `true`** here, while the pipe defaults to `false`, because unit tests want the instance. `false` returns the payload, or `instanceToPlain(entity)` when more validator options are set, exactly as the pipe does. |
| `transformOptions`                       | Passed to `plainToInstance` (for example `enableImplicitConversion`).                                                                                                                                                                                        |
| `wire`                                   | How the payload reaches the pipe: `JSON` (default, a JSON body), any object with `stringify` and `parse` such as the `qs` module, or `false` to validate the value as it is.                                                                                 |
| `async`                                  | `true` uses class-validator's async `validate()`, as the pipe does, so async constraints run; `buildValidated()` then throws and `buildValidatedAsync()` is required. Default `false` uses `validateSync()`, which skips async constraints.                  |
| `validatorPackage`, `transformerPackage` | The application's own copies, as in the pipe. See [package copies](#package-copies).                                                                                                                                                                         |

Per build, `usingValidation({ libraryOptions: { groups: ['admin'] } })` overrides the
validator options, so validation groups need no second builder.

Like the pipe, the bridge turns an absent payload into `{}` and drops `__proto__`,
`prototype` and `constructor` keys before class-transformer sees the payload. It does so
only on the copy the wire made; with `wire: false` the builder's value is not mutated.

**Query strings.** NestJS does not fix the query parser: Express 5 (NestJS 11) uses the
"simple" parser unless the app sets `query parser` to `extended`, and Fastify uses
`fast-querystring`; neither creates nested objects. The trial configures
`querystringParser: (str) => qs.parse(str)`, so its query DTOs use `wire: qs`. The bridge
does not depend on `qs`.

### Validation errors

class-validator returns a tree of `ValidationError`. Each failed constraint becomes one
Standard Schema issue whose path is the property path; children of an array get numeric
indexes. `BuilderValidationError` then names the paths, as it does for other validators:

```text
Schema validation failed: 2 issues at roles[1].roleUuid, roles[1].permissions
```

`formatValidationIssues(error, { messages: true })` adds class-validator's messages
(`roles[1].roleUuid: roleUuid must be a UUID`). An error with neither constraints nor
children still yields one issue, so a rejection is never reported as success.

### Parity with the pipe

The prototype's tests run NestJS 11.1.24's real `ValidationPipe` and the bridge on the
same payloads: 17 cases (enums with `@IsNullable`, whitelisting, trimming `@Transform`,
nested and array `@ValidateNested`, dates and `undefined` on the JSON wire, prototype
keys, absent payloads, pagination through `qs`, `@Equals(undefined)` fields, an async
constraint) under three pipe configurations (`whitelist`, `forbidNonWhitelisted` and
`transform` as the trial sets them, the defaults, and `whitelist` without `transform`).
All 51 agree on success or failure, on the returned value including its class, and on
the messages after the pipe's own path prefixing.

### Package copies

class-validator keeps its metadata in a global, but class-transformer keeps `@Type`
and `@Transform` metadata in a module-level storage. If the adapter loads another copy
of class-transformer than the DTOs, nested DTOs are not converted. A normal install
resolves the adapter's peer dependency to the application's copy. Bundlers that load
the CommonJS build for one import and the ESM build for another can still split them.
`transformerPackage` and `validatorPackage` exist for that case, as in the pipe.

### Peer ranges

| Library           | Newest | Proposed peer    | Notes                                                                                                                                                               |
| ----------------- | ------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| class-validator   | 0.15.1 | `>=0.15.1 <0.16` | The repository's rule allows one minor line for 0.x. 0.14 also works with this code (the API is the same) but would need its own tested group and a rule exception. |
| class-transformer | 0.5.1  | `>=0.5.1 <0.6`   | No release since 2022.                                                                                                                                              |

`@nestjs/common` is not a dependency: the bridge mirrors the pipe and needs only the two
libraries. NestJS 12 adds a `StandardSchemaValidationPipe` and a `schema` option on
`@Body()` and `@Query()`. Applications that move DTOs to Zod or Valibot can use
the existing adapters for those; class-validator DTOs and `ValidationPipe` remain
supported in NestJS 12, so this adapter is still useful there.

### Generating payloads from metadata

Could DTO builders skip the hand-written factory? The information exists:

- class-validator's `getMetadataStorage().getTargetValidationMetadatas(Dto, '', true, false)`
  lists every constraint per property (`isString`, `isEnum` with the enum, `min`,
  `arrayMinSize`, `each`, nested validation), including inherited ones;
- `design:type` metadata (with `emitDecoratorMetadata`) gives the base type, but loses
  array element types;
- class-transformer's `@Type()` metadata names nested classes, but its storage is not
  exported from the package root;
- `@nestjs/swagger` stores `swagger/apiModelProperties` per property: type, enum,
  `isArray`, `required`, `nullable`, `minimum`, `example`. The application turns it into
  an OpenAPI document, which `@mimlet/api` can already generate from.

Assessment on the trial's 36 DTO classes:

- 15 use custom decorators. 14 of them use `@IsNullable()` or `@IsUndefinable()`, which
  are `ValidateIf` wrappers: a generator can ignore the condition and satisfy the other
  constraints. 5 use opaque custom constraints (money amounts, addresses, date-only
  strings, boolean strings in queries) that no generator can satisfy without a
  per-decorator value provider.
- The 26 DTO builders total 443 lines, mostly imports and field lists; 7 have an empty
  factory. The hand-written part was the bridge, not the factories.
- Generated defaults are less readable than domain values (a real order title versus a
  random string), and every generated value still needs validation.

Recommendation: do not build metadata-based generation in the first version. If it is
wanted later, the lower-risk path is the OpenAPI document that `@nestjs/swagger`
already produces (the trial loads it in its contract test): generate with
`@mimlet/api` and validate with `classValidatorSchema`. A metadata generator would
depend on internal shapes of three 0.x libraries.

## 4. Nested setters for `fluent()`

Proposal: path aliases in the explicit method map, built on a new builder operation.

```ts
const query = fluent(viewOrderIndexQueryBuilder, {
  withLimit: ['pagination', 'limit'],
  withOffset: ['pagination', 'offset'],
});
query.withLimit(5).build();

// The operation underneath, also usable directly:
builder.withPath(['pagination', 'limit'], 5);
```

- **Tuples, not strings.** `'pagination.limit'` cannot express keys that contain dots,
  array indexes or symbols, and `setPath()` already uses typed tuples (`ValuePath`,
  `PathValue`, eight segments at most). Automatic names would be `withPaginationLimit`.
- **An operation, not a transform.** `withPath()` joins the patch list, so its order
  relative to `.with()` is the order of the calls. `setPath()` in a transform runs after
  all patches, which is the trial's complaint.
- **An absent parent is an error,** as in `setPath()`: the trial's query default is `{}`,
  so `withLimit(5)` on it would throw `BuilderPathError`. Creating `{ limit: 5 }` silently
  would produce an invalid `pagination` (no `offset`) and hide the choice. A builder that
  wants leaf setters should default the parent (`pagination: { limit: 10, offset: 0 }`).
- **Schema field lists stay top level.** `zodFields()` and `classValidatorFields()` do not
  add nested setters automatically; nested names multiply quickly and collide.

For the trial this means `withPagination({ limit: 5, offset: 10 })` stays the simplest
call for queries whose default omits pagination. Path aliases help builders whose
defaults contain nested records. The cost is mostly types: `fluent()`'s selection types
must accept tuples and type the setter value with `PathValue`.

Not prototyped on this branch.

## 5. Migration from the trial helpers

| Trial helper                                                           | Replacement                                                                                             |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `createBuilder((): Entity => ({...})).transform(asInstanceOf(Entity))` | `createInstanceBuilder(Entity, () => ({...}))`; remove getter placeholders                              |
| `src/test/builders/as-instance-of.ts`                                  | delete                                                                                                  |
| `classValidatorSchema(Dto)`                                            | `@mimlet/class-validator`, with the pipe options passed explicitly                                      |
| `classValidatorSchema(Dto, { wire: 'query' })`                         | `{ ...validationPipeOptions, wire: qs }`                                                                |
| `DtoInput<T>`                                                          | `import type { DtoInput } from '@mimlet/class-validator'`; usually not needed with `fromClassValidator` |
| `src/test/builders/class-validator-schema.ts`                          | delete                                                                                                  |

Behaviour differences to check while migrating:

- A record value for a getter without a setter now throws instead of being skipped.
- The adapter's validator defaults are the pipe's (`whitelist` off). The trial's helper
  hard-coded `whitelist` and `forbidNonWhitelisted`; pass them.
- Transforms such as `withLoadedRoles()` still receive the instance.
- Array paths in issues are numbers (`roles[1]`); they were strings, which the
  formatter already printed the same way.

### Before and after

Seven of the trial's builders (three entities, a command, a query, a scenario and the
two builders the scenario uses) were rewritten with the prototype in a scratch copy
outside this repository, compiled against the trial's real entity and DTO types, and run
against its built code (TypeORM 0.3.31, class-validator 0.15.1, class-transformer 0.5.1,
@nestjs/swagger 11.4.4). The trial repository was not changed. The trial's own builder
unit tests, ported to `node:test`, pass (8 of 8), and a type check confirms that wrong
setter values, setters for getters, invalid enum values and `never` fields are rejected.
The snippets show the changes; the domain-specific ones use neutral names.

**Entity with a getter** (`user.entity.builder.ts`):

```ts
// Before
export const userBuilder = fluent(
  createBuilder((): User => ({
    uuid: generateUuid<UserUuid>(),
    userId: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    status: UserStatus.ACTIVE,
    email: `${randomUUID()}@mail.com`,
    firstName: 'John',
    lastName: 'Doe',
    // Computed by the User getter from the names; the class type lists it.
    fullName: 'John Doe',
  })).transform(asInstanceOf(User)),
  { withUuid: 'uuid', withId: 'userId', /* ... */ withUserRoles: 'userRoles' }
);

// After
export const userBuilder = fluent(
  createInstanceBuilder(User, () => ({
    uuid: generateUuid<UserUuid>(),
    userId: randomUUID(),
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    status: UserStatus.ACTIVE,
    email: `${randomUUID()}@mail.com`,
    firstName: 'John',
    lastName: 'Doe',
  })),
  { withUuid: 'uuid', withId: 'userId', /* ... */ withUserRoles: 'userRoles' }
);
// withLoadedRoles() and withPendingUserId() are unchanged.
```

**Entity with a session sequence and a literal column** (an imported customer, whose
external id is unique): the class moves to the front and the transform goes away. The
factory body, including the string-literal `source` column, is unchanged.

```ts
// Before
createBuilder(
  (session: GenerationSession = testSession()): ImportedCustomer => {
    /* ..., source: 'import' */
  },
  { defaultSession: testSession }
).transform(asInstanceOf(ImportedCustomer));

// After
createInstanceBuilder(
  ImportedCustomer,
  (session: GenerationSession = testSession()) => {
    /* ..., source: 'import' */
  },
  { defaultSession: testSession }
);
```

**Command** (a JSON body with nullable enums):

```ts
// Before
export const updateLocationCommandBuilder = fluent(
  createSchemaBuilder(
    classValidatorSchema(UpdateLocationCommand),
    (): DtoInput<UpdateLocationCommand> => ({
      side: Side.FRONT,
      floor: Floor.GROUND,
      room: Room.KITCHEN,
    })
  ),
  ['side', 'floor', 'room']
);

// After
export const updateLocationCommandBuilder = fluent(
  fromClassValidator(
    UpdateLocationCommand,
    () => ({
      side: Side.FRONT,
      floor: Floor.GROUND,
      room: Room.KITCHEN,
    }),
    validationPipeOptions
  ),
  classValidatorFields(UpdateLocationCommand)
);
```

**Query** (a query string with pagination, parsed by `qs`):

```ts
// Before
export const viewOrderIndexQueryBuilder = fluent(
  createSchemaBuilder(
    classValidatorSchema(ViewOrderIndexQuery, { wire: 'query' }),
    (): DtoInput<ViewOrderIndexQuery> => ({})
  ),
  ['search', 'statuses', 'pagination']
);

// After
export const viewOrderIndexQueryBuilder = fluent(
  fromClassValidator(ViewOrderIndexQuery, () => ({}), { ...validationPipeOptions, wire: qs }),
  ['search', 'statuses', 'pagination']
);
```

**Scenario** (`user-with-role.scenario.ts`): unchanged. Class builders compose like any
other builder; the scenario's `user`, `role` and `userRole` are instances.

```ts
export const userWithRoleScenario = createScenario({ name: 'user-with-role' })
  .node('role', [], () => roleBuilder.build())
  .node('user', [], () => userBuilder.build())
  .node('userRole', ['user', 'role'], ({ user, role }) =>
    userRoleBuilder.withUserUuid(user.uuid).withRoleUuid(role.uuid).build()
  );
```

The role and user-role builders that the scenario uses change like the user builder.
Net effect for the trial: two helper files (133 lines) and their tests go away, 15 entity
builders lose `.transform(asInstanceOf(...))` and their getter placeholders, and 26 DTO
builders change their import and pass the pipe options. Builder count and test code stay
the same.

## 6. Compatibility and API changes

- `Builder` and `AsyncBuilder` get a third type parameter, `Output`, defaulting to `T`.
  Code that names `Builder<T, Args>` is unaffected.
- `BuilderFacade` and `AsyncBuilderFacade` get the same parameter. `FacadeFor<B>` infers
  it.
- `fluent()` reads its input type from `replace()`. For existing builders that is the
  same type as before.
- `map` is a new capability name. A `fluent()` alias or generated class method named
  `map` now collides with it (it already throws for the other capability names). Field
  setters are named `withX`, so generated field setters are unaffected.
- `describe().operations` can contain `'map'`. Tools that switch on operation names
  (inspector, playground) need the new value.
- `createInstanceBuilder()` is new. The prototype also adds a `createBuilder()` overload
  with `{ into, construct? }`, which the proposal would drop. `createBuilderClass()` and
  the code generators do not build into classes yet.
- No runtime behaviour of existing builders changes. The existing core suite (125 tests,
  coverage gates), the workspace build and type check, and the 112 unit tests pass on
  the branch.

## 7. Prototype on this branch

| Path                                                                    | Content                                                                                                   |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `packages/core/src/class-instance.ts`                                   | `InstanceInput`, `intoClass()`, `materialize()`                                                           |
| `packages/core/src/{types,runtime,index,facade,facade-class,fluent}.ts` | `map()`, the `Output` parameter, `createInstanceBuilder()`, `{ into }`; each change is marked `PROTOTYPE` |
| `packages/core/test/class-instance.{test.mjs,types.ts}`                 | runtime and type tests (coverage gates still pass)                                                        |
| `proposals/class-validator/`                                            | `@mimlet/class-validator`, `"private": true`, version `0.0.0-proposal.0`                                  |
| `proposals/class-validator/test/`                                       | NestJS-style fixture (TypeORM-shaped entities, class-validator DTOs), pipe parity, builders, types        |

The adapter lives in `proposals/`, not `packages/`, so the release tooling (which packs
every package under `packages/`) cannot pick it up. `pnpm-workspace.yaml` lists
`proposals/*` so it links `@mimlet/core` from the workspace.

```sh
pnpm install
pnpm test:core
pnpm --dir proposals/class-validator test
```

## 8. Open questions

1. **Names.** `createInstanceBuilder()` and `intoClass()`, or `fromClass()`, `asInstanceOf()`,
   `toClass()`? Drop the `{ into }` option form (proposal) or keep both?
   `InstanceInput` or `ClassInput` / `RecordOf`?
2. **Default construction.** `'new'` (matches TypeORM and class-transformer) or
   `'prototype'` (never runs constructor code)?
3. **Readonly properties.** Optional in `InstanceInput` (prototype), removed, or
   required? The type cannot tell a getter from a readonly field.
4. **Getter values in a record.** Throw (prototype) or skip silently (trial)?
5. **Guarding transforms after the mapping.** Should a transform that returns a non-instance
   (for example a spread copy) throw? It would catch a silent loss of the class, at the
   cost of a check that other builders do not have.
6. **`map()` on schema builders.** Option A (`mapValidated`) or B (not offered).
7. **Public shape.** Keep one `Builder<T, Args, Output>` or introduce a separate
   `MappedBuilder` type? The prototype extends `Builder`, which kept every existing type
   test passing.
8. **Typing `map()` on async builders and on fluent facades** so that setters survive it
   in the types, not only at runtime.
9. **Adapter defaults.** `transform: true` by default (prototype) or the pipe's `false`?
10. **`classValidatorFields()`.** Ship it as experimental, or require explicit field lists?
11. **Peer policy.** Support class-validator 0.14 and 0.15 (two 0.x minor lines) or 0.15
    only?
12. **Packaging.** `@mimlet/class-validator`, or a `@mimlet/nestjs` package that could
    later add OpenAPI-based generation from `@nestjs/swagger`?
13. **Nested setters.** Accept path aliases with "absent parent is an error"?

## 9. Remaining work

Rough estimates for one person familiar with the code base, after the open questions
are decided:

| Work                                                                                                                                                                                           | Estimate     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Core `map()` and `createInstanceBuilder()`: async and facade typing, `createBuilderClass`, docs, changelog, TypeScript version matrix, inspector and playground operation names                | 3 to 4 days  |
| `@mimlet/class-validator` as a published package: move to `packages/`, vendor matrix entries, packed-consumer compatibility fixture, README and guide, `mimlet doctor`, bundler dual-copy test | 3 to 5 days  |
| Nested path setters (`withPath()` operation and `fluent()` path aliases), if accepted                                                                                                          | 2 to 3 days  |
| Migrating the trial application (15 entity and 26 DTO builders, helper removal)                                                                                                                | 0.5 to 1 day |

About two to three weeks in total, not counting metadata-based generation, which this
proposal does not recommend for the first version.
