/** Connected data: one scenario keeps customer, order and lines consistent through overrides. */
import type { Cue } from '../audio.ts';
import {
  box,
  captions,
  chrome,
  code,
  color,
  ease,
  estimateSans,
  frameSvg,
  glidePoint,
  line,
  midline,
  MONO,
  monoWidth,
  pill,
  place,
  popIn,
  presence,
  span,
  step,
  text,
  typing,
  verdict,
  wordmark,
  type Beat,
  type CodeLayout,
  type Key,
  type Point,
  type Typing,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * The fixtures in the video are this program's output with @mimlet/core 0.1.0-beta.0.
 * Re-run it with `node scripts/video/verify.ts connected-data`.
 */
export const facts = {
  packages: { '@mimlet/core': '0.1.0-beta.0' },
  program: `import { createScenario, createSession } from '@mimlet/core';

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

const session = () => createSession({ seed: 42, fingerprint: 'shop/v1', provider: 'shop-test@1' });
const grace = { id: 'customer-2', name: 'Grace' };
const tees = [
  { sku: 'TEE', quantity: 3, priceCents: 1500 },
  { sku: 'PIN', quantity: 1, priceCents: 500 },
];

console.log(JSON.stringify(shop.build(session())));
const forGrace = shop.override('customer', () => grace);
console.log(JSON.stringify(forGrace.build(session())));
const threeTees = forGrace.override('items', () => tees);
console.log(JSON.stringify(threeTees.build(session())));
console.log(JSON.stringify(shop.build(session())));
`,
  stdout: [
    '{"customer":{"id":"customer-1","name":"Ada"},"items":[{"sku":"TEE","quantity":2,"priceCents":1500},{"sku":"PIN","quantity":1,"priceCents":500}],"order":{"id":"order-1","customerId":"customer-1","totalCents":3500},"lines":[{"id":"line-1","orderId":"order-1","sku":"TEE","quantity":2,"priceCents":1500},{"id":"line-2","orderId":"order-1","sku":"PIN","quantity":1,"priceCents":500}]}',
    '{"customer":{"id":"customer-2","name":"Grace"},"items":[{"sku":"TEE","quantity":2,"priceCents":1500},{"sku":"PIN","quantity":1,"priceCents":500}],"order":{"id":"order-1","customerId":"customer-2","totalCents":3500},"lines":[{"id":"line-1","orderId":"order-1","sku":"TEE","quantity":2,"priceCents":1500},{"id":"line-2","orderId":"order-1","sku":"PIN","quantity":1,"priceCents":500}]}',
    '{"customer":{"id":"customer-2","name":"Grace"},"items":[{"sku":"TEE","quantity":3,"priceCents":1500},{"sku":"PIN","quantity":1,"priceCents":500}],"order":{"id":"order-1","customerId":"customer-2","totalCents":5000},"lines":[{"id":"line-1","orderId":"order-1","sku":"TEE","quantity":3,"priceCents":1500},{"id":"line-2","orderId":"order-1","sku":"PIN","quantity":1,"priceCents":500}]}',
    '{"customer":{"id":"customer-1","name":"Ada"},"items":[{"sku":"TEE","quantity":2,"priceCents":1500},{"sku":"PIN","quantity":1,"priceCents":500}],"order":{"id":"order-1","customerId":"customer-1","totalCents":3500},"lines":[{"id":"line-1","orderId":"order-1","sku":"TEE","quantity":2,"priceCents":1500},{"id":"line-2","orderId":"order-1","sku":"PIN","quantity":1,"priceCents":500}]}',
  ].join('\n'),
};

const T = {
  cardsIn: 0.2,
  handEdit: 1.2,
  graceByHand: 3.25,
  stale: 3.9,
  declare: 7.2,
  orderNode: 7.6,
  linesNode: 9.3,
  built: 11.4,
  override: 14.6,
  overrideTyping: 15.0,
  graceBuilt: 17.6,
  items: 21.0,
  itemsTyping: 21.4,
  teesBuilt: 24.1,
  original: 27.6,
  originalTyping: 28.0,
  originalBuilt: 28.9,
  endIn: 31.6,
  end: 36.5,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Swap the customer, and the order goes stale.',
    subtitle: 'The hand-built order still points at customer-1.',
  },
  {
    at: T.declare,
    title: 'Declare the links once.',
    subtitle: 'createScenario() builds each node from the nodes it depends on.',
  },
  {
    at: T.override,
    title: 'New customer? Override one node.',
    subtitle: 'Everything that depends on the customer is rebuilt to match.',
  },
  {
    at: T.items,
    title: 'Three tees? The total follows.',
    subtitle: 'Override the items, and the order and lines are rebuilt: $50.',
  },
  {
    at: T.original,
    title: 'The original recipe is untouched.',
    subtitle: 'Overrides return a new recipe. shop still builds Ada’s $35 order.',
  },
  { at: T.endIn, title: 'One recipe. Connected test data.' },
];

