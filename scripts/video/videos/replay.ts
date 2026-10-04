/** Replay: save the property run that failed in CI and bring back exactly that case. */
import type { Cue } from '../audio.ts';
import {
  box,
  captions,
  chrome,
  code,
  codePanel,
  color,
  ease,
  estimateSans,
  frameSvg,
  glidePoint,
  line,
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
  wordmark,
  type Beat,
  type CodeLayout,
  type Key,
  type Point,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * The runs, record and error in the video are this program's output with @mimlet/core and
 * @mimlet/fast-check 0.1.0-beta.0 and fast-check 4.10.2. Re-run it with
 * `node scripts/video/verify.ts replay`.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/fast-check': '0.1.0-beta.0',
    'fast-check': '4.10.2',
  },
  program: `import * as fc from 'fast-check';
import { createBuilder } from '@mimlet/core';
import { checkFixtureProperty, mapFixtureArbitrary, replayFixtureProperty } from '@mimlet/fast-check';

const carts = mapFixtureArbitrary(fc.integer({ min: 1, max: 100 }), (dollars) =>
  createBuilder(() => ({ id: 'cart-1', subtotalDollars: dollars })).build()
);
// Application bug: free shipping should start at $50, not above it.
const shippingFor = (cart) => (cart.subtotalDollars > 50 ? 0 : 5);
const expectedShipping = (cart) => (cart.subtotalDollars >= 50 ? 0 : 5);
const property = (cart) => shippingFor(cart) === expectedShipping(cart);
const v1 = { fingerprint: 'shipping/v1', provider: 'shop-test@1' };
const v2 = { fingerprint: 'shipping/v2', provider: 'shop-test@1' };

const ci = checkFixtureProperty(carts, property, { identity: v1, seed: 2026 });
const cart = ci.details.counterexample[0];
console.log(ci.details.failed, ci.details.numRuns, cart.subtotalDollars, shippingFor(cart), expectedShipping(cart));
console.log(JSON.stringify(ci.replay));
const rerun = checkFixtureProperty(carts, property, { identity: v1, seed: 42 });
console.log(rerun.details.failed, rerun.details.numRuns);
const record = JSON.parse(JSON.stringify(ci.replay));
const replayed = replayFixtureProperty(carts, property, record, v1);
console.log(replayed.details.failed, replayed.details.numRuns, replayed.details.counterexample[0].subtotalDollars);
try {
  replayFixtureProperty(carts, property, record, v2);
} catch (error) {
  console.log(error.name, error.code, error.message);
}
`,
  stdout: [
    'true 84 50 5 0',
    '{"format":"test-builders/property","version":1,"engine":"fast-check@4.10.2","identity":{"fingerprint":"shipping/v1","provider":"shop-test@1"},"seed":2026,"path":"83"}',
    'false 100',
    'true 1 50',
    'PropertyIntegrationError PROPERTY_REPLAY Property replay version, engine, identity, or path does not match',
  ].join('\n'),
};

const T = {
  cardsIn: 0.2,
  ciRuns: 0.8,
  ciFail: 2.9,
  rerunRuns: 1.2,
  rerunPass: 3.7,
  bugLine: 4.6,
  bugMark: 5.5,
  save: 8.4,
  saveTyping: 8.8,
  recordIn: 9.0,
  recordLines: 11.0,
  replay: 14.6,
  replayTyping: 15.0,
  replaying: 16.8,
  replayRun: 17.0,
  reproduced: 17.6,
  identity: 21.0,
  identityEdit: 21.5,
  currentIdentity: 22.1,
  mismatch: 22.6,
  refused: 23.2,
  endIn: 26.6,
  end: 31.6,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'CI failed once. Your rerun passes.',
    subtitle: 'The bug only shows at exactly $50. A new seed may never hit it.',
  },
  {
    at: T.save,
    title: 'Save the run that failed.',
    subtitle: 'The record keeps fast-check’s version, your test identity, the seed and the path.',
  },
  {
    at: T.replay,
    title: 'Replay it. One run, the same failure.',
    subtitle: 'replayFixtureProperty() reruns only the recorded case.',
  },
  {
    at: T.identity,
    title: 'Changed the test? The old record is refused.',
    subtitle: 'A shipping/v1 record won’t replay under shipping/v2.',
  },
  { at: T.endIn, title: 'Failures you can replay.' },
];

