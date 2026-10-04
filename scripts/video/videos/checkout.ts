/** Checkout: find, shrink, replay and fix a checkout bug with generated, linked fixtures. */
import { readFileSync } from 'node:fs';
import type { Cue } from '../audio.ts';
import {
  box,
  captions,
  caretMark,
  chrome,
  code,
  codePanel,
  color,
  column,
  curve,
  ease,
  estimateSans,
  frameSvg,
  glidePoint,
  lerp,
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
  type Key,
  type Point,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * Every order, total and replay field in the video comes from the repository's checkout recipe
 * (`examples/recipes/checkout.ts`) with @mimlet/core and @mimlet/fast-check 0.1.0-beta.0 and
 * fast-check 4.10.2. Re-run it with `node scripts/video/verify.ts checkout`.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/fast-check': '0.1.0-beta.0',
    'fast-check': '4.10.2',
  },
  files: {
    'checkout.ts': readFileSync(
      new URL('../../../examples/recipes/checkout.ts', import.meta.url),
      'utf8'
    ),
  },
  program: `import {
  buggyCheckoutTotal,
  checkFixedCheckout,
  checkoutTotal,
  expectedCheckoutTotal,
  findCheckoutBug,
  replayCheckoutBug,
} from './checkout.ts';

const describe = (checkout) =>
  checkout.lines
    .map((line) => line.id + '->' + line.orderId + ' ' + line.quantity + 'x' + line.unitPriceCents)
    .join(', ') +
  ' | ' + checkout.order.id + '->' + checkout.order.customerId +
  ' | charged ' + buggyCheckoutTotal(checkout) + ' expected ' + expectedCheckoutTotal(checkout);

const candidates = [];
const result = findCheckoutBug(12345, (checkout) => candidates.push(checkout));
candidates.forEach((checkout) => console.log(describe(checkout)));
console.log('runs ' + result.runs + ' shrinks ' + result.shrinks);
const { engine, seed, path } = result.replay.replay;
console.log(JSON.stringify({ engine, seed, path }));
const replayed = replayCheckoutBug(JSON.parse(JSON.stringify(result.replay)));
console.log('replayed ' + describe(replayed) + ' | fixed ' + checkoutTotal(replayed));
const fixed = checkFixedCheckout(12345);
console.log('fixed runs ' + fixed.details.numRuns + ' failed ' + fixed.details.failed);
`,
  stdout: [
    'line-1->order-1 6x5767, line-2->order-1 3x887 | order-1->customer-1 | charged 6654 expected 37263',
    'line-1->order-1 3x887 | order-1->customer-1 | charged 887 expected 2661',
    'line-1->order-1 1x887 | order-1->customer-1 | charged 887 expected 887',
    'line-1->order-1 2x887 | order-1->customer-1 | charged 887 expected 1774',
    'line-1->order-1 1x887 | order-1->customer-1 | charged 887 expected 887',
    'line-1->order-1 2x1 | order-1->customer-1 | charged 1 expected 2',
    'line-1->order-1 1x1 | order-1->customer-1 | charged 1 expected 1',
    'line-1->order-1 2x1 | order-1->customer-1 | charged 1 expected 2',
    'line-1->order-1 1x1 | order-1->customer-1 | charged 1 expected 1',
    'runs 1 shrinks 4',
    '{"engine":"fast-check@4.10.2","seed":12345,"path":"0:0:1:1:1"}',
    'replayed line-1->order-1 2x1 | order-1->customer-1 | charged 1 expected 2 | fixed 2',
    'fixed runs 1000 failed false',
  ].join('\n'),
};

