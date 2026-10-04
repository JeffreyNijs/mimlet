/** Hey API: generate fluent test builders next to the models openapi-ts already generates. */
import type { Cue } from '../audio.ts';
import {
  box,
  captions,
  chrome,
  code,
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
 * The generated files, setters and built user in the video come from running this program with
 * @hey-api/openapi-ts 0.99.0, hey-api-builders 3.0.0-beta.0, @mimlet/core 0.1.0-beta.0,
 * Faker 10.5.0 and TypeScript 6.0.3. Re-run it with `node scripts/video/verify.ts hey-api`.
 */
export const facts = {
  packages: {
    '@hey-api/openapi-ts': '0.99.0',
    'hey-api-builders': '3.0.0-beta.0',
    '@mimlet/core': '0.1.0-beta.0',
    '@faker-js/faker': '10.5.0',
    typescript: '6.0.3',
  },
  program: `import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const user = (extra) => ({
  type: 'object',
  required: ['id', 'name', 'role', ...Object.keys(extra)],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', enum: ['reader', 'admin'] },
    ...extra,
  },
});
const generate = (schema, output) => {
  writeFileSync(
    'openapi.json',
    JSON.stringify({ openapi: '3.1.0', info: { title: 'Users', version: '1.0.0' }, paths: {}, components: { schemas: { User: schema } } })
  );
  writeFileSync(
    'openapi-ts.config.ts',
    [
      "import { defineConfig } from '@hey-api/openapi-ts';",
      "import { defineConfig as builders } from 'hey-api-builders';",
      'export default defineConfig({',
      "  input: './openapi.json',",
      "  output: { path: './" + output + "', importFileExtension: '.ts' },",
      "  plugins: ['@hey-api/typescript', '@faker-js/faker', builders({ definitions: true, requests: false, responses: false })],",
      '});',
    ].join('\\n')
  );
  const result = spawnSync('npx', ['openapi-ts'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr);
  const files = readdirSync(output, { recursive: true }).filter((name) => name.endsWith('.ts')).sort();
  const methods = [...readFileSync(output + '/hey-api-builders.gen.ts', 'utf8').matchAll(/^    (with\\w+)\\(/gm)].map((match) => match[1]);
  return { files, methods };
};

const first = generate(user({}), 'generated');
console.log(first.files.join(', '));
console.log(first.methods.join(', '));
const { UserBuilder } = await import('./generated/index.ts');
console.log(JSON.stringify(new UserBuilder().withId('user-7').withName('Ada').withRole('admin').build()));
const second = generate(user({ email: { type: 'string', format: 'email' } }), 'regenerated');
console.log(second.methods.join(', '));
`,
  stdout: [
    '@faker-js/faker.gen.ts, hey-api-builders.gen.ts, index.ts, types.gen.ts',
    'withId, withName, withRole',
    '{"id":"user-7","name":"Ada","role":"admin"}',
    'withId, withName, withRole, withEmail',
  ].join('\n'),
};

const T = {
  cardsIn: 0.2,
  copies: 0.8,
  copiesNote: 2.6,
  plugin: 6.4,
  pluginTyping: 6.8,
  generated: 10.2,
  build: 13.2,
  buildTyping: 13.6,
  flights: 15.9,
  flightGap: 0.45,
  flight: 0.5,
  built: 17.4,
  regenerate: 20.2,
  emailAdded: 20.7,
  regenerateTyping: 21.3,
  withEmail: 22.2,
  endIn: 26.0,
  end: 31.0,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Hey API types your models. Not your test data.',
    subtitle: 'Each test still writes its own User by hand.',
  },
  {
    at: T.plugin,
    title: 'Add the builders plugin.',
    subtitle: 'It runs inside the openapi-ts generation you already have.',
  },
  {
    at: T.build,
    title: 'Set what the test needs. Then build.',
    subtitle: 'Generated withX() setters, backed by the Mimlet runtime.',
  },
  {
    at: T.regenerate,
    title: 'API changed? Regenerate.',
    subtitle: 'The new email field gets withEmail(), with no builder code to write.',
  },
  { at: T.endIn, title: 'Your Hey API models. Fluent test builders.' },
];

// ---------------------------------------------------------------------------
// Layout

