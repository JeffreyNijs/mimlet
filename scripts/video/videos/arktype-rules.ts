/** ArkType rules: generate fixtures that satisfy a type's constraints, with ArkType's own messages. */
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
  type CodeSpan,
  type Key,
  type Point,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * Everything the video shows was produced by this program with @mimlet/arktype 0.1.0-beta.0
 * and ArkType 2.2.5. Re-run it with `node scripts/video/verify.ts arktype-rules` before
 * changing any value below.
 */
export const facts = {
  packages: { '@mimlet/arktype': '0.1.0-beta.0', arktype: '2.2.5' },
  program: `import { type } from 'arktype';
import { fromArkType } from '@mimlet/arktype';

const User = type({
  name: '1 <= string <= 20',
  email: 'string.email',
  age: '18 <= number.integer <= 99',
  role: "'reader' | 'admin'",
});

const handWritten = { name: 'Test', email: 'test@', age: 30, role: 'owner' };
const checked = User(handWritten);
console.log(JSON.stringify(checked instanceof type.errors ? checked.map((issue) => issue.message) : checked));

const users = fromArkType(User);
console.log(JSON.stringify(users.buildValidated()));
console.log(JSON.stringify(users.with({ name: 'Ada', role: 'reader' }).buildValidated()));
try {
  users.with({ name: 'Ada', role: 'reader', age: 15 }).buildValidated();
} catch (error) {
  console.log(JSON.stringify(error.issues.map((issue) => issue.message)));
}
`,
  stdout: [
    '["email must be an email address (was \\"test@\\")","role must be \\"admin\\" or \\"reader\\" (was \\"owner\\")"]',
    '{"age":46,"email":"bob858@demo.net","name":"FifpfL59da5Vv8F2","role":"admin"}',
    '{"age":46,"email":"bob858@demo.net","name":"Ada","role":"reader"}',
    '["age must be at least 18 (was 15)"]',
  ].join('\n'),
};

const T = {
  typeIn: 0.2,
  typeRows: 0.45,
  codeIn: 1.0,
  handTyping: 1.3,
  checkTyping: 3.85,
  verdicts: 4.55,
  generate: 8.2,
  genTyping: 8.6,
  flights: 10.75,
  flightGap: 0.45,
  generatedFlight: 0.5,
  validated: 12.9,
  override: 15.3,
  overrideTyping: 15.6,
  flyName: 17.1,
  flyRole: 17.8,
  flight: 0.6,
  revalidated: 18.7,
  breakRule: 21.2,
  breakTyping: 21.6,
  flyAge: 22.2,
  rejected: 23.2,
  endIn: 27.4,
  end: 32.5,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Hand-written fixtures have to obey every rule.',
    subtitle: 'This one breaks two of them.',
  },
  {
    at: T.generate,
    title: 'Let the type write the fixture.',
    subtitle: 'fromArkType() samples values that satisfy every rule.',
  },
  {
    at: T.override,
    title: 'Then set what the test is about.',
    subtitle: 'Your values go through ArkType as well.',
  },
  {
    at: T.breakRule,
    title: 'Break a rule, and ArkType says which.',
    subtitle: 'buildValidated() keeps ArkType’s own messages.',
  },
  { at: T.endIn, title: 'Your ArkType rules. Valid fixtures.' },
];

// ---------------------------------------------------------------------------
// Layout: code across the top, the type's rules and the fixture side by side, rows aligned.

const TOP = 300;
const LOWER = 560;
const LEFT = { x: 140, width: 700 };
const RIGHT = { x: 900, width: 880 };
const FULL = { x: 140, width: 1640 };
const rowY = (index: number) => LOWER + 108 + index * 56;