const T = {
  orderIn: 0.2,
  checkoutIn: 0.5,
  firstCharged: 1.1,
  firstPass: 1.7,
  buysTwo: 4.6,
  twoUnits: 5.0,
  recharge: 5.7,
  firstFail: 6.1,
  generate: 9.6,
  generatedLines: 10.2,
  generatedTotals: 11.0,
  generatedFail: 11.4,
  shrink: 14.4,
  chips: 15.0,
  chipGap: 0.95,
  skippedHold: 0.55,
  checkedCount: 19.9,
  replay: 22.6,
  recordIn: 23.0,
  callTyping: 24.2,
  cleared: 25.15,
  rebuilt: 25.55,
  repeated: 26.2,
  fix: 29.2,
  fixIn: 29.6,
  fixTyping: 30.4,
  fixFlight: 31.5,
  flight: 0.6,
  fixed: 32.15,
  regression: 35.7,
  savedCase: 36.3,
  generatedChecks: 36.9,
  note: 37.6,
  endIn: 40.9,
  end: 45.9,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Imagine a checkout that looks right.',
    subtitle: 'One item at 1¢. Charged 1¢. The test passes.',
  },
  {
    at: T.buysTwo,
    title: 'Then someone buys two.',
    subtitle: 'Same price, twice the quantity. Still charged 1¢.',
  },
  {
    at: T.generate,
    title: 'Generate orders instead of guessing.',
    subtitle: 'fast-check generates the items. Mimlet keeps customer, order and lines linked.',
  },
  {
    at: T.shrink,
    title: 'Keep the failure. Make the order simpler.',
    subtitle: 'This is shrinking: smaller orders that still fail are kept.',
  },
  {
    at: T.replay,
    title: 'Save the small case. Replay the same failure.',
    subtitle: 'The record keeps fast-check’s version, seed and shrink path.',
  },
  {
    at: T.fix,
    title: 'The fix: charge every unit.',
    subtitle: 'Multiply each line’s price by its quantity.',
  },
  {
    at: T.regression,
    title: 'Keep it as a regression test.',
    subtitle: 'The saved case passes. So do 1,000 new generated orders.',
  },
  { at: T.endIn, title: 'Find it. Shrink it. Replay it.' },
];

// ---------------------------------------------------------------------------
// What the order and the checkout show over time

interface OrderLine {
  id: string;
  quantity: number;
  price: number;
}
type Source =
  'HAND-WRITTEN TEST' | 'GENERATED' | 'SHRINKING' | 'SHRUNK' | 'REPLAYED' | 'SAVED CASE';
interface OrderState {
  lines: OrderLine[];
  source: Source;
  /** When each row last changed, for its pop. */
  since: number;
  /** A skipped shrink candidate: passing, shown briefly, then dropped. */
  skipped?: boolean;
}

const one = (quantity: number, price: number, id = 'line-1'): OrderLine => ({
  id,
  quantity,
  price,
});
const firstFailing = [one(6, 5767), one(3, 887, 'line-2')];
const candidates = [
  { lines: [one(3, 887)], fails: true },
  { lines: [one(1, 887)], fails: false },
  { lines: [one(2, 887)], fails: true },
  { lines: [one(2, 1)], fails: true },
  { lines: [one(1, 1)], fails: false },
];
const chipTime = (index: number) => T.chips + index * T.chipGap;

const charged = (lines: OrderLine[]) => lines.reduce((total, item) => total + item.price, 0);
const expected = (lines: OrderLine[]) =>
  lines.reduce((total, item) => total + item.quantity * item.price, 0);

function orderAt(t: number): OrderState | undefined {
  if (t < T.twoUnits) {
    return { lines: [one(1, 1)], source: 'HAND-WRITTEN TEST', since: T.orderIn };
  }
  if (t < T.generatedLines) {
    return { lines: [one(2, 1)], source: 'HAND-WRITTEN TEST', since: T.twoUnits };
  }
  if (t < T.chips) {
    return {
      lines: firstFailing,
      source: t < T.shrink ? 'GENERATED' : 'SHRINKING',
      since: T.generatedLines,
    };
  }
  if (t < T.replay) {
    // Show the candidate being tried; a passing one is dropped and the last kept order returns.
    let kept: OrderState = { lines: firstFailing, source: 'SHRINKING', since: T.generatedLines };
    for (let index = 0; index < candidates.length; index += 1) {
      const at = chipTime(index);
      const candidate = candidates[index];
      if (!candidate || t < at) {
        break;
      }
      if (candidate.fails) {
        kept = { lines: candidate.lines, source: 'SHRINKING', since: at };
      } else if (t < at + T.skippedHold) {
        return { lines: candidate.lines, source: 'SHRINKING', since: at, skipped: true };
      } else {
        // The passing candidate is dropped and the last failing order returns.
        kept = { ...kept, since: at + T.skippedHold };
      }
    }
    return kept;
  }
  if (t < T.cleared) {
    return { lines: [one(2, 1)], source: 'SHRUNK', since: chipTime(3) };
  }
  if (t < T.rebuilt) {
    return undefined;
  }
  return {
    lines: [one(2, 1)],
    source: t < T.fix ? 'REPLAYED' : 'SAVED CASE',
    since: T.rebuilt,
  };
}

