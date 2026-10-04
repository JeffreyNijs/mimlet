/**
 * Starting programs for the docs sandbox. They follow the docs and the demo videos
 * (scripts/video/videos), and tests/unit/docs-sandbox.test.ts runs every one of them.
 * Keep them plain JavaScript: the sandbox does not strip TypeScript.
 */
export interface SandboxPreset {
  readonly id: string;
  readonly label: string;
  readonly summary: string;
  /** Docs route, without the base path. */
  readonly guide: string;
  readonly guideLabel: string;
  readonly source: string;
}

export const presets: readonly SandboxPreset[] = [
  {
    id: 'zod',
    label: 'Zod: build and validate',
    summary:
      'fromZod(...).with(...).buildValidated(). The last line breaks the schema on purpose, so you can see a validation error and its path.',
    guide: '/guide/zod-and-arktype.html',
    guideLabel: 'Zod and ArkType guide',
    source: `import { z } from 'zod';
import { fromZod } from '@mimlet/zod';

const User = z.object({
  name: z.string().min(1),
  email: z.email(),
  age: z.number().int().min(18).max(99),
});

const users = fromZod(User);

// Set the fields your test cares about. Mimlet generates the rest from
// the schema, and buildValidated() checks the result with Zod.
console.log(users.with({ name: 'Ada' }).buildValidated());

// This age breaks the schema, so the run ends with a validation error
// that names the field. Change 12 to 42 and run it again.
console.log(users.with({ age: 12 }).buildValidated());
`,
  },
  {
    id: 'fluent',
    label: 'Named setters with fluent()',
    summary:
      'fluent() adds withName() and withRole() to a schema builder, so there is no builder file to keep in step with the schema.',
    guide: '/guide/fluent-builders.html',
    guideLabel: 'Named setters guide',
    source: `import { fluent } from '@mimlet/core';
import { fromZod } from '@mimlet/zod';
import { z } from 'zod';

const User = z.object({
  name: z.string(),
  role: z.enum(['reader', 'admin']),
  email: z.email(),
});

// Pick the fields that get setters.
const users = fluent(fromZod(User), ['name', 'role']);

console.log(users.withName('Ada').withRole('reader').buildValidated());

// Builders never change in place, so a shared base is safe to reuse.
const admins = users.withRole('admin');
console.log(admins.buildList(2));

// In TypeScript, withRole('owner') does not compile. Here, validation catches it.
try {
  users.withRole('owner').buildValidated();
} catch (error) {
  console.log(error.code, error.issues.map((issue) => issue.message));
}
`,
  },
  {
    id: 'scenario',
    label: 'Connected scenario: customer, order, lines',
    summary:
      'A scenario describes each piece once, with the pieces it depends on. Override one piece and everything that depends on it is rebuilt to match.',
    guide: '/guide/correlated-scenarios.html',
    guideLabel: 'Correlated scenarios guide',
    source: `import { createScenario, createSession } from '@mimlet/core';

const shop = createScenario({ name: 'shop' })
  .node('customer', [], () => ({ id: 'customer-1', name: 'Ada' }))
  .node('items', [], () => [
    { sku: 'TEE', quantity: 2, priceCents: 1500 },
    { sku: 'PIN', quantity: 1, priceCents: 500 },
  ])
  .node('order', ['customer', 'items'], ({ customer, items }) => ({
    id: 'order-1',
    customerId: customer.id,
    totalCents: items.reduce((sum, item) => sum + item.quantity * item.priceCents, 0),
  }))
  .node('lines', ['order', 'items'], ({ order, items }) =>
    items.map((item, index) => ({ id: 'line-' + (index + 1), orderId: order.id, ...item }))
  );

const session = () =>
  createSession({ seed: 42, fingerprint: 'shop/v1', provider: 'shop-test@1' });

console.log(shop.build(session()));

// Three tees instead of two. The order total and the lines follow.
const threeTees = shop.override('items', () => [
  { sku: 'TEE', quantity: 3, priceCents: 1500 },
  { sku: 'PIN', quantity: 1, priceCents: 500 },
]);
const { order, lines } = threeTees.build(session());
console.log(order.totalCents, lines.map((line) => line.quantity));
`,
  },
  {
    id: 'valibot',
    label: 'Valibot adapter',
    summary:
      'The same builder API with a Valibot schema. The last line sets a nested value that breaks the schema, and the error names the full path.',
    guide: '/guide/adapters.html',
    guideLabel: 'Choose an adapter',
    source: `import * as v from 'valibot';
import { fromValibot } from '@mimlet/valibot';

const Delivery = v.object({
  id: v.pipe(v.string(), v.uuid()),
  status: v.picklist(['OUT_FOR_DELIVERY', 'DELIVERED']),
  attempts: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3)),
  address: v.object({
    city: v.pipe(v.string(), v.minLength(1)),
    postcode: v.pipe(v.string(), v.regex(/^[0-9]{4}$/)),
  }),
});

const deliveries = fromValibot(Delivery);

console.log(deliveries.with({ status: 'DELIVERED' }).buildValidated());
console.log(deliveries.buildList(3).map((delivery) => delivery.address.postcode));

// with() replaces the whole address, and this postcode breaks the schema.
console.log(
  deliveries.with({ address: { city: 'Ghent', postcode: '90A' } }).buildValidated()
);
`,
  },
];
