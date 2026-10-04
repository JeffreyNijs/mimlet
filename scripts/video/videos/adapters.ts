/** Adapters: one builder API over five schema libraries, each validating with its own rules. */
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
  midline,
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
  type CodeLayout,
  type Key,
  type Point,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * Every built value and message in the video is this program's output with the 0.1.0-beta.0
 * adapters and zod 4.6.5, valibot 1.5.0, typebox 1.3.34 and arktype 2.2.5.
 * Re-run it with `node scripts/video/verify.ts adapters`.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/zod': '0.1.0-beta.0',
    '@mimlet/valibot': '0.1.0-beta.0',
    '@mimlet/typebox': '0.1.0-beta.0',
    '@mimlet/json-schema': '0.1.0-beta.0',
    '@mimlet/arktype': '0.1.0-beta.0',
    zod: '4.6.5',
    valibot: '1.5.0',
    typebox: '1.3.34',
    arktype: '2.2.5',
  },
  program: `import { z } from 'zod';
import * as v from 'valibot';
import Type from 'typebox';
import { type } from 'arktype';
import { fromZod } from '@mimlet/zod';
import { fromValibot } from '@mimlet/valibot';
import { fromTypeBox } from '@mimlet/typebox';
import { fromJsonSchema } from '@mimlet/json-schema';
import { fromArkType } from '@mimlet/arktype';

const users = {
  Zod: fromZod(z.object({ name: z.string().min(1), age: z.number().int().min(18).max(99) })),
  Valibot: fromValibot(
    v.object({
      name: v.pipe(v.string(), v.minLength(1)),
      age: v.pipe(v.number(), v.integer(), v.minValue(18), v.maxValue(99)),
    })
  ),
  TypeBox: fromTypeBox(Type.Object({ name: Type.String({ minLength: 1 }), age: Type.Integer({ minimum: 18, maximum: 99 }) })),
  'JSON Schema': fromJsonSchema({
    type: 'object',
    properties: { name: { type: 'string', minLength: 1 }, age: { type: 'integer', minimum: 18, maximum: 99 } },
    required: ['name', 'age'],
    additionalProperties: false,
  }),
  ArkType: fromArkType(type({ name: 'string > 0', age: '18 <= number.integer <= 99' })),
};

for (const [library, builder] of Object.entries(users)) {
  const built = JSON.stringify(builder.with({ name: 'Ada' }).buildValidated());
  let message = 'accepted';
  try {
    builder.with({ name: 'Ada', age: 15 }).buildValidated();
  } catch (error) {
    message = error.issues[0].message;
  }
  console.log(library + ' | ' + built + ' | ' + message);
}
`,
  stdout: [
    'Zod | {"name":"Ada","age":45} | Too small: expected number to be >=18',
    'Valibot | {"name":"Ada","age":45} | Invalid value: Expected >=18 but received 15',
    'TypeBox | {"name":"Ada","age":18} | must be >= 18',
    'JSON Schema | {"name":"Ada","age":53} | must be >= 18',
    'ArkType | {"age":35,"name":"Ada"} | age must be at least 18 (was 15)',
  ].join('\n'),
};

const rows = [
  {
    library: 'Zod',
    builder: 'fromZod(User)',
    built: "{ name: 'Ada', age: 45 }",
    message: 'Too small: expected number to be >=18',
  },
  {
    library: 'Valibot',
    builder: 'fromValibot(User)',
    built: "{ name: 'Ada', age: 45 }",
    message: 'Invalid value: Expected >=18 but received 15',
  },
  {
    library: 'TypeBox',
    builder: 'fromTypeBox(User)',
    built: "{ name: 'Ada', age: 18 }",
    message: 'must be >= 18',
  },
  {
    library: 'JSON Schema',
    builder: 'fromJsonSchema(user)',
    built: "{ name: 'Ada', age: 53 }",
    message: 'must be >= 18',
  },
  {
    library: 'ArkType',
    builder: 'fromArkType(User)',
    built: "{ age: 35, name: 'Ada' }",
    message: 'age must be at least 18 (was 15)',
  },
];