const STRIP = { x: 140, y: 300, width: 1640, height: 140 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 58, size: 30, lineHeight: 46 };
const CARDS = { y: 480, height: 390 };
const LEFT = { x: 140, width: 640 };
const RIGHT = { x: 860, width: 920 };
const schemaRowY = (index: number) => CARDS.y + 112 + index * 56;

function label(x: number, y: number, value: string) {
  return text(x, y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 });
}

function schemaCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const rows = [
    ['id', 'string'],
    ['name', 'string'],
    ['role', "'reader' | 'admin'"],
    ['email', 'string · email'],
  ] as const;
  const parts = [
    box(LEFT.x, CARDS.y, LEFT.width, CARDS.height, { radius: 22, fill: color.ink }),
    text(LEFT.x + 32, CARDS.y + 56, 'User · OpenAPI', { size: 30, weight: 700, fill: color.paper }),
  ];
  const fresh =
    t >= T.emailAdded
      ? ease.out(span(t, T.emailAdded, 0.3)) * (1 - span(t, T.emailAdded + 2.2, 0.8))
      : 0;
  if (fresh > 0) {
    parts.push(
      box(LEFT.x + 14, schemaRowY(3) - 38, LEFT.width - 28, 52, {
        radius: 12,
        stroke: color.mint,
        strokeWidth: 2.5,
        opacity: fresh,
      })
    );
  }
  rows.forEach(([name, type], index) => {
    if (index === 3 && t < T.emailAdded) {
      return;
    }
    const highlighted = index === 3 && fresh > 0.5;
    parts.push(
      code([`${name}: ${type}`], {
        x: LEFT.x + 32,
        y: schemaRowY(index),
        size: 30,
        lineHeight: 56,
        fill: highlighted ? color.mint : color.paper,
        spans: [
          {
            line: 0,
            from: name.length + 2,
            to: 99,
            fill: highlighted ? color.mint : color.codeDim,
          },
        ],
        opacity: index === 3 ? span(t, T.emailAdded, 0.3) : 1,
      })
    );
  });
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

function headerTag(value: string, tone: 'mint' | 'coral' | 'plain', t: number, at: number) {
  const width = estimateSans(value, 20, 700, 1.4) + 36;
  const centre = { x: RIGHT.x + RIGHT.width - 28 - width / 2, y: CARDS.y + 42 };
  return popIn(
    pill(centre, value, {
      size: 20,
      weight: 700,
      spacing: 1.4,
      background: tone === 'mint' ? color.mint : tone === 'coral' ? color.coral : color.paper,
      border: tone === 'plain' ? color.rule : undefined,
      fill: tone === 'plain' ? color.muted : color.ink,
      height: 40,
      padding: 18,
    }).svg,
    t,
    at,
    centre
  );
}

function card() {
  return box(RIGHT.x, CARDS.y, RIGHT.width, CARDS.height, {
    radius: 22,
    fill: color.card,
    stroke: color.rule,
  });
}

// Beat 1: the same user written by hand in every test file.
const copies = [
  ['user.test.ts', "{ id: 'u1', name: 'Test', role: 'reader' }"],
  ['admin.test.ts', "{ id: 'a1', name: 'Admin', role: 'admin' }"],
  ['profile.test.ts', "{ id: 'p1', name: 'Ada', role: 'reader' }"],
] as const;

function copiesCard(t: number) {
  const parts = [card(), label(RIGHT.x + 32, CARDS.y + 46, 'HAND-WRITTEN IN EVERY TEST')];
  copies.forEach(([file, literal], index) => {
    const y = CARDS.y + 108 + index * 82;
    const shown = ease.out(span(t, T.copies + index * 0.45, 0.3));
    parts.push(
      place(
        text(RIGHT.x + 32, y, file, { size: 22, family: MONO, fill: color.muted }) +
          text(RIGHT.x + 32, y + 38, literal, { size: 28, family: MONO }),
        { opacity: shown, y: (1 - shown) * 8 }
      )
    );
  });
  parts.push(headerTag('3 COPIES TO KEEP IN SYNC', 'coral', t, T.copiesNote));
  return parts.join('');
}