interface Totals {
  charged: number;
  expected: number;
  since: number;
  verdict: 'PASS' | 'FAIL' | 'FAIL REPEATED';
}

function totalsAt(t: number): Totals | undefined {
  if (t < T.firstCharged) {
    return undefined;
  }
  if (t < T.recharge) {
    return { charged: 1, expected: 1, since: T.firstCharged, verdict: 'PASS' };
  }
  if (t < T.generatedTotals) {
    return t < T.generatedLines
      ? { charged: 1, expected: 2, since: T.recharge, verdict: 'FAIL' }
      : undefined;
  }
  if (t < T.cleared) {
    const order = orderAt(t);
    const lines = order?.lines ?? firstFailing;
    const since = t < T.chips ? T.generatedTotals : (order?.since ?? T.chips);
    const pass = charged(lines) === expected(lines);
    return {
      charged: charged(lines),
      expected: expected(lines),
      since,
      verdict: pass ? 'PASS' : 'FAIL',
    };
  }
  if (t < T.rebuilt + 0.25) {
    return undefined;
  }
  if (t < T.fixed) {
    return { charged: 1, expected: 2, since: T.rebuilt + 0.25, verdict: 'FAIL REPEATED' };
  }
  return { charged: 2, expected: 2, since: T.fixed, verdict: 'PASS' };
}

// ---------------------------------------------------------------------------
// Layout: the order and the checkout side by side, the beat's detail underneath.

const TOP = 300;
const ORDER = { x: 140, width: 860 };
const CHECKOUT = { x: 1060, width: 720 };
const LOWER = 640;
const rowY = (index: number) => TOP + 126 + index * 82;
const cardHeight = (rows: number) => 118 + rows * 82;
const CHARGED: Point = { x: CHECKOUT.x + 32, y: TOP + 176 };
const EXPECTED: Point = { x: CHECKOUT.x + 380, y: TOP + 176 };
const cents = (value: number) => `${value}¢`;

function rowsAt(t: number) {
  if (t < T.generatedLines) {
    return 1;
  }
  if (t < T.chips) {
    return 1 + ease.inOut(span(t, T.generatedLines, 0.35));
  }
  return 2 - ease.inOut(span(t, T.chips, 0.35));
}

function sourceTag(source: Source, x: number, y: number) {
  const generated = source !== 'HAND-WRITTEN TEST';
  const width = estimateSans(source, 18, 700, 1.4) + 32;
  return pill({ x: x - width / 2, y }, source, {
    size: 18,
    weight: 700,
    spacing: 1.4,
    background: generated ? color.mint : color.inkRaised,
    fill: generated ? color.ink : color.codeDim,
    height: 36,
    padding: 16,
  }).svg;
}

function numberPill(x: number, baseline: number, value: string, tone: 'mint' | 'paper' | 'faint') {
  const width = value.length * monoWidth(40) + 36;
  const centreY = baseline - midline(40);
  return {
    width,
    svg:
      box(x, centreY - 30, width, 60, {
        radius: 14,
        fill: tone === 'mint' ? color.mint : tone === 'paper' ? color.paper : color.inkRaised,
      }) +
      text(x + 18, baseline, value, {
        size: 40,
        family: MONO,
        fill: tone === 'faint' ? color.codeDim : color.ink,
      }),
  };
}