const T = {
  rowsIn: 0.4,
  rowGap: 0.35,
  build: 6.6,
  buildTyping: 7.0,
  built: 8.7,
  builtGap: 0.4,
  reject: 14.2,
  rejectTyping: 14.6,
  rejected: 16.6,
  rejectedGap: 0.45,
  endIn: 22.4,
  end: 27.4,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Keep the schema library you already use.',
    subtitle: 'Zod, Valibot, TypeBox, JSON Schema or ArkType: each has its own adapter.',
  },
  {
    at: T.build,
    title: 'One builder API on top.',
    subtitle: 'Each builds { name: ‘Ada’ } and fills age within that schema’s rules.',
  },
  {
    at: T.reject,
    title: 'Break a rule, read that library’s own message.',
    subtitle: 'The schema stays the validator. Mimlet keeps its native issues.',
  },
  { at: T.endIn, title: 'Your schema. Your library’s rules.' },
];

// ---------------------------------------------------------------------------
// Layout: a code strip, then one row per library.

const STRIP = { x: 140, y: 296, width: 1640, height: 92 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 58, size: 32, lineHeight: 48 };
const COLUMNS = { library: 172, builder: 414, built: 772, message: 1184 };
const HEADER_Y = 432;
const rowTop = (index: number) => 452 + index * 88;
const rowBaseline = (index: number) => rowTop(index) + 48;

function header(t: number) {
  const opacity = presence(t, T.rowsIn, T.endIn);
  const label = (x: number, value: string, at: number) =>
    place(text(x, HEADER_Y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 }), {
      opacity: Math.min(opacity, ease.out(span(t, at, 0.3))),
    });
  return (
    label(COLUMNS.library, 'LIBRARY', T.rowsIn) +
    label(COLUMNS.builder, 'BUILDER', T.rowsIn) +
    label(COLUMNS.built, ".with({ name: 'Ada' })", T.built - 0.2) +
    label(COLUMNS.message, 'AGE 15', T.rejected - 0.2)
  );
}

