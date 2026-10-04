/** Beta launch: the alpha badge turns beta, and the beta's fixtures show what changed. */
import type { Cue } from '../audio.ts';
import {
  box,
  captions,
  chrome,
  code,
  codePanel,
  color,
  ease,
  frameSvg,
  glidePoint,
  lerp,
  MONO,
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
 * Everything the video shows after the badge turns is this program's output with
 * @mimlet/zod 0.1.0-beta.0 and zod 4.6.5. Re-run it with `node scripts/video/verify.ts beta`.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/zod': '0.1.0-beta.0',
    zod: '4.6.5',
  },
  program: `import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { fromZod } from '@mimlet/zod';

const { version } = JSON.parse(readFileSync('node_modules/@mimlet/zod/package.json', 'utf8'));
console.log(\`@mimlet/zod \${version}\`);
const Delivery = z.object({
  status: z.enum(['OUT_FOR_DELIVERY', 'DELIVERED_TO_RECIPIENT']),
  at: z.iso.datetime(),
});
for (const delivery of fromZod(Delivery).buildList(3)) {
  console.log(\`\${delivery.status} \${delivery.at}\`);
}
`,
  stdout: [
    '@mimlet/zod 0.1.0-beta.0',
    'DELIVERED_TO_RECIPIENT 1999-08-21T09:20:13Z',
    'OUT_FOR_DELIVERY 2000-04-14T13:44:47Z',
    'DELIVERED_TO_RECIPIENT 2000-06-19T05:02:29Z',
  ].join('\n'),
};

const deliveries = [
  { status: 'DELIVERED_TO_RECIPIENT', at: '1999-08-21T09:20:13Z' },
  { status: 'OUT_FOR_DELIVERY', at: '2000-04-14T13:44:47Z' },
  { status: 'DELIVERED_TO_RECIPIENT', at: '2000-06-19T05:02:29Z' },
];

const T = {
  badgeIn: 0.3,
  flip: 1.9,
  version: 2.3,
  sceneOut: 4.6,
  code: 5.0,
  typing: 6.1,
  results: 8.9,
  resultGap: 0.5,
  endIn: 13.2,
  end: 18.2,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Mimlet has its first beta.',
    subtitle: 'It’s on npm now, and a plain install gets it.',
  },
  {
    at: T.code,
    title: 'Same builders. Fresher fixtures.',
    subtitle: 'Long enum values and varied UTC dates now generate as they should.',
  },
  { at: T.endIn, title: 'Try it, and tell us what’s confusing.' },
];

// ---------------------------------------------------------------------------
// Scene 1: the badge next to the wordmark turns from alpha to beta.

// One centred row: mascot, wordmark, badge. The wordmark is 301 units wide at scale 1.
const MARK = { x: 695, y: 478, scale: 2.0 };
const MARK_RIGHT = MARK.x + 301 * MARK.scale;
const BADGE_STYLE = { size: 64, weight: 800, height: 112, padding: 40 } as const;
const ALPHA_WIDTH = pill({ x: 0, y: 0 }, 'alpha', { ...BADGE_STYLE, background: '' }).width;
const BADGE: Point = { x: MARK_RIGHT + 40 + ALPHA_WIDTH / 2, y: 560 };

/** A four-pointed sparkle that grows and fades after the flip. */
function sparkle(centre: Point, radius: number, t: number, at: number, fill: string) {
  const p = span(t, at, 0.7);
  if (p <= 0 || p >= 1) {
    return '';
  }
  const r = radius * ease.out(p);
  const w = r * 0.28;
  const { x, y } = centre;
  const d = `M${x} ${y - r}Q${x + w} ${y - w} ${x + r} ${y}Q${x + w} ${y + w} ${x} ${y + r}Q${x - w} ${y + w} ${x - r} ${y}Q${x - w} ${y - w} ${x} ${y - r}Z`;
  return `<path d="${d}" fill="${fill}" opacity="${(1 - ease.inOut(p)).toFixed(3)}"/>`;
}

