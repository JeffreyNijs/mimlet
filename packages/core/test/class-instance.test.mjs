import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuilder,
  createBuilderClass,
  createInstanceBuilder,
  createSchemaBuilder,
  createSession,
  fluent,
  intoClass,
} from '../dist/index.js';

class User {
  uuid;
  firstName;
  lastName;
  roles;
  #secret = 'set by the constructor';
  get fullName() {
    return [this.firstName, this.lastName].filter(Boolean).join(' ');
  }
  get secret() {
    return this.#secret;
  }
  isNamed() {
    return this.fullName !== '';
  }
}
const record = () => ({ uuid: 'u-1', firstName: 'John', lastName: 'Doe' });
const identity = { fingerprint: 'class-instance', provider: 'test@1', seed: 1 };

describe('building class instances', () => {
  it('patches the record and creates a new instance on every build', () => {
    let constructed = 0;
    class Counted extends User {
      constructor() {
        super();
        constructed++;
      }
    }
    const users = createInstanceBuilder(Counted, record);
    const ada = users.with({ firstName: 'Ada' }).build();
    assert.ok(ada instanceof Counted);
    assert.equal(ada.fullName, 'Ada Doe');
    assert.equal(ada.isNamed(), true);
    assert.equal(ada.secret, 'set by the constructor');
    assert.equal(constructed, 1);
    const [first, second] = users.buildList(2);
    assert.notEqual(first, second);
    assert.equal(first.firstName, 'John');
    assert.equal(constructed, 3);
    // The constructor defined every declared field, so omitted fields stay present.
    assert.deepEqual(Object.keys(users.omit('lastName').build()), [
      'uuid',
      'firstName',
      'lastName',
      'roles',
    ]);
    assert.deepEqual(users.describe().operations, ['factory', 'map']);
  });

  it('runs later transforms on the instance, after every patch', () => {
    const users = createInstanceBuilder(User, record)
      .transform((user) => Object.assign(user, { roles: [`role-of-${user.uuid}`] }))
      .with({ uuid: 'u-2' });
    const user = users.build();
    assert.ok(user instanceof User);
    assert.deepEqual(user.roles, ['role-of-u-2']);
    assert.deepEqual(users.describe().operations, ['factory', 'merge', 'map', 'transform']);
  });

  it('rejects a transform that turns the instance into another value', async () => {
    const users = createInstanceBuilder(User, record);
    assert.throws(
      () => users.transform((user) => ({ ...user })).build(),
      /A transform after intoClass\(User\) returned a value that is not a User instance/
    );
    await assert.rejects(
      users.transformAsync(async (user) => ({ ...user })).buildAsync(),
      /not a User instance/
    );
    // A subclass instance is an instance; a later map() may change the type again.
    class Admin extends User {}
    assert.ok(users.transform((user) => Object.assign(new Admin(), user)).build() instanceof Admin);
    const label = users
      .map((user) => user.fullName)
      .transform((name) => name.toUpperCase())
      .build();
    assert.equal(label, 'JOHN DOE');
    // An ordinary map() before the mapping sets no check.
    const plain = createBuilder(record)
      .map((value) => ({ ...value, mapped: true }))
      .transform((value) => ({ ...value }));
    assert.equal(plain.build().mapped, true);
  });

  it('rejects a computed getter in the record and assigns through setters', () => {
    class Named {
      #name = '';
      get name() {
        return this.#name;
      }
      set name(value) {
        this.#name = value.trim();
      }
    }
    assert.equal(createInstanceBuilder(Named, () => ({ name: ' Ada ' })).build().name, 'Ada');
    const users = createInstanceBuilder(User, record);
    assert.throws(
      () => users.with({ fullName: 'Ada' }).build(),
      /fullName is computed by User \(a getter without a setter\); leave it out of the record/
    );
  });

  it('can skip the constructor', () => {
    class Money {
      constructor(amount, currency) {
        if (amount === undefined) {
          throw new TypeError('amount is required');
        }
        this.amount = amount;
        this.currency = currency;
      }
      format() {
        return `${this.amount} ${this.currency}`;
      }
    }
    const factory = () => ({ amount: 5, currency: 'EUR' });
    assert.throws(() => createInstanceBuilder(Money, factory).build(), /amount is required/);
    const money = createInstanceBuilder(Money, factory, { construct: 'prototype' })
      .with({ amount: 7 })
      .build();
    assert.ok(money instanceof Money);
    assert.equal(money.format(), '7 EUR');
    // Without the constructor, private fields do not exist.
    const user = createInstanceBuilder(User, record, { construct: 'prototype' }).build();
    assert.deepEqual(Object.keys(user), ['uuid', 'firstName', 'lastName']);
    assert.throws(() => user.secret, TypeError);
  });

  it('keeps arguments, named default sessions and async factories', async () => {
    const users = createInstanceBuilder(
      User,
      (session) => ({ ...record(), uuid: `u-${session.sequence('user')}` }),
      { defaultSession: () => createSession(identity), name: 'users', maxListSize: 5 }
    );
    const list = users.buildList(2);
    assert.ok(list.every((user) => user instanceof User));
    assert.notEqual(list[0].uuid, list[1].uuid);
    assert.equal(users.describe().name, 'users');
    assert.equal(users.describe().maxListSize, 5);
    const loaded = await createInstanceBuilder(User, async () => record())
      .with({ lastName: 'Lovelace' })
      .buildAsync();
    assert.ok(loaded instanceof User);
    assert.equal(loaded.fullName, 'John Lovelace');
    const names = await createInstanceBuilder(User, async () => record())
      .map((user) => user.fullName)
      .buildListAsync(2);
    assert.deepEqual(names, ['John Doe', 'John Doe']);
  });

  it('keeps fluent() setters after map() and in generated classes', () => {
    const users = fluent(createInstanceBuilder(User, record), ['firstName', 'lastName']);
    const user = users.withFirstName('Grace').withLastName('Hopper').build();
    assert.ok(user instanceof User);
    assert.equal(user.fullName, 'Grace Hopper');
    const label = users
      .map((value) => value.fullName)
      .withFirstName('Ada')
      .build();
    assert.equal(label, 'Ada Doe');
    const UserClass = createBuilderClass(record);
    assert.equal(new UserClass().map((value) => value.uuid).build(), 'u-1');
  });

  it('maps to any output type and composes maps', () => {
    const label = createBuilder(() => ({ first: 'Ada', last: 'Lovelace' }))
      .map((name, suffix = '') => `${name.first} ${name.last}${suffix}`)
      .map((text) => text.toUpperCase());
    assert.equal(label.with({ first: 'Grace' }).build('!'), 'GRACE LOVELACE!');
    const explicit = createBuilder(record).map(intoClass(User));
    assert.ok(explicit.build() instanceof User);
    assert.throws(() => createBuilder(record).map('nope'), /map\(\) requires a factory function/);
  });

  it('rejects inputs that are not plain records and invalid options', () => {
    assert.throws(
      () => createInstanceBuilder(User, () => new User()).build(),
      /expects a plain record/
    );
    assert.throws(() => intoClass(User)(null), /expects a plain record/);
    assert.throws(() => intoClass({}), /requires a class/);
    assert.throws(() => intoClass(User, { construct: 'clone' }), /construct must be/);
    assert.throws(
      () => createInstanceBuilder(User, record, { construct: 'clone' }),
      /construct must be/
    );
    const accessor = {};
    Object.defineProperty(accessor, 'uuid', { enumerable: true, get: () => 'u' });
    assert.throws(() => intoClass(User)(accessor), /cannot hold accessors/);
    // Hidden fields are skipped; symbol keys are copied.
    const tag = Symbol('tag');
    const hidden = { uuid: 'u', [tag]: 'tagged' };
    Object.defineProperty(hidden, 'internal', { enumerable: false, value: 1 });
    const user = intoClass(User)(hidden);
    assert.equal(user[tag], 'tagged');
    assert.equal(Object.hasOwn(user, 'internal'), false);
    class Tagged {
      get [tag]() {
        return 'computed';
      }
    }
    assert.throws(() => intoClass(Tagged)({ [tag]: 'x' }), /\[tag\] is computed/);
    const nameless = (() =>
      class {
        get value() {
          return 1;
        }
      })();
    assert.throws(() => intoClass(nameless)({ value: 2 }), /computed by the class/);
    assert.throws(() => intoClass(nameless)([]), /intoClass\(the class\) expects a plain record/);
  });

  it('is not available on schema builders', () => {
    const schema = {
      '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value }) },
    };
    assert.throws(
      () => createSchemaBuilder(schema, () => ({})).map((value) => value),
      /not available on schema builders/
    );
  });
});
