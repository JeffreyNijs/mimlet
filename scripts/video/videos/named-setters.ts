/** Named setters: replace a hand-written builder file with fluent() on a schema builder. */
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
  frameSvg,
  glidePoint,
  lerp,
  midline,
  MONO,
  monoWidth,
  pill,
  place,
  presence,
  span,
  squiggle,
  step,
  text,
  typing,
  wordmark,
  type Beat,
  type CodeLayout,
  type CodeSpan,
  type Key,
  type Point,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * Everything the video shows was produced by this program with @mimlet/core and @mimlet/zod
 * 0.1.0-beta.0, zod 4.6.5 and TypeScript 6.0.3. Re-run it with
 * `node scripts/video/verify.ts named-setters` before changing any value below.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/zod': '0.1.0-beta.0',
    zod: '4.6.5',
    typescript: '6.0.3',
  },
  program: `import { fluent } from '@mimlet/core';
import { fromZod } from '@mimlet/zod';
import { z } from 'zod';

const User = z.object({
  name: z.string(),
  role: z.enum(['reader', 'admin']),
  email: z.email(),
});

const users = fluent(fromZod(User), ['name', 'role']);

console.log(JSON.stringify(users.withName('Ada').withRole('reader').buildValidated()));
`,
  stdout: '{"name":"Ada","role":"reader","email":"dave32@sample.io"}',
  mistakes: `users.withRole('owner');
users.withEmail('ada@example.com');
`,
  errors: [
    `TS2345: Argument of type '"owner"' is not assignable to parameter of type '"reader" | "admin"'.`,
    `TS2339: Property 'withEmail' does not exist on type 'FluentBuilder<`,
  ],
};

const T = {
  testTyping: 0.5,
  builderIn: 1.9,
  builderLines: 2.2,
  schemaIn: 3.7,
  emailAdded: 6.9,
  stale: 8.2,
  badge: 8.5,
  builderOut: 11.6,
  codeIn: 12.0,
  fluentTyping: 12.5,
  chainTyping: 17.8,
  fixtureIn: 20.2,
  flyName: 20.6,
  flyRole: 21.35,
  flyEmail: 22.1,
  flight: 0.6,
  validated: 23.1,
  editorIn: 26.4,
  mistakeOne: 27.2,
  mistakeTwo: 30.0,
  endIn: 34.6,
  end: 39.5,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Readable test data often means a builder file.',
    subtitle: 'One more file to keep in step with your schema.',
  },
  {
    at: 6.4,
    title: 'Add a field, and the builder falls behind.',
    subtitle: 'Its build() still returns users without an email.',
  },
  {
    at: 11.6,
    title: 'Pick the fields. Get the setters.',
    subtitle: 'fluent() adds withName() and withRole(). No builder file.',
  },
  {
    at: 17.4,
    title: 'Set only what the test cares about.',
    subtitle: 'Mimlet generates the rest from the schema, then Zod validates it.',
  },
  {
    at: T.editorIn,
    title: 'Mistakes fail in your editor.',
    subtitle: 'The setters use your schema’s types.',
  },
  { at: T.endIn, title: 'Named setters. No builder file.' },
];

// ---------------------------------------------------------------------------
// Layout: code across the top, the schema and the fixture side by side below it.

const TOP = 300;
const LOWER = 580;
const LEFT = { x: 140, width: 640 };
const RIGHT = { x: 840, width: 940 };
const FULL = { x: 140, width: 1640 };

const rowY = (index: number) => LOWER + 108 + index * 56;

const schemaRows = [
  ['name', 'string'],
  ['role', 'reader | admin'],
  ['email', 'email'],
] as const;
const schemaLayout = (index: number): CodeLayout => ({
  x: LEFT.x + 32,
  y: rowY(index),
  size: 30,
  lineHeight: 56,
});

