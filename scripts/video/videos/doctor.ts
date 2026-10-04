/** mimlet doctor: catch an unsupported peer version before it turns into a confusing test crash. */
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
  type CodeSpan,
  type Key,
  type Point,
  type Typing,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * The terminal output in this video was captured on Node 22.21 with the commands below, in an
 * app whose package.json pins zod 3.25.76. Re-run them with `node scripts/video/verify.ts doctor`.
 * The program pins the Mimlet packages, so a change in npm's resolver or in the adapter's
 * supported range shows up as a mismatch here first.
 */
export const facts = {
  packages: {},
  program: `import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('app');
writeFileSync(
  'app/package.json',
  JSON.stringify({ private: true, type: 'module', devDependencies: { zod: '3.25.76' } })
);
writeFileSync(
  'app/user.test.js',
  [
    "import { test } from 'node:test';",
    "import assert from 'node:assert/strict';",
    "import { z } from 'zod';",
    "import { fromZod } from '@mimlet/zod';",
    "const User = z.object({ name: z.string(), email: z.string().email() });",
    "test('builds a user', () => {",
    "  assert.equal(fromZod(User).with({ name: 'Ada' }).buildValidated().name, 'Ada');",
    '});',
  ].join('\\n')
);
const run = (command, ...args) => spawnSync(command, args, { cwd: 'app', encoding: 'utf8' });
const quiet = ['--no-audit', '--no-fund'];
const mimlet = ['@mimlet/core', '@mimlet/zod', '@mimlet/codegen'].map((name) => \`\${name}@0.1.0-beta.0\`);

console.log(run('npm', 'i', ...quiet).status);
const refused = run('npm', 'i', '-D', ...mimlet, ...quiet);
console.log(
  refused.status,
  /ERESOLVE unable to resolve dependency tree/.test(refused.stderr),
  /retry\\nnpm error this command with --force or --legacy-peer-deps/.test(refused.stderr)
);
const forced = run('npm', 'i', '-D', ...mimlet, '--legacy-peer-deps', ...quiet);
console.log(forced.status, (forced.stdout.match(/added \\d+ packages/) ?? [''])[0]);
const failing = run('node', '--test');
console.log(
  failing.status,
  /not ok 1 - builds a user/.test(failing.stdout),
  /Cannot read properties of undefined \\(reading 'def'\\)/.test(failing.stdout)
);
const doctor = run('npx', 'mimlet', 'doctor');
console.log(doctor.status);
console.log(doctor.stdout.split('\\n').slice(0, 4).join('\\n'));
const report = JSON.parse(run('npx', 'mimlet', 'doctor', '--json').stdout);
const [issue] = report.diagnostics;
console.log(report.ok, issue.code, issue.expected, issue.actual);
const upgrade = run('npm', 'i', '-D', 'zod@4.6.5', ...quiet);
console.log(upgrade.status, (upgrade.stdout.match(/changed \\d+ package/) ?? [''])[0]);
const fixed = run('npx', 'mimlet', 'doctor');
console.log(fixed.status, fixed.stdout.split('\\n')[0]);
const passing = run('node', '--test');
console.log(passing.status, /# pass 1/.test(passing.stdout));
`,
  stdout: [
    '0',
    '1 true true',
    '0 added 26 packages',
    '1 true true',
    '1',
    'Mimlet doctor: needs attention',
    'ERROR PEER_VERSION_UNSUPPORTED (@mimlet/zod -> zod): "An installed peer dependency is outside the supported range."',
    "  Align zod with the adapter's supported range.",
    '  Expected: ">=4.4.3 <=4.6.5"; installed: "3.25.76"',
    'false PEER_VERSION_UNSUPPORTED >=4.4.3 <=4.6.5 3.25.76',
    '0 changed 1 package',
    '0 Mimlet doctor: checked',
    '0 true',
  ].join('\n'),
};