const rules = [
  ['name', "'1 <= string <= 20'"],
  ['email', "'string.email'"],
  ['age', "'18 <= number.integer <= 99'"],
  ['role', `"'reader' | 'admin'"`],
] as const;
const ruleLine = (index: number) => {
  const [key, rule] = rules[index] ?? rules[0];
  return `${`${key}:`.padEnd(7)}${rule}`;
};
const ruleLayout = (index: number): CodeLayout => ({
  x: LEFT.x + 32,
  y: rowY(index),
  size: 30,
  lineHeight: 56,
});
const ruleEnd = (index: number) => column(ruleLayout(index), 0, ruleLine(index).length);

const handLine = "const user = { name: 'Test', email: 'test@', age: 30, role: 'owner' };";
const checkLine = 'User(user);';
const handTyping = typing([handLine], T.handTyping, 32);
const checkTyping = typing([handLine, checkLine], T.checkTyping, 32, 1);

const generateLines = ['const users = fromArkType(User);', 'users.buildValidated();'];
const genTyping = typing(generateLines, T.genTyping, 30);
const overrideInsert = ".with({ name: 'Ada', role: 'reader' })";
const overrideLine = `users${overrideInsert}.buildValidated();`;
const breakAt = overrideLine.indexOf(' })');
const breakInsert = ', age: 15';
const breakLine = `${overrideLine.slice(0, breakAt)}${breakInsert}${overrideLine.slice(breakAt)}`;
const overrideTyping = typing([overrideInsert], T.overrideTyping, 30);
const breakTyping = typing([breakInsert], T.breakTyping, 30);

const panel = (lines: number) =>
  codePanel(FULL.x, TOP, FULL.width, 58 + 36 * 1.7 + (lines - 1) * 55.08 + 36, 'user.test.ts', 36);
const codeLayout = panel(1).layout;

const token = (line: string, value: string) => {
  const from = line.indexOf(value);
  return { from, to: from + value.length };
};

const handValues = ["'Test'", "'test@'", '30', "'owner'"];
const handTimes = handValues.map((value) => handTyping.timeOf(0, token(handLine, value).to - 1));
const verdictTimes = rules.map((_, index) => T.verdicts + index * 0.3);
const handMessages: (string | undefined)[] = [
  undefined,
  'email must be an email address (was "test@")',
  undefined,
  'role must be "admin" or "reader" (was "owner")',
];
const generated = ["'FifpfL59da5Vv8F2'", "'bob858@demo.net'", '46', "'admin'"];
const generatedArrival = (index: number) => T.flights + index * T.flightGap + T.generatedFlight;

const VALUE_X = RIGHT.x + 150;
const MARK_X = RIGHT.x + RIGHT.width - 40;
const slot = (row: number): Point => ({ x: VALUE_X + 16, y: rowY(row) });
const fromTheRight = (row: number): Point => ({ x: VALUE_X + 560, y: rowY(row) - 40 });

interface Flight {
  start: number;
  duration: number;
  from: Point;
  via: Point;
  row: number;
  value: string;
  size: number;
}
const flights: Flight[] = [
  ...generated.map((value, row) => {
    const from = ruleEnd(row);
    return {
      start: T.flights + row * T.flightGap,
      duration: T.generatedFlight,
      from: { x: from.x - 20, y: from.y },
      via: { x: (from.x + slot(row).x) / 2, y: rowY(row) },
      row,
      value,
      size: 30,
    };
  }),
  {
    start: T.flyName,
    duration: T.flight,
    from: column(codeLayout, 1, token(overrideLine, "'Ada'").from),
    via: fromTheRight(0),
    row: 0,
    value: "'Ada'",
    size: 36,
  },
  {
    start: T.flyRole,
    duration: T.flight,
    from: column(codeLayout, 1, token(overrideLine, "'reader'").from),
    via: fromTheRight(3),
    row: 3,
    value: "'reader'",
    size: 36,
  },
  {
    start: T.flyAge,
    duration: T.flight,
    from: column(codeLayout, 1, token(breakLine, '15').from),
    via: fromTheRight(2),
    row: 2,
    value: '15',
    size: 36,
  },
];
const flightPosition = (flight: Flight, t: number) =>
  curve(
    flight.from,
    flight.via,
    slot(flight.row),
    ease.inOut(span(t, flight.start, flight.duration))
  );

