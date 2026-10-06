// PROTOTYPE (docs/proposals/class-instances.md): types of map(), intoClass() and { into }.
import {
  createBuilder,
  createInstanceBuilder,
  createSchemaBuilder,
  createSession,
  fluent,
  intoClass,
  type Builder,
  type GenerationSession,
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

// The record holds the data fields; the getter is optional and the method is gone.
expectExact<
  InstanceInput<User>,
  {
    uuid: string;
    createdAt: Date;
    deletedAt: Date | null;
    status: Status;
    firstName: string | null;
    lastName: string | null;
    roles?: Role[];
    fullName?: string;
  }
>(true);
class Query {
  limit!: number;
  search?: never;
  readonly tag!: string;
}
// Fields typed never are dropped; a readonly data field stays settable but optional.
expectExact<InstanceInput<Query>, { limit: number; tag?: string }>(true);

const users = createBuilder(
  () => ({
    uuid: 'u-1',
    createdAt: new Date(0),
    deletedAt: null,
    status: Status.ACTIVE,
    firstName: 'John',
    lastName: 'Doe',
  }),
  { into: User }
);
expectExact<typeof users, Builder<InstanceInput<User>, [], User>>(true);
expectType<User>(users.build());
expectType<User[]>(users.buildList(2));
users.build().isBlocked();
// Patches use the record type from the class, not the factory's literal types.
users.with({ deletedAt: new Date(), status: Status.BLOCKED }).build();
// @ts-expect-error Patches cannot target methods.
users.with({ isBlocked: () => true });
// @ts-expect-error Patches keep the field types.
users.with({ firstName: 1 });
// Transforms after { into } receive the instance.
users.transform((user) => {
  expectType<User>(user);
  return user;
});
// @ts-expect-error A transform must return the instance type.
users.transform(() => ({ uuid: 'x' }));

// @ts-expect-error The factory must return every required field of the record.
createBuilder(() => ({ uuid: 'u-1' }), { into: User });

class Money {
  constructor(
    readonly amount: number,
    readonly currency: string
  ) {}
}
// @ts-expect-error A constructor with required arguments needs construct: 'prototype'.
createBuilder(() => ({ amount: 1, currency: 'EUR' }), { into: Money });
const money = createBuilder(() => ({ amount: 1, currency: 'EUR' }), {
  into: Money,
  construct: 'prototype',
});
expectType<Money>(money.build());
// @ts-expect-error intoClass() needs the same opt-in.
intoClass(Money);
intoClass(Money, { construct: 'prototype' });

// Arguments and default sessions survive.
const identity = { fingerprint: 'class-instance-types', provider: 'test@1', seed: 1 };
const sessioned = createBuilder(
  (session: GenerationSession = createSession(identity)) => ({
    uuid: `u-${session.sequence('user')}`,
    createdAt: new Date(0),
    deletedAt: null,
    status: Status.ACTIVE,
    firstName: null,
    lastName: null,
  }),
  { into: User, defaultSession: () => createSession(identity) }
);
expectType<User>(sessioned.build());
expectType<User>(sessioned.build(createSession({ ...identity, seed: 2 })));

// Async factories build into the class through buildAsync() only.
const asyncUsers = createBuilder(
  async () => ({
    uuid: 'u-1',
    createdAt: new Date(0),
    deletedAt: null,
    status: Status.ACTIVE,
    firstName: null,
    lastName: null,
  }),
  { into: User }
);
expectType<Promise<User>>(asyncUsers.buildAsync());
// @ts-expect-error No synchronous build for an async factory.
asyncUsers.build();

// fluent() setters patch the record and the builds still return the instance.
const named = fluent(users, ['firstName', 'status', 'roles']);
expectType<User>(named.withFirstName('Ada').withStatus(Status.BLOCKED).build());
named.withRoles([new Role()]).build().fullName.toUpperCase();
// @ts-expect-error Setters keep the record's field type.
named.withFirstName(1);
// @ts-expect-error Methods are not fields.
fluent(users, ['isBlocked']);
expectType<User>(named.transform((user) => user).build());

// map() is a transform that may change the output type; patches keep the input type.
const labels = createBuilder(() => ({ first: 'Ada', last: 'Lovelace' })).map(
  (name) => `${name.first} ${name.last}`
);
expectType<Builder<{ first: string; last: string }, [], string>>(labels);
expectType<string>(labels.with({ first: 'Grace' }).build());
labels.transform((label) => label.toUpperCase()).build();
// @ts-expect-error Transforms after map() see the mapped type.
labels.transform((label) => label.first);
const explicit = createBuilder((): InstanceInput<User> => ({
  uuid: 'u-1',
  createdAt: new Date(0),
  deletedAt: null,
  status: Status.ACTIVE,
  firstName: null,
  lastName: null,
})).map(intoClass(User));
expectType<User>(explicit.build());
const namedLabels = fluent(labels, ['first']);
expectType<string>(namedLabels.withFirst('Grace').build());

// Schema builders have no typed map(): the validator expects the unmapped input.
const schema = {} as StandardSchemaV1<{ age: string }, { age: number }>;
// @ts-expect-error map() is not offered on schema builders in this prototype.
createSchemaBuilder(schema, () => ({ age: '1' })).map((value) => value);

// The class-first form reads the class before the factory, so literal fields stay literal.
class Lead {
  uuid!: string;
  source!: 'import' | 'manual';
}
const leads = createInstanceBuilder(Lead, (_session?: GenerationSession) => ({
  uuid: 'l-1',
  source: 'import',
}));
expectExact<typeof leads, Builder<InstanceInput<Lead>, [_session?: GenerationSession], Lead>>(true);
expectType<Lead>(leads.build());
// @ts-expect-error The factory is still checked against the record.
createInstanceBuilder(Lead, () => ({ uuid: 'l-1', source: 'other' }));
// With { into }, the class comes after the factory: the literal widens to string.
// @ts-expect-error This is the reason the proposal prefers the class-first form.
createBuilder(() => ({ uuid: 'l-1', source: 'import' }), { into: Lead });
createBuilder(() => ({ uuid: 'l-1', source: 'import' as const }), { into: Lead });
expectType<Money>(
  createInstanceBuilder(Money, () => ({ amount: 1, currency: 'EUR' }), {
    construct: 'prototype',
  }).build()
);
// @ts-expect-error A constructor with required arguments needs construct: 'prototype'.
createInstanceBuilder(Money, () => ({ amount: 1, currency: 'EUR' }));
expectType<Promise<Lead>>(
  createInstanceBuilder(Lead, async () => ({ uuid: 'l-1', source: 'manual' })).buildAsync()
);
