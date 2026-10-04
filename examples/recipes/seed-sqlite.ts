import { DatabaseSync } from 'node:sqlite';
import { persistFixtureBatch } from '@mimlet/consumers';
import type { GenerationSession } from '@mimlet/core';
import { shop, type Shop } from './seed-shop.js';

export function openShopDatabase(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL REFERENCES customers (id),
      total_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_lines (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders (id),
      sku TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price_cents INTEGER NOT NULL
    );
  `);
  return db;
}

// Upsert customers and orders by id and replace each order's lines, so writing
// the same graphs again leaves the same rows. One transaction: all or nothing.
export function writeShops(db: DatabaseSync, shops: readonly Shop[]) {
  const customer = db.prepare(`
    INSERT INTO customers (id, name, email) VALUES (?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET name = excluded.name, email = excluded.email`);
  const order = db.prepare(`
    INSERT INTO orders (id, customer_id, total_cents) VALUES (?, ?, ?)
    ON CONFLICT (id) DO UPDATE SET
      customer_id = excluded.customer_id, total_cents = excluded.total_cents`);
  const clearLines = db.prepare('DELETE FROM order_lines WHERE order_id = ?');
  const line = db.prepare(`
    INSERT INTO order_lines (id, order_id, sku, quantity, unit_price_cents)
    VALUES (?, ?, ?, ?, ?)`);
  db.exec('BEGIN');
  try {
    for (const graph of shops) {
      customer.run(graph.customer.id, graph.customer.name, graph.customer.email);
      order.run(graph.order.id, graph.order.customerId, graph.order.totalCents);
      clearLines.run(graph.order.id);
      for (const item of graph.lines) {
        line.run(item.id, item.orderId, item.sku, item.quantity, item.unitPriceCents);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// Build every graph before the first write, then hand them over in one call.
export function seedShop(db: DatabaseSync, session: GenerationSession, count: number) {
  return persistFixtureBatch(
    count,
    (_index, context) => shop.build(context.session),
    (shops, context) => {
      writeShops(context.db, shops);
      return shops;
    },
    { db, session }
  );
}
