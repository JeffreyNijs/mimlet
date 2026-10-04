import { fixtureLoader, jsonResponseResolver, persistFixtureBatch } from '@mimlet/consumers';
declare function expectType<T>(value: T): void;
const loader = fixtureLoader('user', (context: { id: string }) => ({ id: context.id, age: 42 }));
expectType<Promise<{ user: { id: string; age: number } }>>(loader({ id: 'one' }));
// @ts-expect-error Context cannot lose required fields.
loader({});
const response = jsonResponseResolver((request) => ({ method: request.method }));
expectType<Promise<Response>>(response(new Request('https://example.invalid')));
// @ts-expect-error A native Request is required, not a URL string.
response('https://example.invalid');
// DOM projects keep passing their own HeadersInit values.
declare const init: HeadersInit;
jsonResponseResolver(() => ({}), { headers: init });
const result = persistFixtureBatch(
  2,
  (index, ctx: { prefix: string }) => ({ id: ctx.prefix + index }),
  (values, ctx) => ({ ids: values.map((v) => v.id), prefix: ctx.prefix }),
  { prefix: 'u' }
);
expectType<Promise<{ ids: string[]; prefix: string }>>(result);
persistFixtureBatch(
  1,
  () => 1,
  (values) => {
    // @ts-expect-error Persistence cannot mutate the readonly batch array.
    return values.push(2);
  },
  {}
);
// @ts-expect-error Clone hooks must return the fixture type.
fixtureLoader('u', () => ({ id: 'one' }), { clone: () => 'wrong' });