// ---------------------------------------------------------------------------
// What each node shows over time

interface Item {
  sku: string;
  quantity: number;
  price: number;
}
interface Fixture {
  customer: { id: string; name: string };
  items: Item[];
  /** What the lines show; they follow the items once the dependency pulse arrives. */
  lineItems: Item[];
  customerId: string;
  total: number;
  source: string;
}
const adaItems: Item[] = [
  { sku: 'TEE', quantity: 2, price: 15 },
  { sku: 'PIN', quantity: 1, price: 5 },
];
const teeItems: Item[] = [
  { sku: 'TEE', quantity: 3, price: 15 },
  { sku: 'PIN', quantity: 1, price: 5 },
];
const ada = { id: 'customer-1', name: 'Ada' };
const grace = { id: 'customer-2', name: 'Grace' };

function fixtureAt(t: number): Fixture {
  if (t < T.graceByHand) {
    return {
      customer: ada,
      items: adaItems,
      lineItems: adaItems,
      customerId: ada.id,
      total: 35,
      source: 'HAND-BUILT FIXTURE',
    };
  }
  if (t < T.built) {
    return {
      customer: grace,
      items: adaItems,
      lineItems: adaItems,
      customerId: ada.id,
      total: 35,
      source: 'HAND-BUILT FIXTURE',
    };
  }
  if (t < T.graceBuilt) {
    return {
      customer: ada,
      items: adaItems,
      lineItems: adaItems,
      customerId: ada.id,
      total: 35,
      source: 'BUILT FROM SCENARIO',
    };
  }
  if (t < T.teesBuilt) {
    return {
      customer: grace,
      items: adaItems,
      lineItems: adaItems,
      customerId: grace.id,
      total: 35,
      source: 'OVERRIDE: CUSTOMER',
    };
  }
  if (t < T.originalBuilt) {
    return {
      customer: grace,
      items: teeItems,
      lineItems: teeItems,
      customerId: grace.id,
      total: 50,
      source: 'OVERRIDE: ITEMS',
    };
  }
  return {
    customer: ada,
    items: adaItems,
    lineItems: adaItems,
    customerId: ada.id,
    total: 35,
    source: 'ORIGINAL RECIPE',
  };
}

/** When a node's content last changed, so it can pop. Dependants change after the pulse reaches them. */
const PULSE = 0.45;
const changes = {
  customer: [T.graceByHand, T.built, T.graceBuilt, T.originalBuilt],
  items: [T.teesBuilt, T.originalBuilt],
  order: [T.built, T.graceBuilt + PULSE, T.teesBuilt + PULSE, T.originalBuilt],
  lines: [T.built, T.teesBuilt + PULSE, T.originalBuilt],
};
const lastChange = (times: readonly number[], t: number) =>
  times.reduce((latest, at) => (t >= at ? at : latest), -Infinity);

/** The order and lines only show the rebuilt values once the dependency pulse arrives. */
function shownFixture(t: number): Fixture {
  const now = fixtureAt(t);
  const pending = [T.graceBuilt, T.teesBuilt].find((at) => t >= at && t < at + PULSE);
  if (pending === undefined) {
    return now;
  }
  const before = fixtureAt(pending - 0.01);
  return {
    ...now,
    customerId: before.customerId,
    total: before.total,
    lineItems: before.lineItems,
  };
}

// ---------------------------------------------------------------------------
// Layout

const STRIP = { x: 140, y: 300, width: 1640, height: 140 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 58, size: 34, lineHeight: 52 };
const ITEMS = { x: 640, y: 470, width: 1140, height: 92 };
const NODES_Y = 612;
const NODE_HEIGHT = 250;
const CUSTOMER = { x: 140, width: 420 };
const ORDER = { x: 640, width: 540 };
const LINES = { x: 1260, width: 520 };
const midY = NODES_Y + NODE_HEIGHT / 2;