function orderCard(t: number) {
  const opacity = presence(t, T.orderIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const height = cardHeight(rowsAt(t));
  const state = orderAt(t);
  const parts = [
    box(ORDER.x, TOP, ORDER.width, height, { radius: 22, fill: color.ink }),
    text(ORDER.x + 32, TOP + 52, 'order-1', {
      size: 32,
      family: MONO,
      weight: 700,
      fill: color.paper,
    }),
    text(ORDER.x + 32 + 8 * monoWidth(32), TOP + 52, '→ customer-1 · Ada', {
      size: 26,
      family: MONO,
      fill: color.codeDim,
    }),
  ];
  if (state) {
    parts.push(sourceTag(state.source, ORDER.x + ORDER.width - 28, TOP + 42));
    state.lines.forEach((item, index) => {
      const y = rowY(index);
      const grow = ease.back(span(t, state.since, 0.3));
      const linked = state.source !== 'HAND-WRITTEN TEST';
      const tone = state.skipped ? 'faint' : linked ? 'mint' : 'paper';
      const quantity = numberPill(ORDER.x + 150, y, String(item.quantity), tone);
      const timesX = ORDER.x + 150 + quantity.width + 18;
      const price = numberPill(timesX + 44, y, cents(item.price), tone);
      const linkX = timesX + 44 + price.width + 28;
      const row = [
        text(ORDER.x + 32, y - 4, item.id, { size: 26, family: MONO, fill: color.codeDim }),
        quantity.svg,
        text(timesX, y - 4, '×', { size: 36, fill: color.paper }),
        price.svg,
        text(linkX, y - 4, '→ order-1', {
          size: 26,
          family: MONO,
          fill: linked ? color.mint : color.codeDim,
        }),
      ];
      parts.push(
        place(row.join(''), {
          scale: 0.92 + 0.08 * grow,
          origin: { x: ORDER.x + 300, y: y - midline(40) },
        })
      );
    });
  } else {
    parts.push(text(ORDER.x + 150, rowY(0), '—', { size: 40, family: MONO, fill: color.codeDim }));
  }
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.orderIn, 0.4))) * 14 });
}

function checkoutCard(t: number) {
  const opacity = presence(t, T.checkoutIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const height = cardHeight(rowsAt(t));
  const totals = totalsAt(t);
  const parts = [
    box(CHECKOUT.x, TOP, CHECKOUT.width, height, {
      radius: 22,
      fill: color.card,
      stroke: color.rule,
    }),
    text(CHECKOUT.x + 32, TOP + 52, 'CHECKOUT', {
      size: 22,
      weight: 700,
      fill: color.muted,
      spacing: 1.8,
    }),
    text(CHARGED.x, TOP + 112, 'CHARGED', {
      size: 20,
      weight: 700,
      fill: color.muted,
      spacing: 1.6,
    }),
    text(EXPECTED.x, TOP + 112, 'EXPECTED', {
      size: 20,
      weight: 700,
      fill: color.muted,
      spacing: 1.6,
    }),
  ];
  if (!totals) {
    parts.push(
      text(CHARGED.x, CHARGED.y, '—', { size: 52, family: MONO, fill: color.faint }),
      text(EXPECTED.x, EXPECTED.y, '—', { size: 52, family: MONO, fill: color.faint })
    );
  } else {
    const wrong = totals.charged !== totals.expected;
    const grow = ease.back(span(t, totals.since, 0.3));
    const value = (at: Point, amount: number, accent: boolean) => {
      const label = cents(amount);
      const width = label.length * monoWidth(52) + 32;
      return (
        box(at.x - 16, at.y - midline(52) - 38, width, 76, {
          radius: 16,
          fill: accent ? (wrong ? color.coralSoft : color.mintSoft) : color.paper,
          stroke: accent ? (wrong ? color.coral : color.mint) : color.rule,
          strokeWidth: 2.5,
        }) + text(at.x, at.y, label, { size: 52, family: MONO })
      );
    };
    parts.push(
      place(value(CHARGED, totals.charged, true) + value(EXPECTED, totals.expected, false), {
        scale: 0.9 + 0.1 * grow,
        origin: { x: CHECKOUT.x + CHECKOUT.width / 2, y: CHARGED.y - midline(52) },
      })
    );
    const verdictAt = Math.max(
      totals.since + 0.4,
      totals.since === T.firstCharged ? T.firstPass : 0
    );
    const pass = totals.verdict === 'PASS';
    const width = estimateSans(totals.verdict, 20, 700, 1.4) + 36;
    const centre = { x: CHECKOUT.x + CHECKOUT.width - 28 - width / 2, y: TOP + 42 };
    parts.push(
      popIn(
        pill(centre, totals.verdict, {
          size: 20,
          weight: 700,
          spacing: 1.4,
          background: pass ? color.mint : color.coral,
          height: 40,
          padding: 18,
        }).svg,
        t,
        verdictAt,
        centre
      )
    );
  }
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.checkoutIn, 0.4))) * 14 });
}

