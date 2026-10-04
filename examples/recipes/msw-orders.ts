import { z } from 'zod';
import { createSession } from '@mimlet/core';
import { fromZodFactory } from '@mimlet/zod';

// The JSON your API sends. Validated output is the response body.
export const Order = z.object({
  id: z.string(),
  status: z.enum(['open', 'paid', 'cancelled']),
  customer: z.object({ name: z.string(), email: z.email() }),
  lines: z
    .array(z.object({ sku: z.string(), quantity: z.int().min(1), unitPriceCents: z.int().min(0) }))
    .min(1),
  totalCents: z.int().min(0),
});

const products = [
  { sku: 'MUG', unitPriceCents: 1200 },
  { sku: 'TEE', unitPriceCents: 2500 },
  { sku: 'CAP', unitPriceCents: 1800 },
];

// The id seeds the session: the same id always gives the same order, and
// every build returns new objects. The total is a transform, which runs
// after with(), so an order with changed lines keeps a matching total.
export const orders = fromZodFactory(Order, (id: string) => {
  const session = createSession({ seed: id, fingerprint: 'orders/v1', provider: 'shop-mocks@1' });
  return {
    id,
    status: 'open',
    customer: {
      name: session.pick(['Ada Lovelace', 'Grace Hopper', 'Alan Turing']),
      email: `${id}@example.test`,
    },
    lines: Array.from({ length: session.integer(1, 3) }, () => ({
      ...session.pick(products),
      quantity: session.integer(1, 4),
    })),
    totalCents: 0,
  };
}).transform((order) => ({
  ...order,
  totalCents: order.lines.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0),
}));
