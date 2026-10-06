# Correlated scenarios

A scenario is an immutable dependency graph of fixture factories. Nodes are
registered in dependency order, with both TypeScript and runtime checks against
missing, duplicate, self, or forward dependencies. That deliberately prevents
cycles before invoking any application callback; cyclic data can still be created
inside an explicitly managed node and captured with `captureFixture`.

```ts
import { createScenario, createSession } from '@mimlet/core';

const checkout = createScenario({ name: 'checkout' })
  .node('customer', [], (_dependencies, session) => ({
    id: session.sequence('customer', 1),
    name: 'Ada',
  }))
  .node('lines', ['customer'], ({ customer }) => [
    { customer, price: 10, quantity: 2 },
    { customer, price: 5, quantity: 1 },
  ])
  .node('total', ['lines'], ({ lines }) =>
    lines.reduce((sum, line) => sum + line.price * line.quantity, 0)
  );

const session = createSession({
  seed: 'regression-42',
  fingerprint: 'checkout/v1',
  provider: 'application-fixtures@1',
});
const fixture = checkout.build(session);
// fixture.total === 25
// fixture.lines[0].customer === fixture.customer
```

Each factory receives only its declared dependencies and a session view scoped by
scenario name and node name. Adding an independent node does not consume another
node's random stream. Scenarios with the same name and node names draw from the same
streams, so give each scenario its own name.

`build()`, `buildList()` and their async variants take the session as an optional
argument, like the schema builders. Without one, each call uses a fresh
`createTestSession()` (seed `1`), so `checkout.build()` equals
`checkout.build(createTestSession())` and a session-less `buildList(3)` returns three
successive fixtures from one shared session. Pass a session to continue it across
scenarios and builders in a test, or to take a snapshot for replay. Dependencies are shallow-readonly and their container is
frozen, but values are not copied: relationships intentionally preserve identity.
Treat dependency values as input and do not mutate them from dependent factories.
Factories remain responsible for fresh values; `cloneFixture`, `withFactory`, and
ordinary builders can be composed inside nodes.

## Overrides and traits

`override(name, factory)` substitutes that node before dependents are computed:

```ts
const vip = checkout.override('customer', () => ({ id: 99, name: 'Grace' }));
const empty = checkout.trait('empty-cart', { lines: () => [] });
// Empty-cart totals are recomputed as zero; other recipes remain unchanged.
```

A replacement is a complete value of the original node type. Downstream nodes
rerun with the replacement. Overriding a derived node replaces that derivation, so
keep its relations explicitly: override and trait factories receive the node's
session and its declared dependencies, as `(session, dependencies)`:

```ts
const deals = createScenario({ name: 'deals' })
  .node('deal', [], (_dependencies, session) => ({ uuid: dealUuids.build(session) }))
  .node('summary', ['deal'], ({ deal }) => ({ uuid: deal.uuid, total: 0 }));

const busy = deals.override('summary', (session, { deal }) => ({
  uuid: deal.uuid, // still the deal's key
  total: session.integer(10, 99),
}));
```

The dependencies are the same frozen container the original node receives, typed
with the node's declared dependencies. A replacement that ignores them, such as
`() => value`, still works. A scenario type declared by hand as `Scenario<T>` does not
know each node's dependencies, so its replacements see every node as optional; add the
third type argument, a map from node name to dependency names such as
`Scenario<T, false, { deal: never; summary: 'deal' }>`, for exact types.

Traits are named maps of node replacement factories. Conflicting traits and
traits applied over explicit overrides fail by default. Use the explicit
`{ replaceConflicts: true }` third argument to select a later trait's value.
Duplicate trait names are rejected. A direct `override` is always an explicit
replacement. Trait definitions are inspected as data properties without calling
getters. The `.describe()` result records names, dependencies, origins, and traits;
it never includes values or application callback source.

## Async execution, failures, and replay

Promise-producing nodes, overrides, or traits yield async-only capability types.
`buildAsync` and `buildListAsync` run in dependency/item order; they do not launch
uncontrolled parallel work. Runtime misuse of a synchronous method observes an
accidental rejected promise before reporting the required async method.

`ScenarioError` identifies the failed node and retains the original cause. Its
own message does not print fixture values. Failed runs may have consumed session
state or application effects; the scenario does not claim transactional rollback.
Restore a snapshot taken before execution to replay controlled session state.
Include recipe and override changes in the consumer-supplied replay fingerprint
or configuration identity. Arbitrary closures cannot be fingerprinted reliably.

Node and list budgets default to 1000 and are checked before execution. Names
are nonempty strings of at most 1024 characters. The name `then` is reserved to
prevent the result container from accidentally becoming a thenable. Other
prototype-like names are stored with safe own-property definitions.

## Rows with loaded relations

A builder for a database row covers the model's own columns. When the code under
test loads a relation (an ORM `include` or `select`), you don't need a scenario:
build the related row with its own builder, take its key from the parent row, and
combine both in a small function:

```ts
const orderWithUser = (order = orders.buildValidated()) => ({
  ...order,
  user: users.with({ id: order.userId }).buildValidated(),
});

ordersRepository.findUnique.mockResolvedValue(orderWithUser());
```

Don't type the function's return as the row type alone. TypeScript checks for
excess properties only on an object literal written directly where a narrower type
is expected, so `mockResolvedValue({ ...order, user })` fails with TS2353 or TS2561
against a row type without `user`, and so does a function declared to return that
row. A value returned from a function or held in a `const` is checked structurally
and passes. Leave the return type inferred, or, when a lint rule such as
`@typescript-eslint/explicit-function-return-type` requires one, name the row with
its relation, such as `Order & { user: User }` with your model types. Use a scenario
when several relations must share generated keys or a session.

A function that returns a scenario can name it the same way: `Scenario<T>` from
`@mimlet/core`, where `T` maps each node name to its value, or `Scenario<T, true>`
when a node, override or trait is async.

## Writing scenarios to a database

A scenario builds rows that already reference each other, which makes it a good
source for test and development databases. The
[database seeding guide](database-seeding.md) writes customer, order and line
rows in one transaction, deterministically and idempotently.