// Shrinking: the smaller orders fast-check tried, in order.
const CHIP = { width: 300, height: 116, gap: 35 };
const chipCentre = (index: number): Point => ({
  x: ORDER.x + index * (CHIP.width + CHIP.gap) + CHIP.width / 2,
  y: LOWER + CHIP.height / 2,
});

function shrinkChips(t: number) {
  const opacity = presence(t, T.chips - 0.2, T.replay, 0.3);
  if (opacity <= 0) {
    return '';
  }
  const parts: string[] = [];
  candidates.forEach((candidate, index) => {
    const at = chipTime(index);
    const centre = chipCentre(index);
    const label = candidate.lines
      .map((item) => `${item.quantity} × ${cents(item.price)}`)
      .join(' + ');
    const chip =
      box(centre.x - CHIP.width / 2, LOWER, CHIP.width, CHIP.height, {
        radius: 18,
        fill: candidate.fails ? color.mintSoft : color.paper,
        stroke: candidate.fails ? color.mint : color.rule,
        strokeWidth: 2.5,
      }) +
      text(centre.x, LOWER + 52, label, {
        size: 32,
        family: MONO,
        anchor: 'middle',
        fill: candidate.fails ? color.ink : color.faint,
      }) +
      text(centre.x, LOWER + 92, candidate.fails ? 'still fails · kept' : 'passes · skipped', {
        size: 24,
        weight: 600,
        anchor: 'middle',
        fill: candidate.fails ? color.ink : color.faint,
      });
    parts.push(popIn(chip, t, at, centre));
  });
  parts.push(
    place(
      text(960, LOWER + CHIP.height + 56, 'fast-check checked 9 orders in total', {
        size: 26,
        fill: color.muted,
        anchor: 'middle',
      }),
      { opacity: ease.out(span(t, T.checkedCount, 0.35)) }
    )
  );
  return place(parts.join(''), { opacity });
}

// Replay: the saved record and the call that reruns it.
const recordLines = ['"engine": "fast-check@4.10.2",', '"seed": 12345,', '"path": "0:0:1:1:1"'];
const RECORD = { x: ORDER.x, width: 1040 };
const recordPanel = codePanel(
  RECORD.x,
  LOWER - 20,
  RECORD.width,
  256,
  'checkout-regression.json',
  34
);
const CALL = { x: 1240, width: 540 };
const callPanel = codePanel(CALL.x, LOWER - 20, CALL.width, 160, 'checkout.test.ts', 30);
const callTyping = typing(['replayCheckoutBug(record)'], T.callTyping, 30);

function replayPieces(t: number) {
  const opacity = presence(t, T.recordIn, T.fix);
  if (opacity <= 0) {
    return '';
  }
  let reveal = 0;
  recordLines.forEach((source, index) => {
    if (t >= T.recordIn + 0.3 + index * 0.25) {
      reveal += source.length + 1;
    }
  });
  const arrowY = LOWER - 20 + 109;
  const arrow = presence(t, T.callTyping - 0.2) * 1;
  return place(
    recordPanel.svg +
      code(recordLines, {
        ...recordPanel.layout,
        lineHeight: 52,
        reveal,
        spans: [
          { line: 0, from: 10, to: 29, fill: color.mint },
          { line: 1, from: 8, to: 13, fill: color.mint },
          { line: 2, from: 8, to: 19, fill: color.mint },
        ],
      }) +
      place(
        line(
          { x: RECORD.x + RECORD.width + 10, y: arrowY },
          { x: CALL.x - 14, y: arrowY },
          color.mint,
          3
        ) +
          `<path d="M${CALL.x - 24} ${arrowY - 8}L${CALL.x - 12} ${arrowY}L${CALL.x - 24} ${arrowY + 8}" stroke="${color.mint}" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`,
        { opacity: arrow }
      ) +
      place(
        callPanel.svg +
          code(['replayCheckoutBug(record)'], {
            ...callPanel.layout,
            reveal: callTyping.reveal(t),
          }) +
          caretMark(t, callTyping, callPanel.layout),
        { opacity: presence(t, T.callTyping - 0.3) }
      ),
    { opacity }
  );
}

// The fix, typed into the recipe's reducer.
const reducer = '(total, line) => total + line.unitPriceCents';
const insertAt = reducer.indexOf('line.unitPriceCents');
const insertion = 'line.quantity * ';
const fixPanel = codePanel(ORDER.x, LOWER - 20, 1640, 160, 'checkout.ts', 36);
const fixTyping = typing([insertion], T.fixTyping, 20);