interface Edge {
  from: Point;
  to: Point;
  /** Times a pulse travels along this edge. */
  pulses: number[];
}
const edges: Record<string, Edge> = {
  customerOrder: {
    from: { x: CUSTOMER.x + CUSTOMER.width + 6, y: midY },
    to: { x: ORDER.x - 8, y: midY },
    pulses: [T.graceBuilt],
  },
  orderLines: {
    from: { x: ORDER.x + ORDER.width + 6, y: midY },
    to: { x: LINES.x - 8, y: midY },
    pulses: [],
  },
  itemsOrder: {
    from: { x: ORDER.x + ORDER.width / 2, y: ITEMS.y + ITEMS.height + 6 },
    to: { x: ORDER.x + ORDER.width / 2, y: NODES_Y - 8 },
    pulses: [T.teesBuilt],
  },
  itemsLines: {
    from: { x: LINES.x + LINES.width / 2, y: ITEMS.y + ITEMS.height + 6 },
    to: { x: LINES.x + LINES.width / 2, y: NODES_Y - 8 },
    pulses: [T.teesBuilt],
  },
};
/** Edges into the order light up when its dependencies are declared, then into the lines. */
const declaredAt: Record<string, number> = {
  customerOrder: T.orderNode + 0.9,
  itemsOrder: T.orderNode + 0.9,
  orderLines: T.linesNode + 0.8,
  itemsLines: T.linesNode + 0.8,
};

