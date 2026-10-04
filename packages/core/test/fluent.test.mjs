import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  builderClass,
  createBuilder,
  createBuilderClass,
  createScenario,
  createSchemaBuilder,
  createSession,
  fluent,
  schemaFields,
  BuilderValidationError,
} from '../dist/index.js';

describe('opt-in named fluent builders', () => {
  it('retains factory arguments, immutable branches and configuration order without probing data', () => {
    let calls = 0;
    const source = createBuilder((id, name = 'base') => {
      calls++;
      return { id, name, age: 7 };
    });
    const fields = ['name', 'age'];
    const base = fluent(source, fields);
    fields[0] = 'other';
    const changed = base
      .withName('Ada')
      .with({ age: 8 })
      .withAge(9)
      .transform((value) => ({ ...value, name: `${value.name}!` }))
      .withName('Grace');
    assert.equal(calls, 0);
    assert.deepEqual(changed.build(1), { id: 1, name: 'Grace!', age: 9 });
    assert.deepEqual(base.build(2), { id: 2, name: 'base', age: 7 });
    assert.deepEqual(source.build(3), { id: 3, name: 'base', age: 7 });
    assert.notEqual(changed, base);
    assert.equal(changed.describe().operations.length, 6);
    assert.throws(() => base.withName.call({}, 'invalid'), /receiver/);
  });
  it('preserves validation, encoded inputs and named methods after asynchronous transitions', async () => {
    let parses = 0;
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate(value) {
          parses++;
          return value.age === 'bad'
            ? { issues: [{ message: 'invalid' }] }
            : { value: { age: Number(value.age) } };
        },
      },
    };
    const base = fluent(
      createSchemaBuilder(schema, (age) => ({ age })),
      ['age']
    );
    assert.deepEqual(base.withAge('42').build('1'), { age: '42' });
    assert.equal(parses, 0);
    assert.deepEqual(base.withAge('42').buildValidated('1'), { age: 42 });
    assert.equal(parses, 1);
    const asyncBuilder = base.transformAsync(async (value) => value).withAge('43');
    assert.deepEqual(await asyncBuilder.buildValidatedAsync('1'), { age: 43 });
    assert.throws(() => asyncBuilder.build('1'), /buildAsync/);
    assert.throws(() => base.withAge('bad').buildValidated('1'), BuilderValidationError);
    const nativeAsync = fluent(
      createBuilder(async (id) => ({ id })),
      ['id']
    );
    assert.deepEqual(await nativeAsync.withId(9).buildAsync(1), { id: 9 });
  });
  it('normalizes explicit field names and allows unambiguous method aliases', () => {
    const source = createBuilder(() => ({
      'first-name': 'base',
      first_name: 'base',
      factory: '',
      '': 1,
    }));
    assert.equal(fluent(source, ['first-name']).withFirstName('Ada').build()['first-name'], 'Ada');
    assert.equal(fluent(source, ['']).withValue(2).build()[''], 2);
    const mapping = Object.assign(Object.create(null), {
      withFactoryValue: 'factory',
      named: 'first_name',
    });
    const base = fluent(source, mapping);
    mapping.named = 'factory';
    assert.equal(base.named('Grace').withFactoryValue('domain').build().first_name, 'Grace');
    for (const fields of [
      ['first-name', 'first_name'],
      ['factory'],
      ['name', 'name'],
      { one: 'factory', two: 'factory' },
    ])
      assert.throws(() => fluent(source, fields), /unique|capabilities/);
    const property = 'x'.repeat(100);
    assert.equal(
      fluent(
        createBuilder(() => ({ [property]: 1 })),
        { withLong: property }
      )
        .withLong(2)
        .build()[property],
      2
    );
  });
  it('rejects active, oversized and capability-overriding selections without invoking accessors', () => {
    const base = createBuilder(() => ({ name: '' }));
    let reads = 0;
    const accessor = Object.defineProperty({}, 'withName', {
      enumerable: true,
      get() {
        reads++;
        return 'name';
      },
    });
    const sparse = new Array(1);
    const extra = Object.assign(['name'], { extra: true });
    for (const selection of [
      null,
      undefined,
      1,
      [],
      {},
      new Date(),
      sparse,
      extra,
      accessor,
      Object.defineProperty({}, 'withName', { value: 'name' }),
      { [Symbol('hidden')]: 'name' },
      [1],
      ['x'.repeat(65)],
      { long: 'x'.repeat(1025) },
      { 'not valid': 'name' },
      { ['x'.repeat(129)]: 'name' },
      { build: 'name' },
      { then: 'name' },
      { toJSON: 'name' },
      new Array(1001).fill('name'),
    ])
      assert.throws(() => fluent(base, selection), TypeError);
    assert.equal(reads, 0);
    assert.throws(() => fluent(null, ['name']), /builder/);
  });
});

