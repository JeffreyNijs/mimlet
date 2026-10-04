import { createBuilder, createScenario, createSession } from '@mimlet/core';
import type { GenerationSession } from '@mimlet/core';

const products = [
  { sku: 'MUG', unitPriceCents: 1200 },
  { sku: 'TEE', unitPriceCents: 2500 },
  { sku: 'CAP', unitPriceCents: 1800 },
];

// Ids and unique columns come from a session sequence: the same for a seed,
// and never repeated while the scenario below builds rows from one session.
export const customers = createBuilder((session: GenerationSession) => {
  const number = session.sequence('customer', 1);
  return {
    id: `customer-${number}`,
    name: session.pick(['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Katherine Johnson']),
    email: `customer-${number}@example.test`,
  };
});

// One customer, one order and its lines. Foreign keys and the total are derived.
export const shop = createScenario({ name: 'shop' })
  .node('customer', [], (_, session) => customers.build(session))
  .node('items', [], (_, session) =>
    Array.from({ length: session.integer(1, 3) }, () => ({
      ...session.pick(products),
      quantity: session.integer(1, 4),
    }))
  )
  .node('order', ['customer', 'items'], ({ customer, items }, session) => ({
    id: `order-${session.sequence('order', 1)}`,
    customerId: customer.id,
    totalCents: items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0),
  }))
  .node('lines', ['order', 'items'], ({ order, items }) =>
    items.map((item, index) => ({ id: `${order.id}-${index + 1}`, orderId: order.id, ...item }))
  );

export type Shop = ReturnType<typeof shop.build>;

export const shopSession = (seed: string) =>
  createSession({ seed, fingerprint: 'shop-seed/v1', provider: 'shop-fixtures@1' });