// Kept to the badge's side of the row, so no sparkle crosses the wordmark.
const sparkles = [
  { dx: -96, dy: -86, r: 22, delay: 0, fill: color.mint },
  { dx: 132, dy: -76, r: 20, delay: 0.08, fill: color.coral },
  { dx: 164, dy: 50, r: 24, delay: 0.14, fill: color.mint },
  { dx: 36, dy: 98, r: 18, delay: 0.2, fill: color.coral },
  { dx: -88, dy: 92, r: 16, delay: 0.26, fill: color.mint },
];

function badge(t: number) {
  const opacity = presence(t, T.badgeIn, T.sceneOut);
  if (opacity <= 0) {
    return '';
  }
  const alpha = pill(BADGE, 'alpha', {
    ...BADGE_STYLE,
    background: color.coralSoft,
    fill: color.ink,
  });
  const beta = pill(BADGE, 'beta', { ...BADGE_STYLE, background: color.mint, fill: color.ink });
  // The alpha badge shrinks away as the beta badge pops in on the same spot.
  const leaving = 1 - ease.inOut(span(t, T.flip - 0.25, 0.25));
  const parts = [
    place(wordmark(MARK.x, MARK.y, MARK.scale), {
      opacity: ease.out(span(t, T.badgeIn, 0.4)),
    }),
    t < T.flip
      ? place(alpha.svg, {
          opacity: Math.min(ease.out(span(t, T.badgeIn + 0.2, 0.35)), leaving),
          scale: 0.7 + 0.3 * leaving,
          origin: BADGE,
        })
      : popIn(beta.svg, t, T.flip, BADGE),
    ...sparkles.map((s) =>
      sparkle({ x: BADGE.x + s.dx, y: BADGE.y + s.dy }, s.r, t, T.flip + s.delay, s.fill)
    ),
    place(
      text(MARK.x + 301 * MARK.scale * 0.5, 724, '@mimlet/zod 0.1.0-beta.0', {
        size: 36,
        family: MONO,
        fill: color.muted,
        anchor: 'middle',
      }),
      { opacity: ease.out(span(t, T.version, 0.4)), y: (1 - ease.out(span(t, T.version, 0.4))) * 8 }
    ),
  ];
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// Scene 2: the schema, a list of three, and what the beta generates.

const lines = [
  'const Delivery = z.object({',
  "  status: z.enum(['OUT_FOR_DELIVERY',",
  "                  'DELIVERED_TO_RECIPIENT']),",
  '  at: z.iso.datetime(),',
  '});',
  '',
  'fromZod(Delivery).buildList(3);',
];
const panel = codePanel(120, 300, 940, 440, 'deliveries.mjs', 30);
const typed = typing(lines, T.typing, 18, 6);

function source(t: number) {
  const opacity = presence(t, T.code, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const longValue = lines[2]?.indexOf("'DELIVERED_TO_RECIPIENT'") ?? 0;
  const datetime = lines[3]?.indexOf('z.iso.datetime()') ?? 0;
  const spans =
    t >= T.results
      ? [
          { line: 2, from: longValue, to: longValue + 24, fill: color.mint },
          { line: 3, from: datetime, to: datetime + 16, fill: color.mint },
        ]
      : [];
  const caret =
    t >= typed.start - 0.2 && t <= typed.end + 0.8 && (t < typed.end || Math.floor(t * 3) % 2 === 0)
      ? (() => {
          const at = typed.caret(t, panel.layout);
          return box(at.x + 1, at.y - 18, 3, 36, { fill: color.mint });
        })()
      : '';
  return place(
    panel.svg + code(lines, { ...panel.layout, reveal: typed.reveal(t), spans }) + caret,
    { opacity, y: (1 - ease.out(span(t, T.code, 0.4))) * 14 }
  );
}

const CARD = { x: 1120, width: 680, height: 132, gap: 22, top: 300 };
const cardTop = (index: number) => CARD.top + index * (CARD.height + CARD.gap);

function results(t: number) {
  const opacity = presence(t, T.code, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts: string[] = [];
  deliveries.forEach((delivery, index) => {
    const at = T.results + index * T.resultGap;
    const top = cardTop(index);
    if (t < at) {
      parts.push(
        box(CARD.x, top, CARD.width, CARD.height, {
          radius: 20,
          fill: color.card,
          stroke: color.rule,
        })
      );
      return;
    }
    const centre = { x: CARD.x + CARD.width / 2, y: top + CARD.height / 2 };
    const long = delivery.status.length > 16;
    parts.push(
      popIn(
        box(CARD.x, top, CARD.width, CARD.height, {
          radius: 20,
          fill: color.card,
          stroke: long ? color.mintText : color.rule,
        }) +
          verdict({ x: CARD.x + 52, y: top + CARD.height / 2 }, true, 20) +
          text(CARD.x + 96, top + 56, delivery.status, {
            size: 30,
            weight: 700,
            family: MONO,
            fill: long ? color.mintText : color.ink,
          }) +
          text(CARD.x + 96, top + 104, delivery.at, { size: 28, family: MONO, fill: color.muted }),
        t,
        at,
        centre
      )
    );
  });
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// End card

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const install = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/zod zod', {
    size: 30,
    family: MONO,
    weight: 700,
    background: color.ink,
    fill: color.paper,
    height: 64,
    padding: 28,
  }).svg;
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      pill({ x: 1306, y: 368 }, 'beta', {
        size: 34,
        weight: 800,
        background: color.mint,
        fill: color.ink,
        height: 60,
        padding: 22,
      }).svg +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      install +
      text(960, 840, 'First beta · feedback welcome', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot starts big beside the badge, then settles into its corner.

const BIG = { x: 335, y: 410, size: 300 };
const SMALL = { x: 120, y: 870, size: 200 };

function pose(t: number) {
  const p = ease.inOut(span(t, T.sceneOut - 0.2, 0.7));
  return {
    x: lerp(BIG.x, SMALL.x, p),
    y: lerp(BIG.y, SMALL.y, p),
    size: lerp(BIG.size, SMALL.size, p),
  };
}

const card = (index: number): Point => ({ x: CARD.x + 260, y: cardTop(index) + 60 });
const gaze: Key<Point>[] = [
  { at: 0, value: { x: MARK.x + 200, y: 560 } },
  { at: T.badgeIn + 0.4, value: BADGE },
  { at: T.version, value: { x: MARK.x + 301 * MARK.scale * 0.5, y: 712 } },
  { at: 3.6, value: BADGE },
  { at: T.code + 0.2, value: { x: 500, y: 420 } },
  { at: T.typing - 0.1, value: (t: number) => typed.caret(t, panel.layout) },
  ...deliveries.map((_, index): Key<Point> => ({
    at: T.results + index * T.resultGap,
    value: card(index),
  })),
  { at: 11.8, value: { x: 640, y: 420 } },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const lastResult = T.results + (deliveries.length - 1) * T.resultGap;
const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.flip, value: 'grin' },
  { at: T.flip + 1.8, value: 'smile' },
  { at: lastResult, value: 'grin' },
  { at: lastResult + 1.4, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [1.2, 3.8, 6.6, 10.6, 12.4, 15.2, 17.4];
const hops = [T.flip, T.flip + 0.6, lastResult, T.endIn + 0.6];

function character(t: number) {
  const { hop, squash } = hopAt(t, hops, 22);
  return mascot({
    ...pose(t),
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
  { at: T.badgeIn, kind: 'line' },
  { at: T.flip, kind: 'pop' },
  { at: T.flip + 0.12, kind: 'chime' },
  { at: T.sceneOut, kind: 'whoosh' },
  ...typed.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...deliveries.map((_, index): Cue => ({ at: T.results + index * T.resultGap, kind: 'pop' })),
  { at: lastResult + 0.1, kind: 'success' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'beta',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('First beta'),
        captions(beats, t),
        badge(t),
        source(t),
        results(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
