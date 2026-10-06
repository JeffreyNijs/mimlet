import { createScenario, createSession } from '../src/index.js';
declare function expectType<T>(value: T): void;
const session = createSession({ seed: 1, fingerprint: 'cart/v1', provider: 'fixtures@1' });
const cart = createScenario()
  .node('customer', [], (_deps, s) => ({ id: s.sequence('id'), name: 'Ada' }))
  .node('lines', ['customer'], ({ customer }) => [{ owner: customer.id, quantity: 2, price: 3 }])
  .node('total', ['lines'], ({ lines }) =>
    lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  );
expectType<number>(cart.build(session).total);
expectType<string>(cart.build(session).customer.name);
cart.override('customer', () => ({ id: 42, name: 'Grace' }));
cart.trait('large', { lines: () => [{ owner: 1, price: 10, quantity: 100 }] });
// @ts-expect-error Dependencies must name already-declared nodes.
createScenario().node('broken', ['later'], () => 1);
// @ts-expect-error Duplicate node names cannot silently change the inferred output.
cart.node('customer', [], () => 1);
// @ts-expect-error Scenario result cannot accidentally become a thenable.
createScenario().node('then', [], () => 1);
// @ts-expect-error An override cannot change the node's type.
cart.override('customer', () => ({ id: 'x', name: 'Grace' }));
// @ts-expect-error Traits cannot replace unknown nodes.
cart.trait('wrong', { unrelated: () => 1 });
// @ts-expect-error Traits cannot lose required data.
cart.trait('wrong', { customer: () => ({ id: 1 }) });
cart.node('private-deps', ['total'], (deps) => {
  // @ts-expect-error A node can only see declared dependencies.
  expectType<unknown>(deps.customer);
  // @ts-expect-error The dependency container is readonly.
  deps.total = 1;
  return deps.total;
});
const asyncCart = cart.node('external', ['customer'], async ({ customer }) => customer.name);
expectType<
  Promise<{
    customer: { id: number; name: string };
    lines: { owner: number; quantity: number; price: number }[];
    total: number;
    external: string;
  }>
>(asyncCart.buildAsync(session));
// @ts-expect-error Async nodes do not expose synchronous build capabilities.
asyncCart.build(session);
const asyncOverride = cart.override('total', async () => 10);
// @ts-expect-error Async overrides retain the async-only capability.
asyncOverride.build(session);
const asyncTrait = cart.trait('delayed', { total: async () => 10 });
// @ts-expect-error Async trait replacements make the whole recipe async-only.
asyncTrait.build(session);
const unknownNode = cart.node('dynamic', [], (): unknown => 1);
// @ts-expect-error Unknown return types might be asynchronous; choose the async path.
unknownNode.build(session);
const emptyTrait = cart.trait('named', {});
expectType<number>(emptyTrait.build(session).total);

// patch() keeps the node's derivation and type; literal types need no `as const`.
interface Deal {
  uuid: string;
  leadUuid: string;
  status: 'open' | 'won' | 'lost';
}
const dealOf = (leadUuid: string): Deal => ({ uuid: 'deal-1', leadUuid, status: 'open' });
const crm = createScenario()
  .node('lead', [], (_deps, s) => ({ uuid: `lead-${s.sequence('lead')}` }))
  .node('deal', ['lead'], ({ lead }) => dealOf(lead.uuid))
  .node('summary', ['deal'], ({ deal }) => ({ status: deal.status }));
const lost = crm.patch('deal', (deal, { lead }, s) => {
  expectType<Deal>(deal);
  expectType<string>(lead.uuid);
  expectType<number>(s.integer(1, 2));
  return { ...deal, status: 'lost' };
});
expectType<'open' | 'won' | 'lost'>(lost.build(session).summary.status);
expectType<typeof crm>(lost);
crm.patch('deal', (deal, dependencies) => {
  // @ts-expect-error A patch only receives the node's declared dependencies.
  void dependencies.summary;
  return deal;
});
// @ts-expect-error A patch keeps the node's type.
crm.patch('deal', (deal) => ({ ...deal, status: 'closed' }));
// @ts-expect-error A patch must return the whole value.
crm.patch('deal', () => ({ status: 'lost' }));
// @ts-expect-error A patch names an existing node.
crm.patch('unknown', (value) => value);
// Patches chain with overrides, traits and further nodes.
expectType<string>(
  crm
    .override('lead', () => ({ uuid: 'lead-9' }))
    .patch('lead', (lead) => ({ uuid: `${lead.uuid}!` }))
    .trait('won', { summary: () => ({ status: 'won' }) })
    .node('label', ['deal'], ({ deal }) => deal.uuid)
    .build(session).label
);
const asyncPatch = crm.patch('deal', async (deal) => ({ ...deal, status: 'won' }));
expectType<Promise<'open' | 'won' | 'lost'>>(
  asyncPatch.buildAsync(session).then((value) => value.deal.status)
);
// @ts-expect-error An async patch makes the scenario async-only.
asyncPatch.build(session);
// A sync patch on an async scenario stays async-only.
const asyncThenPatched = asyncCart.patch('external', (name) => name.toUpperCase());
// @ts-expect-error The scenario was already async.
asyncThenPatched.build(session);

// A function returning a scenario can declare its return type with the exported Scenario type.
import type { Scenario } from '../src/index.js';
interface CartNodes {
  customer: { id: number; name: string };
  lines: { owner: number; quantity: number; price: number }[];
  total: number;
}
function namedCart(): Scenario<CartNodes> {
  return cart;
}
const named: Scenario<CartNodes> = cart;
const inferred: typeof cart = named;
expectType<number>(inferred.build(session).total);
expectType<string>(
  namedCart()
    .override('customer', () => ({ id: 7, name: 'Lin' }))
    .build(session).customer.name
);
expectType<number>(
  namedCart()
    .node('count', ['lines'], ({ lines }) => lines.length)
    .build(session).count
);
// @ts-expect-error The declared node types stay checked.
namedCart().override('total', () => 'free');
function namedAsyncCart(): Scenario<CartNodes & { external: string }, true> {
  return asyncCart;
}
expectType<Promise<string>>(
  namedAsyncCart()
    .buildAsync(session)
    .then((value) => value.external)
);
// @ts-expect-error A scenario declared async exposes only the async methods.
namedAsyncCart().build(session);
// @ts-expect-error An async scenario cannot be declared synchronous.
const _notSync: Scenario<CartNodes & { external: string }> = asyncCart;
