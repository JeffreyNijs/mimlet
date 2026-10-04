import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  graphqlAdapter,
  fromGraphQLVariables,
  fromGraphQLResponse,
  GraphQLFixtureError,
} from '@mimlet/graphql';
import { BuilderValidationError, restoreSession } from '@mimlet/core';
const failure = (run) => assert.throws(run, GraphQLFixtureError);
const plain = (value) => JSON.parse(JSON.stringify(value));
const schema = `
  enum Role { READER ADMIN }
  input Filter { name: String! minimum: Int! = 1 tags: [String!] active: Boolean }
  type User { id: ID! name: String! age: Int role: Role! friends: [User!]! }
  type Query { user(id: ID!): User! users(filter: Filter!): [User!]! count: Int! role: Role! ratio: Float! flag: Boolean! }
  type Mutation { update(id: ID!, name: String!): User! }
  type Subscription { changed: User! }
`;
const date = {
  id: 'date/v1',
  input: () => '2026-01-01T00:00:00.000Z',
  output: (session) => session.referenceDate(),
  parseInput(value) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
      throw new Error('invalid date');
    return new Date(value);
  },
  serialize(value) {
    if (!(value instanceof Date)) throw new Error('not date');
    return value.toISOString();
  },
  parseOutput(value) {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value)))
      throw new Error('invalid wire date');
    return new Date(value);
  },
};