const testUsage = ['new UserBuilder()', "  .withName('Ada')", '  .build();'];
const usagePanel = codePanel(LEFT.x, TOP, LEFT.width, 240, 'user.test.ts', 32);
const usageTyping = typing(testUsage, T.testTyping, 28);

const builderLines = [
  'class UserBuilder {',
  '  private user = defaultUser();',
  '  withName(name: string) { … }',
  '  withRole(role: Role) { … }',
  '  build() { return { ...this.user }; }',
  '}',
];
const BUILD_LINE = 4;
const builder = codePanel(RIGHT.x, TOP, RIGHT.width, 390, 'UserBuilder.ts', 32);
const builderLineTime = (index: number) => T.builderLines + index * 0.15;
const builderLineY = (index: number) => builder.layout.y + index * builder.layout.lineHeight;

const fluentLine = "const users = fluent(fromZod(User), ['name', 'role']);";
const chainLine = "users.withName('Ada').withRole('reader').buildValidated();";
const testLines = [fluentLine, chainLine];
const testPanel = (height: number) =>
  codePanel(FULL.x, TOP, FULL.width, height, 'user.test.ts', 36);
const testLayout = testPanel(0).layout;
const testPanelHeight = (lines: number) => 58 + 36 * 1.7 + (lines - 1) * testLayout.lineHeight + 36;
const fluentTyping = typing([fluentLine], T.fluentTyping, 24);
const chainTyping = typing(testLines, T.chainTyping, 26, 1);

const token = (line: string, value: string) => {
  const from = line.indexOf(value);
  return { from, to: from + value.length };
};
const nameField = token(fluentLine, "'name'");
const roleField = token(fluentLine, "'role'");
const adaArgument = token(chainLine, "'Ada'");
const readerArgument = token(chainLine, "'reader'");
const validateCall = token(chainLine, '.buildValidated()');
const chipTimes = [
  fluentTyping.timeOf(0, nameField.to - 1),
  fluentTyping.timeOf(0, roleField.to - 1),
];

const fixtureValues = [
  { label: 'name', value: "'Ada'", source: 'set' },
  { label: 'role', value: "'reader'", source: 'set' },
  { label: 'email', value: "'dave32@sample.io'", source: 'generated' },
] as const;
const VALUE_X = RIGHT.x + 160;
const slot = (row: number): Point => ({ x: VALUE_X + 16, y: rowY(row) });
/** Set values swing out to the right and enter their slot from the side, never crossing a landed value. */
const fromTheRight = (row: number): Point => ({ x: VALUE_X + 576, y: rowY(row) - 40 });
const flights = [
  { start: T.flyName, from: column(testLayout, 1, adaArgument.from), row: 0, size: 36 },
  { start: T.flyRole, from: column(testLayout, 1, readerArgument.from), row: 1, size: 36 },
  { start: T.flyEmail, from: column(schemaLayout(2), 0, 7), row: 2, size: 30 },
].map((flight) => ({
  ...flight,
  via:
    flight.row === 2
      ? { x: (flight.from.x + slot(2).x) / 2, y: rowY(2) }
      : fromTheRight(flight.row),
}));
const arrival = (row: number) => (flights[row]?.start ?? 0) + T.flight;

const editor = codePanel(FULL.x, TOP, FULL.width, 470, 'user.test.ts', 36);
const TIP = { size: 28, lineHeight: 40 };
const mistakes = [
  {
    line: "users.withRole('owner');",
    mark: "'owner'",
    y: editor.layout.y,
    start: T.mistakeOne,
    code: 'TS2345',
    // The compiler's exact wording, wrapped at a space.
    message: [
      `Argument of type '"owner"' is not assignable to`,
      `parameter of type '"reader" | "admin"'.`,
    ],
  },
  {
    line: "users.withEmail('ada@example.com');",
    mark: 'withEmail',
    y: editor.layout.y + 214,
    start: T.mistakeTwo,
    code: 'TS2339',
    // The full type name is long; the video elides it.
    message: ["Property 'withEmail' does not exist on type 'FluentBuilder<…>'."],
  },
].map((mistake) => {
  const layout = { ...editor.layout, y: mistake.y };
  const typed = typing([mistake.line], mistake.start, 26);
  return {
    ...mistake,
    ...token(mistake.line, mistake.mark),
    layout,
    typed,
    flagged: typed.end + 0.2,
  };
});