// ---------------------------------------------------------------------------
// Layout

const TOP = 300;
const CARD_HEIGHT = 400;
const LEFT = { x: 140, width: 780 };
const RIGHT = { x: 1000, width: 780 };
const STRIP = { x: 140, y: 730, width: 1640, height: 112 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 70, size: 34, lineHeight: 52 };

function label(x: number, y: number, value: string) {
  return text(x, y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 });
}

function badge(centre: Point, value: string, tone: 'mint' | 'coral' | 'plain') {
  return pill(centre, value, {
    size: 20,
    weight: 700,
    spacing: 1.4,
    background: tone === 'mint' ? color.mint : tone === 'coral' ? color.coral : color.paper,
    border: tone === 'plain' ? color.rule : undefined,
    fill: tone === 'plain' ? color.muted : color.ink,
    height: 42,
    padding: 18,
  }).svg;
}

function seedChip(card: { x: number; width: number }, value: string) {
  const width = value.length * monoWidth(26) + 28;
  return (
    box(card.x + card.width - 28 - width, TOP + 22, width, 40, {
      radius: 12,
      fill: color.paper,
      stroke: color.rule,
    }) + text(card.x + card.width - 28 - width + 14, TOP + 51, value, { size: 26, family: MONO })
  );
}

/** A property run: a run counter that ticks while fast-check searches, then the outcome. */
function runCard(
  card: { x: number; width: number },
  heading: string,
  seed: string,
  runs: number,
  startedAt: number,
  endedAt: number,
  t: number,
  outcome: { at: number; failed: boolean; verdict: string }
) {
  const p = span(t, startedAt, endedAt - startedAt);
  const shown = Math.max(t >= startedAt ? 1 : 0, Math.round(runs * p));
  const parts = [
    box(card.x, TOP, card.width, CARD_HEIGHT, { radius: 22, fill: color.card, stroke: color.rule }),
    label(card.x + 32, TOP + 50, heading),
    seedChip(card, seed),
    text(card.x + 32, TOP + 170, String(shown), { size: 88, family: MONO, weight: 700 }),
    text(
      card.x + 32 + String(shown).length * monoWidth(88) + 20,
      TOP + 170,
      shown === 1 ? 'run' : 'runs',
      {
        size: 32,
        fill: color.muted,
      }
    ),
  ];
  if (t >= outcome.at) {
    const settle = ease.out(span(t, outcome.at, 0.3));
    const result = outcome.failed
      ? text(card.x + 32, TOP + 252, 'cart.subtotalDollars: 50', { size: 32, family: MONO }) +
        text(card.x + 32, TOP + 300, 'Charged $5 shipping, expected $0', { size: 30, weight: 600 })
      : text(card.x + 32, TOP + 252, 'No failing cart found', {
          size: 32,
          weight: 600,
          fill: color.muted,
        });
    parts.push(place(result, { opacity: settle, y: (1 - settle) * 8 }));
    const width = estimateSans(outcome.verdict, 20, 700, 1.4) + 36;
    const centre = { x: card.x + 32 + width / 2, y: TOP + CARD_HEIGHT - 46 };
    parts.push(
      popIn(
        badge(centre, outcome.verdict, outcome.failed ? 'coral' : 'mint'),
        t,
        outcome.at,
        centre
      )
    );
  }
  return parts.join('');
}

function leftCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  if (t < T.replaying) {
    const leaving = t >= T.replay ? 1 - ease.inOut(span(t, T.replaying - 0.3, 0.3)) : 1;
    return place(
      runCard(LEFT, 'CI RUN', 'seed 2026', 84, T.ciRuns, T.ciFail, t, {
        at: T.ciFail,
        failed: true,
        verdict: 'FAIL',
      }),
      { opacity: opacity * leaving }
    );
  }
  if (t < T.currentIdentity) {
    const entering = ease.out(span(t, T.replaying, 0.3));
    const leaving = 1 - ease.inOut(span(t, T.currentIdentity - 0.3, 0.3));
    return place(
      runCard(LEFT, 'REPLAY', 'path 83', 1, T.replayRun, T.replayRun, t, {
        at: T.reproduced,
        failed: true,
        verdict: 'FAIL REPRODUCED',
      }),
      { opacity: opacity * Math.min(entering, leaving) }
    );
  }
  // Refused: the current identity no longer matches the record.
  const entering = ease.out(span(t, T.currentIdentity, 0.3));
  const identity = 'shipping/v2';
  const identityWidth = identity.length * monoWidth(40) + 32;
  const parts = [
    box(LEFT.x, TOP, LEFT.width, CARD_HEIGHT, { radius: 22, fill: color.card, stroke: color.rule }),
    label(LEFT.x + 32, TOP + 50, 'REPLAY'),
    label(LEFT.x + 32, TOP + 112, 'CURRENT IDENTITY'),
    box(LEFT.x + 28, TOP + 132, identityWidth, 60, {
      radius: 14,
      fill: color.coralSoft,
      stroke: color.coral,
      strokeWidth: 2.5,
    }),
    text(LEFT.x + 44, TOP + 176, identity, { size: 40, family: MONO }),
  ];
  if (t >= T.refused) {
    const settle = ease.out(span(t, T.refused, 0.3));
    parts.push(
      place(
        text(LEFT.x + 32, TOP + 250, 'PropertyIntegrationError', {
          size: 30,
          family: MONO,
          weight: 700,
        }) +
          text(LEFT.x + 32, TOP + 292, 'Property replay version, engine, identity,', { size: 26 }) +
          text(LEFT.x + 32, TOP + 326, 'or path does not match', { size: 26 }),
        { opacity: settle, y: (1 - settle) * 8 }
      )
    );
    const width = estimateSans('NOT RUN', 20, 700, 1.4) + 36;
    const centre = { x: LEFT.x + LEFT.width - 28 - width / 2, y: TOP + 46 };
    parts.push(popIn(badge(centre, 'NOT RUN', 'plain'), t, T.refused, centre));
  }
  return place(parts.join(''), { opacity: opacity * entering });
}

const recordLines = [
  '"engine": "fast-check@4.10.2",',
  '"identity": {',
  '  "fingerprint": "shipping/v1", …',
  '},',
  '"seed": 2026,',
  '"path": "83"',
];
const recordPanel = codePanel(RIGHT.x, TOP, RIGHT.width, CARD_HEIGHT, 'shipping-replay.json', 30);
const recordLayout: CodeLayout = { ...recordPanel.layout, lineHeight: 46 };
const fingerprint = { line: 2, from: 17, to: 30 };

function rightCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  if (t < T.recordIn) {
    return place(
      runCard(RIGHT, 'YOUR RERUN', 'seed 42', 100, T.rerunRuns, T.rerunPass, t, {
        at: T.rerunPass,
        failed: false,
        verdict: 'PASS',
      }),
      { opacity: opacity * (1 - ease.inOut(span(t, T.save, 0.35))) }
    );
  }
  let reveal = 0;
  recordLines.forEach((source, index) => {
    if (t >= T.recordLines + index * 0.2) {
      reveal += source.length + 1;
    }
  });
  const used = t >= T.replaying && t < T.identity;
  const mismatched = t >= T.mismatch;
  const spans = [
    { line: 0, from: 10, to: 29, fill: color.mint },
    {
      ...fingerprint,
      fill: mismatched ? color.coral : color.mint,
    },
    { line: 4, from: 8, to: 12, fill: used ? color.paper : color.mint },
    { line: 5, from: 8, to: 12, fill: used ? color.paper : color.mint },
  ];
  const parts = [recordPanel.svg];
  if (used) {
    for (const row of [4, 5]) {
      parts.push(
        box(
          RIGHT.x + 14,
          recordLayout.y + row * recordLayout.lineHeight - 34,
          RIGHT.width - 28,
          46,
          {
            radius: 10,
            stroke: color.mint,
            strokeWidth: 2.5,
          }
        )
      );
    }
  }
  if (mismatched) {
    parts.push(
      box(
        RIGHT.x + 14,
        recordLayout.y + fingerprint.line * recordLayout.lineHeight - 34,
        RIGHT.width - 28,
        46,
        {
          radius: 10,
          stroke: color.coral,
          strokeWidth: 2.5,
        }
      )
    );
  }
  parts.push(code(recordLines, { ...recordLayout, reveal, spans }));
  return place(parts.join(''), { opacity: opacity * ease.out(span(t, T.recordIn, 0.35)) });
}