function table(t: number) {
  const opacity = presence(t, T.rowsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts: string[] = [];
  rows.forEach((row, index) => {
    const shown = ease.out(span(t, T.rowsIn + index * T.rowGap, 0.35));
    if (shown <= 0) {
      return;
    }
    const top = rowTop(index);
    const y = rowBaseline(index);
    const cells = [
      box(140, top, 1640, 72, { radius: 16, fill: color.card, stroke: color.rule }),
      text(COLUMNS.library, y, row.library, { size: 28, weight: 700 }),
      text(COLUMNS.builder, y, row.builder, { size: 26, family: MONO, fill: color.muted }),
    ];
    const builtAt = T.built + index * T.builtGap;
    if (t >= builtAt) {
      const centre = { x: COLUMNS.built + 180, y: y - midline(26) };
      cells.push(
        popIn(
          box(COLUMNS.built - 14, centre.y - 22, 392, 44, { radius: 12, fill: color.mintSoft }) +
            text(COLUMNS.built, y, row.built, { size: 26, family: MONO }),
          t,
          builtAt,
          centre
        )
      );
    } else if (t >= T.build) {
      cells.push(text(COLUMNS.built, y, '—', { size: 26, family: MONO, fill: color.faint }));
    }
    const rejectedAt = T.rejected + index * T.rejectedGap;
    if (t >= rejectedAt) {
      const mark = { x: COLUMNS.message + 16, y: y - midline(24) };
      cells.push(
        popIn(verdict(mark, false, 16), t, rejectedAt, mark),
        place(text(COLUMNS.message + 44, y, row.message, { size: 24, weight: 600 }), {
          opacity: ease.out(span(t, rejectedAt, 0.3)),
        })
      );
    } else if (t >= T.reject) {
      cells.push(text(COLUMNS.message, y, '—', { size: 26, family: MONO, fill: color.faint }));
    }
    parts.push(place(cells.join(''), { opacity: shown, y: (1 - shown) * 10 }));
  });
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// The code strip

const buildLine = "users.with({ name: 'Ada' }).buildValidated();";
const rejectLine = "users.with({ name: 'Ada', age: 15 }).buildValidated();";
const writing = [
  {
    from: T.build,
    until: T.reject,
    line: buildLine,
    typed: typing([buildLine], T.buildTyping, 32),
    mark: "{ name: 'Ada' }",
    markFill: color.mint,
    markAt: T.built,
  },
  {
    from: T.reject,
    until: T.endIn,
    line: rejectLine,
    typed: typing([rejectLine], T.rejectTyping, 32),
    mark: 'age: 15',
    markFill: color.coral,
    markAt: T.rejected,
  },
];

function strip(t: number) {
  const opacity = presence(t, T.build, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [box(STRIP.x, STRIP.y, STRIP.width, STRIP.height, { radius: 22, fill: color.ink })];
  for (const entry of writing) {
    const shown = presence(t, entry.from, entry.until, 0.25);
    if (shown <= 0) {
      continue;
    }
    const from = entry.line.indexOf(entry.mark);
    const spans =
      t >= entry.markAt
        ? [{ line: 0, from, to: from + entry.mark.length, fill: entry.markFill }]
        : [];
    const typed = entry.typed;
    const caret =
      t >= typed.start - 0.2 &&
      t <= typed.end + 0.6 &&
      (t < typed.end || Math.floor(t * 3) % 2 === 0)
        ? (() => {
            const at = typed.caret(t, stripLayout);
            return box(at.x + 1, at.y - 18, 3, 36, { fill: color.mint });
          })()
        : '';
    parts.push(
      place(code([entry.line], { ...stripLayout, reveal: typed.reveal(t), spans }) + caret, {
        opacity: shown,
      })
    );
  }
  return place(parts.join(''), { opacity });
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const packages = [
    '@mimlet/zod',
    '@mimlet/valibot',
    '@mimlet/typebox',
    '@mimlet/json-schema',
    '@mimlet/arktype',
  ];
  const widths = packages.map((name) => estimateSans(name, 24, 700) + 40);
  const total = widths.reduce((sum, width) => sum + width, 0) + (packages.length - 1) * 16;
  let x = 960 - total / 2;
  const chips = packages
    .map((name, index) => {
      const width = widths[index] ?? 0;
      const chip = pill({ x: x + width / 2, y: 726 }, name, {
        size: 24,
        weight: 700,
        background: color.ink,
        fill: color.paper,
        height: 52,
        padding: 20,
      }).svg;
      x += width + 16;
      return chip;
    })
    .join('');
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      chips +
      text(960, 832, 'Pick the adapter for your schema library · beta', {
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
  return entry ? entry.typed.caret(t, stripLayout) : { x: 960, y: 340 };
};
const cell = (column: number, index: number): Point => ({
  x: column + 160,
  y: rowBaseline(index) - 10,
});

const gaze: Key<Point>[] = [
  ...rows.map((_, index): Key<Point> => ({
    at: T.rowsIn + index * T.rowGap,
    value: cell(COLUMNS.library, index),
  })),
  { at: 3.4, value: cell(COLUMNS.builder, 2) },
  { at: T.buildTyping - 0.1, value: caretOf(0) },
  ...rows.map((_, index): Key<Point> => ({
    at: T.built + index * T.builtGap,
    value: cell(COLUMNS.built, index),
  })),
  { at: 12.4, value: cell(COLUMNS.built, 2) },
  { at: T.rejectTyping - 0.1, value: caretOf(1) },
  ...rows.map((_, index): Key<Point> => ({
    at: T.rejected + index * T.rejectedGap,
    value: cell(COLUMNS.message + 100, index),
  })),
  { at: 20.4, value: cell(COLUMNS.message + 100, 4) },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.built + 4 * T.builtGap, value: 'grin' },
  { at: T.built + 4 * T.builtGap + 1.4, value: 'smile' },
  { at: T.rejected, value: 'open' },
  { at: T.rejected + 4 * T.rejectedGap + 0.8, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.6, 5.8, 9.8, 13.4, 16.0, 19.8, 23.8, 26.2];
const hops = [T.built + 4 * T.builtGap, T.endIn + 0.6];

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
  ...rows.map((_, index): Cue => ({ at: T.rowsIn + index * T.rowGap, kind: 'line' })),
  ...writing.flatMap((entry) => entry.typed.keystrokes.map((at): Cue => ({ at, kind: 'key' }))),
  ...rows.map((_, index): Cue => ({ at: T.built + index * T.builtGap, kind: 'pop' })),
  { at: T.built + 4 * T.builtGap + 0.1, kind: 'success' },
  ...rows.map((_, index): Cue => ({
    at: T.rejected + index * T.rejectedGap,
    kind: index === 0 ? 'error' : 'line',
  })),
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'adapters',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Schema adapters'),
        captions(beats, t),
        strip(t),
        header(t),
        table(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
