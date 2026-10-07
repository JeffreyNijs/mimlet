import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  builderClass,
  createBuilder,
  createBuilderClass,
  createInstanceBuilder,
  createScenario,
  createSchemaBuilder,
  createSession,
  fluent,
  schemaFields,
  BuilderPathError,
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

describe('path aliases', () => {
  const withPath = Symbol.for('mimlet.builder.withPath');
  const query = () =>
    createBuilder((search = 'ramp') => ({ search, pagination: { limit: 10, offset: 0 } }));
  const paged = (builder = query()) =>
    fluent(builder, {
      withLimit: ['pagination', 'limit'],
      withOffset: ['pagination', 'offset'],
    });
  const pathError = (message) => (error) =>
    error instanceof BuilderPathError &&
    error instanceof TypeError &&
    error.code === 'INVALID_BUILDER_PATH' &&
    error.message === message;

  it('sets a value inside the parent record and keeps its other fields, in call order', () => {
    let calls = 0;
    const shared = { limit: 10, offset: 0 };
    const source = createBuilder((search = 'ramp') => {
      calls++;
      return { search, pagination: shared };
    });
    const base = paged(source);
    const changed = base.withLimit(5).withOffset(20);
    assert.equal(calls, 0);
    assert.deepEqual(changed.build(), { search: 'ramp', pagination: { limit: 5, offset: 20 } });
    // The factory's value and earlier branches are never changed.
    assert.deepEqual(shared, { limit: 10, offset: 0 });
    assert.deepEqual(base.build(), { search: 'ramp', pagination: { limit: 10, offset: 0 } });
    assert.deepEqual(changed.describe().operations, ['factory', 'mergePath', 'mergePath']);
    // Operations apply in the order of the calls, mixed with .with(), .withFactory() and .replace().
    assert.equal(changed.with({ pagination: { limit: 1, offset: 1 } }).build().pagination.limit, 1);
    assert.equal(
      base
        .withFactory(() => ({ pagination: { limit: 2, offset: 2 } }))
        .withLimit(3)
        .build().pagination.limit,
      3
    );
    assert.deepEqual(
      base
        .withLimit(4)
        .replace({ search: 'x', pagination: { limit: 9, offset: 9 } })
        .withOffset(8)
        .build(),
      { search: 'x', pagination: { limit: 9, offset: 8 } }
    );
    // A transform runs after every patch and sees the path setters' values.
    assert.equal(
      base
        .transform((value) => ({ ...value, search: String(value.pagination.limit) }))
        .withLimit(6)
        .build('a').search,
      '6'
    );
    // Factory arguments and lists work as for any setter.
    assert.deepEqual(
      base
        .withLimit(7)
        .buildList(2, 'b')
        .map((value) => [value.search, value.pagination.limit]),
      [
        ['b', 7],
        ['b', 7],
      ]
    );
    // An absent leaf is added; a one-key path is a top-level setter.
    const more = fluent(query(), { withCursor: ['pagination', 'cursor'], withTerm: ['search'] });
    assert.deepEqual(more.withCursor('c').withTerm('t').build(), {
      search: 't',
      pagination: { limit: 10, offset: 0, cursor: 'c' },
    });
    assert.deepEqual(more.withTerm('t').describe().operations, ['factory', 'merge']);
  });

  it('copies each record and array on the path and keeps prototypes and descriptors', () => {
    const marker = Symbol('marker');
    const bare = Object.create(null);
    bare.limit = 1;
    const parent = Object.freeze({ inner: bare, untouched: { id: 1 } });
    const hidden = Object.defineProperty({ value: 1 }, 'secret', { value: 's', enumerable: false });
    const source = createBuilder(() => ({
      parent,
      lines: [{ quantity: 1 }, { quantity: 2 }],
      pair: [{ id: 'a' }, { id: 'b' }],
      hidden,
      box: { [marker]: 0 },
      tags: {},
    }));
    const value = fluent(source, {
      withLimit: ['parent', 'inner', 'limit'],
      withQuantity: ['lines', 1, 'quantity'],
      withFirst: ['pair', 0],
      withValue: ['hidden', 'value'],
      withMarker: ['box', marker],
      withTag: ['tags', 'team'],
    })
      .withLimit(2)
      .withQuantity(5)
      .withFirst({ id: 'z' })
      .withValue(2)
      .withMarker(1)
      .withTag('core')
      .build();
    assert.equal(Object.getPrototypeOf(value.parent.inner), null);
    assert.equal(value.parent.inner.limit, 2);
    assert.equal(value.parent.untouched, parent.untouched);
    assert.equal(bare.limit, 1);
    assert.deepEqual(value.lines, [{ quantity: 1 }, { quantity: 5 }]);
    assert.deepEqual(value.pair, [{ id: 'z' }, { id: 'b' }]);
    assert.equal(value.hidden.value, 2);
    assert.equal(Object.getOwnPropertyDescriptor(value.hidden, 'secret').enumerable, false);
    assert.equal(hidden.value, 1);
    assert.equal(value.box[marker], 1);
    assert.deepEqual(value.tags, { team: 'core' });
  });

  it('explains a missing parent and other values a path cannot go into', () => {
    const empty = fluent(
      createBuilder(() => ({ search: 'secret value' })),
      { withLimit: ['pagination', 'limit'] }
    );
    const missing =
      'withLimit() cannot set pagination.limit: pagination is missing; set pagination first (with .with() or its own setter) or give it a default in the factory';
    assert.throws(() => empty.withLimit(5).build(), pathError(missing));
    assert.throws(
      () => empty.with({ pagination: undefined }).withLimit(5).build(),
      pathError(missing)
    );
    assert.throws(
      () => empty.with({ pagination: null }).withLimit(5).build(),
      pathError(
        'withLimit() cannot set pagination.limit: pagination is null; set pagination first (with .with() or its own setter) or give it a default in the factory'
      )
    );
    // Setting the parent first, or a default, makes the setter work.
    assert.deepEqual(empty.with({ pagination: {} }).withLimit(5).build().pagination, { limit: 5 });
    // A deeper missing parent is named by its path.
    const deep = fluent(
      createBuilder(() => ({ owner: {} })),
      { withCity: ['owner', 'address', 'city'] }
    );
    assert.throws(
      () => deep.withCity('Gent').build(),
      pathError(
        'withCity() cannot set owner.address.city: owner.address is missing; set owner.address first (with .with() or its own setter) or give it a default in the factory'
      )
    );
    class Lead {
      name = 'Ada';
    }
    const values = fluent(
      createBuilder(() => ({ lead: new Lead(), date: new Date(0), text: 'secret value' })),
      { withName: ['lead', 'name'], withTime: ['date', 'time'], withLength: ['text', 'length'] }
    );
    assert.throws(
      () => values.withName('Grace').build(),
      pathError(
        'withName() cannot set lead.name: lead is a Lead instance, and path setters only change plain records and arrays; set lead as a whole instead'
      )
    );
    assert.throws(
      () => values.withTime(1).build(),
      pathError(
        'withTime() cannot set date.time: date is a Date value, not a plain record or an array'
      )
    );
    assert.throws(
      () => values.withLength(1).build(),
      pathError(
        'withLength() cannot set text.length: text is a string value, not a plain record or an array'
      )
    );
    const lines = fluent(
      createBuilder(() => ({ lines: [] })),
      { withQuantity: ['lines', 0, 'quantity'] }
    );
    assert.throws(
      () => lines.withQuantity(1).build(),
      pathError('withQuantity() cannot set lines[0].quantity: lines has no item 0')
    );
    let reads = 0;
    const accessor = {};
    Object.defineProperty(accessor, 'limit', {
      enumerable: true,
      get() {
        reads++;
        return 1;
      },
    });
    const accessors = fluent(
      createBuilder(() => ({ pagination: accessor, other: accessor })),
      { withLimit: ['pagination', 'limit'], withOther: ['other', 'offset'] }
    );
    assert.throws(
      () => accessors.withLimit(1).build(),
      pathError(
        'withLimit() cannot set pagination.limit: pagination.limit is an accessor, not a data field'
      )
    );
    assert.throws(
      () => accessors.withOther(1).build(),
      pathError(
        'withOther() cannot set other.offset: other has an accessor; path setters copy data fields only'
      )
    );
    assert.equal(reads, 0);
    // The value being built must be a record or an array.
    const scalar = fluent(
      createBuilder(() => ({ a: { b: 1 } })),
      { withB: ['a', 'b'] }
    ).replace('secret value');
    assert.throws(
      () => scalar.withB(1).build(),
      pathError('withB() cannot set a.b: the value being built is not a plain record or an array')
    );
    // Messages name keys, never values.
    for (const failing of [() => empty.withLimit(5).build(), () => values.withLength(1).build()]) {
      assert.throws(failing, (error) => !error.message.includes('secret value'));
    }
  });

  it('works with async, schema and instance builders', async () => {
    const asynchronous = paged(
      createBuilder(async () => ({ pagination: { limit: 10, offset: 0 } }))
    );
    assert.deepEqual(await asynchronous.withLimit(5).buildAsync(), {
      pagination: { limit: 5, offset: 0 },
    });
    const transformed = paged()
      .withLimit(5)
      .transformAsync(async (value) => value)
      .withOffset(3);
    assert.deepEqual((await transformed.buildAsync()).pagination, { limit: 5, offset: 3 });
    await assert.rejects(
      paged(createBuilder(async () => ({})))
        .withLimit(1)
        .buildAsync(),
      BuilderPathError
    );
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) =>
          value.pagination.limit > 100
            ? { issues: [{ message: 'too large', path: ['pagination', 'limit'] }] }
            : { value: { ...value, valid: true } },
      },
    };
    const validated = paged(
      createSchemaBuilder(schema, () => ({ pagination: { limit: 1, offset: 0 } }))
    );
    assert.deepEqual(validated.withLimit(5).buildValidated(), {
      pagination: { limit: 5, offset: 0 },
      valid: true,
    });
    assert.throws(() => validated.withLimit(500).buildValidated(), BuilderValidationError);
    class Query {
      pagination = undefined;
      get limit() {
        return this.pagination?.limit;
      }
    }
    const instances = paged(
      createInstanceBuilder(Query, () => ({ pagination: { limit: 1, offset: 0 } }))
    );
    const built = instances.withLimit(7).build();
    assert.ok(built instanceof Query);
    assert.equal(built.limit, 7);
    assert.deepEqual(
      instances
        .withLimit(7)
        .map((query) => query.limit)
        .build(),
      7
    );
    // A generated or hand-written class facade gets path setters through its runtime.
    class Users extends createBuilderClass(() => ({ profile: { name: 'Ada', age: 1 } })) {
      older() {
        return this.with({ profile: { name: 'Old', age: 99 } });
      }
    }
    const users = fluent(new Users(), { withName: ['profile', 'name'] });
    assert.deepEqual(users.older().withName('Grace').build(), {
      profile: { name: 'Grace', age: 99 },
    });
  });

  it('keeps path setters through nesting, like other setters', () => {
    const base = paged();
    const outer = fluent(base, ['search']);
    assert.deepEqual(outer.withSearch('x').withLimit(1).withOffset(2).build(), {
      search: 'x',
      pagination: { limit: 1, offset: 2 },
    });
    const inner = fluent(fluent(query(), ['search']), { withLimit: ['pagination', 'limit'] });
    assert.deepEqual(inner.withLimit(3).withSearch('y').build(), {
      search: 'y',
      pagination: { limit: 3, offset: 0 },
    });
    // Repeating a kept path setter for the same path adds nothing; a new name is a second setter.
    const repeated = fluent(base, { withLimit: ['pagination', 'limit'] });
    assert.equal(repeated.withLimit(5).build().pagination.limit, 5);
    const renamed = fluent(base, { withSize: ['pagination', 'limit'] });
    assert.equal(renamed.withSize(4).build().pagination.limit, 4);
    assert.equal(renamed.withLimit(5).build().pagination.limit, 5);
    // A kept name for another path or field throws; a path cannot reuse a field setter's name.
    assert.throws(() => fluent(base, { withLimit: ['pagination', 'offset'] }), /unique/);
    assert.throws(() => fluent(outer, { withSearch: ['pagination', 'limit'] }), /unique/);
    assert.throws(() => fluent(base, { withLimit: 'search' }), /unique/);
    // Two setters for one path in one call, or a capability name, throw as for fields.
    assert.throws(
      () =>
        fluent(query(), { withLimit: ['pagination', 'limit'], withSize: ['pagination', 'limit'] }),
      /unique/
    );
    assert.throws(() => fluent(query(), { with: ['pagination', 'limit'] }), /capabilities/);
    // A third level still knows the paths of the first.
    const third = fluent(fluent(outer, { withTerm: 'search' }), {
      withLimit: ['pagination', 'limit'],
    });
    assert.equal(third.withLimit(8).withTerm('z').build().pagination.limit, 8);
    // Symbols and indexes compare by identity and value.
    const marker = Symbol('marker');
    const symbols = fluent(
      createBuilder(() => ({ box: { [marker]: 1 }, list: [{ a: 1 }] })),
      {
        withMarker: ['box', marker],
        withItem: ['list', 0, 'a'],
      }
    );
    assert.equal(
      fluent(symbols, { withMarker: ['box', marker] })
        .withMarker(2)
        .build().box[marker],
      2
    );
    assert.throws(() => fluent(symbols, { withMarker: ['box', Symbol('marker')] }), /unique/);
    assert.throws(() => fluent(symbols, { withItem: ['list', 1, 'a'] }), /unique/);
    assert.throws(() => fluent(symbols, { withItem: ['list', '0', 'a'] }), /unique/);
    assert.throws(() => fluent(symbols, { withMarker: ['list', 0, 'a'] }), /unique/);
  });

  it('validates path aliases as data, and needs a builder with path setters', () => {
    const base = query();
    let reads = 0;
    const getter = ['pagination', 'limit'];
    Object.defineProperty(getter, 1, {
      enumerable: true,
      get() {
        reads++;
        return 'limit';
      },
    });
    class Path extends Array {}
    const sparse = ['pagination'];
    sparse.length = 2;
    for (const path of [
      [],
      new Array(9).fill('pagination'),
      sparse,
      Object.assign(['pagination', 'limit'], { extra: true }),
      Path.from(['pagination', 'limit']),
      getter,
      [1, 'limit'],
      [Symbol('first'), 'limit'],
      ['pagination', {}],
      ['pagination', -1],
      ['pagination', 1.5],
      ['pagination', 'x'.repeat(1025)],
    ]) {
      assert.throws(() => fluent(base, { withLimit: path }), TypeError);
    }
    assert.equal(reads, 0);
    assert.throws(() => fluent(base, { 'not valid': ['pagination', 'limit'] }), TypeError);
    // Tuple selections take field names only.
    assert.throws(() => fluent(base, [['pagination', 'limit']]), TypeError);
    // The alias is copied: changing the array afterwards changes nothing.
    const alias = ['pagination', 'limit'];
    const copied = fluent(base, { withLimit: alias });
    alias[1] = 'offset';
    assert.deepEqual(copied.withLimit(3).build().pagination, { limit: 3, offset: 0 });
    // A builder without path setters, such as one from an older core, is rejected.
    const custom = {
      with: () => custom,
      build: () => ({}),
      buildAsync: async () => ({}),
      describe: () => base.describe(),
    };
    assert.throws(() => fluent(custom, { withLimit: ['pagination', 'limit'] }), /path setters/);
    assert.deepEqual(fluent(custom, { withLimit: 'limit' }).withLimit(1).build(), {});
    const facade = new (builderClass(() => custom))();
    assert.throws(
      () => fluent(facade, { withLimit: ['pagination', 'limit'] }).withLimit(1),
      /no path setters/
    );
  });

  it('checks the internal path operation of a builder', () => {
    const base = query();
    for (const path of [undefined, 'pagination', [], new Array(9).fill('a'), [{}], [-1], [0.5]]) {
      assert.throws(() => base[withPath](path, 1, 'label'), TypeError);
    }
    assert.deepEqual(base[withPath](['search'], 'x').build(), {
      search: 'x',
      pagination: { limit: 10, offset: 0 },
    });
    assert.throws(
      () =>
        fluent(
          createBuilder(() => ({})),
          {}
        )[withPath],
      TypeError
    );
    assert.throws(
      () => base[withPath](['missing', 'x'], 1).build(),
      /^BuilderPathError: A path setter cannot set missing\.x: missing is missing/
    );
    assert.throws(
      () => base[withPath](['missing', 'x'], 1, `with${'X'.repeat(200)}()`).build(),
      (error) => error.message.startsWith(`with${'X'.repeat(136)} cannot set`)
    );
  });
});