describe('setters for every field of a schema field list', () => {
  it('adds a setter per field and skips names it cannot add without a guess', () => {
    let calls = 0;
    const long = 'x'.repeat(65);
    const source = createBuilder((id) => {
      calls++;
      return { id, status: 'NEW', factory: '', 'first-name': '', first_name: '', [long]: 0 };
    });
    const fields = schemaFields(['id', 'status', 'factory', 'first-name', 'first_name', long, '']);
    const rows = fluent(source, fields);
    assert.equal(calls, 0);
    assert.deepEqual(rows.withStatus('PAID').withValue(1).withId('changed').build('o'), {
      id: 'changed',
      status: 'PAID',
      factory: '',
      'first-name': '',
      first_name: '',
      [long]: 0,
      '': 1,
    });
    // Two fields share withFirstName; a field named factory cannot replace withFactory().
    assert.equal('withFirstName' in rows, false);
    assert.equal(
      Object.getOwnPropertyNames(Object.getPrototypeOf(rows)).some((name) => name.length > 64),
      false
    );
    assert.equal(rows.withFactory(() => ({ factory: 'plant' })).build('o').factory, 'plant');
    assert.throws(() => rows.withFactory('plant'), /factory function/);
    assert.equal('withStatus' in source, false);
    const asynchronous = rows.transformAsync(async (value) => value).withStatus('PAID');
    assert.throws(() => asynchronous.build('o'), /buildAsync/);
    // A list whose only field is skipped still wraps the builder, with no setters.
    const only = fluent(
      createBuilder(() => ({ factory: '' })),
      schemaFields(['factory'])
    );
    const setters = (builder) =>
      Object.getOwnPropertyNames(Object.getPrototypeOf(builder)).filter(
        (name) => /^with[A-Z0-9]/.test(name) && name !== 'withFactory'
      );
    assert.deepEqual(setters(only), []);
    assert.deepEqual(setters(rows).sort(), ['withId', 'withStatus', 'withValue']);
  });
  it('validates field lists as data without invoking accessors', () => {
    const base = createBuilder(() => ({ name: '' }));
    const fields = schemaFields(['name']);
    assert.equal(Array.isArray(fields), true);
    assert.equal(Object.isFrozen(fields), true);
    assert.equal(JSON.stringify(fields), '["name"]');
    assert.equal(fluent(base, fields).withName('Ada').build().name, 'Ada');
    const thousand = Array.from({ length: 1000 }, (_, index) => `field${index}`);
    assert.equal(typeof fluent(base, schemaFields(thousand)).withField999, 'function');
    // Lists stay structural, so a list from another copy of the package still works.
    const copied = Object.freeze(
      Object.defineProperty(['name'], '~schemaFields', { value: { version: 1 } })
    );
    assert.equal(fluent(base, copied).withName('Grace').build().name, 'Grace');
    let reads = 0;
    const accessor = Object.defineProperty(['name'], 0, {
      get() {
        reads++;
        return 'name';
      },
    });
    for (const names of [
      null,
      'name',
      [1],
      ['name', 'name'],
      new Array(1),
      accessor,
      [...thousand, 'more'],
    ])
      assert.throws(() => schemaFields(names), TypeError);
    const forged = (names, marker, frozen = true) => {
      const list = Object.defineProperty([...names], '~schemaFields', { value: marker });
      return frozen ? Object.freeze(list) : list;
    };
    for (const selection of [
      schemaFields([]),
      forged(['name'], { version: 1 }, false),
      forged(['name'], { version: 2 }),
      forged(['name'], {
        get version() {
          reads++;
          return 1;
        },
      }),
      forged(['name', 'name'], { version: 1 }),
      forged([1], { version: 1 }),
      forged(['name'], true),
      Object.freeze(Object.assign(forged(['name'], { version: 1 }, false), { extra: true })),
      forged([...thousand, 'more'], { version: 1 }),
    ])
      assert.throws(() => fluent(base, selection), TypeError);
    assert.equal(reads, 0);
  });
});

