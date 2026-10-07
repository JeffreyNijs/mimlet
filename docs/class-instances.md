# Entities and class instances

Mimlet builders patch plain records: a partial patch onto a class instance is rejected,
because a structural type cannot say which fields a class needs. To build instances of a
class, such as a TypeORM entity or a domain object with getters and methods, let the builder
patch the class's record and create the instance as the last step.

## createInstanceBuilder()

```ts
import { randomUUID } from 'node:crypto';
import { createInstanceBuilder, fluent } from '@mimlet/core';
import { User, UserStatus } from '../entities/user.entity.js';

export const userBuilder = fluent(
  createInstanceBuilder(User, () => ({
    uuid: randomUUID(),
    email: `${randomUUID()}@example.com`,
    status: UserStatus.ACTIVE,
    firstName: 'John',
    lastName: 'Doe',
    deletedAt: null,
  })),
  ['email', 'status', 'firstName', 'lastName', 'deletedAt']
);

const user = userBuilder.withFirstName('Ada').build();
user instanceof User; // true
user.fullName; // 'Ada Doe', computed by the class's getter
await dataSource.getRepository(User).insert(user);
```

The factory returns `InstanceInput<User>`: the public data fields of the class, without methods
and without fields typed `never`. Readonly properties are optional, because TypeScript types a
getter without a setter (`get fullName()`) the same way as a `readonly` field; the record may
set a readonly field and leaves a computed getter to the class. The class comes before the
factory, so the factory is checked against the record as TypeScript reads it: it needs no
annotation, and a literal column such as `source: 'import'` keeps its type without `as const`.

TypeScript itself does not report an extra key in an object literal that a function returns.
`createInstanceBuilder()` checks the keys separately, so a misspelled field is a compile error
in the factory without a return type annotation, in sync and async factories, factories with
arguments or a session, block bodies and spreads:

```ts
createInstanceBuilder(User, () => ({
  ...baseUser(),
  isSystemAdmn: true,
  // error: Type 'boolean' is not assignable to type '"isSystemAdmn is not a field of the class"'.
}));
```

A method gets its own message (`"isBlocked is a method of the class, not a field"`), and so
does a field typed `never` (`"search is typed never in the class and cannot be set"`). Private
fields are reported as keys that are not fields. A class with an index signature accepts any
key, and a factory typed as returning `any`, or declared to return exactly the record (such
as `make: () => InstanceInput<T>` in a generic helper), is not checked. When one branch of a
conditional returns a typed record and the other the same record plus a key, TypeScript merges
the two types and the extra key is not reported; give that factory a return type
(`(): InstanceInput<User> => ...`) if it matters. Adapters reuse the check through the exported
`KnownFieldsFactory` type; `@mimlet/class-validator` uses `KnownNestedFieldsFactory`, which
also checks nested records and arrays.

The check is compile-time only. At runtime, every own enumerable key of the record is copied,
and Mimlet does not compare the keys with the class. A new instance has no own property for a
field declared with `declare`, for an uninitialized field such as `uuid!: string` when the
class is compiled with `useDefineForClassFields: false`, or for any field with
`construct: 'prototype'`, so a runtime check could not tell a misspelled key from a declared
field.

`.with()`, `.omit()`, the patch factories and the `fluent()` setters change the record. Each
build creates a new instance, so a variant never shares an instance with another build.

## How the instance is created

| Option                       | What runs                                       | Use for                                                                                           |
| ---------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| default                      | `new User()` without arguments                  | TypeORM entities, class-transformer classes, classes with field initializers or `#private` fields |
| `{ construct: 'prototype' }` | `Object.create(User.prototype)`, no constructor | classes whose constructor requires arguments or has side effects                                  |

TypeORM creates entities with `new Entity()` too (unless the data source sets
`entitySkipConstructor`), so a built entity looks like one a repository returns: with
`useDefineForClassFields` (the default from `target: ES2022`), every declared field is an own
property, `undefined` until the record sets it. A class whose constructor takes arguments
must opt into `construct: 'prototype'`; TypeScript reports the missing option. Without the
constructor, field initializers do not run and `#private` fields do not exist.

The record's own enumerable fields are defined on the instance. A field with a setter on the
class is assigned, so the setter runs. A value for a getter without a setter throws
`fullName is computed by User (a getter without a setter); leave it out of the record`.
Copying is shallow: a relation such as `userRoles` is assigned as it is, so build related
entities with their own builders.

## Transforms and derived values

Transforms run in the order they were added, after every patch. The mapping to the class is the
first, so later transforms receive the instance and must return an instance of the class.
Change the instance in place, which is safe because every build creates a new one:

```ts
export function withLoadedRoles(...roles: Role[]) {
  return (user: User): User =>
    Object.assign(user, {
      userRoles: roles.map((role) =>
        userRoleBuilder.withUserUuid(user.uuid).withRoleUuid(role.uuid).withRole(role).build()
      ),
    });
}
const admin = userBuilder.transform(withLoadedRoles(adminRole)).build();
```

A transform that returns another value, for example a spread copy `{ ...user }` (a plain
object, even though TypeScript may accept it for a class without methods), throws
`A transform after intoClass(User) returned a value that is not a User instance`. Use
`map()` to change the type on purpose.

## map(): change what builds return

`map(mapper)` is a transform whose result may have another type. Patches keep their input
type; builds return the mapped value.

```ts
const emails = userBuilder.map((user) => user.email); // builds return strings
emails.withFirstName('Ada').build(); // a string; the setters stay
```

The builder type has a third parameter for this: `Builder<T, Args, Output>`, where `Output`
is `T` until a `map()`. `createInstanceBuilder(User, factory)` is
`Builder<InstanceInput<User>, Args, User>`, also available as `InstanceBuilder<typeof User, Args>`
for a helper's return type. `intoClass(User)` is the mapper `createInstanceBuilder()` uses, so
`createBuilder((): InstanceInput<User> => ({ ... })).map(intoClass(User))` is the same builder,
for the rare case where a transform must see the record before the instance exists. That
factory needs its return type annotation: `createBuilder()` does not know the class, so only
the annotation makes TypeScript report missing fields and misspelled keys there.

`map()` works on async builders and on `fluent()` builders, whose setters stay typed. Schema
builders have no `map()`: their validator expects the unmapped input, and a validator that
returns class instances (such as class-validator with `transform: true`) already makes
`buildValidated()` return them. After a facade's `transformAsync()`, call `map()` first.

## Sessions, names and lists

Instance builders take the same configuration as `createBuilder()`: a default session (the
factory may then declare its session parameter as required), a builder `name`, `maxListSize`
and `cloneInput`. Lists with a literal count are tuples, so
`const [first, second] = userBuilder.buildList(2)` types both as `User`. Scenarios compose
instance builders like any other builder.