// Beat 2: what generation writes.
const files = ['@faker-js/faker.gen.ts', 'hey-api-builders.gen.ts', 'index.ts', 'types.gen.ts'];

function filesCard(t: number) {
  const parts = [card(), label(RIGHT.x + 32, CARDS.y + 46, 'npx openapi-ts')];
  parts.push(headerTag('4 FILES GENERATED', 'mint', t, T.generated + 0.9));
  files.forEach((file, index) => {
    const at = T.generated + index * 0.2;
    const y = CARDS.y + 120 + index * 66;
    const builders = file === 'hey-api-builders.gen.ts';
    const icon =
      box(RIGHT.x + 32, y - 30, 44, 36, {
        radius: 8,
        fill: builders ? color.mint : color.inkRaised,
      }) +
      text(RIGHT.x + 54, y - 6, 'TS', {
        size: 16,
        weight: 700,
        anchor: 'middle',
        fill: builders ? color.ink : color.paper,
      });
    const row =
      icon +
      text(RIGHT.x + 92, y, file, { size: 30, family: MONO, weight: builders ? 700 : 400 }) +
      (builders
        ? text(RIGHT.x + 92 + file.length * monoWidth(30) + 22, y, 'UserBuilder', {
            size: 26,
            family: MONO,
            fill: color.mintText,
          })
        : '');
    parts.push(popIn(row, t, at, { x: RIGHT.x + 300, y: y - 10 }));
  });
  return parts.join('');
}

// Beat 3: the built user.
const builtRows = [
  ['id', "'user-7'"],
  ['name', "'Ada'"],
  ['role', "'admin'"],
] as const;
const VALUE_X = RIGHT.x + 180;
const builtRowY = (index: number) => CARDS.y + 130 + index * 76;

function builtCard(t: number) {
  const parts = [card(), label(RIGHT.x + 32, CARDS.y + 46, 'BUILT USER')];
  parts.push(headerTag('BUILT', 'mint', t, T.built));
  builtRows.forEach(([name, value], index) => {
    const y = builtRowY(index);
    parts.push(text(RIGHT.x + 32, y, name, { size: 28, weight: 600, fill: color.muted }));
    const landed = T.flights + index * T.flightGap + T.flight;
    if (t < landed) {
      parts.push(text(VALUE_X + 16, y, '—', { size: 30, family: MONO, fill: color.faint }));
      return;
    }
    const width = value.length * monoWidth(30) + 32;
    const grow = ease.back(span(t, landed, 0.3));
    parts.push(
      place(
        box(VALUE_X, y - midline(30) - 23, width, 46, { radius: 12, fill: color.mintSoft }) +
          text(VALUE_X + 16, y, value, { size: 30, family: MONO }),
        { scale: 0.85 + 0.15 * grow, origin: { x: VALUE_X + width / 2, y: y - midline(30) } }
      )
    );
  });
  return parts.join('');
}

// Beat 4: the regenerated class.
const methods = ['withId()', 'withName()', 'withRole()', 'withEmail()'];

function classCard(t: number) {
  const parts = [card(), label(RIGHT.x + 32, CARDS.y + 46, 'hey-api-builders.gen.ts')];
  parts.push(
    text(RIGHT.x + 32, CARDS.y + 120, 'class UserBuilder', { size: 32, family: MONO, weight: 700 }),
    text(RIGHT.x + 32 + 18 * monoWidth(32), CARDS.y + 120, 'extends UserBuilderBase', {
      size: 26,
      family: MONO,
      fill: color.muted,
    })
  );
  methods.forEach((method, index) => {
    const fresh = method === 'withEmail()';
    if (fresh && t < T.withEmail) {
      return;
    }
    const x = RIGHT.x + 32 + (index % 2) * 300;
    const y = CARDS.y + 200 + Math.floor(index / 2) * 84;
    const width = method.length * monoWidth(30) + 32;
    const chip =
      box(x, y - 34, width, 50, {
        radius: 14,
        fill: fresh ? color.mint : color.paper,
        stroke: fresh ? undefined : color.rule,
      }) + text(x + 16, y, method, { size: 30, family: MONO, weight: fresh ? 700 : 400 });
    parts.push(fresh ? popIn(chip, t, T.withEmail, { x: x + width / 2, y: y - 9 }) : chip);
  });
  parts.push(headerTag('REGENERATED', 'mint', t, T.withEmail));
  return parts.join('');
}

function rightCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const phases: { from: number; until: number; svg: () => string }[] = [
    { from: T.cardsIn, until: T.generated - 0.1, svg: () => copiesCard(t) },
    { from: T.generated - 0.1, until: T.build + 0.6, svg: () => filesCard(t) },
    { from: T.build + 0.6, until: T.regenerateTyping + 0.5, svg: () => builtCard(t) },
    { from: T.regenerateTyping + 0.5, until: T.endIn, svg: () => classCard(t) },
  ];
  const parts: string[] = [];
  for (const phase of phases) {
    const shown = presence(t, phase.from, phase.until, 0.25);
    if (shown > 0) {
      parts.push(place(phase.svg(), { opacity: shown }));
    }
  }
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

// ---------------------------------------------------------------------------
// The code strip

interface Writing {
  from: number;
  until: number;
  lines: string[];
  typed: Typing;
  marks?: { line: number; value: string; fill: string; at: number }[];
}
const pluginLines = [
  "plugins: ['@hey-api/typescript', '@faker-js/faker',",
  '  builders({ definitions: true, requests: false, responses: false })],',
];
const buildLine = "new UserBuilder().withId('user-7').withName('Ada').withRole('admin').build();";
const regenerateLine = 'npx openapi-ts';
const existingLine = "plugins: ['@hey-api/typescript', '@faker-js/faker'],";
const writing: Writing[] = [
  {
    from: 0,
    until: T.plugin,
    lines: [existingLine],
    typed: typing([existingLine], 0.5, 40),
  },
  {
    from: T.plugin,
    until: T.build,
    lines: pluginLines,
    // The existing first line stays; only the builders() line is typed.
    typed: typing(pluginLines, T.pluginTyping, 40, 1),
    marks: [{ line: 1, value: 'builders', fill: color.mint, at: T.generated }],
  },
  {
    from: T.build,
    until: T.regenerate,
    lines: [buildLine],
    typed: typing([buildLine], T.buildTyping, 36),
    marks: [
      { line: 0, value: "'user-7'", fill: color.mint, at: T.flights },
      { line: 0, value: "'Ada'", fill: color.mint, at: T.flights + T.flightGap },
      { line: 0, value: "'admin'", fill: color.mint, at: T.flights + 2 * T.flightGap },
    ],
  },
  {
    from: T.regenerate,
    until: T.endIn,
    lines: [regenerateLine],
    typed: typing([regenerateLine], T.regenerateTyping, 24),
  },
];

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
    const spans = (entry.marks ?? [])
      .filter((mark) => t >= mark.at)
      .map((mark) => {
        const from = (entry.lines[mark.line] ?? '').indexOf(mark.value);
        return { line: mark.line, from, to: from + mark.value.length, fill: mark.fill };
      });
    const typed = entry.typed;
    const caret =
      t >= typed.start - 0.2 &&
      t <= typed.end + 0.6 &&
      (t < typed.end || Math.floor(t * 3) % 2 === 0)
        ? (() => {
            const at = typed.caret(t, stripLayout);
            return box(at.x + 1, at.y - 17, 3, 34, { fill: color.mint });
          })()
        : '';
    const prompt =
      entry.lines[0] === regenerateLine ? { line: 0, from: 0, to: 3, fill: color.mint } : undefined;
    parts.push(
      place(
        code(entry.lines, {
          ...stripLayout,
          reveal: typed.reveal(t),
          spans: prompt ? [prompt, ...spans] : spans,
        }) + caret,
        {
          opacity: shown,
        }
      )
    );
  }
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// Flying values: the setter arguments land in the built user.

const flights = builtRows.map(([, value], index) => ({
  start: T.flights + index * T.flightGap,
  value,
  from: column(stripLayout, 0, buildLine.indexOf(value)),
  to: { x: VALUE_X + 16, y: builtRowY(index) },
}));
/** Enter the card to the right of its label, then drop into the row. */
const ENTRY: Point = { x: RIGHT.x + 640, y: CARDS.y + 80 };
const flightPoint = (flight: (typeof flights)[number], t: number) =>
  curve(flight.from, ENTRY, flight.to, ease.inOut(span(t, flight.start, T.flight)));

