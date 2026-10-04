import { expect, it } from 'vitest';
import { graphqlAdapter } from '../../packages/graphql/src/index.js';
it('retains aliases, input defaults and selected response fields', () => {
  const adapter = graphqlAdapter(
    'type Query { echo(value: Int! = 3): Int! }',
    'query($n: Int! = 5) { result: echo(value:$n) }'
  );
  const variables = adapter.variables.builder().buildValidated();
  expect(variables).toEqual({ n: 5 });
  const response = adapter.response(variables);
  expect(response.check({ result: 7 })).toBe(true);
  expect(response.check({ echo: 7 })).toBe(false);
});

it('shares one default session across session-less variable and response lists', () => {
  const adapter = graphqlAdapter(
    'type Query { echo(value: Int!): Int! }',
    'query($n: Int!) { echo(value: $n) }',
    { profile: 'random' }
  );
  for (const builder of [adapter.variables.builder(), adapter.response({ n: 1 }).builder()]) {
    const list = builder.buildList(4);
    expect(new Set(list.map((value) => JSON.stringify(value))).size).toBe(4);
    expect(list).toEqual(builder.buildList(4, adapter.session()));
    expect(builder.build()).toEqual(list[0]);
  }
});

it('names a missing custom scalar and keeps operation validation messages', () => {
  const sdl = 'scalar DateTime type Shipment { at: DateTime! } type Query { shipment: Shipment }';
  expect(() => graphqlAdapter(sdl, '{ shipment { at } }')).toThrow(
    /add options\.scalars for DateTime$/
  );
  expect(() => graphqlAdapter('type Query { count: Int }', '{ nope }')).toThrow(
    'GraphQL operation validation failed: Cannot query field "nope" on type "Query".'
  );
});
