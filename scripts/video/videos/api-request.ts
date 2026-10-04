/** API request: build, validate and serialize test requests from an OpenAPI operation. */
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
 * The fixture, transport and rejection in the video are this program's output with
 * @mimlet/api 0.1.0-beta.0. Re-run it with `node scripts/video/verify.ts api-request`.
 */
export const facts = {
  packages: { '@mimlet/core': '0.1.0-beta.0', '@mimlet/api': '0.1.0-beta.0' },
  program: `import { openApi } from '@mimlet/api';

const spec = {
  openapi: '3.1.0',
  info: { title: 'Users', version: '1.0.0' },
  paths: {
    '/users/{id}': {
      patch: {
        operationId: 'updateUser',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['name'],
                properties: { name: { type: 'string', minLength: 1 } },
              },
            },
          },
        },
        responses: { 200: { description: 'Updated' } },
      },
    },
  },
};

const request = openApi(spec).request({ operationId: 'updateUser' });
const fixture = request
  .builder()
  .with({ path: { id: 'user-7' }, body: { name: 'Ada' } })
  .buildValidated();
console.log(JSON.stringify(fixture));
console.log(JSON.stringify(request.serialize(fixture, { baseUrl: 'https://example.test/api' })));
try {
  request
    .builder()
    .with({ path: { id: 'user-7' }, body: { name: '' } })
    .buildValidated();
} catch (error) {
  const [issue] = error.issues;
  console.log(error.name, issue.path.join('.'), issue.message);
}
`,
  stdout: [
    '{"path":{"id":"user-7"},"body":{"name":"Ada"}}',
    '{"method":"PATCH","url":"https://example.test/api/users/user-7","headers":{"content-type":"application/json"},"body":"{\\"name\\":\\"Ada\\"}"}',
    'BuilderValidationError body.name must NOT have fewer than 1 characters',
  ].join('\n'),
};

const T = {
  cardsIn: 0.2,
  mockTyping: 0.6,
  mockShown: 3.0,
  drift: 4.2,
  operation: 7.4,
  requestTyping: 7.8,
  builderIn: 10.0,
  fixture: 12.6,
  fixtureTyping: 13.0,
  flyId: 16.3,
  flyName: 16.9,
  flight: 0.6,
  validated: 17.7,
  serialize: 20.6,
  serializeTyping: 21.0,
  descriptor: 23.1,
  empty: 27.0,
  emptyTyping: 27.4,
  rejected: 30.0,
  rejectedMessage: 30.4,
  endIn: 33.4,
  end: 38.4,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'A hand-written mock can drift from the API.',
    subtitle: 'It still sends fullName. updateUser now requires name.',
  },
  {
    at: T.operation,
    title: 'Start from the operation instead.',
    subtitle: 'openApi(spec).request() reads updateUser’s parameters and body.',
  },
  {
    at: T.fixture,
    title: 'Set the case your test needs.',
    subtitle: 'buildValidated() checks it against the operation’s schemas.',
  },
  {
    at: T.serialize,
    title: 'Serialize it for your test transport.',
    subtitle: 'Method, URL, headers and body. No HTTP request is made.',
  },
  {
    at: T.empty,
    title: 'An empty name never becomes a request.',
    subtitle: 'The operation’s minLength rule rejects it first.',
  },
  { at: T.endIn, title: 'Your contract. A checked test request.' },
];

// ---------------------------------------------------------------------------
// Layout: what is written across the top, the operation and the request below it.

const STRIP = { x: 140, y: 300, width: 1640, height: 140 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 58, size: 32, lineHeight: 48 };
const CARDS = { y: 480, height: 390 };
const LEFT = { x: 140, width: 640 };
const RIGHT = { x: 860, width: 920 };

function label(x: number, y: number, value: string) {
  return text(x, y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 });
}

function card(x: number, width: number) {
  return box(x, CARDS.y, width, CARDS.height, { radius: 22, fill: color.card, stroke: color.rule });
}