const T = {
  terminalIn: 0.2,
  install: 0.6,
  installOutput: 3.0,
  retry: 4.2,
  retryOutput: 6.1,
  testCommand: 6.9,
  testOutput: 7.65,
  diagnose: 11.5,
  doctorCommand: 11.9,
  doctorOutput: 12.75,
  cardsIn: 13.9,
  flyExpected: 14.4,
  flyInstalled: 15.1,
  flight: 0.6,
  mismatch: 15.9,
  agents: 19.3,
  jsonCommand: 19.7,
  jsonOutput: 20.75,
  pin: 24.3,
  pinCommand: 24.7,
  pinOutput: 25.6,
  fixed: 25.8,
  recheckCommand: 26.3,
  recheckOutput: 27.05,
  retestCommand: 27.7,
  retestOutput: 28.3,
  endIn: 32.3,
  end: 37.3,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Your app is still on Zod 3.',
    subtitle: 'npm refuses, and offers --legacy-peer-deps as a way through.',
  },
  {
    at: T.testCommand - 0.3,
    title: 'It installs. Then the test fails.',
    subtitle: 'The error points inside zod, not at the version.',
  },
  {
    at: T.diagnose,
    title: 'mimlet doctor names the cause.',
    subtitle: 'It checks installed versions against each adapter’s supported range.',
  },
  {
    at: T.agents,
    title: 'Coding agents get the same report.',
    subtitle: 'Add --json for stable codes, expected and actual versions, and exit code 1.',
  },
  {
    at: T.pin,
    title: 'Upgrade to the version it asks for.',
    subtitle: 'Doctor passes, and so does the test.',
  },
  { at: T.endIn, title: 'Check the install before the tests.' },
];

// ---------------------------------------------------------------------------
// The terminal: commands are typed, output lines print one after another.

type Tone = 'command' | 'output' | 'dim' | 'error' | 'ok';
interface TerminalLine {
  text: string;
  tone: Tone;
  /** Draw a pass or fail mark in the first two columns instead of a glyph the fonts lack. */
  mark?: 'pass' | 'fail';
  spans?: { value: string; fill: string }[];
}
interface Step {
  command: string;
  /** Characters per second; a retried command is typed faster. */
  rate?: number;
  typedAt: number;
  printAt: number;
  output: TerminalLine[];
}
interface Screen {
  from: number;
  until: number;
  steps: Step[];
}