function fixPieces(t: number) {
  const opacity = presence(t, T.fixIn, T.regression);
  if (opacity <= 0) {
    return '';
  }
  const typed = insertion.slice(0, fixTyping.reveal(t));
  const source = `${reducer.slice(0, insertAt)}${typed}${reducer.slice(insertAt)}`;
  const caretAt = column(fixPanel.layout, 0, insertAt + typed.length);
  const caret =
    t >= fixTyping.start - 0.2 &&
    t <= fixTyping.end + 0.6 &&
    (t < fixTyping.end || Math.floor(t * 3) % 2 === 0)
      ? box(caretAt.x + 1, caretAt.y - midline(36) - 19, 3, 38, { fill: color.mint })
      : '';
  return place(
    fixPanel.svg +
      code([source], {
        ...fixPanel.layout,
        spans: typed
          ? [{ line: 0, from: insertAt, to: insertAt + typed.length, fill: color.mint }]
          : [],
      }) +
      caret,
    { opacity }
  );
}

const flightFrom = column(fixPanel.layout, 0, insertAt);
const flightTo: Point = { x: CHARGED.x, y: CHARGED.y };
const flightPoint = (t: number) =>
  curve(
    flightFrom,
    { x: (flightFrom.x + flightTo.x) / 2 + 200, y: flightTo.y + 40 },
    flightTo,
    ease.inOut(span(t, T.fixFlight, T.flight))
  );

function fixFlight(t: number) {
  if (t < T.fixFlight || t >= T.fixFlight + T.flight) {
    return '';
  }
  const at = flightPoint(t);
  const size = lerp(36, 44, ease.inOut(span(t, T.fixFlight, T.flight)));
  const label = '2 × 1¢';
  const width = label.length * monoWidth(size) + 28;
  return (
    box(at.x - 14, at.y - midline(size) - size * 0.78, width, size * 1.56, {
      radius: 12,
      fill: color.mint,
    }) + text(at.x, at.y, label, { size, family: MONO })
  );
}