describe('a field list and an alias map in one call', () => {
  const setters = (builder) =>
    Object.getOwnPropertyNames(Object.getPrototypeOf(builder))
      .filter((name) => /^with[A-Z0-9]/.test(name) && name !== 'withFactory')
      .sort();
  const query = () =>
    createBuilder((search = 'ramp') => ({
      search,
      filter: { status: 'open' },
      pagination: { key: 'a', limit: 10 },
    }));

  it('adds the setters of the list and of the map, like a nested call', () => {
    let calls = 0;
    const source = createBuilder((search = 'ramp') => {
      calls++;
      return { search, filter: { status: 'open' }, pagination: { key: 'a', limit: 10 } };
    });
    const views = fluent(source, ['filter', 'pagination'], {
      withPaginationKey: ['pagination', 'key'],
      withTerm: 'search',
    });
    assert.equal(calls, 0);
    assert.deepEqual(setters(views), [
      'withFilter',
      'withPagination',
      'withPaginationKey',
      'withTerm',
    ]);
    const changed = views
      .withPagination({ key: 'b', limit: 5 })
      .withPaginationKey('c')
      .withFilter({ status: 'closed' })
      .withTerm('t');
    assert.deepEqual(changed.build(), {
      search: 't',
      filter: { status: 'closed' },
      pagination: { key: 'c', limit: 5 },
    });
    assert.deepEqual(changed.describe().operations, [
      'factory',
      'merge',
      'mergePath',
      'merge',
      'merge',
    ]);
    // The same setters as fluent(fluent(builder, fields), aliases), with the same results.
    const nested = fluent(fluent(source, ['filter', 'pagination']), {
      withPaginationKey: ['pagination', 'key'],
      withTerm: 'search',
    });
    assert.deepEqual(setters(nested), setters(views));
    assert.deepEqual(
      nested
        .withPagination({ key: 'b', limit: 5 })
        .withPaginationKey('c')
        .withFilter({ status: 'closed' })
        .withTerm('t')
        .build(),
      changed.build()
    );
    // Every branch is a new builder, and an alias map of undefined is no alias map.
    assert.deepEqual(views.build('x').pagination, { key: 'a', limit: 10 });
    assert.deepEqual(setters(fluent(source, ['search'], undefined)), ['withSearch']);
    assert.throws(() => views.withPaginationKey.call({}, 'x'), /receiver/);
  });

  it('skips the names of the map in a schema field list and checks a tuple like nesting', () => {
    const fields = schemaFields(['search', 'filter', 'pagination', 'key']);
    const source = createBuilder(() => ({
      search: 'ramp',
      filter: { status: 'open' },
      pagination: { key: 'a', limit: 10 },
      key: 'top',
    }));
    // A schema field list skips the names the alias map uses, as it skips builder methods.
    const listed = fluent(source, fields, { withKey: ['pagination', 'key'], withQuery: 'search' });
    assert.deepEqual(setters(listed), [
      'withFilter',
      'withKey',
      'withPagination',
      'withQuery',
      'withSearch',
    ]);
    assert.deepEqual(listed.withKey('b').withQuery('q').build(), {
      search: 'q',
      filter: { status: 'open' },
      pagination: { key: 'b', limit: 10 },
      key: 'top',
    });
    // A name that the list skips for two fields can go to one of them in the alias map.
    const names = createBuilder(() => ({ 'first-name': '', first_name: '', id: 0 }));
    const named = fluent(names, schemaFields(['first-name', 'first_name', 'id']), {
      withFirstName: 'first_name',
    });
    assert.deepEqual(setters(named), ['withFirstName', 'withId']);
    assert.deepEqual(named.withFirstName('Ada').withId(1).build(), {
      'first-name': '',
      first_name: 'Ada',
      id: 1,
    });
    // A tuple's names are explicit: the map may repeat one for the same field, add another name
    // for a field, or name a new path, but not reuse a tuple name for another field or path.
    const tupled = fluent(source, ['filter', 'pagination'], {
      withFilter: 'filter',
      withState: ['filter', 'status'],
      withPage: 'pagination',
    });
    assert.deepEqual(setters(tupled), ['withFilter', 'withPage', 'withPagination', 'withState']);
    assert.equal(tupled.withState('closed').build().filter.status, 'closed');
    assert.equal(tupled.withPage({ key: 'p', limit: 1 }).build().pagination.key, 'p');
    for (const aliases of [
      { withFilter: ['filter', 'status'] },
      { withPagination: 'search' },
      { withKey: ['pagination', 'key'], withOther: ['pagination', 'key'] },
      { withFactory: 'search' },
      { build: 'search' },
    ]) {
      assert.throws(
        () => fluent(source, ['filter', 'pagination'], aliases),
        /unique and cannot replace builder capabilities/
      );
    }
    // Wrapping a fluent() builder keeps its setters, with the same rules for the alias map.
    const inner = fluent(source, { withTerm: 'search' });
    const outer = fluent(inner, ['filter'], { withKey: ['pagination', 'key'], withTerm: 'search' });
    assert.deepEqual(setters(outer), ['withFilter', 'withKey', 'withTerm']);
    assert.equal(outer.withTerm('t').withKey('k').build().pagination.key, 'k');
    assert.throws(() => fluent(inner, ['filter'], { withTerm: 'filter' }), /unique/);
    const outerListed = fluent(inner, fields, { withKey: ['pagination', 'key'] });
    assert.deepEqual(setters(outerListed), [
      'withFilter',
      'withKey',
      'withPagination',
      'withSearch',
      'withTerm',
    ]);
  });

  it('works with async, schema, instance and class builders', async () => {
    const asynchronous = fluent(
      createBuilder(async () => ({ filter: {}, pagination: { key: 'a', limit: 1 } })),
      ['filter'],
      { withKey: ['pagination', 'key'] }
    );
    assert.deepEqual(await asynchronous.withKey('b').withFilter({ status: 'x' }).buildAsync(), {
      filter: { status: 'x' },
      pagination: { key: 'b', limit: 1 },
    });
    const transformed = fluent(query(), ['search'], { withKey: ['pagination', 'key'] })
      .withKey('t')
      .transformAsync(async (value) => value)
      .withSearch('s');
    assert.deepEqual(await transformed.buildAsync(), {
      search: 's',
      filter: { status: 'open' },
      pagination: { key: 't', limit: 10 },
    });
    assert.throws(() => transformed.build(), /buildAsync/);
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value) =>
          value.pagination.key === ''
            ? { issues: [{ message: 'empty key', path: ['pagination', 'key'] }] }
            : { value: { ...value, valid: true } },
      },
    };
    const validated = fluent(
      createSchemaBuilder(schema, () => ({ search: '', pagination: { key: 'a', limit: 1 } })),
      schemaFields(['search', 'pagination']),
      { withKey: ['pagination', 'key'] }
    );
    assert.deepEqual(validated.withKey('b').withSearch('s').buildValidated(), {
      search: 's',
      pagination: { key: 'b', limit: 1 },
      valid: true,
    });
    assert.throws(() => validated.withKey('').buildValidated(), BuilderValidationError);
    class Query {
      search = '';
      pagination = undefined;
      get key() {
        return this.pagination?.key;
      }
    }
    const instances = fluent(
      createInstanceBuilder(Query, () => ({ pagination: { key: 'a', limit: 1 } })),
      ['search'],
      { withKey: ['pagination', 'key'] }
    );
    const built = instances.withKey('i').withSearch('s').build();
    assert.ok(built instanceof Query);
    assert.equal(built.key, 'i');
    assert.equal(built.search, 's');
    // A name of a class method is replaced by the alias map's setter, as in a nested call.
    class Users extends createBuilderClass(() => ({
      id: 0,
      profile: { name: 'Ada' },
      vip: false,
    })) {
      withName(name) {
        return this.with({ profile: { name: `${name}!` } });
      }
      vip() {
        return this.with({ vip: true });
      }
    }
    const users = fluent(new Users(), ['id'], { withName: ['profile', 'name'] });
    assert.deepEqual(users.vip().withName('Grace').withId(2).build(), {
      id: 2,
      profile: { name: 'Grace' },
      vip: true,
    });
  });

  it('validates the alias map as data before running a factory', () => {
    let calls = 0;
    const source = createBuilder(() => {
      calls++;
      return { search: '', pagination: { key: 'a' } };
    });
    const accessors = {};
    Object.defineProperty(accessors, 'withKey', {
      enumerable: true,
      get() {
        calls++;
        return ['pagination', 'key'];
      },
    });
    for (const [selection, aliases] of [
      [{ withSearch: 'search' }, { withKey: ['pagination', 'key'] }],
      [['search'], ['pagination']],
      [['search'], [['pagination', 'key']]],
      ['search', { withKey: 'search' }],
      [['search'], null],
      [['search'], 'withKey'],
      [['search'], {}],
      [['search'], accessors],
      [['search'], new (class Aliases {})()],
      [['search'], { 'not valid': 'search' }],
      [['search'], { withKey: ['pagination', -1] }],
    ]) {
      assert.throws(() => fluent(source, selection, aliases), TypeError);
    }
    assert.equal(calls, 0);
    // A builder without path setters, such as one from an older core, is rejected for paths.
    const custom = {
      with: () => custom,
      build: () => ({}),
      buildAsync: async () => ({}),
      describe: () => source.describe(),
    };
    assert.throws(
      () => fluent(custom, ['search'], { withKey: ['pagination', 'key'] }),
      /path setters/
    );
    assert.deepEqual(fluent(custom, ['search'], { withKey: 'key' }).withKey(1).build(), {});
  });
});
