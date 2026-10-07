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
keep its relations explicitly, or [patch the node](#patches-change-a-node-and-keep-its-derivation)
to change only its value: override and trait factories receive the node's
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
traits applied over explicit overrides or patches fail by default. Use the explicit
`{ replaceConflicts: true }` third argument to select a later trait's value.
Duplicate trait names are rejected. A direct `override` is always an explicit
replacement. Trait definitions are inspected as data properties without calling
getters. The `.describe()` result records names, dependencies, origins, patch counts
and traits; it never includes values or application callback source.

## Patches: change a node and keep its derivation

To vary one field of a derived node, an override has to repeat the derivation:
every caller that wants a lost deal rebuilds it with the lead's key. `patch(name, patcher)`
keeps the node's factory and changes the value it built (for class instances, pass the
fields instead; see [below](#patch-fields-of-class-instances)):

```ts
const crm = createScenario({ name: 'crm' })
  .node('lead', [], (_dependencies, session) => leads.build(session))
  .node('deal', ['lead'], ({ lead }, session) => deals.withLeadUuid(lead.uuid).build(session))
  .node('summary', ['deal'], ({ deal }) => ({ deal: deal.uuid, status: deal.status }));

const lost = crm.patch('deal', (deal) => ({ ...deal, status: 'lost' }));
const fixture = lost.build();
// fixture.deal.leadUuid === fixture.lead.uuid, from the node's own factory
// fixture.summary.status === 'lost': dependents see the patched value
```

The patcher runs after the node's factory and before any dependent node. It receives
the value, the node's declared dependencies and the node's session, as
`(value, dependencies, session)`, and returns the node's value with the same type, so a
literal such as `'lost'` needs no `as const`. A session draw in a patcher continues the
node's own stream after the factory's draws.

- **Order.** Patches run in the order they were added. `patch()` returns a new scenario
  and leaves the original unchanged.
- **Overrides and traits.** A patch added after an override or a trait changes the
  replacement's value. An override added after a patch replaces the whole node, patches
  included. A trait that would replace a patched node fails with `SCENARIO_CONFLICT`
  unless it passes `{ replaceConflicts: true }`, which also drops the patches.
- **Async.** An async patcher makes the scenario async-only, like an async node. A
  patcher on an async node receives the resolved value in `buildAsync()`; a synchronous
  `build()` reports the async node before any patcher runs.
- **Values.** Return a new value, such as a spread copy of a plain record. Like a factory, a
  patcher should not change its dependencies.
- **Failures.** An error in a patcher is a `SCENARIO_EXECUTION` error for the node; its
  message names the patch, as in `Scenario node "deal" failed in patch 2: ...`.

### Patch fields of class instances

A spread copy of a class instance, such as an entity from `createInstanceBuilder()`, is a
plain object. TypeScript accepts it for a class without methods, so the node would silently
stop being a `Deal`, and `Object.assign(deal, { stauts: 'sent' })` accepts a misspelled key.
Pass the changed fields instead of a function:

```ts
const sent = crm.patch('deal', { status: 'sent' });
sent.build().deal instanceof Deal; // true
crm.patch('deal', { stauts: 'sent' }); // compile error: 'stauts' does not exist
```

The fields are typed as a partial of the node's data fields, as `InstanceInput` reads a class:
no methods, no fields typed `never`, and literals need no `as const`. Each build copies the
node's value with the fields set and never changes the value the factory built:

- The copy has the same prototype, so `instanceof`, getters and methods keep working, and the
  same own properties, including non-enumerable and symbol keys. A frozen, sealed or
  non-extensible value gives a copy in the same state.
- A field is set the way `createInstanceBuilder()` sets a record's field: through a setter on
  the class when there is one, and a value for a getter without a setter fails the node
  (`label is computed by Deal ...`).
- No constructor runs, as with `construct: 'prototype'`, so `#private` fields do not exist on
  the copy. For such a class, return a new instance from a patcher function.
- The fields are read once, when `patch()` is called, and copied shallowly. The form works for
  plain records too, and it is synchronous, so it keeps a synchronous scenario synchronous.
- Arrays, dates and other built-in values have no fields to set; the types reject them, and a
  value that turns out not to be a record or an instance at runtime (such as `null` for a
  nullable node) fails the node.

A patcher function that returns a plain object for a class instance fails the node with
`A patch of deal returned a plain object in place of a Deal instance`, as a transform after
`createInstanceBuilder()` fails for a spread copy. Changing the instance in place with
`Object.assign` or returning another instance of the class still works.

## Async execution, failures, and replay

Promise-producing nodes, overrides, patches, or traits yield async-only capability types.
`buildAsync` and `buildListAsync` run in dependency/item order; they do not launch
uncontrolled parallel work. Runtime misuse of a synchronous method observes an
accidental rejected promise before reporting the required async method.

`ScenarioError` identifies the failed node in `node` and retains the original error
in `cause`. Its message names the node, the step that failed and the cause's
message, on one line and cut at 200 characters:

```text
Scenario node "deal" failed in patch 1: A patch of deal returned a plain object in place of a Deal instance; pass the changed fields, as in patch('deal', { ... }), to keep the class, or return a Deal
```

The step is the node's factory (no step in the message), `in its override`,
`in trait "name"` or `in patch 2` (counted from 1). When a dependency fails, the
message names the dependency, because the nodes after it never run. A
`BuilderValidationError` cause keeps fixture values out, as its own message names
paths only, and so do Mimlet's other errors; an error your factory or patcher throws
appears as you wrote it. A thrown string is used as the message; other thrown values
add nothing. Definition and conflict errors end with the node's name, as in
`Duplicate scenario node: "deal"`. Before `0.1.0-beta.7`, every node failure had the
message `Scenario node failed`. Failed runs may have consumed session
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
when a node, override, patch or trait is async.

## Writing scenarios to a database

A scenario builds rows that already reference each other, which makes it a good
source for test and development databases. The
[database seeding guide](database-seeding.md) writes customer, order and line
rows in one transaction, deterministically and idempotently.