// Regression: the saved case and fresh generated orders both pass.
function regressionPieces(t: number) {
  const opacity = presence(t, T.regression + 0.3, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const result = (x: number, width: number, label: string, value: string, at: number) => {
    const centre = { x: x + width - 48, y: LOWER + 66 };
    return (
      box(x, LOWER, width, 132, { radius: 22, fill: color.card, stroke: color.rule }) +
      text(x + 32, LOWER + 46, label, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 }) +
      text(x + 32, LOWER + 98, value, { size: 34, weight: 600 }) +
      popIn(verdict(centre, true, 24), t, at, centre)
    );
  };
  return place(
    result(ORDER.x, 780, 'SAVED CASE', 'Charged 2¢, expected 2¢', T.savedCase) +
      result(ORDER.x + 820, 820, 'NEW GENERATED ORDERS', '1,000 checks pass', T.generatedChecks) +
      place(
        text(960, LOWER + 190, 'Seed 12345. Passing checks are bounded coverage, not a proof.', {
          size: 26,
          fill: color.muted,
          anchor: 'middle',
        }),
        { opacity: ease.out(span(t, T.note, 0.35)) }
      ),
    { opacity }
  );
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const installPill = pill(
    { x: 960, y: 726 },
    'npm i -D @mimlet/core @mimlet/fast-check fast-check',
    {
      size: 32,
      family: MONO,
      background: color.ink,
      fill: color.paper,
      height: 70,
      padding: 34,
    }
  );
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      installPill.svg +
      text(960, 832, 'Generation and shrinking by fast-check · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const QTY: Point = { x: ORDER.x + 180, y: rowY(0) - midline(40) };
const CHARGED_AT: Point = { x: CHARGED.x + 60, y: CHARGED.y - midline(52) };
const EXPECTED_AT: Point = { x: EXPECTED.x + 60, y: EXPECTED.y - midline(52) };
const VERDICT_AT: Point = { x: CHECKOUT.x + CHECKOUT.width - 90, y: TOP + 42 };
const LINKS_AT: Point = { x: ORDER.x + 680, y: rowY(0) - 12 };

const gaze: Key<Point>[] = [
  { at: 0, value: { x: 560, y: 420 } },
  { at: T.firstCharged, value: CHARGED_AT },
  { at: T.firstCharged + 0.3, value: EXPECTED_AT },
  { at: T.firstPass, value: VERDICT_AT },
  { at: 3.0, value: QTY },
  { at: T.twoUnits, value: QTY },
  { at: T.recharge, value: CHARGED_AT },
  { at: T.firstFail, value: VERDICT_AT },
  { at: 7.6, value: QTY },
  { at: T.generatedLines, value: { x: ORDER.x + 400, y: rowY(1) - 12 } },
  { at: T.generatedTotals, value: CHARGED_AT },
  { at: T.generatedTotals + 0.35, value: EXPECTED_AT },
  { at: T.generatedFail, value: VERDICT_AT },
  { at: 12.4, value: LINKS_AT },
  { at: 13.4, value: { x: ORDER.x + 680, y: rowY(1) - 12 } },
  ...candidates.map((_, index): Key<Point> => ({ at: chipTime(index), value: chipCentre(index) })),
  { at: T.checkedCount, value: { x: 960, y: LOWER + CHIP.height + 46 } },
  { at: T.recordIn + 0.3, value: { x: RECORD.x + 400, y: LOWER + 90 } },
  { at: T.callTyping - 0.1, value: (t) => callTyping.caret(t, callPanel.layout) },
  { at: T.cleared, value: { x: 560, y: rowY(0) - 12 } },
  { at: T.repeated, value: VERDICT_AT },
  { at: 27.4, value: CHARGED_AT },
  {
    at: T.fixTyping - 0.1,
    value: (t) => {
      const at = column(fixPanel.layout, 0, insertAt + fixTyping.reveal(t));
      return { x: at.x, y: at.y - midline(36) };
    },
  },
  { at: T.fixFlight, value: flightPoint },
  { at: T.fixed, value: CHARGED_AT },
  { at: T.fixed + 0.4, value: VERDICT_AT },
  { at: T.savedCase, value: { x: ORDER.x + 732, y: LOWER + 66 } },
  { at: T.generatedChecks, value: { x: ORDER.x + 1592, y: LOWER + 66 } },
  { at: T.note, value: { x: 960, y: LOWER + 180 } },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.firstFail, value: 'worried' },
  { at: T.generate, value: 'smile' },
  { at: T.generatedFail, value: 'open' },
  { at: T.generatedFail + 1.1, value: 'smile' },
  { at: T.repeated, value: 'worried' },
  { at: T.fix, value: 'smile' },
  { at: T.fixed + 0.3, value: 'grin' },
  { at: T.fixed + 1.8, value: 'smile' },
  { at: T.generatedChecks, value: 'grin' },
  { at: 38.6, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.6, 4.2, 8.4, 12.6, 14.0, 20.6, 23.6, 27.0, 30.0, 34.0, 38.4, 42.6, 44.8];
const hops = [T.fixed + 0.3, T.generatedChecks, T.endIn + 0.6];

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
  { at: T.firstCharged, kind: 'pop' },
  { at: T.firstPass, kind: 'success' },
  { at: T.twoUnits, kind: 'pop' },
  { at: T.recharge, kind: 'pop' },
  { at: T.firstFail, kind: 'error' },
  { at: T.generatedLines, kind: 'whoosh' },
  { at: T.generatedTotals, kind: 'pop' },
  { at: T.generatedFail, kind: 'error' },
  ...candidates.map((candidate, index): Cue => ({
    at: chipTime(index),
    kind: candidate.fails ? 'pop' : 'line',
  })),
  ...recordLines.map((_, index): Cue => ({ at: T.recordIn + 0.3 + index * 0.25, kind: 'line' })),
  ...callTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.cleared, kind: 'whoosh' },
  { at: T.rebuilt, kind: 'pop' },
  { at: T.repeated, kind: 'error' },
  ...fixTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.fixFlight, kind: 'whoosh' },
  { at: T.fixed, kind: 'pop' },
  { at: T.fixed + 0.4, kind: 'success' },
  { at: T.savedCase, kind: 'success' },
  { at: T.generatedChecks, kind: 'success' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'checkout',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Find, shrink, replay'),
        captions(beats, t),
        orderCard(t),
        checkoutCard(t),
        shrinkChips(t),
        replayPieces(t),
        fixPieces(t),
        regressionPieces(t),
        fixFlight(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