const MASCOT = { x: 120, y: 870, size: 200 };

// ---------------------------------------------------------------------------
// What each fixture row shows at time t

type Source = 'hand' | 'generated' | 'set';
interface RowState {
  value: string;
  source: Source;
  since: number;
  pass?: boolean;
  judged?: number;
  message?: string;
}

function rowState(row: number, t: number): RowState | undefined {
  if (t < T.generate) {
    const since = handTimes[row] ?? 0;
    if (t < since) {
      return undefined;
    }
    const judged = verdictTimes[row] ?? 0;
    const message = handMessages[row];
    return { value: handValues[row] ?? '', source: 'hand', since, judged, pass: !message, message };
  }
  const landed = generatedArrival(row);
  if (t < landed) {
    return undefined;
  }
  let state: RowState = {
    value: generated[row] ?? '',
    source: 'generated',
    since: landed,
    judged: landed + 0.1,
    pass: true,
  };
  for (const flight of flights.slice(rules.length)) {
    const arrived = flight.start + flight.duration;
    if (flight.row === row && t >= arrived) {
      state = {
        value: flight.value,
        source: 'set',
        since: arrived,
        judged: arrived + 0.1,
        pass: true,
      };
    }
  }
  if (row === 2 && t >= T.flyAge + T.flight) {
    // The bad age is only judged when buildValidated() rejects it.
    state = {
      ...state,
      pass: false,
      judged: T.rejected,
      message: 'age must be at least 18 (was 15)',
    };
  }
  return state;
}

// ---------------------------------------------------------------------------
// Scene pieces

function typeCard(t: number) {
  const opacity = presence(t, T.typeIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [
    box(LEFT.x, LOWER, LEFT.width, 310, { radius: 22, fill: color.ink }),
    text(LEFT.x + 32, LOWER + 56, 'User · ArkType', { size: 30, weight: 700, fill: color.paper }),
  ];
  rules.forEach(([key], index) => {
    const failing =
      (t >= (verdictTimes[index] ?? 0) && t < T.generate && handMessages[index] !== undefined) ||
      (index === 2 && t >= T.rejected);
    const source = flights[index];
    const sampling = source !== undefined && t >= source.start - 0.15 && t < source.start + 0.7;
    const accent = failing ? color.coral : sampling ? color.mint : undefined;
    if (accent) {
      parts.push(
        box(LEFT.x + 14, rowY(index) - 38, LEFT.width - 28, 52, {
          radius: 12,
          stroke: accent,
          strokeWidth: 2.5,
        })
      );
    }
    parts.push(
      code([ruleLine(index)], {
        ...ruleLayout(index),
        fill: accent ?? color.paper,
        spans: [{ line: 0, from: key.length + 1, to: 99, fill: accent ?? color.codeDim }],
        opacity: span(t, T.typeRows + index * 0.15, 0.25),
      })
    );
  });
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.typeIn, 0.4))) * 14 });
}