function valuePill(
  x: number,
  baseline: number,
  value: string,
  tone: 'mint' | 'coral' | 'plain',
  size = 30
) {
  const width = Math.max(1, value.length) * monoWidth(size) + 28;
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

// The operation: the contract every request is checked against.
const OPERATION_ROWS = { pathId: CARDS.y + 250, bodyName: CARDS.y + 314 };

function operationCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const drifted = t >= T.drift && t < T.operation;
  const matched = t >= T.validated && t < T.empty;
  const rejected = t >= T.rejectedMessage && t < T.endIn;
  const nameAccent = drifted || rejected ? color.coral : matched ? color.mint : undefined;
  const methodChip = pill({ x: LEFT.x + 32 + 58, y: CARDS.y + 104 }, 'PATCH', {
    size: 28,
    family: MONO,
    weight: 700,
    background: color.mint,
    height: 46,
    padding: 14,
  });
  const parts = [
    card(LEFT.x, LEFT.width),
    label(LEFT.x + 32, CARDS.y + 46, 'OPENAPI 3.1 OPERATION'),
    methodChip.svg,
    text(LEFT.x + 32 + methodChip.width + 20, CARDS.y + 117, '/users/{id}', {
      size: 36,
      family: MONO,
    }),
    text(LEFT.x + 32, CARDS.y + 180, 'operationId', { size: 24, fill: color.muted }),
    text(LEFT.x + 200, CARDS.y + 180, 'updateUser', { size: 30, family: MONO, weight: 700 }),
    line(
      { x: LEFT.x + 24, y: CARDS.y + 210 },
      { x: LEFT.x + LEFT.width - 24, y: CARDS.y + 210 },
      color.rule,
      2
    ),
  ];
  const row = (y: number, field: string, rule: string, accent?: string) => {
    const pieces = [];
    if (accent) {
      pieces.push(
        box(LEFT.x + 14, y - 38, LEFT.width - 28, 54, {
          radius: 12,
          stroke: accent,
          strokeWidth: 2.5,
        })
      );
    }
    pieces.push(
      text(LEFT.x + 32, y, field, { size: 28, family: MONO, weight: 700 }),
      text(LEFT.x + 230, y, rule, { size: 24, fill: color.muted })
    );
    return pieces.join('');
  };
  parts.push(
    row(OPERATION_ROWS.pathId, 'path.id', 'string · required', matched ? color.mint : undefined),
    row(OPERATION_ROWS.bodyName, 'body.name', 'string · minLength 1 · required', nameAccent)
  );
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

// The request side: a hand-written mock, then builder slots, a validated fixture, the
// serialized transport and finally a rejected override.
const SLOT = { x: RIGHT.x + 180, id: CARDS.y + 170, name: CARDS.y + 286 };
const idSlot: Point = { x: SLOT.x + 14, y: SLOT.id };
const nameSlot: Point = { x: SLOT.x + 14, y: SLOT.name };
const URL_ROW = CARDS.y + 170;
const BODY_ROW = CARDS.y + 310;
const urlPrefix = 'https://example.test/api/users/';
const urlValueAt: Point = { x: RIGHT.x + 200 + urlPrefix.length * monoWidth(28), y: URL_ROW };
const bodyPrefix = '{"name":"';
const bodyValueAt: Point = { x: RIGHT.x + 200 + bodyPrefix.length * monoWidth(28), y: BODY_ROW };

function headerBadge(value: string, tone: 'mint' | 'coral' | 'plain', t: number, at: number) {
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

function mockCard(t: number) {
  const rows = [
    ['method', "'PATCH'"],
    ['url', "'/users/7'"],
    ['body', "{ fullName: 'Ada' }"],
  ] as const;
  const parts = [
    card(RIGHT.x, RIGHT.width),
    label(RIGHT.x + 32, CARDS.y + 46, 'HAND-WRITTEN MOCK'),
  ];
  parts.push(headerBadge('NOT CHECKED', 'plain', t, T.mockShown));
  rows.forEach(([name, value], index) => {
    const y = CARDS.y + 130 + index * 66;
    const shown = ease.out(span(t, T.mockShown + index * 0.12, 0.3));
    const pieces = [
      text(RIGHT.x + 32, y, name, { size: 26, fill: color.muted }),
      code([value], {
        x: RIGHT.x + 180,
        y,
        size: 30,
        lineHeight: 48,
        fill: color.ink,
        spans:
          name === 'body' && t >= T.drift
            ? [{ line: 0, from: 2, to: 10, fill: color.coralText }]
            : [],
      }),
    ];
    parts.push(place(pieces.join(''), { opacity: shown }));
  });
  if (t >= T.drift) {
    const settle = ease.out(span(t, T.drift, 0.3));
    const centre = { x: RIGHT.x + 52, y: CARDS.y + 340 - midline(26) };
    parts.push(
      popIn(verdict(centre, false, 17), t, T.drift, centre),
      place(
        text(RIGHT.x + 84, CARDS.y + 340, 'The operation requires body.name, not fullName.', {
          size: 26,
          weight: 600,
        }),
        { opacity: settle }
      )
    );
  }
  return parts.join('');
}

function slotsCard(
  t: number,
  values: { id?: string; name?: string; tone: 'mint' | 'coral' | 'plain' }
) {
  const parts = [card(RIGHT.x, RIGHT.width), label(RIGHT.x + 32, CARDS.y + 46, 'TEST REQUEST')];
  const group = (
    y: number,
    title: string,
    field: string,
    value: string | undefined,
    at: number
  ) => {
    const pieces = [
      label(RIGHT.x + 32, y - 46, title),
      text(RIGHT.x + 32, y, field, { size: 28, family: MONO, fill: color.muted }),
    ];
    if (value === undefined || t < at) {
      pieces.push(text(SLOT.x + 14, y, '—', { size: 30, family: MONO, fill: color.faint }));
    } else {
      const shown = valuePill(SLOT.x, y, value === '' ? "''" : `'${value}'`, values.tone);
      pieces.push(
        place(shown.svg, {
          scale: 0.85 + 0.15 * ease.back(span(t, at, 0.3)),
          origin: { x: SLOT.x + shown.width / 2, y: y - midline(30) },
        })
      );
    }
    return pieces.join('');
  };
  const idAt = values.tone === 'coral' ? T.rejected : T.flyId + T.flight;
  const nameAt = values.tone === 'coral' ? T.rejected : T.flyName + T.flight;
  parts.push(
    group(SLOT.id, 'PATH', 'id', values.id, idAt),
    group(SLOT.name, 'BODY', 'name', values.name, nameAt)
  );
  return parts.join('');
}

function descriptorCard(t: number) {
  const parts = [
    card(RIGHT.x, RIGHT.width),
    label(RIGHT.x + 32, CARDS.y + 46, 'SERIALIZED REQUEST'),
  ];
  parts.push(headerBadge('NO HTTP CALL', 'plain', t, T.descriptor + 0.6));
  const rows: [string, string, number, string?][] = [
    ['method', 'PATCH', CARDS.y + 110],
    ['url', `${urlPrefix}user-7`, URL_ROW, 'user-7'],
    ['header', 'content-type: application/json', CARDS.y + 240],
    ['body', '{"name":"Ada"}', BODY_ROW, 'Ada'],
  ];
  rows.forEach(([name, value, y, highlight], index) => {
    const shown = ease.out(span(t, T.descriptor + index * 0.1, 0.3));
    const from = highlight ? value.indexOf(highlight) : -1;
    const landed = t >= T.descriptor + 0.6;
    parts.push(
      place(
        text(RIGHT.x + 32, y, name, { size: 26, fill: color.muted }) +
          code([value], {
            x: RIGHT.x + 200,
            y,
            size: 28,
            lineHeight: 48,
            fill: color.ink,
            reveal: highlight && !landed ? from : Infinity,
            spans: highlight
              ? [{ line: 0, from, to: from + highlight.length, fill: color.mintText }]
              : [],
          }),
        { opacity: shown }
      )
    );
  });
  return parts.join('');
}

function rejectedCard(t: number) {
  const parts = [slotsCard(t, { id: 'user-7', name: '', tone: 'coral' })];
  parts.push(headerBadge('REJECTED', 'coral', t, T.rejected));
  if (t >= T.rejectedMessage) {
    const settle = ease.out(span(t, T.rejectedMessage, 0.3));
    parts.push(
      place(
        text(RIGHT.x + 420, SLOT.id - 10, 'BuilderValidationError', {
          size: 28,
          family: MONO,
          weight: 700,
        }) +
          text(RIGHT.x + 420, SLOT.id + 34, 'body.name', {
            size: 26,
            family: MONO,
            fill: color.muted,
          }) +
          text(RIGHT.x + 420, SLOT.id + 74, 'must NOT have fewer', { size: 26 }) +
          text(RIGHT.x + 420, SLOT.id + 108, 'than 1 characters', { size: 26 }),
        { opacity: settle, y: (1 - settle) * 8 }
      )
    );
  }
  return parts.join('');
}

function requestCard(t: number) {
  const opacity = presence(t, T.mockShown - 0.3, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const phases: { from: number; until: number; svg: () => string }[] = [
    { from: T.mockShown - 0.3, until: T.builderIn, svg: () => mockCard(t) },
    {
      from: T.builderIn,
      until: T.descriptor,
      svg: () =>
        slotsCard(t, { id: 'user-7', name: 'Ada', tone: t >= T.validated ? 'mint' : 'plain' }) +
        headerBadge('VALIDATED', 'mint', t, T.validated),
    },
    { from: T.descriptor, until: T.rejected, svg: () => descriptorCard(t) },
    { from: T.rejected, until: T.endIn, svg: () => rejectedCard(t) },
  ];
  const parts: string[] = [];
  for (const phase of phases) {
    const shown = presence(t, phase.from, phase.until, 0.25);
    if (shown > 0) {
      parts.push(place(phase.svg(), { opacity: shown }));
    }
  }
  return place(parts.join(''), { opacity });
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
const mockLine = "const mock = { method: 'PATCH', url: '/users/7', body: { fullName: 'Ada' } };";
const requestLine = "const request = openApi(spec).request({ operationId: 'updateUser' });";
const fixtureLines = [
  'const fixture = request.builder()',
  "  .with({ path: { id: 'user-7' }, body: { name: 'Ada' } }).buildValidated();",
];
const serializeLine = "request.serialize(fixture, { baseUrl: 'https://example.test/api' });";
const emptyLines = [
  'request.builder()',
  "  .with({ path: { id: 'user-7' }, body: { name: '' } }).buildValidated();",
];
const writing: Writing[] = [
  {
    from: 0,
    until: T.operation,
    lines: [mockLine],
    typed: typing([mockLine], T.mockTyping, 34),
    marks: [{ line: 0, value: 'fullName', fill: color.coral, at: T.drift }],
  },
  {
    from: T.operation,
    until: T.fixture,
    lines: [requestLine],
    typed: typing([requestLine], T.requestTyping, 34),
    marks: [{ line: 0, value: "'updateUser'", fill: color.mint, at: T.builderIn }],
  },
  {
    from: T.fixture,
    until: T.serialize,
    lines: fixtureLines,
    typed: typing(fixtureLines, T.fixtureTyping, 36),
    marks: [
      { line: 1, value: "'user-7'", fill: color.mint, at: T.flyId },
      { line: 1, value: "'Ada'", fill: color.mint, at: T.flyName },
      { line: 1, value: 'buildValidated()', fill: color.mint, at: T.validated },
    ],
  },
  {
    from: T.serialize,
    until: T.empty,
    lines: [serializeLine],
    typed: typing([serializeLine], T.serializeTyping, 36),
    marks: [{ line: 0, value: 'serialize', fill: color.mint, at: T.descriptor }],
  },
  {
    from: T.empty,
    until: T.endIn,
    lines: emptyLines,
    typed: typing(emptyLines, T.emptyTyping, 38),
    marks: [{ line: 1, value: "''", fill: color.coral, at: T.rejected }],
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
        const source = entry.lines[mark.line] ?? '';
        const from = source.indexOf(mark.value);
        return { line: mark.line, from, to: from + mark.value.length, fill: mark.fill };
      });
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
      place(code(entry.lines, { ...stripLayout, reveal: typed.reveal(t), spans }) + caret, {
        opacity: shown,
      })
    );
  }
  return place(parts.join(''), { opacity });
}

// ---------------------------------------------------------------------------
// Flying values: from the code into the fixture, then from the fixture into the transport.

interface Flight {
  start: number;
  value: string;
  from: Point;
  to: Point;
  fromSize: number;
  toSize: number;
}
const tokenAt = (lineIndex: number, value: string): Point => {
  const source = fixtureLines[lineIndex] ?? '';
  return column(stripLayout, lineIndex, source.indexOf(value));
};
const flights: Flight[] = [
  {
    start: T.flyId,
    value: "'user-7'",
    from: tokenAt(1, "'user-7'"),
    to: idSlot,
    fromSize: 32,
    toSize: 30,
  },
  {
    start: T.flyName,
    value: "'Ada'",
    from: tokenAt(1, "'Ada'"),
    to: nameSlot,
    fromSize: 32,
    toSize: 30,
  },
  {
    start: T.descriptor,
    value: 'user-7',
    from: { x: idSlot.x + monoWidth(30), y: idSlot.y },
    to: urlValueAt,
    fromSize: 30,
    toSize: 28,
  },
  {
    start: T.descriptor + 0.08,
    value: 'Ada',
    from: { x: nameSlot.x + monoWidth(30), y: nameSlot.y },
    to: bodyValueAt,
    fromSize: 30,
    toSize: 28,
  },
];
/** Code values enter the request card to the right of its label, then drop into their slot. */
const ENTRY: Point = { x: RIGHT.x + 640, y: CARDS.y + 80 };
const flightPoint = (flight: Flight, t: number) => {
  const p = ease.inOut(span(t, flight.start, T.flight));
  const fromCode = flight.from.y < CARDS.y;
  const via = fromCode
    ? ENTRY
    : { x: Math.max(flight.from.x, flight.to.x) + 120, y: (flight.from.y + flight.to.y) / 2 };
  return curve(flight.from, via, flight.to, p);
};

function flyingValues(t: number) {
  return flights
    .map((flight) => {
      if (t < flight.start || t >= flight.start + T.flight) {
        return '';
      }
      const p = ease.inOut(span(t, flight.start, T.flight));
      const at = flightPoint(flight, t);
      const size = lerp(flight.fromSize, flight.toSize, p);
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
  const installPill = pill({ x: 960, y: 726 }, 'npm i -D @mimlet/core @mimlet/api', {
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
      text(960, 832, '@mimlet/api · OpenAPI 3.0 to 3.2 · beta', {
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
const BODY_NAME_AT: Point = { x: LEFT.x + 330, y: OPERATION_ROWS.bodyName - 12 };

const gaze: Key<Point>[] = [
  { at: 0, value: { x: LEFT.x + 320, y: CARDS.y + 120 } },
  { at: T.mockTyping - 0.1, value: caretOf(0) },
  { at: T.mockShown, value: { x: RIGHT.x + 360, y: CARDS.y + 200 } },
  { at: T.drift, value: { x: RIGHT.x + 300, y: CARDS.y + 262 } },
  { at: T.drift + 0.8, value: BODY_NAME_AT },
  { at: T.requestTyping - 0.1, value: caretOf(1) },
  { at: T.builderIn, value: { x: RIGHT.x + 300, y: CARDS.y + 230 } },
  { at: T.fixtureTyping - 0.1, value: caretOf(2) },
  { at: T.flyId - 0.1, value: follow(0) },
  { at: T.flyName - 0.1, value: follow(1) },
  { at: T.validated, value: { x: RIGHT.x + RIGHT.width - 110, y: CARDS.y + 42 } },
  { at: T.validated + 0.6, value: BODY_NAME_AT },
  { at: T.serializeTyping - 0.1, value: caretOf(3) },
  { at: T.descriptor, value: follow(2) },
  { at: T.descriptor + 0.7, value: { x: RIGHT.x + 520, y: URL_ROW - 10 } },
  { at: T.descriptor + 1.6, value: { x: RIGHT.x + 400, y: BODY_ROW - 10 } },
  { at: T.emptyTyping - 0.1, value: caretOf(4) },
  { at: T.rejected, value: { x: SLOT.x + 40, y: SLOT.name - 10 } },
  { at: T.rejectedMessage, value: { x: RIGHT.x + 560, y: SLOT.id + 40 } },
  { at: T.rejectedMessage + 1.0, value: BODY_NAME_AT },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.drift, value: 'worried' },
  { at: T.operation, value: 'smile' },
  { at: T.validated, value: 'grin' },
  { at: T.validated + 1.4, value: 'smile' },
  { at: T.rejected, value: 'open' },
  { at: T.rejectedMessage + 1.2, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.4, 6.2, 9.4, 12.2, 15.2, 19.4, 22.6, 26.2, 29.0, 32.6, 35.4, 37.6];
const hops = [T.validated, T.endIn + 0.6];

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
  { at: T.mockShown, kind: 'line' },
  { at: T.drift, kind: 'error' },
  { at: T.builderIn, kind: 'pop' },
  ...flights.slice(0, 2).flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + T.flight, kind: 'pop' },
  ]),
  { at: T.validated, kind: 'success' },
  { at: T.descriptor, kind: 'whoosh' },
  { at: T.descriptor + 0.6, kind: 'pop' },
  { at: T.rejected, kind: 'pop' },
  { at: T.rejectedMessage, kind: 'error' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'api-request',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('Operation → test request'),
        captions(beats, t),
        strip(t),
        operationCard(t),
        requestCard(t),
        flyingValues(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