const screens: Screen[] = [
  {
    from: 0,
    until: T.diagnose,
    steps: [
      {
        command: 'npm i -D @mimlet/core @mimlet/zod @mimlet/codegen',
        typedAt: T.install,
        printAt: T.installOutput,
        output: [
          { text: 'npm error ERESOLVE unable to resolve dependency tree', tone: 'error' },
          {
            text: 'npm error … retry this command with --force or --legacy-peer-deps',
            tone: 'dim',
            spans: [{ value: '--legacy-peer-deps', fill: color.paper }],
          },
        ],
      },
      {
        command: 'npm i -D @mimlet/core @mimlet/zod @mimlet/codegen --legacy-peer-deps',
        rate: 45,
        typedAt: T.retry,
        printAt: T.retryOutput,
        output: [{ text: 'added 26 packages in 1s', tone: 'output' }],
      },
      {
        command: 'node --test',
        typedAt: T.testCommand,
        printAt: T.testOutput,
        output: [
          { text: '  builds a user', tone: 'error', mark: 'fail' },
          {
            text: "  TypeError: Cannot read properties of undefined (reading 'def')",
            tone: 'error',
          },
        ],
      },
    ],
  },
  {
    from: T.diagnose,
    until: T.agents,
    steps: [
      {
        command: 'npx mimlet doctor',
        typedAt: T.doctorCommand,
        printAt: T.doctorOutput,
        output: [
          { text: 'Mimlet doctor: needs attention', tone: 'error' },
          { text: 'ERROR PEER_VERSION_UNSUPPORTED (@mimlet/zod -> zod):', tone: 'error' },
          {
            text: '"An installed peer dependency is outside the supported range."',
            tone: 'output',
          },
          { text: "  Align zod with the adapter's supported range.", tone: 'dim' },
          {
            text: '  Expected: ">=4.4.3 <=4.6.5"; installed: "3.25.76"',
            tone: 'output',
            spans: [
              { value: '">=4.4.3 <=4.6.5"', fill: color.mint },
              { value: '"3.25.76"', fill: color.coral },
            ],
          },
        ],
      },
    ],
  },
  {
    from: T.agents,
    until: T.pin,
    steps: [
      {
        command: 'npx mimlet doctor --json',
        typedAt: T.jsonCommand,
        printAt: T.jsonOutput,
        output: [
          {
            text: '  "ok": false,',
            tone: 'output',
            spans: [{ value: 'false', fill: color.coral }],
          },
          { text: '  …', tone: 'dim' },
          {
            text: '      "code": "PEER_VERSION_UNSUPPORTED",',
            tone: 'output',
            spans: [{ value: '"PEER_VERSION_UNSUPPORTED"', fill: color.mint }],
          },
          {
            text: '      "expected": ">=4.4.3 <=4.6.5",',
            tone: 'output',
            spans: [{ value: '">=4.4.3 <=4.6.5"', fill: color.mint }],
          },
          {
            text: '      "actual": "3.25.76"',
            tone: 'output',
            spans: [{ value: '"3.25.76"', fill: color.coral }],
          },
        ],
      },
    ],
  },
  {
    from: T.pin,
    until: T.endIn,
    steps: [
      {
        command: 'npm i -D zod@4.6.5',
        typedAt: T.pinCommand,
        printAt: T.pinOutput,
        output: [{ text: 'changed 1 package in 261ms', tone: 'output' }],
      },
      {
        command: 'npx mimlet doctor',
        typedAt: T.recheckCommand,
        printAt: T.recheckOutput,
        output: [{ text: 'Mimlet doctor: checked', tone: 'ok' }],
      },
      {
        command: 'node --test',
        typedAt: T.retestCommand,
        printAt: T.retestOutput,
        output: [{ text: '  builds a user', tone: 'ok', mark: 'pass' }],
      },
    ],
  },
];

const TOP = 300;
const FULL = { x: 140, width: 1640 };
const SIZE = 30;
const LINE_HEIGHT = 46;
const PRINT_GAP = 0.12;
const terminalLayout: CodeLayout = {
  x: FULL.x + 36,
  y: TOP + 58 + SIZE * 1.7,
  size: SIZE,
  lineHeight: LINE_HEIGHT,
};
const toneFill: Record<Tone, string> = {
  command: color.paper,
  output: color.paper,
  dim: color.codeDim,
  error: color.coral,
  ok: color.mint,
};

interface Row {
  line: TerminalLine;
  index: number;
  at: number;
  typed?: Typing;
  /** Only the first error line of a command buzzes. */
  buzz: boolean;
}

/** Assign every command and output line to a terminal row with the time it appears. */
const laidOut = screens.map((screen) => {
  const rows: Row[] = [];
  for (const entry of screen.steps) {
    const prompt = `$ ${entry.command}`;
    rows.push({
      line: { text: prompt, tone: 'command', spans: [{ value: '$', fill: color.mint }] },
      index: rows.length,
      at: entry.typedAt,
      typed: typing([prompt], entry.typedAt, entry.rate ?? 30),
      buzz: false,
    });
    const firstError = entry.output.findIndex((output) => output.tone === 'error');
    entry.output.forEach((output, offset) => {
      rows.push({
        line: output,
        index: rows.length,
        at: entry.printAt + offset * PRINT_GAP,
        buzz: offset === firstError,
      });
    });
  }
  return { screen, rows };
});
const heightFor = (rows: number) => 58 + SIZE * 1.7 + (rows - 1) * LINE_HEIGHT + 36;
/** The panel fits the current screen; it only resizes while one screen hands over to the next. */
function terminalHeight(t: number) {
  const index = Math.max(
    0,
    laidOut.findIndex(({ screen }) => t >= screen.from && t < screen.until)
  );
  const current = heightFor(laidOut[index]?.rows.length ?? 1);
  const previous = laidOut[index - 1];
  if (!previous) {
    return current;
  }
  const p = ease.inOut(span(t, laidOut[index]?.screen.from ?? 0, 0.3));
  return lerp(heightFor(previous.rows.length), current, p);
}
/** The version cards sit under the six-row screens, the only ones that show them. */
const CARD_SCREEN_HEIGHT = heightFor(6);
const rowLayout = (index: number): CodeLayout => ({
  ...terminalLayout,
  y: terminalLayout.y + index * LINE_HEIGHT,
});
/** A point on a terminal row's midline, at a character column. */
const rowPoint = (row: number, col = 0): Point => {
  const at = column(rowLayout(row), 0, col);
  return { x: at.x, y: at.y - midline(SIZE) };
};