describe('nested fluent() builders', () => {
  const setters = (builder) =>
    Object.getOwnPropertyNames(Object.getPrototypeOf(builder))
      .filter((name) => /^with[A-Z0-9]/.test(name) && name !== 'withFactory')
      .sort();
  const schema = {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: (value) =>
        value.name === 'bad'
          ? { issues: [{ message: 'invalid name', path: ['name'] }] }
          : { value: { ...value, valid: true } },
    },
  };
  it('keeps the inner setters and adds the outer ones through every builder operation', async () => {
    let calls = 0;
    const source = createSchemaBuilder(schema, (id) => {
      calls++;
      return { id, name: 'base', email: '', user_name: '', note: '' };
    });
    const base = fluent(source, schemaFields(['id', 'name', 'email', 'user_name', 'note']));
    const users = fluent(base, { withKey: 'id', withLogin: 'user_name' });
    assert.deepEqual(setters(users), [
      'withEmail',
      'withId',
      'withKey',
      'withLogin',
      'withName',
      'withNote',
      'withUserName',
    ]);
    const configured = users
      .withName('Ada')
      .withKey(1)
      .withLogin('ada')
      .with({ email: 'first' })
      .withFactory(() => ({ note: 'factory' }))
      .omit('note')
      .withNote('kept')
      .transform((value) => ({ ...value, name: `${value.name}!` }))
      .withEmail('ada@example.com');
    assert.equal(calls, 0);
    const expected = {
      id: 1,
      name: 'Ada!',
      email: 'ada@example.com',
      user_name: 'ada',
      note: 'kept',
    };
    assert.deepEqual(configured.build(7), expected);
    assert.deepEqual(configured.buildList(2, 7), [expected, expected]);
    assert.deepEqual(configured.buildValidated(7), { ...expected, valid: true });
    assert.deepEqual(configured.usingValidation({}).withId(2).buildValidatedList(1, 7), [
      { ...expected, id: 2, valid: true },
    ]);
    assert.deepEqual(
      configured
        .replace({ id: 3, name: 'R', email: '', user_name: '', note: '' })
        .withId(4)
        .build(),
      { id: 4, name: 'R!', email: '', user_name: '', note: '' }
    );
    assert.deepEqual(
      users
        .replaceFactory((id) => ({ id, name: 'F', email: '', user_name: '', note: '' }))
        .withLogin('f')
        .build(5),
      { id: 5, name: 'F', email: '', user_name: 'f', note: '' }
    );
    assert.throws(() => users.withKey(1).withName('bad').buildValidated(7), BuilderValidationError);
    const asynchronous = configured
      .transformAsync(async (value) => ({ ...value, note: `${value.note}?` }))
      .withName('Grace')
      .withKey(2);
    assert.deepEqual(await asynchronous.buildValidatedAsync(7), {
      ...expected,
      id: 2,
      name: 'Grace!',
      note: 'kept?',
      valid: true,
    });
    assert.equal((await asynchronous.withLogin('g').buildListAsync(2, 7))[1].user_name, 'g');
    assert.throws(() => asynchronous.withName('x').build(7), /buildAsync/);
    // Every branch is a new builder; neither call's builder changes.
    assert.deepEqual(users.build(7), { id: 7, name: 'base', email: '', user_name: '', note: '' });
    assert.equal(base.withName('b').build(8).name, 'b');
    assert.equal('withKey' in base, false);
    assert.equal(configured.describe().operations.length, 10);
    assert.throws(() => users.withName.call({}, 'x'), /receiver/);
    assert.throws(() => users.withKey.call(base, 1), /receiver/);
  });
  it('lets the outer call repeat a kept setter, and rejects or skips a name that sets another field', () => {
    const source = createBuilder(() => ({ id: 0, name: '', user_name: '', 'first-name': '' }));
    const base = fluent(source, schemaFields(['id', 'name', 'user_name']));
    // The same name for the same field is allowed and adds nothing.
    const again = fluent(base, ['id', 'name']);
    assert.deepEqual(setters(again), setters(base));
    assert.deepEqual(again.withId(1).withName('A').build(), {
      id: 1,
      name: 'A',
      user_name: '',
      'first-name': '',
    });
    // Another name for a field the inner call already sets is a new setter.
    assert.equal(fluent(base, { withLogin: 'user_name' }).withLogin('l').build().user_name, 'l');
    // An explicit name that the inner call uses for another field throws, as do the old rules.
    for (const selection of [
      { withName: 'user_name' },
      { withId: 'name' },
      ['id', 'id'],
      { withId: 'id', withKey: 'id' },
      ['factory'],
      { build: 'id' },
    ])
      assert.throws(() => fluent(base, selection), /unique|capabilities/);
    // A list skips a name the inner call already has, keeping the inner field.
    const aliased = fluent(source, { withName: 'user_name' });
    const listed = fluent(aliased, schemaFields(['id', 'name', 'user_name', 'first-name']));
    assert.deepEqual(setters(listed), ['withFirstName', 'withId', 'withName', 'withUserName']);
    assert.deepEqual(listed.withName('alias').withFirstName('F').build(), {
      id: 0,
      name: '',
      user_name: 'alias',
      'first-name': 'F',
    });
  });
  it('remembers the field of every setter across more than two calls', () => {
    const source = createBuilder((id = 0) => ({ id, name: '', user_name: '' }));
    const one = fluent(source, ['id']);
    const two = fluent(one, { withLogin: 'user_name' });
    const three = fluent(two, schemaFields(['id', 'name', 'user_name']));
    assert.deepEqual(setters(three), ['withId', 'withLogin', 'withName', 'withUserName']);
    assert.deepEqual(three.withId(1).withLogin('l').withName('n').build(), {
      id: 1,
      name: 'n',
      user_name: 'l',
    });
    const four = fluent(three, { withLogin: 'user_name', withId: 'id' });
    assert.equal(four.withLogin('x').build().user_name, 'x');
    assert.throws(() => fluent(three, { withLogin: 'name' }), /capabilities/);
    assert.throws(() => fluent(three, { withId: 'name' }), /capabilities/);
  });
  it('works inside scenarios and with sessions', () => {
    const session = () => createSession({ seed: 1, fingerprint: 'nested/v1', provider: 'test@1' });
    const people = fluent(
      fluent(
        createBuilder((s) => ({ id: s.sequence('person', 1), name: '' })),
        ['name']
      ),
      { withKey: 'id' }
    );
    const scenario = createScenario().node('person', [], (_deps, s) =>
      people.withName('Ada').build(s)
    );
    assert.deepEqual(scenario.build(session()).person, { id: 1, name: 'Ada' });
    assert.deepEqual(people.withKey(9).withName('Grace').build(session()), {
      id: 9,
      name: 'Grace',
    });
  });
});