describe('GraphQL native variables and execution', () => {
  it('generates required encoded variables and returns native coerced defaults', () => {
    const adapter = graphqlAdapter(
      schema,
      'query($filter: Filter!, $id: ID! = "fixed") { users(filter:$filter) { id } user(id:$id) { name } }'
    );
    const input = adapter.variables.create();
    assert.equal(input.filter.name, 'value-0');
    assert.equal(Object.hasOwn(input.filter, 'minimum'), false);
    assert.equal(Object.hasOwn(input, 'id'), false);
    const output = adapter.variables.builder().buildValidated();
    assert.equal(output.id, 'fixed');
    assert.equal(output.filter.minimum, 1);
    assert.equal(adapter.variables.check(input), true);
    for (const invalid of [
      null,
      [],
      { filter: {} },
      { filter: { name: 1 } },
      { filter: { name: 'a', unexpected: true } },
    ])
      assert.equal(adapter.variables.check(invalid), false);
    assert.throws(
      () => adapter.variables.builder().with({ filter: {} }).buildValidated(),
      BuilderValidationError
    );
    assert.ok(adapter.variables.issues({}).length);
    assert.equal(
      fromGraphQLVariables(schema, 'query($id: ID!){ user(id:$id){ id } }').buildValidated().id,
      '0'
    );
  });
  it('honors aliases, fragments, inline fragments, directives, arguments and supplied relationships', () => {
    const document =
      'query Read($id: ID!, $name: Boolean! = true){ alias: user(id:$id){ ...Fields age @include(if:$name) role @skip(if:$name) ... on User { friends { id } } } count } fragment Fields on User { id name }';
    const options = {
      fieldsIdentity: 'user/v1',
      fields: {
        'Query.user': ({ args }) => ({
          id: args.id,
          name: 'Ada',
          age: 42,
          role: 'ADMIN',
          friends: [{ id: 'friend' }],
        }),
      },
    };
    const adapter = graphqlAdapter(schema, document, options);
    const prepared = adapter.response({ id: 123 });
    const value = prepared.create();
    assert.deepEqual(plain(value), {
      alias: { id: '123', name: 'Ada', age: 42, friends: [{ id: 'friend' }] },
      count: 0,
    });
    assert.equal(prepared.check(value), true);
    assert.equal(prepared.check({ ...value, unknown: true }), false);
    assert.equal(prepared.check({ alias: { ...value.alias, name: 1 }, count: 0 }), false);
    assert.equal(prepared.check({ alias: value.alias }), false);
    assert.equal(prepared.check({ alias: value.alias, count: '0' }), false);
    assert.ok(prepared.issues({}).length);
    const other = adapter.response({ id: 'x', name: false }).create();
    assert.equal(other.alias.role, 'ADMIN');
    assert.equal(Object.hasOwn(other.alias, 'age'), false);
    assert.equal(prepared.builder().buildValidated().alias.id, '123');
    assert.equal(fromGraphQLResponse(schema, '{ count }').buildValidated().count, 0);
    const branch = adapter.response({ id: 'x' }).builder();
    assert.throws(() => branch.with({ count: 'wrong' }).buildValidated(), BuilderValidationError);
  });
  it('produces native null bubbling and error paths without exposing fixture values', () => {
    const adapter = graphqlAdapter(schema, '{ user(id:"x"){ name id } count }', {
      fieldsIdentity: 'invalid/v1',
      fields: { 'User.name': () => null },
    });
    const result = adapter.result();
    assert.equal(result.data, null);
    assert.deepEqual(result.errors[0].path, ['user', 'name']);
    failure(() => adapter.response().create());
    const secret = graphqlAdapter(schema, 'query($id: ID!){ user(id:$id){ id } }').result({
      id: { secret: 'do-not-print' },
    });
    assert.equal(JSON.stringify(secret).includes('do-not-print'), false);
    assert.equal(secret.data, undefined);
    const nullable = graphqlAdapter(schema, '{ user(id:"x"){ age } count }', {
      fieldsIdentity: 'error/v1',
      fields: {
        'User.age': () => {
          throw new Error('private-diagnostic');
        },
      },
    });
    const n = nullable.result();
    assert.equal(n.data.user.age, null);
    assert.equal(n.data.count, 0);
    assert.equal(JSON.stringify(n).includes('private-diagnostic'), false);
  });
  it('supports mutations and individual subscription event response fixtures without side effects', () => {
    const mutation = graphqlAdapter(
      schema,
      'mutation Update($id:ID!,$name:String!){ update(id:$id,name:$name){id name} }',
      {
        fieldsIdentity: 'mutation-fixture/v1',
        fields: { 'Mutation.update': ({ args }) => ({ id: args.id, name: args.name }) },
      }
    );
    assert.equal(mutation.metadata.operation, 'mutation');
    assert.equal(mutation.metadata.operationName, 'Update');
    assert.deepEqual(plain(mutation.response({ id: '1', name: 'Ada' }).create()), {
      update: { id: '1', name: 'Ada' },
    });
    const subscription = graphqlAdapter(schema, 'subscription { changed { id name } }');
    assert.equal(subscription.metadata.operation, 'subscription');
    assert.equal(subscription.metadata.network, false);
    assert.equal(typeof subscription.response().create().changed.name, 'string');
    const multi = graphqlAdapter(schema, 'query A { count } query B { ratio }', {
      operationName: 'B',
    });
    assert.equal(multi.response().create().ratio, 0);
  });
  it('supports scalar/enum/list input variation, oneOf inputs and bounded recursive inputs', () => {
    const s =
      'enum E { A B } input Choice @oneOf { id: ID name: String } input Nested { next: Nested name: String! } type Query { item(c:Choice!, n:Nested!, e:E!, f:Float!, b:Boolean!, list:[Int!]!):String }';
    const q =
      'query($c:Choice!,$n:Nested!,$e:E!,$f:Float!,$b:Boolean!,$list:[Int!]!){ item(c:$c,n:$n,e:$e,f:$f,b:$b,list:$list) }';
    const minimal = graphqlAdapter(s, q);
    const input = minimal.variables.create();
    assert.equal(Object.keys(input.c).length, 1);
    assert.equal(input.e, 'A');
    assert.equal(input.f, 0);
    assert.equal(input.b, false);
    assert.deepEqual(input.list, [0]);
    const random = graphqlAdapter(s, q, { profile: 'random', maxDepth: 5, listLength: 2 });
    const stream = random.session(42);
    assert.equal(random.variables.check(random.variables.create(stream)), true);
    const boundary = graphqlAdapter(
      'type Query { item(i:Int!):Int! }',
      'query($i:Int!){item(i:$i)}',
      { profile: 'boundary' }
    );
    assert.ok([-2147483648, 0, 2147483647].includes(boundary.variables.create().i));
    assert.equal(minimal.variables.check({ ...input, c: { id: 'x', name: 'y' } }), false);
    failure(() => graphqlAdapter(s, q, { maxDepth: 0 }).variables.create());
    failure(() => graphqlAdapter(s, q, { maxNodes: 0 }).variables.create());
  });
  it('preserves deterministic named streams and response lists', () => {
    const a = graphqlAdapter(
      schema,
      '{ users(filter:{name:"x"}) { id name age role } flag ratio }',
      { profile: 'random', listLength: 3 }
    );
    const stream = a.session(33);
    const before = stream.snapshot();
    const values = a.response().builder().buildValidatedList(3, stream);
    assert.deepEqual(
      values,
      a.response().builder().buildValidatedList(3, restoreSession(before, a.identity))
    );
    assert.equal(values[0].users.length, 3);
    assert.ok(values[0].users.every((user) => typeof user.age === 'number'));
    assert.equal(typeof values[0].flag, 'boolean');
    const boundary = graphqlAdapter(schema, '{ user(id:"x"){ name age } flag }', {
      profile: 'boundary',
    });
    assert.equal(boundary.response().create().user.name, '');
  });
});