const MASCOT = { x: 120, y: 870, size: 200 };

// ---------------------------------------------------------------------------
// Scene pieces

const popIn = (content: string, t: number, at: number, centre: Point) => {
  const grow = ease.back(span(t, at, 0.35));
  return t < at ? '' : place(content, { scale: 0.6 + 0.4 * grow, origin: centre, opacity: grow });
};

function usageCard(t: number) {
  const opacity = presence(t, T.testTyping - 0.3, T.builderOut, 0.4);
  return place(
    usagePanel.svg +
      code(testUsage, { ...usagePanel.layout, reveal: usageTyping.reveal(t) }) +
      caretMark(t, usageTyping, usagePanel.layout),
    { opacity }
  );
}

function builderCard(t: number) {
  const leaving = ease.inOut(span(t, T.builderOut, 0.45));
  const opacity = presence(t, T.builderIn) * (1 - leaving);
  let reveal = 0;
  builderLines.forEach((source, index) => {
    if (t >= builderLineTime(index)) {
      reveal += source.length + 1;
    }
  });
  const y = builderLineY(BUILD_LINE);
  const stale = span(t, T.stale, 0.3);
  const parts = [
    builder.svg,
    box(RIGHT.x + 14, y - 33, RIGHT.width - 28, 46, {
      radius: 10,
      stroke: color.coral,
      strokeWidth: 2.5,
      opacity: stale,
    }),
    code(builderLines, {
      ...builder.layout,
      reveal,
      spans: stale > 0.5 ? [{ line: BUILD_LINE, from: 0, to: 99, fill: color.coral }] : [],
    }),
  ];
  const centre = { x: RIGHT.x + RIGHT.width - 130, y: TOP + 390 };
  const badge = pill(centre, 'missing email', {
    size: 24,
    weight: 700,
    background: color.coral,
    height: 44,
    padding: 20,
  });
  parts.push(popIn(badge.svg, t, T.badge, centre));
  return place(parts.join(''), { opacity, x: leaving * 70 });
}

function schemaCard(t: number) {
  const opacity = presence(t, T.schemaIn, T.editorIn);
  if (opacity <= 0) {
    return '';
  }
  const rows = 2 + ease.inOut(span(t, T.emailAdded, 0.45));
  const parts = [
    box(LEFT.x, LOWER, LEFT.width, 142 + (rows - 1) * 56, { radius: 22, fill: color.ink }),
    text(LEFT.x + 32, LOWER + 56, 'User · Zod', { size: 30, weight: 700, fill: color.paper }),
  ];
  const fresh = ease.out(span(t, T.emailAdded, 0.3)) * (1 - span(t, T.emailAdded + 1.8, 0.8));
  parts.push(
    box(LEFT.x + 14, rowY(2) - 38, LEFT.width - 28, 52, {
      radius: 12,
      stroke: color.mint,
      strokeWidth: 2.5,
      opacity: fresh,
    })
  );
  schemaRows.forEach(([name, type], index) => {
    const generating = index === 2 && t >= T.flyEmail && t < arrival(2) + 0.3;
    const highlighted = (index === 2 && fresh > 0.5) || generating;
    parts.push(
      code([`${name}: ${type}`], {
        ...schemaLayout(index),
        fill: highlighted ? color.mint : color.paper,
        spans: [
          {
            line: 0,
            from: name.length + 2,
            to: 99,
            fill: highlighted ? color.mint : color.codeDim,
          },
        ],
        opacity: index === 2 ? span(t, T.emailAdded + 0.15, 0.3) : 1,
      })
    );
  });
  ['.withName()', '.withRole()'].forEach((label, index) => {
    const width = label.length * monoWidth(26) + 28;
    const centre = { x: LEFT.x + LEFT.width - 20 - width / 2, y: rowY(index) - midline(30) };
    const chip = pill(centre, label, {
      size: 26,
      family: MONO,
      background: color.mint,
      height: 44,
    });
    parts.push(popIn(chip.svg, t, chipTimes[index] ?? 0, centre));
  });
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.schemaIn, 0.4))) * 14 });
}