function codeCard(t: number) {
  const opacity = presence(t, T.codeIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const lines = 1 + ease.inOut(span(t, T.checkTyping - 0.3, 0.3));
  const parts = [panel(lines).svg];
  if (t < T.generate + 0.3) {
    const spans: CodeSpan[] = [];
    handMessages.forEach((message, index) => {
      if (message && t >= (verdictTimes[index] ?? 0)) {
        spans.push({ line: 0, ...token(handLine, handValues[index] ?? ''), fill: color.coral });
      }
    });
    const reveal = t < T.checkTyping ? handTyping.reveal(t) : checkTyping.reveal(t);
    const active = t < T.checkTyping - 0.2 ? handTyping : checkTyping;
    parts.push(
      place(
        code([handLine, checkLine], { ...codeLayout, reveal, spans }) +
          caretMark(t, active, codeLayout),
        { opacity: 1 - span(t, T.generate, 0.25) }
      )
    );
  }
  if (t >= T.genTyping - 0.2) {
    let second = generateLines[1] ?? '';
    let caret: Point | undefined;
    const insertion = (base: string, at: number, typed: typeof overrideTyping, value: string) => {
      const count = typed.reveal(t);
      if (t >= typed.start - 0.2 && t <= typed.end + 0.6) {
        caret = column(codeLayout, 1, at + Math.min(count, value.length));
      }
      return `${base.slice(0, at)}${value.slice(0, count)}${base.slice(at)}`;
    };
    if (t >= T.breakTyping) {
      second = insertion(overrideLine, breakAt, breakTyping, breakInsert);
    } else if (t >= T.overrideTyping) {
      second = insertion(generateLines[1] ?? '', 'users'.length, overrideTyping, overrideInsert);
    }
    const spans: CodeSpan[] = [];
    if (t >= T.flyName) {
      spans.push({ line: 1, ...token(second, "'Ada'"), fill: color.mint });
    }
    if (t >= T.flyRole) {
      spans.push({ line: 1, ...token(second, "'reader'"), fill: color.mint });
    }
    if (t >= T.flyAge) {
      spans.push({
        line: 1,
        ...token(second, '15'),
        fill: t >= T.rejected ? color.coral : color.mint,
      });
    }
    parts.push(
      code([generateLines[0] ?? '', second], {
        ...codeLayout,
        reveal: t < T.overrideTyping ? genTyping.reveal(t) : Infinity,
        spans,
      }),
      caretMark(t, genTyping, codeLayout)
    );
    if (caret) {
      const on = Math.floor(t * 3) % 2 === 0 || t < T.breakTyping + 0.3;
      if (on) {
        parts.push(box(caret.x + 1, caret.y - midline(36) - 19, 3, 38, { fill: color.mint }));
      }
    }
  }
  return place(parts.join(''), { opacity });
}

function headerBadge(t: number) {
  const right = RIGHT.x + RIGHT.width - 28;
  const badge = (label: string, background: string, fill: string, border?: string) => {
    const width = estimateSans(label, 20, 700, 1.4) + 36;
    const centre = { x: right - width / 2, y: LOWER + 42 };
    return {
      centre,
      svg: pill(centre, label, {
        size: 20,
        weight: 700,
        spacing: 1.4,
        background,
        fill,
        border,
        height: 40,
        padding: 18,
      }).svg,
    };
  };
  if (t < T.generate) {
    const hand = badge('WRITTEN BY HAND', color.paper, color.muted, color.rule);
    return place(hand.svg, { opacity: 1 - span(t, T.generate - 0.25, 0.25) });
  }
  if (t >= T.rejected) {
    const rejected = badge('REJECTED BY ARKTYPE', color.coral, color.ink);
    return popIn(rejected.svg, t, T.rejected, rejected.centre);
  }
  // Hide the verdict while the next build is being written; it returns once that build passes.
  const rewriting =
    (t >= T.overrideTyping && t < T.revalidated) || (t >= T.breakTyping && t < T.rejected);
  const valid = badge('VALIDATED BY ARKTYPE', color.mint, color.ink);
  const at = t >= T.revalidated ? T.revalidated : T.validated;
  const leaving = t >= T.overrideTyping && t < T.revalidated ? T.overrideTyping : T.breakTyping;
  return rewriting
    ? place(valid.svg, { opacity: 1 - span(t, leaving, 0.25) })
    : popIn(valid.svg, t, at, valid.centre);
}

function fixtureCard(t: number) {
  const opacity = presence(t, T.codeIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [
    box(RIGHT.x, LOWER, RIGHT.width, 310, { radius: 22, fill: color.card, stroke: color.rule }),
    text(RIGHT.x + 32, LOWER + 50, 'FIXTURE', {
      size: 22,
      weight: 700,
      fill: color.muted,
      spacing: 1.8,
    }),
    headerBadge(t),
  ];
  rules.forEach(([key], row) => {
    const y = rowY(row);
    parts.push(text(RIGHT.x + 32, y, key, { size: 28, weight: 600, fill: color.muted }));
    // Hand-written values fade out together when the generated fixture replaces them, and a
    // value being overridden fades while its replacement is in flight, so the two never overlap.
    const leaving =
      t >= T.generate && t < T.generate + 0.3 ? rowState(row, T.generate - 0.01) : undefined;
    const incoming = flights
      .slice(rules.length)
      .find(
        (flight) => flight.row === row && t >= flight.start && t < flight.start + flight.duration
      );
    const state = leaving ?? rowState(row, t);
    if (!state) {
      parts.push(text(VALUE_X + 16, y, '—', { size: 30, family: MONO, fill: color.faint }));
      return;
    }
    const fade = leaving
      ? 1 - span(t, T.generate, 0.3)
      : incoming
        ? 1 - span(t, incoming.start, incoming.duration * 0.45)
        : 1;
    const centreY = y - midline(30);
    const failed = state.pass === false && t >= (state.judged ?? Infinity);
    const width = state.value.length * monoWidth(30) + 32;
    const grow = ease.back(span(t, state.since, 0.3));
    // A failing hand-written row shows ArkType's message instead; it already quotes the value.
    const messageOnly = failed && state.source === 'hand';
    const pieces = messageOnly
      ? []
      : [
          box(VALUE_X, centreY - 23, width, 46, {
            radius: 12,
            fill: failed
              ? color.coralSoft
              : state.source === 'generated'
                ? color.paper
                : color.mintSoft,
            stroke: failed ? color.coral : state.source === 'generated' ? color.rule : undefined,
            strokeWidth: failed ? 2.5 : 2,
          }),
          text(VALUE_X + 16, y, state.value, { size: 30, family: MONO }),
        ];
    if (failed && state.message) {
      const x = messageOnly ? VALUE_X + 4 : VALUE_X + width + 20;
      pieces.push(
        place(text(x, y - 1, state.message, { size: 24, fill: color.ink }), {
          opacity: ease.out(span(t, state.judged ?? 0, 0.3)),
        })
      );
    } else if (state.source !== 'hand') {
      const label = state.source === 'generated' ? 'GENERATED' : 'SET';
      const tagWidth = estimateSans(label, 18, 700, 1.4) + 28;
      pieces.push(
        pill({ x: MARK_X - 34 - tagWidth / 2, y: centreY }, label, {
          size: 18,
          weight: 700,
          spacing: 1.4,
          background: state.source === 'generated' ? color.paper : color.mint,
          border: state.source === 'generated' ? color.rule : undefined,
          fill: state.source === 'generated' ? color.muted : color.ink,
          height: 32,
          padding: 14,
        }).svg
      );
    }
    if (state.judged !== undefined && t >= state.judged) {
      const centre = { x: MARK_X, y: centreY };
      pieces.push(popIn(verdict(centre, !failed), t, state.judged, centre));
    }
    parts.push(
      place(pieces.join(''), {
        opacity: fade,
        scale: 0.85 + 0.15 * grow,
        origin: { x: VALUE_X + width / 2, y: centreY },
      })
    );
  });
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.codeIn, 0.4))) * 14 });
}