describe('GraphQL native scalars and abstract selections', () => {
  it('retains custom scalar encoded/decoded boundaries and strict output round trips', () => {
    const adapter = graphqlAdapter(
      'scalar DateTime type Query { time(since:DateTime!): DateTime! }',
      'query($since:DateTime!){ time(since:$since) }',
      { scalars: { DateTime: date } }
    );
    assert.equal(typeof adapter.variables.create().since, 'string');
    assert.ok(adapter.variables.builder().buildValidated().since instanceof Date);
    const response = adapter.response(adapter.variables.create());
    const generated = response.builder().buildValidated();
    assert.equal(typeof generated.time, 'string');
    assert.equal(response.check(generated), true);
    assert.equal(response.check({ time: 'not-a-date' }), false);
    assert.equal(response.check({ time: '2026-01-01' }), false);
    const literal = graphqlAdapter(
      'scalar DateTime type Query { time(since:DateTime = "2026-01-01"): DateTime! }',
      '{time(since:"2026-01-01")}',
      { scalars: { DateTime: date } }
    );
    assert.equal(typeof literal.response().create().time, 'string');
    failure(() => graphqlAdapter('scalar DateTime type Query { time: DateTime! }', '{time}'));
  });
  it('selects union/interface variants natively and accepts explicit __typename fixtures', () => {
    const schema =
      'interface Node { id: ID! } type User implements Node { id: ID! name: String! } type Team implements Node { id:ID! title:String! } union Search = User | Team type Query { node:Node! search:Search! }';
    const query =
      '{ node { __typename id ... on User { name } ... on Team { title } } search { __typename ... on User { name } ... on Team { title } } }';
    for (const options of [
      {},
      { abstractTypes: { Node: 'Team', Search: 'Team' } },
      {
        fieldsIdentity: 'mixed/v1',
        fields: {
          'Query.node': () => ({ __typename: 'Team', id: 't', title: 'Team' }),
          'Query.search': () => ({ __typename: 'User', name: 'Ada' }),
        },
      },
    ]) {
      const p = graphqlAdapter(schema, query, options).response();
      const v = p.create();
      assert.equal(p.check(v), true);
    }
    const alias = graphqlAdapter(
      schema,
      '{ node { kind:__typename id ... on User { name } } }'
    ).response();
    assert.equal(alias.check(alias.create()), true);
    failure(() => graphqlAdapter(schema, query, { abstractTypes: { Node: 'Unknown' } }));
    failure(() => graphqlAdapter(schema, query, { abstractTypes: { User: 'Team' } }));
    const invalid = graphqlAdapter(schema, query, {
      fieldsIdentity: 'bad/v1',
      fields: { 'Query.node': () => ({ __typename: 'Unknown' }) },
    }).result();
    assert.ok(invalid.errors.length);
  });
  it('reports callback failures and observes accidentally asynchronous results', async () => {
    const a = graphqlAdapter(schema, '{count}', {
      fieldsIdentity: 'async/v1',
      fields: { 'Query.count': () => Promise.reject(new Error('observed')) },
    });
    assert.ok(a.result().errors.length);
    const custom = { ...date, serialize: () => Promise.reject(new Error('observed')) };
    const s = graphqlAdapter('scalar DateTime type Query { date:DateTime }', '{date}', {
      scalars: { DateTime: custom },
    });
    assert.ok(s.result().errors.length);
    const broken = graphqlAdapter('scalar DateTime type Query { date:DateTime! }', '{date}', {
      scalars: { DateTime: { ...date, serialize: () => ({ x: undefined }) } },
    });
    failure(() => broken.result());
    const getter = graphqlAdapter(schema, '{user(id:"x"){name}}', {
      fieldsIdentity: 'getter/v1',
      fields: {
        'Query.user': () =>
          Object.defineProperty({}, 'name', {
            enumerable: true,
            get() {
              throw new Error('getter ran');
            },
          }),
      },
    });
    assert.ok(getter.result().errors.length);
    await setImmediate();
  });
});