function arrow(edge: Edge, t: number, key: string) {
  const declared = t >= (declaredAt[key] ?? Infinity) && t < T.endIn;
  const lit = declared ? ease.out(span(t, declaredAt[key] ?? 0, 0.3)) : 0;
  const stroke = lit > 0 ? color.mint : color.rule;
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const head = `M${edge.to.x - ux * 12 - uy * 8} ${edge.to.y - uy * 12 + ux * 8}L${edge.to.x} ${edge.to.y}L${edge.to.x - ux * 12 + uy * 8} ${edge.to.y - uy * 12 - ux * 8}`;
  const parts = [
    line(edge.from, edge.to, color.rule, 3),
    lit > 0 ? line(edge.from, edge.to, color.mint, 4, lit) : '',
    `<path d="${head}" stroke="${stroke}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
  ];
  for (const at of edge.pulses) {
    if (t >= at && t < at + PULSE) {
      const p = ease.inOut(span(t, at, PULSE));
      const x = edge.from.x + dx * p;
      const y = edge.from.y + dy * p;
      parts.push(
        `<circle cx="${x}" cy="${y}" r="11" fill="${color.mint}" stroke="${color.ink}" stroke-width="3"/>`
      );
    }
  }
  return parts.join('');
}

function label(x: number, y: number, value: string) {
  return text(x, y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 });
}

function nodeCard(
  x: number,
  width: number,
  title: string,
  content: string,
  t: number,
  changed: number
) {
  const grow = ease.back(span(t, changed, 0.3));
  return (
    box(x, NODES_Y, width, NODE_HEIGHT, { radius: 22, fill: color.card, stroke: color.rule }) +
    label(x + 30, NODES_Y + 44, title) +
    place(content, { scale: 0.92 + 0.08 * grow, origin: { x: x + width / 2, y: NODES_Y + 150 } })
  );
}

function valuePill(
  x: number,
  baseline: number,
  value: string,
  tone: 'mint' | 'coral' | 'plain',
  size = 30
) {
  const width = value.length * monoWidth(size) + 28;
  const centreY = baseline - midline(size);
  return {
    width,
    svg:
      box(x, centreY - size * 0.78, width, size * 1.56, {
        radius: 12,
        fill: tone === 'mint' ? color.mintSoft : tone === 'coral' ? color.coralSoft : color.paper,
        stroke: tone === 'mint' ? color.mint : tone === 'coral' ? color.coral : color.rule,
        strokeWidth: 2.5,
      }) + text(x + 14, baseline, value, { size, family: MONO }),
  };
}

function diagram(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const fixture = shownFixture(t);
  // Only the hand-built fixture is stale; a scenario rebuild is merely waiting for its pulse.
  const mismatch = fixture.customerId !== fixture.customer.id;
  const stale = mismatch && fixture.source === 'HAND-BUILT FIXTURE';
  const parts: string[] = [];

  // Items, which both the order and the lines depend on.
  const itemsChanged = lastChange(changes.items, t);
  // Each item is placed on its own, because SVG collapses repeated spaces.
  const itemsContent = fixture.items
    .map((item, index) => {
      const x = ITEMS.x + 150 + index * 430;
      const name = `${item.quantity} × ${item.sku}`;
      return (
        text(x, ITEMS.y + 60, name, { size: 34, family: MONO, weight: 700 }) +
        text(x + name.length * monoWidth(34) + 22, ITEMS.y + 60, `$${item.price}`, {
          size: 34,
          family: MONO,
          fill: color.muted,
        })
      );
    })
    .join('');
  parts.push(
    box(ITEMS.x, ITEMS.y, ITEMS.width, ITEMS.height, {
      radius: 20,
      fill: color.card,
      stroke: color.rule,
    }),
    label(ITEMS.x + 30, ITEMS.y + 56, 'ITEMS'),
    place(itemsContent, {
      scale: 0.94 + 0.06 * ease.back(span(t, itemsChanged, 0.3)),
      origin: { x: ITEMS.x + 500, y: ITEMS.y + 48 },
    })
  );

  // Where the current fixture came from.
  const source = fixture.source;
  const sourceWidth = estimateSans(source, 20, 700, 1.4) + 36;
  parts.push(
    popIn(
      pill({ x: CUSTOMER.x + sourceWidth / 2, y: ITEMS.y + ITEMS.height / 2 }, source, {
        size: 20,
        weight: 700,
        spacing: 1.4,
        background: source === 'HAND-BUILT FIXTURE' ? color.paper : color.mint,
        border: source === 'HAND-BUILT FIXTURE' ? color.rule : undefined,
        fill: source === 'HAND-BUILT FIXTURE' ? color.muted : color.ink,
        height: 44,
        padding: 18,
      }).svg,
      t,
      lastChange([T.cardsIn, T.built, T.graceBuilt, T.teesBuilt, T.originalBuilt], t),
      { x: CUSTOMER.x + sourceWidth / 2, y: ITEMS.y + ITEMS.height / 2 }
    )
  );

  for (const [key, edge] of Object.entries(edges)) {
    parts.push(arrow(edge, t, key));
  }

  // Customer
  parts.push(
    nodeCard(
      CUSTOMER.x,
      CUSTOMER.width,
      'CUSTOMER',
      text(CUSTOMER.x + 30, NODES_Y + 140, fixture.customer.name, { size: 52, weight: 700 }) +
        text(CUSTOMER.x + 30, NODES_Y + 204, fixture.customer.id, {
          size: 30,
          family: MONO,
          fill: color.muted,
        }),
      t,
      lastChange(changes.customer, t)
    )
  );

  // Order
  const idPill = valuePill(
    ORDER.x + 196,
    NODES_Y + 136,
    fixture.customerId,
    stale ? 'coral' : mismatch || fixture.source === 'HAND-BUILT FIXTURE' ? 'plain' : 'mint'
  );
  const orderContent = [
    text(ORDER.x + 30, NODES_Y + 88, 'order-1', { size: 32, family: MONO, weight: 700 }),
    text(ORDER.x + 30, NODES_Y + 136, 'customerId', { size: 24, fill: color.muted }),
    idPill.svg,
    text(ORDER.x + 30, NODES_Y + 212, 'total', { size: 24, fill: color.muted }),
    text(ORDER.x + ORDER.width - 30, NODES_Y + 214, `$${fixture.total}`, {
      size: 52,
      weight: 700,
      anchor: 'end',
    }),
  ];
  if (stale && t >= T.stale) {
    const centre = { x: ORDER.x + 196 + idPill.width + 26, y: NODES_Y + 136 - midline(30) };
    orderContent.push(popIn(verdict(centre, false, 18), t, T.stale, centre));
  }
  parts.push(
    nodeCard(ORDER.x, ORDER.width, 'ORDER', orderContent.join(''), t, lastChange(changes.order, t))
  );

  // Lines
  const lineRows = fixture.lineItems
    .map((item, index) => {
      const y = NODES_Y + 120 + index * 64;
      return (
        text(LINES.x + 30, y, `line-${index + 1}`, { size: 26, family: MONO, fill: color.muted }) +
        text(LINES.x + 160, y, `${item.sku} × ${item.quantity}`, {
          size: 30,
          family: MONO,
          weight: 700,
        }) +
        text(LINES.x + LINES.width - 30, y, '→ order-1', {
          size: 26,
          family: MONO,
          fill: color.muted,
          anchor: 'end',
        })
      );
    })
    .join('');
  parts.push(nodeCard(LINES.x, LINES.width, 'LINES', lineRows, t, lastChange(changes.lines, t)));

  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

// ---------------------------------------------------------------------------
// The code strip: what is written at each step.

interface Writing {
  from: number;
  until: number;
  lines: string[];
  typed: Typing;
  highlight?: string[];
}
const writing: Writing[] = [
  {
    from: 0,
    until: T.declare,
    lines: ["fixture.customer = { id: 'customer-2', name: 'Grace' };"],
    typed: typing(["fixture.customer = { id: 'customer-2', name: 'Grace' };"], T.handEdit, 28),
  },
  {
    from: T.declare,
    until: T.override,
    lines: [".node('order', ['customer', 'items'], …)", ".node('lines', ['order', 'items'], …)"],
    typed: typing([".node('order', ['customer', 'items'], …)"], T.orderNode, 30),
    highlight: ["['customer', 'items']", "['order', 'items']"],
  },
  {
    from: T.override,
    until: T.items,
    lines: ["const forGrace = shop.override('customer', () => grace);", 'forGrace.build(session);'],
    typed: typing(
      ["const forGrace = shop.override('customer', () => grace);", 'forGrace.build(session);'],
      T.overrideTyping,
      30
    ),
    highlight: ["override('customer'"],
  },
  {
    from: T.items,
    until: T.original,
    lines: [
      "const threeTees = forGrace.override('items', () => tees);",
      'threeTees.build(session);',
    ],
    typed: typing(
      ["const threeTees = forGrace.override('items', () => tees);", 'threeTees.build(session);'],
      T.itemsTyping,
      30
    ),
    highlight: ["override('items'"],
  },
  {
    from: T.original,
    until: T.endIn,
    lines: ['shop.build(session);'],
    typed: typing(['shop.build(session);'], T.originalTyping, 30),
  },
];
// The second recipe line is typed after the first, in the same strip.
const linesNodeTyping = typing(
  [".node('order', ['customer', 'items'], …)", ".node('lines', ['order', 'items'], …)"],
  T.linesNode,
  30,
  1
);

function strip(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [box(STRIP.x, STRIP.y, STRIP.width, STRIP.height, { radius: 22, fill: color.ink })];
  for (const entry of writing) {
    const shown = presence(t, entry.from, entry.until, 0.25);
    if (shown <= 0) {
      continue;
    }
    const twoStep = entry.from === T.declare;
    const active = twoStep && t >= T.linesNode - 0.2 ? linesNodeTyping : entry.typed;
    const reveal = active.reveal(t);
    const spans = (entry.highlight ?? []).flatMap((value) =>
      entry.lines
        .map((source, index) => ({ index, from: source.indexOf(value) }))
        .filter(({ from }) => from >= 0)
        .map(({ index, from }) => ({
          line: index,
          from,
          to: from + value.length,
          fill: color.mint,
        }))
    );
    const caret =
      t >= active.start - 0.2 &&
      t <= active.end + 0.6 &&
      (t < active.end || Math.floor(t * 3) % 2 === 0)
        ? (() => {
            const at = active.caret(t, stripLayout);
            return box(at.x + 1, at.y - 19, 3, 38, { fill: color.mint });
          })()
        : '';
    parts.push(
      place(code(entry.lines, { ...stripLayout, reveal, spans }) + caret, { opacity: shown })
    );
  }
  return place(parts.join(''), { opacity });
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/core', {
    size: 34,
    family: MONO,
    background: color.ink,
    fill: color.paper,
    height: 72,
    padding: 36,
  });
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      installPill.svg +
      text(960, 832, '@mimlet/core · scenarios · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const CUSTOMER_AT: Point = { x: CUSTOMER.x + 140, y: NODES_Y + 130 };
const ORDER_ID_AT: Point = { x: ORDER.x + 300, y: NODES_Y + 126 };
const TOTAL_AT: Point = { x: ORDER.x + ORDER.width - 90, y: NODES_Y + 196 };
const LINES_AT: Point = { x: LINES.x + 260, y: NODES_Y + 120 };
const ITEMS_AT: Point = { x: ITEMS.x + 330, y: ITEMS.y + 48 };
const caretOf = (index: number) => (t: number) => {
  const entry = writing[index];
  if (!entry) {
    return { x: 960, y: 360 };
  }
  const active = index === 1 && t >= T.linesNode - 0.2 ? linesNodeTyping : entry.typed;
  return active.caret(t, stripLayout);
};
const along = (edge: Edge | undefined, at: number) => (t: number) => {
  if (!edge) {
    return { x: 960, y: 540 };
  }
  const p = ease.inOut(span(t, at, PULSE));
  return {
    x: edge.from.x + (edge.to.x - edge.from.x) * p,
    y: edge.from.y + (edge.to.y - edge.from.y) * p,
  };
};

const gaze: Key<Point>[] = [
  { at: 0, value: { x: 900, y: 700 } },
  { at: T.handEdit - 0.1, value: caretOf(0) },
  { at: T.graceByHand, value: CUSTOMER_AT },
  { at: T.stale, value: ORDER_ID_AT },
  { at: 5.6, value: CUSTOMER_AT },
  { at: T.orderNode - 0.1, value: caretOf(1) },
  { at: T.orderNode + 0.9, value: ORDER_ID_AT },
  { at: T.linesNode - 0.1, value: caretOf(1) },
  { at: T.linesNode + 0.8, value: LINES_AT },
  { at: T.built, value: ORDER_ID_AT },
  { at: 12.8, value: TOTAL_AT },
  { at: T.overrideTyping - 0.1, value: caretOf(2) },
  { at: T.graceBuilt, value: along(edges.customerOrder, T.graceBuilt) },
  { at: T.graceBuilt + PULSE, value: ORDER_ID_AT },
  { at: 19.2, value: LINES_AT },
  { at: T.itemsTyping - 0.1, value: caretOf(3) },
  { at: T.teesBuilt - 0.2, value: ITEMS_AT },
  { at: T.teesBuilt, value: along(edges.itemsOrder, T.teesBuilt) },
  { at: T.teesBuilt + PULSE, value: TOTAL_AT },
  { at: T.teesBuilt + 1.2, value: LINES_AT },
  { at: T.originalTyping - 0.1, value: caretOf(4) },
  { at: T.originalBuilt, value: TOTAL_AT },
  { at: 30.2, value: CUSTOMER_AT },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.stale, value: 'worried' },
  { at: T.declare, value: 'smile' },
  { at: T.graceBuilt + PULSE, value: 'grin' },
  { at: T.graceBuilt + 1.6, value: 'smile' },
  { at: T.teesBuilt + PULSE, value: 'grin' },
  { at: T.teesBuilt + 1.8, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.4, 6.4, 10.2, 13.6, 16.4, 20.2, 23.0, 26.6, 30.6, 34.6];
const hops = [T.graceBuilt + PULSE, T.teesBuilt + PULSE, T.endIn + 0.6];

function character(t: number) {
  const { hop, squash } = hopAt(t, hops);
  return mascot({
    x: 120,
    y: 870,
    size: 200,
    look: glidePoint(gaze, t),
    blink: blinkAt(t, blinks),
    mouth: step(mouths, t, 'smile'),
    hop,
    squash,
  });
}

// ---------------------------------------------------------------------------
// Sound

const cues: Cue[] = [
  ...writing.flatMap((entry) => entry.typed.keystrokes.map((at): Cue => ({ at, kind: 'key' }))),
  ...linesNodeTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.graceByHand, kind: 'pop' },
  { at: T.stale, kind: 'error' },
  { at: T.orderNode + 0.9, kind: 'line' },
  { at: T.linesNode + 0.8, kind: 'line' },
  { at: T.built, kind: 'success' },
  { at: T.graceBuilt, kind: 'pop' },
  { at: T.graceBuilt, kind: 'whoosh' },
  { at: T.graceBuilt + PULSE, kind: 'success' },
  { at: T.teesBuilt, kind: 'pop' },
  { at: T.teesBuilt, kind: 'whoosh' },
  { at: T.teesBuilt + PULSE, kind: 'success' },
  { at: T.originalBuilt, kind: 'pop' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'connected-data',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Connected test data'),
        captions(beats, t),
        strip(t),
        diagram(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
