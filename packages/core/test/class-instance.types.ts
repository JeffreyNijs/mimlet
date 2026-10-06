// Types of map(), intoClass(), createInstanceBuilder() and Builder<T, Args, Output>.
import {
  createBuilder,
  createBuilderClass,
  createInstanceBuilder,
  createSchemaBuilder,
  createSession,
  fluent,
  intoClass,
  schemaFields,
  type AsyncBuilder,
  type Builder,
  type BuilderFacade,
  type GenerationSession,
  type InstanceBuilder,
  type InstanceInput,
  type StandardSchemaV1,
} from '../src/index.js';

declare function expectType<T>(value: T): void;
type Equal<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
declare function expectExact<A, B>(proof: Equal<A, B>): void;

enum Status {
  ACTIVE = 'active',
  BLOCKED = 'blocked',
}
class Role {
  uuid!: string;
}
class User {
  uuid!: string;
  createdAt!: Date;
  deletedAt!: Date | null;
  status!: Status;
  source!: 'import' | 'manual';
  firstName!: string | null;
  lastName!: string | null;
  roles?: Role[];
  get fullName(): string {
    return [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  isBlocked(): boolean {
    return this.status === Status.BLOCKED;
  }
}
type UserRecord = {
  uuid: string;
  createdAt: Date;
  deletedAt: Date | null;
  status: Status;
  source: 'import' | 'manual';
  firstName: string | null;
  lastName: string | null;
  roles?: Role[];
  fullName?: string;
};

// The record holds the data fields; the getter is optional and the method is gone.
expectExact<InstanceInput<User>, UserRecord>(true);
class Query {
  limit!: number;
  search?: never;
  readonly tag!: string;
}
// Fields typed never are dropped; a readonly data field stays settable but optional.
expectExact<InstanceInput<Query>, { limit: number; tag?: string }>(true);

const record = (): InstanceInput<User> => ({
  uuid: 'u-1',
  createdAt: new Date(0),
  deletedAt: null,
  status: Status.ACTIVE,
  source: 'import',
  firstName: 'John',
  lastName: 'Doe',
});
const users = createInstanceBuilder(User, record);
// The class comes first, so an inline factory's literals keep their type without `as const`.
createInstanceBuilder(User, () => ({
  uuid: 'u-1',
  createdAt: new Date(0),
  deletedAt: null,
  status: Status.ACTIVE,
  source: 'import',
  firstName: null,
  lastName: null,
}));
createInstanceBuilder(User, (suffix?: string) => ({
  uuid: `u-1${suffix ?? ''}`,
  createdAt: new Date(0),
  deletedAt: null,
  status: Status.ACTIVE,
  source: 'manual',
  firstName: null,
  lastName: null,
}));
expectExact<typeof users, Builder<UserRecord, [], User>>(true);
expectExact<typeof users, InstanceBuilder<typeof User>>(true);
expectType<User>(users.build());
expectExact<ReturnType<typeof users.buildList<2>>, [User, User]>(true);
users.build().isBlocked();
// Patches use the record type from the class, not the factory's literal types.
users.with({ deletedAt: new Date(), status: Status.BLOCKED, source: 'manual' }).build();
// @ts-expect-error Patches cannot target methods.
users.with({ isBlocked: () => true });
// @ts-expect-error Patches keep the field types.
users.with({ firstName: 1 });
// @ts-expect-error The factory is checked against the record.
createInstanceBuilder(User, () => ({ uuid: 'u-1' }));
// @ts-expect-error Literal fields are checked too.
createInstanceBuilder(User, () => ({ ...record(), source: 'other' }));

// Keys the class does not declare are errors without a return type annotation.
// @ts-expect-error A misspelled field in an inline factory.
createInstanceBuilder(User, () => ({
  uuid: 'u-1',
  createdAt: new Date(0),
  deletedAt: null,
  status: Status.ACTIVE,
  source: 'import',
  firstName: null,
  lastName: null,
  lastNmae: 'Doe',
}));
// @ts-expect-error The same after a spread of a typed record.
createInstanceBuilder(User, () => ({ ...record(), sourse: 'manual' }));
// @ts-expect-error The same in a block body.
createInstanceBuilder(User, () => {
  const base = record();
  return { ...base, deleted: true };
});
// @ts-expect-error The same in an async factory.
createInstanceBuilder(User, async () => ({ ...record(), firstname: 'Ada' }));
// @ts-expect-error The same in a factory that takes arguments.
createInstanceBuilder(User, (suffix?: string) => ({ ...record(), uuidSuffix: suffix }));
// @ts-expect-error The same in one branch of a conditional.
createInstanceBuilder(User, (blocked?: boolean) =>
  blocked
    ? { ...record(), status: Status.BLOCKED, blockedAt: new Date() }
    : { ...record(), status: Status.ACTIVE }
);
// @ts-expect-error Methods are not fields of the record.
createInstanceBuilder(User, () => ({ ...record(), isBlocked: () => true }));
const misspelled = () => ({ ...record(), statsu: Status.ACTIVE });
// @ts-expect-error A named factory is checked the same way.
createInstanceBuilder(User, misspelled);
class Account {
  uuid!: string;
  private secret = 'hidden';
  reveal(): string {
    return this.secret;
  }
}
// @ts-expect-error Private members are set by the constructor, not by the record.
createInstanceBuilder(Account, () => ({ uuid: 'a-1', secret: 'x' }));
// Getters, optional and readonly fields are fields the factory may set, without `as const`.
expectType<Query>(createInstanceBuilder(Query, () => ({ limit: 10, tag: 'recent' })).build());
expectType<User>(
  createInstanceBuilder(User, () => ({ ...record(), source: 'manual', roles: [], fullName: 'x' }))
    .with({ roles: [new Role()] })
    .build()
);
class Settings {
  [key: string]: unknown;
  theme!: 'light' | 'dark';
}
// A class with an index signature accepts any key.
expectType<Settings>(createInstanceBuilder(Settings, () => ({ theme: 'dark', extra: 1 })).build());
// A factory typed as returning any is not checked.
createInstanceBuilder(User, () => JSON.parse('{}'));
// Transforms after the mapping receive the instance and return one.
users.transform((user) => {
  expectType<User>(user);
  return user;
});
// @ts-expect-error A transform must return the instance type.
users.transform(() => ({ uuid: 'x' }));

class Money {
  constructor(
    readonly amount: number,
    readonly currency: string
  ) {}
}
// @ts-expect-error A constructor with required arguments needs construct: 'prototype'.
createInstanceBuilder(Money, () => ({ amount: 1, currency: 'EUR' }));
// @ts-expect-error The same with a configuration that lacks it.
createInstanceBuilder(Money, () => ({ amount: 1, currency: 'EUR' }), { maxListSize: 3 });
expectType<Money>(
  createInstanceBuilder(Money, () => ({ amount: 1, currency: 'EUR' }), {
    construct: 'prototype',
  }).build()
);
// @ts-expect-error intoClass() needs the same opt-in.
intoClass(Money);
intoClass(Money, { construct: 'prototype' });

// Factory arguments and default sessions, including a required session.
const identity = { fingerprint: 'class-instance-types', provider: 'test@1', seed: 1 };
const optional = createInstanceBuilder(
  User,
  (session: GenerationSession = createSession(identity), suffix?: string) => ({
    ...record(),
    uuid: `u-${session.sequence('user')}${suffix ?? ''}`,
  }),
  { defaultSession: () => createSession(identity) }
);
expectType<User>(optional.build());
expectType<User>(optional.build(createSession(identity), '!'));
const required = createInstanceBuilder(
  User,
  (session: GenerationSession) => ({ ...record(), uuid: `u-${session.sequence('user')}` }),
  { defaultSession: () => createSession(identity), name: 'users' }
);
expectExact<
  typeof required,
  Builder<UserRecord, [session?: GenerationSession], User, [session: GenerationSession]>
>(true);
expectType<User>(required.build());
required.transform((user, session) => {
  expectType<GenerationSession>(session);
  return user;
});
required.map((user, session) => {
  expectType<GenerationSession>(session);
  return user.uuid;
});
// The session parameter needs no annotation with a default session.
const unannotated = createInstanceBuilder(
  User,
  (session) => ({ ...record(), uuid: `u-${session.sequence('user')}`, source: 'manual' }),
  { defaultSession: () => createSession(identity) }
);
expectExact<
  typeof unannotated,
  Builder<UserRecord, [session?: GenerationSession], User, [session: GenerationSession]>
>(true);
createInstanceBuilder(
  User,
  // @ts-expect-error Unknown keys are reported with a default session too.
  (session) => ({ ...record(), uuid: `u-${session.sequence('user')}`, isAdmn: true }),
  { defaultSession: () => createSession(identity) }
);
// Setters and patches still work on the checked builder.
expectType<User>(
  fluent(unannotated, ['firstName', 'source']).withFirstName('Ada').withSource('import').build()
);

// Async factories build into the class through buildAsync(), and map() is typed there too.
const asyncUsers = createInstanceBuilder(User, async () => record());
expectExact<typeof asyncUsers, AsyncBuilder<UserRecord, [], User>>(true);
expectType<Promise<User>>(asyncUsers.buildAsync());
expectExact<ReturnType<typeof asyncUsers.buildListAsync<2>>, Promise<[User, User]>>(true);
// @ts-expect-error No synchronous build for an async factory.
asyncUsers.build();
const asyncNames = asyncUsers.map((user) => user.fullName);
expectExact<typeof asyncNames, AsyncBuilder<UserRecord, [], string>>(true);
expectType<Promise<string>>(asyncNames.with({ firstName: 'Ada' }).buildAsync());

// map() changes the output type; patches keep the input type; maps compose.
const labels = createBuilder(() => ({ first: 'Ada', last: 'Lovelace' })).map(
  (name) => `${name.first} ${name.last}`
);
expectExact<typeof labels, Builder<{ first: string; last: string }, [], string>>(true);
expectType<string>(labels.with({ first: 'Grace' }).build());
expectExact<ReturnType<typeof labels.buildList<3>>, [string, string, string]>(true);
labels.transform((label) => label.toUpperCase()).build();
// @ts-expect-error Transforms after map() see the mapped type.
labels.transform((label) => label.first);
expectType<number>(labels.map((label) => label.length).build());
const explicit = createBuilder((): InstanceInput<User> => ({ ...record(), source: 'import' })).map(
  intoClass(User)
);
expectExact<typeof explicit, Builder<UserRecord, [], User>>(true);
expectType<User>(explicit.build());

// fluent() setters patch the record and stay typed after map().
const named = fluent(users, ['firstName', 'status', 'roles']);
expectType<User>(named.withFirstName('Ada').withStatus(Status.BLOCKED).build());
named.withRoles([new Role()]).build().fullName.toUpperCase();
const [firstUser, secondUser] = named.buildList(2);
expectType<User>(firstUser);
expectType<User>(secondUser);
// @ts-expect-error Setters keep the record's field type.
named.withFirstName(1);
// @ts-expect-error Methods are not fields.
fluent(users, ['isBlocked']);
const mappedNamed = named.map((user) => user.fullName);
expectType<string>(mappedNamed.withFirstName('Ada').build());
expectType<number>(
  mappedNamed
    .withStatus(Status.ACTIVE)
    .map((name) => name.length)
    .build()
);
mappedNamed.transform((name) => name.trim());
// @ts-expect-error After map(), transforms see the mapped type.
mappedNamed.transform((name) => name.length);
const fields = fluent(users, schemaFields(['firstName', 'lastName']));
expectType<string>(
  fields
    .map((user) => user.fullName)
    .withLastName('Lovelace')
    .build()
);
const nested = fluent(named, { withSurname: 'lastName' });
expectType<string>(
  nested
    .map((user) => user.fullName)
    .withSurname('Hopper')
    .withFirstName('Grace')
    .build()
);
const asyncNamed = fluent(asyncUsers, ['firstName']);
expectType<Promise<string>>(
  asyncNamed
    .map((user) => user.fullName)
    .withFirstName('Ada')
    .buildAsync()
);
// @ts-expect-error After a facade's transformAsync(), map() is not typed: map first.
named.transformAsync(async (user) => user).map((user) => user);

// Generated classes map to the plain facade type.
const UserClass = createBuilderClass(record);
const generated = new UserClass().map((value) => value.uuid);
expectExact<typeof generated, BuilderFacade<UserRecord, [], string>>(true);
expectType<string>(generated.build());

// Schema builders have no typed map(): the validator expects the unmapped input.
const schema = {} as StandardSchemaV1<{ age: string }, { age: number }>;
// @ts-expect-error map() is not offered on schema builders.
createSchemaBuilder(schema, () => ({ age: '1' })).map((value) => value);
const ages = fluent(
  createSchemaBuilder(schema, () => ({ age: '1' })),
  ['age']
);
// @ts-expect-error Nor on their fluent() builders.
ages.map((value: unknown) => value);