describe('GraphQL budgets and data-only boundaries', () => {
  it('refuses invalid SDL, ambiguous operations and unsupported executable directives', () => {
    for (const [s, q] of [
      ['broken', '{x}'],
      ['type Query { x: Missing }', '{x}'],
      ['type Query { x:Int }', '{unknown}'],
      ['type Query { x:Int }', 'query A {x} query B {x}'],
      ['type Query { x:Int }', '{__schema {queryType{name}}}'],
    ])
      failure(() => graphqlAdapter(s, q));
    failure(() => graphqlAdapter(schema, 'query A{count}', { operationName: 'missing' }));
    failure(() => graphqlAdapter('directive @custom on FIELD type Query {x:Int}', '{x @custom}'));
    failure(() => graphqlAdapter('input Bad { x:Bad! } type Query {x(b:Bad):Int}', '{x}'));
    for (const opts of [
      { profile: 'unsupported' },
      { listLength: -1 },
      { maxDepth: 65 },
      { maxNodes: 100001 },
      { maxTokens: 0 },
      { maxDocumentCharacters: 1 },
      { fields: { 'Query.count': () => 1 } },
      { fieldsIdentity: 'v1', fields: { 'Query.missing': () => 1 } },
      { fieldsIdentity: 'v1', fields: { 'Missing.count': () => 1 } },
      { fieldsIdentity: 'v1', fields: { 'Query.count.extra': () => 1 } },
      { fieldsIdentity: 'v1', fields: { 'Query.count': 1 } },
      { scalars: { Int: date } },
      { scalars: { Missing: date } },
    ])
      failure(() => graphqlAdapter(schema, '{count}', opts));
    for (const fixture of [{}, { ...date, id: 1 }, { ...date, parseOutput: undefined }])
      failure(() =>
        graphqlAdapter('scalar DateTime type Query{date:DateTime}', '{date}', {
          scalars: { DateTime: fixture },
        })
      );
    failure(() => graphqlAdapter({}, '{x}'));
  });
  it('names missing scalars and keeps static validation messages, not fixture values', () => {
    const caught = (run) => {
      try {
        run();
      } catch (error) {
        assert.ok(error instanceof GraphQLFixtureError);
        assert.equal(error.code, 'GRAPHQL_FIXTURE_FAILED');
        return error;
      }
      assert.fail('Expected a GraphQL fixture error');
    };
    const sdl =
      'scalar DateTime scalar Money type Q { at: DateTime total: Money name: String } type Query { q: Q }';
    assert.equal(
      caught(() => graphqlAdapter(sdl, '{ q { name } }', { scalars: { DateTime: date } })).message,
      'Every custom scalar requires its native fixture/coercion hooks; add options.scalars for Money'
    );
    assert.equal(
      caught(() =>
        graphqlAdapter(
          'scalar A scalar B scalar C scalar D scalar E scalar F scalar G type Query { a: A }',
          '{a}'
        )
      ).message,
      'Every custom scalar requires its native fixture/coercion hooks; add options.scalars for A, B, C, D, E and 2 more'
    );
    assert.equal(
      caught(() => graphqlAdapter(sdl, '{ q { name } }', { scalars: { Name: date } })).message,
      'Custom scalar hooks were supplied for "Name", which is not a custom scalar in the schema'
    );
    assert.match(
      caught(() => graphqlAdapter(schema, '{count}', { scalars: { ['X'.repeat(150)]: date } }))
        .message,
      /^Custom scalar hooks were supplied for "X{97}\.\.\.", which is not a custom scalar/
    );
    assert.match(
      caught(() =>
        graphqlAdapter(sdl, '{ q { name } }', {
          scalars: { DateTime: date, Money: { ...date, serialize: undefined } },
        })
      ).message,
      /^Custom scalar Money needs paired versioned generation\/coercion hooks/
    );
    const scalars = { DateTime: date, Money: date };
    const unknown = caught(() => graphqlAdapter(sdl, '{ q { nope } }', { scalars }));
    assert.equal(
      unknown.message,
      'GraphQL operation validation failed: Cannot query field "nope" on type "Q".'
    );
    assert.deepEqual(plain(unknown.issues), [
      { message: 'Cannot query field "nope" on type "Q".', locations: [{ line: 1, column: 7 }] },
    ]);
    const introspection = caught(() =>
      graphqlAdapter(sdl, '{ __schema { types { name } } }', { scalars })
    );
    assert.match(
      introspection.message,
      /^GraphQL operation validation failed: GraphQL introspection has been disabled, .*"__schema"\. \(and 1 more\)$/
    );
    assert.equal(introspection.issues.length, 2);
    const long = caught(() => graphqlAdapter(schema, `{ ${'n'.repeat(400)} }`));
    assert.equal(long.issues[0].message.length, 300);
    assert.ok(long.issues[0].message.endsWith('...'));
    const rootless = caught(() => graphqlAdapter('type Foo { a: Int }', '{a}'));
    assert.equal(
      rootless.message,
      'GraphQL schema validation failed: Query root type must be provided.'
    );
    assert.deepEqual(plain(rootless.issues), [{ message: 'Query root type must be provided.' }]);
    // Variable coercion can repeat the supplied value, so those issues stay redacted.
    const variables = graphqlAdapter(schema, 'query($id: ID!) { user(id: $id) { id } }').variables;
    const issues = variables.issues({ id: { secret: 'PRIVATE_FIXTURE_SENTINEL' } });
    assert.ok(issues.length);
    assert.ok(!JSON.stringify(issues).includes('PRIVATE_FIXTURE_SENTINEL'));
  });
  it('bounds data and native execution without invoking fixture getters', () => {
    const adapter = graphqlAdapter(schema, '{count}');
    const getter = Object.defineProperty({}, 'value', {
      enumerable: true,
      get() {
        throw new Error('get');
      },
    });
    const cycle = {};
    cycle.self = cycle;
    for (const bad of [
      getter,
      cycle,
      [],
      new Date(),
      { x: NaN },
      { x: undefined },
      { x: BigInt(1) },
      { x: new Map() },
      { [Symbol('x')]: 1 },
      { x: Array(1) },
    ]) {
      assert.equal(adapter.variables.check(bad), false);
      assert.equal(adapter.response().check(bad), false);
    }
    const budget = graphqlAdapter(schema, '{user(id:"x"){friends{friends{name}}} count}', {
      maxDepth: 2,
    });
    assert.ok(budget.result().errors.length);
    const nodes = graphqlAdapter(schema, '{count}', { maxNodes: 1 });
    assert.ok(nodes.result().errors.length);
    assert.ok(graphqlAdapter(schema, '{count}', { maxDepth: 0 }).result().errors.length);
    const opts = { profile: 'minimal', fieldsIdentity: 'v1', fields: { 'Query.count': () => 3 } };
    const prepared = graphqlAdapter(schema, '{count}', opts);
    opts.fields['Query.count'] = () => 9;
    opts.profile = 'random';
    assert.equal(prepared.response().create().count, 3);
    failure(() => adapter.response(new Date()));
    assert.equal(adapter.metadata.nativeVersion, '17.0.2');
  });
});
