import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatabaseSync } from 'node:sqlite';
import { shop, shopSession } from './seed-shop.js';
import { openShopDatabase, seedShop, writeShops } from './seed-sqlite.js';

const allRows = (db: DatabaseSync) =>
  ['customers', 'orders', 'order_lines'].map((table) =>
    db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()
  );

test('the same seed writes the same rows', async () => {
  const first = openShopDatabase();
  const second = openShopDatabase();
  await seedShop(first, shopSession('integration'), 5);
  await seedShop(second, shopSession('integration'), 5);
  assert.deepEqual(allRows(first), allRows(second));
});

test('seeding twice leaves the same rows', async () => {
  const db = openShopDatabase();
  await seedShop(db, shopSession('integration'), 5);
  const before = allRows(db);
  await seedShop(db, shopSession('integration'), 5);
  assert.deepEqual(allRows(db), before);
});

test('every order total matches its lines', async () => {
  const db = openShopDatabase();
  await seedShop(db, shopSession('integration'), 5);
  const mismatched = db
    .prepare(
      `SELECT orders.id FROM orders JOIN order_lines ON order_lines.order_id = orders.id
       GROUP BY orders.id
       HAVING orders.total_cents <> SUM(order_lines.quantity * order_lines.unit_price_cents)`
    )
    .all();
  assert.deepEqual(mismatched, []);
});

test('a test adds an order for a seeded customer', async () => {
  const db = openShopDatabase();
  const session = shopSession('integration');
  const [seeded] = await seedShop(db, session, 2);
  assert.ok(seeded);
  // Continue the same session, so the new order gets the next free id.
  const repeat = shop.override('customer', () => seeded.customer).build(session);
  writeShops(db, [repeat]);
  const count = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE customer_id = ?');
  assert.equal(count.get(seeded.customer.id)?.n, 2);
});
