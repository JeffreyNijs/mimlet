// PROTOTYPE (docs/proposals/class-instances.md): runtime of map(), intoClass() and { into }.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createBuilder,
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

describe('building into classes (prototype)', () => {
  it('patches the record and creates a new instance on every build', () => {
    let constructed = 0;
    class Counted extends User {
      constructor() {
        super();
        constructed++;
      }
    }
    const users = createBuilder(record, { into: Counted });
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

  it('runs transforms after the instance exists and keeps patch order', () => {
    const users = createBuilder(record, { into: User })
      .transform((user) => Object.assign(user, { roles: [`role-of-${user.uuid}`] }))
      .with({ uuid: 'u-2' });
    const user = users.build();
    assert.ok(user instanceof User);
    assert.deepEqual(user.roles, ['role-of-u-2']);
    assert.deepEqual(users.describe().operations, ['factory', 'merge', 'map', 'transform']);
  });

  it('rejects a computed getter in the record and accepts accessors with a setter', () => {
    class Named {
      #name = '';
      get name() {
        return this.#name;
      }
      set name(value) {
        this.#name = value.trim();
      }
    }
    assert.equal(createBuilder(() => ({ name: ' Ada ' }), { into: Named }).build().name, 'Ada');
    const users = createBuilder(record, { into: User });
    assert.throws(
      () => users.with({ fullName: 'Ada' }).build(),
      /fullName is computed by User \(a getter without a setter\)/
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
    assert.throws(() => createBuilder(factory, { into: Money }).build(), /amount is required/);
    const money = createBuilder(factory, { into: Money, construct: 'prototype' })
      .with({ amount: 7 })
      .build();
    assert.ok(money instanceof Money);
    assert.equal(money.format(), '7 EUR');
    // Without the constructor, private fields do not exist.
    const user = createBuilder(record, { into: User, construct: 'prototype' }).build();
    assert.deepEqual(Object.keys(user), ['uuid', 'firstName', 'lastName']);
    assert.throws(() => user.secret, TypeError);
  });

  it('keeps arguments, default sessions and async factories', async () => {
    const identity = { fingerprint: 'class-instance', provider: 'test@1', seed: 1 };
    const users = createBuilder(
      (session) => ({ ...record(), uuid: `u-${session.sequence('user')}` }),
      { into: User, defaultSession: () => createSession(identity) }
    );
    assert.deepEqual(
      users.buildList(2).map((user) => user.uuid),
      ['u-0', 'u-1']
    );
    const loaded = await createBuilder(async () => record(), { into: User })
      .with({ lastName: 'Lovelace' })
      .buildAsync();
    assert.ok(loaded instanceof User);
    assert.equal(loaded.fullName, 'John Lovelace');
  });

  it('works with fluent() setters, which patch the record', () => {
    const users = fluent(createBuilder(record, { into: User }), ['firstName', 'lastName']);
    const user = users.withFirstName('Grace').withLastName('Hopper').build();
    assert.ok(user instanceof User);
    assert.equal(user.fullName, 'Grace Hopper');
    // map() on a fluent builder keeps its setters at runtime.
    const label = users
      .map((value) => value.fullName)
      .withFirstName('Ada')
      .build();
    assert.equal(label, 'Ada Doe');
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
      () => createBuilder(() => new User(), { into: User }).build(),
      /expects a plain record/
    );
    assert.throws(() => intoClass(User)(null), /expects a plain record/);
    assert.throws(() => intoClass({}), /requires a class/);
    assert.throws(() => intoClass(User, { construct: 'clone' }), /construct must be/);
    const accessor = {};
    Object.defineProperty(accessor, 'uuid', { enumerable: true, get: () => 'u' });
    assert.throws(() => intoClass(User)(accessor), /cannot hold accessors/);
    // Hidden and symbol-keyed fields: hidden ones are skipped, symbols are copied.
    const tag = Symbol('tag');
    const hidden = { uuid: 'u', [tag]: 'tagged' };
    Object.defineProperty(hidden, 'internal', { enumerable: false, value: 1 });
    const user = intoClass(User)(hidden);
    assert.equal(user[tag], 'tagged');
    assert.equal(Object.hasOwn(user, 'internal'), false);
    class Frozen {
      get [tag]() {
        return 'computed';
      }
    }
    assert.throws(() => intoClass(Frozen)({ [tag]: 'x' }), /\[tag\] is computed/);
    const nameless = (() =>
      class {
        get value() {
          return 1;
        }
      })();
    assert.throws(() => intoClass(nameless)({ value: 2 }), /computed by the class/);
    assert.throws(() => intoClass(nameless)([]), /intoClass\(class\) expects a plain record/);
  });

  it('has a class-first form with the same behaviour', () => {
    const users = createInstanceBuilder(User, record).with({ firstName: 'Ada' });
    assert.ok(users.build() instanceof User);
    assert.equal(users.build().fullName, 'Ada Doe');
    assert.deepEqual(users.describe().operations, ['factory', 'merge', 'map']);
    class Money {
      constructor(amount) {
        if (amount === undefined) {
          throw new TypeError('amount is required');
        }
        this.amount = amount;
      }
    }
    const money = createInstanceBuilder(Money, () => ({ amount: 3 }), { construct: 'prototype' });
    assert.equal(money.build().amount, 3);
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