function testCard(t: number) {
  const opacity = presence(t, T.codeIn, T.editorIn);
  if (opacity <= 0) {
    return '';
  }
  const lines = 1 + ease.inOut(span(t, T.chainTyping - 0.35, 0.35));
  const panel = testPanel(testPanelHeight(lines));
  const reveal = t < T.chainTyping ? fluentTyping.reveal(t) : chainTyping.reveal(t);
  const spans: CodeSpan[] = [];
  const highlight = (at: number, line: number, range: { from: number; to: number }) => {
    if (t >= at) {
      spans.push({ line, ...range, fill: color.mint });
    }
  };
  highlight(chipTimes[0] ?? 0, 0, nameField);
  highlight(chipTimes[1] ?? 0, 0, roleField);
  highlight(T.flyName, 1, adaArgument);
  highlight(T.flyRole, 1, readerArgument);
  highlight(T.validated, 1, validateCall);
  const active = t < T.chainTyping - 0.3 ? fluentTyping : chainTyping;
  return place(
    panel.svg +
      code(testLines, { ...testLayout, reveal, spans }) +
      caretMark(t, active, testLayout),
    { opacity }
  );
}

function fixtureCard(t: number) {
  const opacity = presence(t, T.fixtureIn, T.editorIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [
    box(RIGHT.x, LOWER, RIGHT.width, 254, { radius: 22, fill: color.card, stroke: color.rule }),
    text(RIGHT.x + 32, LOWER + 50, 'FIXTURE', {
      size: 22,
      weight: 700,
      fill: color.muted,
      spacing: 1.8,
    }),
  ];
  fixtureValues.forEach(({ label, value, source }, index) => {
    const y = rowY(index);
    parts.push(text(RIGHT.x + 32, y, label, { size: 28, weight: 600, fill: color.muted }));
    const landed = arrival(index);
    if (t < landed) {
      parts.push(text(VALUE_X + 16, y, '—', { size: 30, family: MONO, fill: color.faint }));
      return;
    }
    const grow = ease.back(span(t, landed, 0.3));
    const width = value.length * monoWidth(30) + 32;
    const centre = { x: VALUE_X + width / 2, y: y - midline(30) };
    const generated = source === 'generated';
    const valuePill =
      box(VALUE_X, centre.y - 23, width, 46, {
        radius: 12,
        fill: generated ? color.paper : color.mintSoft,
        stroke: generated ? color.rule : undefined,
      }) + text(VALUE_X + 16, y, value, { size: 30, family: MONO });
    const label2 = generated ? 'GENERATED' : 'SET';
    const tagWidth = generated ? 150 : 66;
    const tag = pill({ x: RIGHT.x + RIGHT.width - 28 - tagWidth / 2, y: centre.y }, label2, {
      size: 18,
      weight: 700,
      spacing: 1.4,
      background: generated ? color.paper : color.mint,
      border: generated ? color.rule : undefined,
      fill: generated ? color.muted : color.ink,
      height: 32,
      padding: 14,
    });
    parts.push(place(valuePill + tag.svg, { scale: 0.85 + 0.15 * grow, origin: centre }));
  });
  const badgeCentre = { x: RIGHT.x + RIGHT.width - 150, y: LOWER + 42 };
  const badge = pill(badgeCentre, 'VALIDATED BY ZOD', {
    size: 20,
    weight: 700,
    spacing: 1.4,
    background: color.mint,
    height: 40,
    padding: 18,
  });
  parts.push(popIn(badge.svg, t, T.validated, badgeCentre));
  return place(parts.join(''), {
    opacity,
    y: (1 - ease.out(span(t, T.fixtureIn, 0.4))) * 14,
  });
}

function flightPosition(index: number, t: number): Point {
  const flight = flights[index] ?? (flights[0] as (typeof flights)[number]);
  const p = ease.inOut(span(t, flight.start, T.flight));
  return curve(flight.from, flight.via, slot(flight.row), p);
}

function flyingValues(t: number) {
  return flights
    .map((flight, index) => {
      if (t < flight.start || t >= flight.start + T.flight) {
        return '';
      }
      const p = ease.inOut(span(t, flight.start, T.flight));
      const at = flightPosition(index, t);
      const size = lerp(flight.size, 30, p);
      const value = fixtureValues[flight.row]?.value ?? '';
      const width = value.length * monoWidth(size) + 28;
      return (
        box(at.x - 14, at.y - midline(size) - size * 0.78, width, size * 1.56, {
          radius: 12,
          fill: color.mint,
        }) + text(at.x, at.y, value, { size, family: MONO })
      );
    })
    .join('');
}

function editorCard(t: number) {
  const opacity = presence(t, T.editorIn + 0.35, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [editor.svg];
  for (const mistake of mistakes) {
    parts.push(
      code([mistake.line], {
        ...mistake.layout,
        reveal: mistake.typed.reveal(t),
        spans:
          t >= mistake.flagged
            ? [{ line: 0, from: mistake.from, to: mistake.to, fill: color.coral }]
            : [],
      }),
      caretMark(t, mistake.typed, mistake.layout)
    );
    const start = column(mistake.layout, 0, mistake.from);
    parts.push(
      squiggle(
        start.x,
        mistake.y + 16,
        (mistake.to - mistake.from) * monoWidth(mistake.layout.size),
        span(t, mistake.flagged, 0.3),
        color.coral
      )
    );
    const shown = ease.out(span(t, mistake.flagged + 0.15, 0.3));
    if (shown > 0) {
      const top = mistake.y + 38;
      const indent = (mistake.code.length + 2) * monoWidth(TIP.size);
      const longest = Math.max(...mistake.message.map((part) => part.length));
      const width = indent + longest * monoWidth(TIP.size) + 56;
      const height = mistake.message.length * TIP.lineHeight + 26;
      const first = top + 13 + TIP.lineHeight - 10;
      parts.push(
        place(
          box(FULL.x + 32, top, width, height, { radius: 10, fill: color.inkRaised }) +
            box(FULL.x + 32, top, 6, height, { radius: 3, fill: color.coral }) +
            text(FULL.x + 60, first, mistake.code, {
              size: TIP.size,
              family: MONO,
              weight: 700,
              fill: color.coral,
            }) +
            mistake.message
              .map((part, index) =>
                text(FULL.x + 60 + indent, first + index * TIP.lineHeight, part, {
                  size: TIP.size,
                  family: MONO,
                  fill: color.paper,
                })
              )
              .join(''),
          { opacity: shown, y: (1 - shown) * -8 }
        )
      );
    }
  }
  return place(parts.join(''), { opacity });
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/core @mimlet/zod', {
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
      text(960, 832, '@mimlet/core · zod 4.6.5 · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const chipPoint = (index: number): Point => ({
  x: LEFT.x + LEFT.width - 110,
  y: rowY(index) - midline(30),
});
const builderFollow = (t: number): Point => {
  const shown = builderLines.filter((_, index) => t >= builderLineTime(index)).length;
  return { x: RIGHT.x + 300, y: builderLineY(Math.max(0, shown - 1)) - 11 };
};
const tooltipPoint = (index: number): Point => ({
  x: FULL.x + 600,
  y: (mistakes[index]?.y ?? 0) + 80,
});

const gaze: Key<Point>[] = [
  { at: 0, value: { x: 460, y: 420 } },
  { at: T.testTyping - 0.1, value: (t) => usageTyping.caret(t, usagePanel.layout) },
  { at: T.builderLines - 0.1, value: builderFollow },
  { at: T.schemaIn, value: { x: 460, y: 650 } },
  { at: 5.0, value: { x: 1300, y: 520 } },
  { at: T.emailAdded, value: { x: 330, y: rowY(2) - 10 } },
  { at: T.stale, value: { x: 1150, y: builderLineY(BUILD_LINE) - 11 } },
  { at: T.badge + 0.1, value: { x: RIGHT.x + RIGHT.width - 130, y: TOP + 390 } },
  { at: T.builderOut, value: { x: 1500, y: 500 } },
  { at: T.fluentTyping - 0.1, value: (t) => fluentTyping.caret(t, testLayout) },
  { at: chipTimes[0] ?? 0, value: chipPoint(0) },
  { at: (chipTimes[0] ?? 0) + 0.25, value: (t) => fluentTyping.caret(t, testLayout) },
  { at: chipTimes[1] ?? 0, value: chipPoint(1) },
  { at: (chipTimes[1] ?? 0) + 1.4, value: { x: 900, y: 410 } },
  { at: T.chainTyping - 0.1, value: (t) => chainTyping.caret(t, testLayout) },
  { at: T.fixtureIn, value: { x: 1300, y: 680 } },
  { at: T.flyName, value: (t) => flightPosition(0, t) },
  { at: T.flyRole, value: (t) => flightPosition(1, t) },
  { at: T.flyEmail - 0.15, value: (t) => flightPosition(2, t) },
  { at: T.validated, value: { x: RIGHT.x + RIGHT.width - 150, y: LOWER + 42 } },
  { at: 24.8, value: { x: 1000, y: 680 } },
  ...mistakes.flatMap((mistake, index): Key<Point>[] => [
    { at: mistake.start - 0.1, value: (t) => mistake.typed.caret(t, mistake.layout) },
    { at: mistake.flagged, value: tooltipPoint(index) },
  ]),
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.badge, value: 'worried' },
  { at: 10.9, value: 'smile' },
  { at: chipTimes[0] ?? 0, value: 'grin' },
  { at: (chipTimes[1] ?? 0) + 0.7, value: 'smile' },
  { at: T.validated, value: 'grin' },
  { at: 25.1, value: 'smile' },
  ...mistakes.flatMap((mistake): Key<Mouth>[] => [
    { at: mistake.flagged, value: 'open' },
    { at: mistake.flagged + 1.1, value: 'smile' },
  ]),
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [3.2, 5.9, 10.2, 13.6, 16.4, 19.6, 25.5, 29.2, 33.1, 36.4, 38.6];
const hops = [...chipTimes, T.validated, T.endIn + 0.6];

function character(t: number) {
  const { hop, squash } = hopAt(t, hops);
  return mascot({
    ...MASCOT,
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
  ...usageTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...builderLines.map((_, index): Cue => ({ at: builderLineTime(index), kind: 'line' })),
  { at: T.schemaIn, kind: 'pop' },
  { at: T.emailAdded, kind: 'pop' },
  { at: T.badge, kind: 'error' },
  { at: T.builderOut, kind: 'whoosh' },
  ...fluentTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...chipTimes.map((at): Cue => ({ at, kind: 'pop' })),
  ...chainTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...flights.flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + T.flight, kind: 'pop' },
  ]),
  { at: T.validated, kind: 'success' },
  ...mistakes.flatMap((mistake): Cue[] => [
    ...mistake.typed.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
    { at: mistake.flagged, kind: 'error' },
  ]),
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'named-setters',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Named setters'),
        captions(beats, t),
        usageCard(t),
        builderCard(t),
        schemaCard(t),
        testCard(t),
        fixtureCard(t),
        flyingValues(t),
        editorCard(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
