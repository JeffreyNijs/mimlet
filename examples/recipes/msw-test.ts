import assert from 'node:assert/strict';
import { after, afterEach, before, test } from 'node:test';
import { setupServer } from 'msw/node';
import { api, handlers, orderHandler } from './msw-handlers.js';
import { Order, orders } from './msw-orders.js';

const server = setupServer(...handlers);
before(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
after(() => server.close());

// The code under test: an API client that fetches and parses an order.
async function getOrder(id: string) {
  const response = await fetch(`${api}/orders/${id}`);
  if (!response.ok) {
    throw new Error(`GET order failed with ${response.status}`);
  }
  return Order.parse(await response.json());
}

test('a unit test builds the order it needs', () => {
  const twoMugs = [{ sku: 'MUG', quantity: 2, unitPriceCents: 1200 }];
  const order = orders.with({ lines: twoMugs }).buildValidated('order-1');
  assert.equal(order.totalCents, 2400);
});

test('every build returns new objects', () => {
  const order = orders.buildValidated('order-1');
  order.lines.length = 0;
  assert.notEqual(orders.buildValidated('order-1').lines.length, 0);
});

test('the MSW handler serves the order the unit test builds', async () => {
  assert.deepEqual(await getOrder('order-1'), orders.buildValidated('order-1'));
});

test('one test changes the response with a builder variant', async () => {
  server.use(orderHandler(orders.with({ status: 'cancelled' })));
  assert.equal((await getOrder('order-2')).status, 'cancelled');
});
