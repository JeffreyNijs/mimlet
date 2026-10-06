# NestJS DTOs with class-validator

`@mimlet/class-validator` builds test data for the commands and queries of an API that
validates requests with class-validator, such as a NestJS application with a global
`ValidationPipe`. It was first published as `0.1.0-beta.4`, after the rest of that train, and
follows the toolkit's version from then on. The examples use the `@mimlet/core` API of the
same train.

One builder serves both kinds of test:

- **e2e tests** send `build()`: the payload a client sends, before any validation.
- **unit tests** call `buildValidated()`: what the pipe hands to the controller, by default
  the DTO instance, with `@Transform()` and `@Type()` applied. Invalid data fails the test
  with a `BuilderValidationError` that names the rejected fields.

```sh
npm install --save-dev @mimlet/class-validator class-validator@0.15.1 class-transformer@0.5.1
```

The adapter supports class-validator 0.14.1 through 0.15 and class-transformer 0.5; see
[compatibility](compatibility.md#supported-and-tested-versions). class-transformer's
`@Type()` needs the `reflect-metadata` polyfill, which a NestJS application already loads.

## 1. Share the pipe's options

The builders validate the way the pipe validates only when both use the same options. Export
them next to the pipe:

```ts
// src/validation/validation-pipe-options.ts
import type { ValidationPipeOptions } from '@nestjs/common';

export const validationPipeOptions = {
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
} satisfies ValidationPipeOptions;

// src/main.ts
app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
```

The adapter accepts the whole `ValidationPipeOptions` object. Its HTTP options
(`exceptionFactory`, `errorHttpStatusCode`, `disableErrorMessages`) have no effect: a failed
build reports issues instead of an HTTP error. One difference matters when the object does
not set it: **`transform` defaults to `true` in the adapter and to `false` in
`ValidationPipe`.** Set `transform` explicitly when the pipe runs without it, and
`buildValidated()` then returns the plain payload, as the pipe does.

## 2. A command builder

```ts
// src/orders/create-order/create-order.command.ts
export class CreateOrderCommand {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsInt()
  @Min(1)
  productCount: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => DeliveryCommand)
  delivery?: DeliveryCommand;
}

// src/orders/create-order/tests/create-order.command.builder.ts
import { fluent } from '@mimlet/core';
import { fromClassValidator } from '@mimlet/class-validator';

export const createOrderCommandBuilder = fluent(
  fromClassValidator(
    CreateOrderCommand,
    () => ({ title: 'Windows', productCount: 2 }),
    validationPipeOptions
  ),
  ['title', 'productCount', 'delivery']
);
```

The factory's return type is `DtoInput<CreateOrderCommand>`: the DTO's data fields,
recursively for nested DTOs, without methods and without fields typed `never`. It comes
from the class, so the factory needs no annotation and a wrong value is a type error.

```ts
// A unit test of the use case
const command = createOrderCommandBuilder.withProductCount(3).buildValidated();
await useCase.execute(command); // a CreateOrderCommand instance, title trimmed

// An e2e test of the endpoint
await request(app.getHttpServer())
  .post('/orders')
  .send(createOrderCommandBuilder.withTitle('Doors').build())
  .expect(201);

// A 400 test: build() never validates
await request(app.getHttpServer())
  .post('/orders')
  .send(createOrderCommandBuilder.withProductCount(0).build())
  .expect(400);
```

`createOrderCommandBuilder.withProductCount(0).buildValidated()` throws
`Schema validation failed: 1 issue at productCount`. Nested DTOs and arrays have full paths,
such as `delivery.address.city` or `lines[2].quantity`.

## 3. A query builder

Query strings carry strings only, and nested parameters need a parser that understands
`pagination[limit]=5`. NestJS does not choose one for you: Express 5 uses the "simple"
parser unless the app sets `query parser` to `extended`, and Fastify parses flat keys
unless the app configures `querystringParser`. If the app parses queries with `qs`, pass
`qs` as the wire, so the pipe sees exactly what a request delivers:

```ts
import qs from 'qs';

export const viewOrdersQueryBuilder = fluent(
  fromClassValidator(ViewOrdersQuery, () => ({}), { ...validationPipeOptions, wire: qs }),
  ['search', 'statuses', 'pagination']
);

const query = viewOrdersQueryBuilder.withPagination({ limit: 5, offset: 10 });
query.buildValidated().pagination; // a PaginatedOffsetQuery with numbers, via @Type(() => Number)
await request(app.getHttpServer())
  .get(`/orders?${qs.stringify(query.build())}`)
  .expect(200);
```

Fields typed `never`, such as `sort?: never` with `@Equals(undefined)`, are not part of
`DtoInput`, so the builder cannot set them by accident; `.with({ sort })` is a type error.

## 4. Async constraints and groups

`fromClassValidator()` validates with `validateSync()`, which skips async constraints, so
`buildValidated()` stays synchronous. For a DTO with an async constraint, such as a
uniqueness check, use `fromClassValidatorAsync()`. It runs class-validator's `validate()`,
as the pipe does, and offers only the async build methods:

```ts
const invites = fromClassValidatorAsync(InviteUserCommand, () => ({ email: 'ada@example.com' }));
const command = await invites.buildValidatedAsync();
```

Validation groups follow the options (`groups`, `always`, `strictGroups`). Choose them per
build with `usingValidation()`:

```ts
const adminInvite = invites.usingValidation({ libraryOptions: { groups: ['admin'] } });
```

## 5. Setters for every field

Listing fields in `fluent()` is explicit and always matches the class. To skip the list,
`classValidatorFields(Dto)` collects the decorated properties, inherited ones included, and
the fields `new Dto()` defines:

```ts
const builder = fluent(
  fromClassValidator(CreateOrderCommand, factory, validationPipeOptions),
  classValidatorFields(CreateOrderCommand)
);
```

It is **experimental**: TypeScript cannot compare the list with the class, so a field that
has no decorator and is not emitted as a class field (with `useDefineForClassFields` off, as
for `target` below ES2022) gets a typed setter that does not exist at runtime.

## 6. Entities next to DTOs

A use case test usually needs both: a command the controller would receive, and the entities
already in the database. Commands come from this adapter; entities, which no validator
checks, come from `createInstanceBuilder()` in `@mimlet/core`, which patches the entity's
record and builds an instance (see [entities and class instances](class-instances.md)):

```ts
// src/orders/tests/order.entity.builder.ts
export const orderBuilder = fluent(
  createInstanceBuilder(Order, () => ({
    uuid: randomUUID(),
    title: 'Windows',
    productCount: 2,
    status: OrderStatus.DRAFT,
    deletedAt: null,
  })),
  ['title', 'productCount', 'status']
);

// src/orders/update-order/tests/update-order.use-case.unit.test.ts
const order = orderBuilder.withStatus(OrderStatus.SENT).build(); // an Order instance
const command = updateOrderCommandBuilder.withProductCount(3).buildValidated(); // a DTO
await useCase.execute(order.uuid, command);
```

The two record types differ on purpose. `DtoInput<Dto>` is a request payload: nested DTOs
become plain objects, and a `readonly` field stays required. `InstanceInput<Entity>` is the
entity's own fields: relations keep their class types (build them with their own builders),
and readonly properties are optional, so a computed getter needs no value.

## How closely it follows the pipe

The schema takes the pipe's steps in its order: the payload crosses the wire, an absent
payload becomes `{}`, `__proto__`, `prototype` and `constructor` keys are dropped,
class-transformer creates the DTO, class-validator checks it, and the result is the DTO
instance or, with `transform: false`, the payload (through `classToPlain()` when the pipe
would use it). The package's tests run NestJS 11 and NestJS 12's own `ValidationPipe` and
the schema on the same payloads under five configurations, for every tested class-validator
release, and require the same accepted values, the same returned value including its class,
and the same messages.

What it does not cover:

- Guards, interceptors, other pipes and the HTTP layer. `buildValidated()` replaces the
  validation step of a unit test, not an e2e test.
- Parameter decorators (`@Param()`, `@Query('id')` with a primitive type) and custom
  parameter decorators.
- Automatic payloads. class-validator metadata does not describe values precisely enough,
  so the factory provides them.

NestJS 12 also accepts Standard Schema validators directly (`StandardSchemaValidationPipe`
and the `schema` option on `@Body()`). DTOs that move to Zod or Valibot can use those
adapters instead; see [Zod and ArkType](zod-and-arktype.md).

See the [package contract](../packages/class-validator/README.md) for every option.
