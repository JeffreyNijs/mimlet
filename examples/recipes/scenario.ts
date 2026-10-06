import { createScenario, createSession } from '@mimlet/core';

export const checkout = createScenario({ name: 'checkout' })
  .node('customer', [], (_, session) => ({ id: `user-${session.sequence('id', 1)}` }))
  .node('lines', [], () => [{ quantity: 2, priceCents: 1500 }])
  .node('order', ['customer', 'lines'], ({ customer, lines }) => ({
    customerId: customer.id,
    totalCents: lines.reduce((sum, line) => sum + line.quantity * line.priceCents, 0),
  }));

export const shop = checkout.build(
  createSession({ seed: 42, fingerprint: 'checkout/v1', provider: 'my-test@1' })
);
// shop.order.customerId === shop.customer.id; shop.order.totalCents === 3000.

// patch() changes one node's value and keeps its derivation: the order still belongs to the
// customer, and nodes that depend on the order see the patched value.
export const discounted = checkout
  .patch('order', (order) => ({ ...order, totalCents: order.totalCents - 500 }))
  .node('invoice', ['order'], ({ order }) => ({ dueCents: order.totalCents }))
  .build(createSession({ seed: 42, fingerprint: 'checkout/v1', provider: 'my-test@1' }));
// discounted.order.customerId === discounted.customer.id; discounted.invoice.dueCents === 2500.