function terminal(t: number) {
  const opacity = presence(t, T.terminalIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [codePanel(FULL.x, TOP, FULL.width, terminalHeight(t), 'Terminal', SIZE).svg];
  for (const { screen, rows } of laidOut) {
    const shown = presence(t, screen.from, screen.until, 0.25);
    if (shown <= 0) {
      continue;
    }
    const content: string[] = [];
    for (const row of rows) {
      if (t < row.at) {
        continue;
      }
      const spans: CodeSpan[] = (row.line.spans ?? []).map(({ value, fill }) => {
        const from = row.line.text.indexOf(value);
        return { line: 0, from, to: from + value.length, fill };
      });
      content.push(
        code([row.line.text], {
          ...rowLayout(row.index),
          fill: toneFill[row.line.tone],
          spans,
          reveal: row.typed ? row.typed.reveal(t) : Infinity,
        })
      );
      if (row.typed) {
        content.push(caretMark(t, row.typed, rowLayout(row.index)));
      }
      if (row.line.mark) {
        const centre = rowPoint(row.index, 0.7);
        content.push(popIn(verdict(centre, row.line.mark === 'pass', 14), t, row.at, centre));
      }
    }
    parts.push(place(content.join(''), { opacity: shown }));
  }
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// Version cards: what the adapter supports against what is installed.

const CARDS = { y: TOP + CARD_SCREEN_HEIGHT + 40, height: 130 };
const SUPPORTS = { x: FULL.x, width: 700 };
const INSTALLED = { x: FULL.x + FULL.width - 700, width: 700 };
const CONNECTOR: Point = { x: 960, y: CARDS.y + CARDS.height / 2 };
const valueSlot = (card: { x: number }): Point => ({ x: card.x + 32, y: CARDS.y + 98 });

const expectedLine = laidOut[1]?.rows.find((row) => row.line.text.includes('Expected:'));
const expectedFrom = (value: string): Point => {
  const textLine = expectedLine?.line.text ?? '';
  const at = column(terminalLayout, expectedLine?.index ?? 0, textLine.indexOf(value) + 1);
  return at;
};
const versionFlights = [
  {
    start: T.flyExpected,
    value: 'zod >=4.4.3 <=4.6.5',
    from: expectedFrom('">=4.4.3 <=4.6.5"'),
    to: valueSlot(SUPPORTS),
  },
  {
    start: T.flyInstalled,
    value: 'zod 3.25.76',
    from: expectedFrom('"3.25.76"'),
    to: valueSlot(INSTALLED),
  },
];

function versionCard(
  card: { x: number; width: number },
  label: string,
  value: string,
  tone: 'mint' | 'coral' | 'plain',
  t: number,
  landed: number,
  previous?: { value: string; tone: 'coral' }
) {
  const parts = [
    box(card.x, CARDS.y, card.width, CARDS.height, {
      radius: 22,
      fill: color.card,
      stroke: color.rule,
    }),
    text(card.x + 32, CARDS.y + 44, label, {
      size: 22,
      weight: 700,
      fill: color.muted,
      spacing: 1.8,
    }),
  ];
  const slot = valueSlot(card);
  const drawValue = (content: string, accent: 'mint' | 'coral' | 'plain', opacity: number) => {
    const width = content.length * monoWidth(32) + 36;
    return place(
      box(slot.x - 4, slot.y - midline(32) - 26, width, 52, {
        radius: 14,
        fill:
          accent === 'mint' ? color.mintSoft : accent === 'coral' ? color.coralSoft : color.paper,
        stroke: accent === 'mint' ? color.mint : accent === 'coral' ? color.coral : color.rule,
        strokeWidth: 2.5,
      }) + text(slot.x + 14, slot.y, content, { size: 32, family: MONO }),
      { opacity }
    );
  };
  if (t >= landed) {
    if (previous && t < T.fixed + 0.35) {
      parts.push(drawValue(previous.value, previous.tone, 1 - span(t, T.fixed, 0.35)));
    }
    if (!previous || t >= T.fixed) {
      const grow = ease.back(span(t, previous ? T.fixed : landed, 0.3));
      parts.push(
        place(drawValue(value, tone, 1), {
          scale: 0.85 + 0.15 * grow,
          origin: { x: slot.x + 100, y: slot.y - midline(32) },
          opacity: previous ? span(t, T.fixed, 0.2) : 1,
        })
      );
    }
  } else {
    parts.push(text(slot.x + 14, slot.y, '—', { size: 32, family: MONO, fill: color.faint }));
  }
  return parts.join('');
}

function connector(t: number) {
  const matched = t >= T.fixed;
  const fill = matched ? color.mint : color.coral;
  const r = 30;
  const bar = (dy: number) =>
    line(
      { x: CONNECTOR.x - 12, y: CONNECTOR.y + dy },
      { x: CONNECTOR.x + 12, y: CONNECTOR.y + dy },
      color.ink,
      4.5
    );
  const slash = matched
    ? ''
    : line(
        { x: CONNECTOR.x + 8, y: CONNECTOR.y - 15 },
        { x: CONNECTOR.x - 8, y: CONNECTOR.y + 15 },
        color.ink,
        4.5
      );
  const leftEdge = SUPPORTS.x + SUPPORTS.width;
  const rightEdge = INSTALLED.x;
  const svg =
    line({ x: leftEdge + 8, y: CONNECTOR.y }, { x: CONNECTOR.x - r - 8, y: CONNECTOR.y }, fill, 3) +
    line(
      { x: CONNECTOR.x + r + 8, y: CONNECTOR.y },
      { x: rightEdge - 8, y: CONNECTOR.y },
      fill,
      3
    ) +
    `<circle cx="${CONNECTOR.x}" cy="${CONNECTOR.y}" r="${r}" fill="${fill}"/>` +
    bar(-6) +
    bar(6) +
    slash;
  const at = matched ? T.fixed + 0.1 : T.mismatch;
  return t < T.mismatch ? '' : popIn(svg, t, at, CONNECTOR);
}

function versionCards(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  return place(
    versionCard(
      SUPPORTS,
      '@MIMLET/ZOD SUPPORTS',
      'zod >=4.4.3 <=4.6.5',
      'mint',
      t,
      T.flyExpected + T.flight
    ) +
      versionCard(
        INSTALLED,
        'NODE_MODULES HAS',
        'zod 4.6.5',
        'mint',
        t,
        T.flyInstalled + T.flight,
        { value: 'zod 3.25.76', tone: 'coral' }
      ) +
      connector(t),
    { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 }
  );
}

function flyingVersions(t: number) {
  return versionFlights
    .map((flight) => {
      if (t < flight.start || t >= flight.start + T.flight) {
        return '';
      }
      const p = ease.inOut(span(t, flight.start, T.flight));
      const at = curve(
        flight.from,
        { x: (flight.from.x + flight.to.x) / 2, y: flight.to.y - 30 },
        flight.to,
        p
      );
      const size = lerp(SIZE, 32, p);
      const width = flight.value.length * monoWidth(size) + 28;
      return (
        box(at.x - 14, at.y - midline(size) - size * 0.78, width, size * 1.56, {
          radius: 12,
          fill: flight.start === T.flyExpected ? color.mint : color.coral,
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
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/codegen', {
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
      text(960, 832, 'Then run npx mimlet doctor · @mimlet/codegen · beta', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const rowsOf = (index: number) => laidOut[index]?.rows ?? [];
const caretOf = (index: number, row: number) => (t: number) => {
  const entry = rowsOf(index)[row];
  if (!entry?.typed) {
    return rowPoint(row, 10);
  }
  const at = entry.typed.caret(t, { ...terminalLayout, y: terminalLayout.y + row * LINE_HEIGHT });
  return at;
};
const textPoint = (_screen: number, row: number, col: number) => rowPoint(row, col);
const flightPoint = (index: number) => (t: number) => {
  const flight = versionFlights[index];
  if (!flight) {
    return CONNECTOR;
  }
  const p = ease.inOut(span(t, flight.start, T.flight));
  return curve(
    flight.from,
    { x: (flight.from.x + flight.to.x) / 2, y: flight.to.y - 30 },
    flight.to,
    p
  );
};

const gaze: Key<Point>[] = [
  { at: 0, value: { x: 900, y: 420 } },
  { at: T.install - 0.1, value: caretOf(0, 0) },
  { at: T.installOutput, value: textPoint(0, 1, 20) },
  { at: T.installOutput + 0.5, value: textPoint(0, 2, 52) },
  { at: T.retry - 0.1, value: caretOf(0, 3) },
  { at: T.retryOutput, value: textPoint(0, 4, 10) },
  { at: T.testCommand - 0.1, value: caretOf(0, 5) },
  { at: T.testOutput, value: textPoint(0, 6, 8) },
  { at: T.testOutput + 0.5, value: textPoint(0, 7, 40) },
  { at: T.doctorCommand - 0.1, value: caretOf(1, 0) },
  { at: T.doctorOutput, value: textPoint(1, 2, 30) },
  { at: T.doctorOutput + 0.6, value: textPoint(1, 5, 28) },
  { at: T.flyExpected, value: flightPoint(0) },
  { at: T.flyInstalled, value: flightPoint(1) },
  { at: T.mismatch, value: CONNECTOR },
  { at: T.jsonCommand - 0.1, value: caretOf(2, 0) },
  { at: T.jsonOutput + 0.3, value: textPoint(2, 3, 24) },
  { at: T.jsonOutput + 1.0, value: textPoint(2, 5, 20) },
  { at: T.jsonOutput + 1.75, value: CONNECTOR },
  { at: T.pinCommand - 0.1, value: caretOf(3, 0) },
  { at: T.fixed, value: valueSlot(INSTALLED) },
  { at: T.fixed + 0.3, value: CONNECTOR },
  { at: T.recheckCommand - 0.1, value: caretOf(3, 2) },
  { at: T.recheckOutput, value: textPoint(3, 3, 12) },
  { at: T.retestCommand - 0.1, value: caretOf(3, 4) },
  { at: T.retestOutput, value: textPoint(3, 5, 6) },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.testOutput, value: 'worried' },
  { at: T.doctorOutput + 0.8, value: 'smile' },
  { at: T.mismatch, value: 'open' },
  { at: T.mismatch + 1.0, value: 'smile' },
  { at: T.recheckOutput, value: 'grin' },
  { at: T.retestOutput + 1.4, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.2, 5.6, 10.4, 17.5, 22.1, 23.9, 29.9, 34.7];
const hops = [T.recheckOutput, T.retestOutput, T.endIn + 0.6];

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
  ...laidOut.flatMap(({ rows }) =>
    rows.flatMap((row): Cue[] =>
      row.typed
        ? row.typed.keystrokes.map((at): Cue => ({ at, kind: 'key' }))
        : [{ at: row.at, kind: row.buzz ? 'error' : row.line.tone === 'ok' ? 'success' : 'line' }]
    )
  ),
  ...versionFlights.flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + T.flight, kind: 'pop' },
  ]),
  { at: T.mismatch, kind: 'error' },
  { at: T.fixed, kind: 'pop' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'doctor',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('CLI diagnostics'),
        captions(beats, t),
        terminal(t),
        versionCards(t),
        flyingVersions(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
