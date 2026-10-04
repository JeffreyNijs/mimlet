# Seed a database from scenarios

Integration tests and local development often need connected rows: a customer,
their order and its lines, with a total that matches the lines. This recipe builds
those rows with a [scenario](correlated-scenarios.md), writes them in one
transaction, and gives the same rows for the same seed. Running it twice leaves
the same rows instead of adding duplicates.

<!-- github-only -->

[Read this guide with inline examples](https://jeffreynijs.github.io/mimlet/guide/database-seeding.html),
or open the tested recipe source links below.
<!-- /github-only -->

The recipe writes to SQLite through `node:sqlite`, which is built into Node 22, so
it runs in CI without a database server or a driver package. `node:sqlite` is
still marked experimental and prints an `ExperimentalWarning`. The scenario
and the seeding steps are the same for PostgreSQL or MySQL; only the SQL in the
write step changes. [Prisma and Drizzle](#prisma-and-drizzle) are covered below.

```sh
npm install --save-dev @mimlet/core@0.1.0-beta.2 @mimlet/consumers@0.1.0-beta.2
```

## 1. Describe the rows as a scenario

<!-- recipe:seed-shop -->

[View the tested scenario](../examples/recipes/seed-shop.ts).

`customers` is an ordinary builder. The scenario adds an order and its lines, and
derives the foreign keys and the order total from the nodes they depend on, so an
override of one node keeps the others consistent. Each graph matches one customer
row, one order row and the line rows of that order.

Ids and the unique email come from `session.sequence()`. They are the same for a
given seed and never repeat while the scenario builds rows from one session.
Avoid `Date.now()`, `Math.random()` or database-generated keys in seed data: the
rows would differ on every run and a second run could not find the first run's
rows.

Each scenario node gets its own view of the session, so a node's sequence counts
only that node's rows. A builder called outside the scenario, with a different
session or scope, starts counting at 1 again and can repeat an id. Add rows
through the scenario and the same session, as the tests below do.

## 2. Write a batch in one transaction

<!-- recipe:seed-sqlite -->

[View the tested SQLite seed](../examples/recipes/seed-sqlite.ts).

`persistFixtureBatch` from `@mimlet/consumers` builds and copies the whole batch
before it calls the write function once. If generation fails, nothing has been
written. The batch limit defaults to 1,000 graphs. The shared session is passed in
the context, so the sequences continue across the batch.

The write function makes the seed idempotent:

- **Stable keys.** The same seed gives the same primary keys and unique values.
- **Upsert parents.** Customers and orders are inserted or updated by id.
- **Replace owned children.** An order's lines are deleted and inserted again, so
  lines from an earlier run cannot stay behind and no longer match the total.
- **One transaction.** A failed write rolls back the whole batch.

The seed only adds or updates rows. Rows from an earlier run with a different seed
or a larger count stay in the database. To start over, delete the database file or
empty the tables before seeding.

## 3. Seed integration tests

<!-- recipe:seed-test -->

[View the tested integration tests](../examples/recipes/seed-test.ts).

Each test opens its own in-memory database, so tests need no cleanup and do not
share rows. To add rows for one test, continue the session that seeded the
database and override the node that should point at an existing row. The new
order gets the next free id and the seeded customer's id as its foreign key.

With a database server, keep the seed function and change the isolation: open a
transaction per test and roll it back afterwards, or give each test worker its own
schema or database. Seed inside that boundary, with a session per test.

## 4. Seed a local development database

<!-- recipe:seed-dev -->

[View the tested development seed](../examples/recipes/seed-dev.ts).

Run it after your migrations, for example from a package script. Running it again
with the same seed and count leaves the same rows, so it is safe to run on every
start. Use a different seed for a different data set.

## Determinism

The same seed and count give the same rows for the same recipe code and package
versions. Editing a factory, for example adding a `pick()` call, can change the
data that factory produces. Adding a scenario node does not change the other
nodes' values, because each node draws from its own stream. When a seeded test
fails, keep its seed and count to reproduce the rows. For the general rules,
including session snapshots, see [sessions and replay](sessions-and-replay.md).

## Prisma and Drizzle

The scenario does not change. Its fields use the camelCase names that Prisma and
Drizzle models usually have, so each node's value can often be passed as the row
data directly. Only the write function changes:

| Step                   | `node:sqlite` (tested here)                  | Prisma                                                                                   | Drizzle                                                                                             |
| ---------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| One transaction        | `BEGIN`, then `COMMIT` or `ROLLBACK`         | `prisma.$transaction(async (tx) => { ... })`                                             | `db.transaction(async (tx) => { ... })`                                                             |
| Upsert a parent        | `INSERT ... ON CONFLICT (id) DO UPDATE SET`  | `tx.customer.upsert({ where: { id: customer.id }, create: customer, update: customer })` | `tx.insert(customers).values(customer).onConflictDoUpdate({ target: customers.id, set: customer })` |
| Replace owned children | `DELETE FROM order_lines WHERE order_id = ?` | `tx.orderLine.deleteMany({ where: { orderId: order.id } })`                              | `tx.delete(orderLines).where(eq(orderLines.orderId, order.id))`                                     |
| Insert the children    | `INSERT INTO order_lines ...`                | `tx.orderLine.createMany({ data: lines })`                                               | `tx.insert(orderLines).values(lines)`                                                               |

Keep the batch step: call `persistFixtureBatch` with your ORM client in the
context and do the writes above in its write function. Drizzle on MySQL uses
`onDuplicateKeyUpdate` instead of `onConflictDoUpdate`. Write parents before
children so foreign keys exist when a child row is inserted.

This repository does not install Prisma or Drizzle, so the calls in this table
are not run by its tests. Check them against the documentation of your ORM
version.

## How this is tested

`pnpm test:examples`, which CI runs on Node 22.18, compiles these files against
packed Mimlet packages and runs the integration tests above as written. It also
checks that different seeds give different rows with valid foreign keys, that a
failed write rolls back, that an oversized batch writes nothing, and that the
development seed gives the same rows on a second run against a database file.

See the [consumers package](../packages/consumers/README.md) for the
`persistFixtureBatch` contract, and [serve fixtures from MSW](mock-service-worker.md)
for using fixtures in HTTP mocks and previews.