describe('fluent() over builders with their own methods', () => {
  it('keeps the methods of a generated class facade', async () => {
    let reads = 0;
    class Users extends createBuilderClass((id = 0) => ({ id, name: '', role: 'reader' })) {
      label = 'User';
      withName(name) {
        return this.with({ name });
      }
      admin() {
        return this.with({ role: 'admin' });
      }
      count() {
        return 1;
      }
      get computed() {
        reads++;
        return () => this;
      }
    }
    const users = fluent(new Users(), { withKey: 'id' });
    assert.deepEqual(users.withName('Ada').admin().withKey(2).build(), {
      id: 2,
      name: 'Ada',
      role: 'admin',
    });
    assert.equal(users.count(), 1);
    // Instance fields and accessors stay on the class; reading the class runs no accessor.
    assert.equal(users.label, undefined);
    assert.equal('computed' in users, false);
    assert.equal(reads, 0);
    const asynchronous = users.transformAsync(async (value) => value).withName('Grace');
    assert.deepEqual(await asynchronous.admin().buildAsync(3), {
      id: 3,
      name: 'Grace',
      role: 'admin',
    });
    assert.throws(() => asynchronous.build(3), /buildAsync/);
    // A list skips a class method's name; the class method keeps it.
    const listed = fluent(new Users(), schemaFields(['id', 'name', 'role']));
    assert.deepEqual(listed.withName('A').withId(1).withRole('owner').build(), {
      id: 1,
      name: 'A',
      role: 'owner',
    });
    // A facade without methods of its own adds nothing.
    const Plain = builderClass(() => createBuilder(() => ({ id: 0 })));
    assert.deepEqual(
      Object.getOwnPropertyNames(Object.getPrototypeOf(fluent(new Plain(), ['id']))).sort(),
      Object.getOwnPropertyNames(Plain.prototype).concat('withId').sort()
    );
  });
  it('lets an explicit name replace a class method whose field is unknown, as before', async () => {
    let calls = 0;
    class Users extends createBuilderClass((id = 0) => ({ id, name: '', role: 'reader' })) {
      withName(name) {
        calls++;
        return this.with({ name: `class ${name}` });
      }
      admin() {
        return this.with({ role: 'admin' });
      }
    }
    // The outer setter replaces withName(); the other class methods are kept.
    const users = fluent(new Users(), { withName: 'role', withKey: 'id' });
    const configured = users
      .withName('owner')
      .with({ name: 'Ada' })
      .withKey(2)
      .withFactory(() => ({ name: 'Grace' }))
      .withName('editor');
    assert.deepEqual(configured.build(), { id: 2, name: 'Grace', role: 'editor' });
    assert.equal(configured.admin().withName('viewer').build().role, 'viewer');
    const asynchronous = configured.transformAsync(async (value) => value).withName('guest');
    assert.deepEqual(await asynchronous.buildAsync(), { id: 2, name: 'Grace', role: 'guest' });
    assert.throws(() => asynchronous.build(), /buildAsync/);
    assert.equal(calls, 0);
    // A tuple works the same; omit() and replace() keep the replacing setter.
    const named = fluent(new Users(), ['name']);
    assert.deepEqual(named.withName('Ada').build(1), { id: 1, name: 'Ada', role: 'reader' });
    assert.deepEqual(
      named
        .replace({ id: 3, name: '', role: 'reader' })
        .omit('role')
        .withName('Lin')
        .admin()
        .build(),
      { id: 3, name: 'Lin', role: 'admin' }
    );
    assert.equal(calls, 0);
    // The replacing setter's field is known from then on, like any setter.
    assert.equal(fluent(named, ['name']).withName('Kai').build().name, 'Kai');
    assert.throws(() => fluent(named, { withName: 'role' }), /capabilities/);
    // A class method kept through a middle call is still replaced.
    const middle = fluent(new Users(), { withKey: 'id' });
    assert.deepEqual(fluent(middle, ['name']).withName('Mo').withKey(4).admin().build(), {
      id: 4,
      name: 'Mo',
      role: 'admin',
    });
    // The usual rules within one call still apply.
    assert.throws(() => fluent(new Users(), { withName: 'name', other: 'name' }), /unique/);
  });
  it('forwards methods of custom builders and returns results that are not builders as is', () => {
    const make = (runtime) => ({
      with: (patch) => make(runtime.with(patch)),
      build: (...args) => runtime.build(...args),
      buildAsync: (...args) => runtime.buildAsync(...args),
      describe: () => runtime.describe(),
      sample: () => ({ id: 1 }),
      doubled: () => make(runtime.transform((value) => ({ id: value.id * 2 }))),
    });
    const custom = fluent(make(createBuilder(() => ({ id: 3 }))), ['id']);
    assert.deepEqual(custom.sample(), { id: 1 });
    assert.deepEqual(custom.withId(4).doubled().withId(5).build(), { id: 10 });
    assert.throws(() => custom.sample.call({}), /receiver/);
    // A builder without a prototype is read too; Object.prototype never is.
    const bare = Object.assign(Object.create(null), make(createBuilder(() => ({ id: 0 }))));
    assert.deepEqual(fluent(bare, ['id']).sample(), { id: 1 });
    assert.equal(Object.hasOwn(Object.getPrototypeOf(custom), 'hasOwnProperty'), false);
    let chain = make(createBuilder(() => ({ id: 0 })));
    for (let depth = 0; depth < 63; depth++) chain = Object.create(chain);
    assert.equal(fluent(chain, ['id']).withId(1).build().id, 1);
    assert.throws(() => fluent(Object.create(chain), ['id']), /64 prototypes/);
  });
});