function flyingValues(t: number) {
  return flights
    .map((flight) => {
      if (t < flight.start || t >= flight.start + T.flight) {
        return '';
      }
      const p = ease.inOut(span(t, flight.start, T.flight));
      const at = flightPoint(flight, t);
      const size = lerp(30, 30, p);
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
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D hey-api-builders@next @mimlet/core', {
    size: 32,
    family: MONO,
    background: color.ink,
    fill: color.paper,
    height: 70,
    padding: 34,
  });
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      installPill.svg +
      text(960, 832, 'hey-api-builders v3 beta · Hey API 0.99 · Faker 10', {
        size: 28,
        fill: color.muted,
        anchor: 'middle',
      }),
    { opacity, y: (1 - opacity) * 12 }
  );
}

// ---------------------------------------------------------------------------
// The mascot looks at whatever is changing.

const caretOf = (index: number) => (t: number) => {
  const entry = writing[index];
  return entry ? entry.typed.caret(t, stripLayout) : { x: 960, y: 360 };
};
const follow = (index: number) => (t: number) => {
  const flight = flights[index];
  return flight ? flightPoint(flight, t) : { x: 960, y: 600 };
};

const gaze: Key<Point>[] = [
  { at: 0, value: { x: LEFT.x + 300, y: CARDS.y + 180 } },
  ...copies.map((_, index): Key<Point> => ({
    at: T.copies + index * 0.45,
    value: { x: RIGHT.x + 400, y: CARDS.y + 130 + index * 82 },
  })),
  { at: T.copiesNote, value: { x: RIGHT.x + RIGHT.width - 150, y: CARDS.y + 42 } },
  { at: 4.4, value: { x: LEFT.x + 300, y: CARDS.y + 200 } },
  { at: T.pluginTyping - 0.1, value: caretOf(1) },
  { at: T.generated + 0.2, value: { x: RIGHT.x + 300, y: CARDS.y + 176 } },
  { at: T.buildTyping - 0.1, value: caretOf(2) },
  ...flights.map((_, index): Key<Point> => ({
    at: T.flights + index * T.flightGap - 0.05,
    value: follow(index),
  })),
  { at: T.built, value: { x: RIGHT.x + RIGHT.width - 80, y: CARDS.y + 42 } },
  { at: T.emailAdded, value: { x: LEFT.x + 250, y: schemaRowY(3) - 10 } },
  { at: T.regenerateTyping - 0.1, value: caretOf(3) },
  { at: T.withEmail, value: { x: RIGHT.x + 450, y: CARDS.y + 274 } },
  { at: 24.4, value: { x: LEFT.x + 250, y: schemaRowY(3) - 10 } },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.copiesNote, value: 'worried' },
  { at: T.plugin, value: 'smile' },
  { at: T.built, value: 'grin' },
  { at: T.built + 1.4, value: 'smile' },
  { at: T.withEmail, value: 'grin' },
  { at: T.withEmail + 1.6, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.0, 5.2, 8.6, 12.0, 15.0, 19.2, 23.6, 27.6, 30.0];
const hops = [T.built, T.withEmail, T.endIn + 0.6];

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
  ...copies.map((_, index): Cue => ({ at: T.copies + index * 0.45, kind: 'line' })),
  { at: T.copiesNote, kind: 'error' },
  ...writing.flatMap((entry) => entry.typed.keystrokes.map((at): Cue => ({ at, kind: 'key' }))),
  ...files.map((_, index): Cue => ({ at: T.generated + index * 0.2, kind: 'line' })),
  { at: T.generated + 0.9, kind: 'success' },
  ...flights.flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + T.flight, kind: 'pop' },
  ]),
  { at: T.built, kind: 'success' },
  { at: T.emailAdded, kind: 'pop' },
  { at: T.withEmail, kind: 'pop' },
  { at: T.withEmail + 0.1, kind: 'success' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'hey-api',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Hey API integration'),
        captions(beats, t),
        strip(t),
        schemaCard(t),
        rightCard(t),
        flyingValues(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