/** The save arrow from the failed run to the record, and the identity mismatch between them. */
function bridge(t: number) {
  const parts: string[] = [];
  const y = TOP + CARD_HEIGHT / 2;
  const from = { x: LEFT.x + LEFT.width + 10, y };
  const to = { x: RIGHT.x - 12, y };
  const saving = presence(t, T.recordIn, T.replay, 0.3);
  if (saving > 0) {
    const p = ease.inOut(span(t, T.recordIn, 0.5));
    parts.push(
      place(
        line(from, { x: from.x + (to.x - from.x) * p, y }, color.mint, 4) +
          (p >= 1
            ? `<path d="M${to.x - 12} ${y - 9}L${to.x} ${y}L${to.x - 12} ${y + 9}" stroke="${color.mint}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
            : ''),
        { opacity: saving }
      )
    );
  }
  if (t >= T.mismatch && t < T.endIn) {
    const centre = { x: (from.x + to.x) / 2, y: TOP + 160 };
    const sign =
      `<circle cx="${centre.x}" cy="${centre.y}" r="28" fill="${color.coral}"/>` +
      line(
        { x: centre.x - 11, y: centre.y - 6 },
        { x: centre.x + 11, y: centre.y - 6 },
        color.ink,
        4.5
      ) +
      line(
        { x: centre.x - 11, y: centre.y + 6 },
        { x: centre.x + 11, y: centre.y + 6 },
        color.ink,
        4.5
      ) +
      line(
        { x: centre.x + 7, y: centre.y - 14 },
        { x: centre.x - 7, y: centre.y + 14 },
        color.ink,
        4.5
      );
    parts.push(popIn(sign, t, T.mismatch, centre));
  }
  return parts.join('');
}

// ---------------------------------------------------------------------------
// The code strip

const bugLine = 'const shippingFor = (cart) => (cart.subtotalDollars > 50 ? 0 : 5);';
const saveLine = "writeFileSync('shipping-replay.json', JSON.stringify(report.replay));";
const replayLine = 'replayFixtureProperty(carts, property, record, v1);';
const refusedLine = 'replayFixtureProperty(carts, property, record, v2);';
const saveTyping = typing([saveLine], T.saveTyping, 36);
const replayTyping = typing([replayLine], T.replayTyping, 34);

function strip(t: number) {
  const visible = presence(t, T.bugLine, T.endIn);
  if (visible <= 0) {
    return '';
  }
  const parts = [box(STRIP.x, STRIP.y, STRIP.width, STRIP.height, { radius: 22, fill: color.ink })];
  const caret = (typed: typeof saveTyping) => {
    if (
      t < typed.start - 0.2 ||
      t > typed.end + 0.6 ||
      (t > typed.end && Math.floor(t * 3) % 2 === 1)
    ) {
      return '';
    }
    const at = typed.caret(t, stripLayout);
    return box(at.x + 1, at.y - 19, 3, 38, { fill: color.mint });
  };
  const entries = [
    {
      from: T.bugLine,
      until: T.save,
      svg: code([bugLine], {
        ...stripLayout,
        spans:
          t >= T.bugMark
            ? [
                {
                  line: 0,
                  from: bugLine.indexOf('> 50'),
                  to: bugLine.indexOf('> 50') + 4,
                  fill: color.coral,
                },
              ]
            : [],
      }),
    },
    {
      from: T.save,
      until: T.replay,
      svg: code([saveLine], { ...stripLayout, reveal: saveTyping.reveal(t) }) + caret(saveTyping),
    },
    {
      from: T.replay,
      until: T.identity,
      svg:
        code([replayLine], {
          ...stripLayout,
          reveal: replayTyping.reveal(t),
          spans: [{ line: 0, from: 0, to: 21, fill: color.mint }],
        }) + caret(replayTyping),
    },
    {
      from: T.identity,
      until: T.endIn,
      svg: (() => {
        const edited = t >= T.identityEdit;
        const source = edited ? refusedLine : replayLine;
        const at = source.lastIndexOf('v');
        const grow = ease.back(span(t, T.identityEdit, 0.3));
        const spans = [
          { line: 0, from: 0, to: 21, fill: color.mint },
          ...(edited ? [{ line: 0, from: at, to: at + 2, fill: color.coral }] : []),
        ];
        return place(code([source], { ...stripLayout, spans }), {
          scale: edited ? 0.98 + 0.02 * grow : 1,
          origin: { x: STRIP.x + 820, y: STRIP.y + 56 },
        });
      })(),
    },
  ];
  for (const entry of entries) {
    const shown = presence(t, entry.from, entry.until, 0.25);
    if (shown > 0) {
      parts.push(place(entry.svg, { opacity: shown }));
    }
  }
  return place(parts.join(''), { opacity: visible });
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
      text(960, 832, 'fast-check replay · Mimlet identity checks · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const COUNTER_LEFT: Point = { x: LEFT.x + 120, y: TOP + 140 };
const COUNTER_RIGHT: Point = { x: RIGHT.x + 120, y: TOP + 140 };
const RESULT_LEFT: Point = { x: LEFT.x + 260, y: TOP + 270 };
const BUG_AT: Point = {
  x: STRIP.x + 36 + bugLine.indexOf('> 50') * monoWidth(34),
  y: STRIP.y + 58,
};
const recordRow = (row: number): Point => ({
  x: RIGHT.x + 260,
  y: recordLayout.y + row * recordLayout.lineHeight - 12,
});

const gaze: Key<Point>[] = [
  { at: 0, value: COUNTER_LEFT },
  { at: T.ciFail, value: RESULT_LEFT },
  { at: T.rerunPass - 0.4, value: COUNTER_RIGHT },
  { at: T.rerunPass, value: { x: RIGHT.x + 220, y: TOP + 250 } },
  { at: T.bugMark, value: BUG_AT },
  { at: 7.0, value: RESULT_LEFT },
  { at: T.saveTyping - 0.1, value: (t) => saveTyping.caret(t, stripLayout) },
  { at: T.recordLines, value: recordRow(0) },
  { at: T.recordLines + 0.6, value: recordRow(2) },
  { at: T.recordLines + 1.0, value: recordRow(5) },
  { at: T.replayTyping - 0.1, value: (t) => replayTyping.caret(t, stripLayout) },
  { at: T.replaying, value: recordRow(4) },
  { at: T.replayRun, value: COUNTER_LEFT },
  { at: T.reproduced, value: RESULT_LEFT },
  {
    at: T.identityEdit,
    value: { x: STRIP.x + 36 + refusedLine.lastIndexOf('v') * monoWidth(34), y: STRIP.y + 58 },
  },
  { at: T.currentIdentity, value: { x: LEFT.x + 160, y: TOP + 160 } },
  { at: T.mismatch, value: recordRow(2) },
  { at: T.refused, value: { x: LEFT.x + 260, y: TOP + 290 } },
  { at: 25.0, value: { x: 960, y: TOP + 160 } },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.ciFail, value: 'worried' },
  { at: T.rerunPass, value: 'open' },
  { at: T.rerunPass + 1.2, value: 'worried' },
  { at: T.save, value: 'smile' },
  { at: T.reproduced, value: 'grin' },
  { at: T.reproduced + 1.8, value: 'smile' },
  { at: T.refused, value: 'open' },
  { at: T.refused + 1.2, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.2, 6.4, 9.6, 13.2, 16.2, 20.0, 24.4, 27.8, 30.2];
const hops = [T.reproduced, T.endIn + 0.6];

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

const ticks = (from: number, to: number, count: number): Cue[] =>
  Array.from({ length: count }, (_, index): Cue => ({
    at: from + ((to - from) * index) / count,
    kind: 'key',
  }));

const cues: Cue[] = [
  ...ticks(T.ciRuns, T.ciFail, 14),
  { at: T.ciFail, kind: 'error' },
  ...ticks(T.rerunRuns, T.rerunPass, 16),
  { at: T.rerunPass, kind: 'line' },
  { at: T.bugLine, kind: 'line' },
  { at: T.bugMark, kind: 'pop' },
  ...saveTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.recordIn, kind: 'whoosh' },
  ...recordLines.map((_, index): Cue => ({ at: T.recordLines + index * 0.2, kind: 'line' })),
  ...replayTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.replayRun, kind: 'pop' },
  { at: T.reproduced, kind: 'error' },
  { at: T.identityEdit, kind: 'pop' },
  { at: T.mismatch, kind: 'error' },
  { at: T.refused, kind: 'line' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'replay',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Replay a failure'),
        captions(beats, t),
        leftCard(t),
        rightCard(t),
        bridge(t),
        strip(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