function flyingValues(t: number) {
  return flights
    .map((flight) => {
      if (t < flight.start || t >= flight.start + flight.duration) {
        return '';
      }
      const p = ease.inOut(span(t, flight.start, flight.duration));
      const at = flightPosition(flight, t);
      const size = lerp(flight.size, 30, p);
      const width = flight.value.length * monoWidth(size) + 28;
      return (
        box(at.x - 14, at.y - midline(size) - size * 0.78, width, size * 1.56, {
          radius: 12,
          fill: color.mint,
        }) + text(at.x, at.y, flight.value, { size, family: MONO })
      );
    })
    .join('');
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/arktype arktype@2.2.5', {
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
      text(960, 832, '@mimlet/arktype · arktype 2.2.5 · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const messagePoint = (row: number): Point => ({ x: VALUE_X + 400, y: rowY(row) - 12 });
const rulePoint = (row: number): Point => ({ x: LEFT.x + 360, y: rowY(row) - 12 });
const insertionCaret = (typed: typeof overrideTyping, at: number) => (t: number) => {
  const point = column(codeLayout, 1, at + typed.reveal(t));
  return { x: point.x, y: point.y - midline(36) };
};
const follow = (flight: Flight | undefined) => (t: number) =>
  flight ? flightPosition(flight, t) : { x: 960, y: 540 };

const gaze: Key<Point>[] = [
  { at: 0, value: { x: 480, y: 700 } },
  { at: T.handTyping - 0.1, value: (t) => handTyping.caret(t, codeLayout) },
  { at: T.checkTyping - 0.1, value: (t) => checkTyping.caret(t, codeLayout) },
  { at: verdictTimes[0] ?? 0, value: { x: MARK_X - 200, y: rowY(1) } },
  { at: verdictTimes[1] ?? 0, value: messagePoint(1) },
  { at: verdictTimes[3] ?? 0, value: messagePoint(3) },
  { at: 6.2, value: rulePoint(3) },
  { at: 7.0, value: rulePoint(1) },
  { at: T.genTyping - 0.1, value: (t) => genTyping.caret(t, codeLayout) },
  ...flights
    .slice(0, rules.length)
    .map((flight): Key<Point> => ({ at: flight.start - 0.1, value: follow(flight) })),
  { at: T.validated, value: { x: RIGHT.x + RIGHT.width - 150, y: LOWER + 42 } },
  { at: 14.0, value: { x: 1300, y: 720 } },
  { at: T.overrideTyping - 0.1, value: insertionCaret(overrideTyping, 'users'.length) },
  { at: T.flyName - 0.1, value: follow(flights[rules.length]) },
  { at: T.flyRole - 0.1, value: follow(flights[rules.length + 1]) },
  { at: T.revalidated, value: { x: RIGHT.x + RIGHT.width - 150, y: LOWER + 42 } },
  { at: 20.0, value: { x: 1300, y: 720 } },
  { at: T.breakTyping - 0.1, value: insertionCaret(breakTyping, breakAt) },
  { at: T.flyAge - 0.1, value: follow(flights[rules.length + 2]) },
  { at: T.rejected, value: messagePoint(2) },
  { at: 24.4, value: rulePoint(2) },
  { at: 25.4, value: { x: RIGHT.x + RIGHT.width - 170, y: LOWER + 42 } },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: verdictTimes[1] ?? 0, value: 'worried' },
  { at: 7.6, value: 'smile' },
  { at: T.validated, value: 'grin' },
  { at: 14.4, value: 'smile' },
  { at: T.revalidated, value: 'grin' },
  { at: 19.9, value: 'smile' },
  { at: T.rejected, value: 'open' },
  { at: T.rejected + 1.2, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.6, 6.8, 9.9, 14.2, 16.4, 20.3, 25.9, 29.6, 31.4];
const hops = [T.validated, T.revalidated, T.endIn + 0.6];

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
  ...rules.map((_, index): Cue => ({ at: T.typeRows + index * 0.15, kind: 'line' })),
  ...handTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...checkTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...verdictTimes.map((at, index): Cue => ({ at, kind: handMessages[index] ? 'error' : 'line' })),
  ...genTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  ...flights.flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + flight.duration, kind: 'pop' },
  ]),
  { at: T.validated, kind: 'success' },
  ...overrideTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.revalidated, kind: 'success' },
  ...breakTyping.keystrokes.map((at): Cue => ({ at, kind: 'key' })),
  { at: T.rejected, kind: 'error' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'arktype-rules',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('ArkType adapter'),
        captions(beats, t),
        typeCard(t),
        codeCard(t),
        fixtureCard(t),
        flyingValues(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
