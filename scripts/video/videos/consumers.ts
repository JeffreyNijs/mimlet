/** Consumers: one Faker recipe feeds a component preview and an HTTP mock with fresh objects. */
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
  lerp,
  line,
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
  type Typing,
  type Video,
} from '../kit.ts';
import { blinkAt, hopAt, mascot, type Mouth } from '../mascot.ts';

/**
 * The user, response and fresh-object check in the video are this program's output with
 * @mimlet/faker and @mimlet/consumers 0.1.0-beta.0 and @faker-js/faker 10.5.0.
 * Re-run it with `node scripts/video/verify.ts consumers`.
 */
export const facts = {
  packages: {
    '@mimlet/core': '0.1.0-beta.0',
    '@mimlet/faker': '0.1.0-beta.0',
    '@mimlet/consumers': '0.1.0-beta.0',
    '@faker-js/faker': '10.5.0',
  },
  program: `import { fakerAdapter, fromFaker } from '@mimlet/faker';
import { fixtureLoader, jsonResponseResolver } from '@mimlet/consumers';

const options = { fingerprint: 'users/v1' };
const provider = fakerAdapter(options);
const referenceTime = '2026-01-01T00:00:00.000Z';
const users = fromFaker((faker) => ({ name: faker.person.fullName(), role: 'reader' }), options);
const buildUser = () => users.build(provider.session(42, { referenceTime }));

const loadUser = fixtureLoader('user', buildUser);
const resolveUser = jsonResponseResolver(buildUser);

const first = await loadUser({});
console.log(JSON.stringify(first));
const response = await resolveUser(new Request('https://example.test/user'));
console.log(response.status, response.headers.get('content-type'), await response.text());
first.user.name = 'Edited in preview';
const next = await loadUser({});
console.log(JSON.stringify(next), next.user === first.user);
const again = await resolveUser(new Request('https://example.test/user'));
console.log(await again.text());
`,
  stdout: [
    '{"user":{"name":"Renee Kessler DDS","role":"reader"}}',
    '200 application/json; charset=utf-8 {"name":"Renee Kessler DDS","role":"reader"}',
    '{"user":{"name":"Renee Kessler DDS","role":"reader"}} false',
    '{"name":"Renee Kessler DDS","role":"reader"}',
  ].join('\n'),
};

const NAME = 'Renee Kessler DDS';
const BODY = '{"name":"Renee Kessler DDS","role":"reader"}';

const T = {
  cardsIn: 0.2,
  handTyping: 0.5,
  handPreview: 1.95,
  handMock: 2.9,
  drift: 3.3,
  recipe: 6.4,
  recipeTyping: 6.8,
  recipeIn: 9.4,
  recipeValue: 9.9,
  preview: 12.4,
  previewTyping: 12.8,
  previewFlight: 14.4,
  flight: 0.45,
  mock: 18.4,
  mockTyping: 18.8,
  mockFlight: 20.4,
  fresh: 24.2,
  editTyping: 24.6,
  edited: 25.7,
  nextTyping: 26.6,
  nextFlight: 27.6,
  endIn: 30.8,
  end: 35.8,
};

const beats: Beat[] = [
  {
    at: 0,
    title: 'Two consumers. Two copies of the same user.',
    subtitle: 'The preview and the mock were written by hand, and they drifted apart.',
  },
  {
    at: T.recipe,
    title: 'Keep one recipe.',
    subtitle: 'fromFaker() builds the user from a seeded session and a fixed reference date.',
  },
  {
    at: T.preview,
    title: 'Load a fresh preview.',
    subtitle: 'fixtureLoader() gives each story its own user.',
  },
  {
    at: T.mock,
    title: 'Serve the same user from a mock.',
    subtitle: 'jsonResponseResolver() answers each request with a new 200 JSON response.',
  },
  {
    at: T.fresh,
    title: 'Edit one copy. The next one is fresh.',
    subtitle: 'Every call builds a new object, so tests cannot leak into each other.',
  },
  { at: T.endIn, title: 'One recipe. Fresh fixtures everywhere.' },
];

// ---------------------------------------------------------------------------
// Layout

const STRIP = { x: 140, y: 300, width: 1640, height: 140 };
const stripLayout: CodeLayout = { x: STRIP.x + 36, y: STRIP.y + 58, size: 30, lineHeight: 46 };
const RECIPE = { x: 560, y: 470, width: 800, height: 128 };
const CARDS = { y: 650, height: 220 };
const PREVIEW = { x: 140, width: 760 };
const MOCK = { x: 1020, width: 760 };

function label(x: number, y: number, value: string) {
  return text(x, y, value, { size: 20, weight: 700, fill: color.muted, spacing: 1.6 });
}

function tag(
  right: number,
  y: number,
  value: string,
  tone: 'mint' | 'coral' | 'plain',
  t: number,
  at: number
) {
  const width = estimateSans(value, 18, 700, 1.4) + 32;
  const centre = { x: right - width / 2, y };
  return popIn(
    pill(centre, value, {
      size: 18,
      weight: 700,
      spacing: 1.4,
      background: tone === 'mint' ? color.mint : tone === 'coral' ? color.coral : color.paper,
      border: tone === 'plain' ? color.rule : undefined,
      fill: tone === 'plain' ? color.muted : color.ink,
      height: 36,
      padding: 16,
    }).svg,
    t,
    at,
    centre
  );
}

// The recipe: one seeded Faker factory both consumers call.
function recipeCard(t: number) {
  const opacity = presence(t, T.recipeIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const valueLabel = `${NAME} · reader`;
  const pillWidth = estimateSans(valueLabel, 30, 700) + 40;
  const parts = [
    box(RECIPE.x, RECIPE.y, RECIPE.width, RECIPE.height, { radius: 22, fill: color.ink }),
    text(RECIPE.x + 32, RECIPE.y + 48, 'buildUser()', {
      size: 30,
      family: MONO,
      weight: 700,
      fill: color.paper,
    }),
    text(RECIPE.x + 260, RECIPE.y + 48, 'fromFaker · seed 42 · 2026-01-01', {
      size: 24,
      fill: color.codeDim,
    }),
    popIn(
      box(RECIPE.x + 24, RECIPE.y + 70, pillWidth, 46, { radius: 14, fill: color.mint }) +
        text(RECIPE.x + 44, RECIPE.y + 103, valueLabel, { size: 30, weight: 700 }),
      t,
      T.recipeValue,
      { x: RECIPE.x + 24 + pillWidth / 2, y: RECIPE.y + 93 }
    ),
  ];
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.recipeIn, 0.4))) * 12 });
}

/** Dependency arrows from the recipe down to each consumer, lit while that consumer calls it. */
const toPreview = {
  from: { x: RECIPE.x + 160, y: RECIPE.y + RECIPE.height + 6 },
  to: { x: PREVIEW.x + 520, y: CARDS.y - 8 },
};
const toMock = {
  from: { x: RECIPE.x + RECIPE.width - 160, y: RECIPE.y + RECIPE.height + 6 },
  to: { x: MOCK.x + 240, y: CARDS.y - 8 },
};

function arrows(t: number) {
  if (t < T.recipeIn || t >= T.endIn) {
    return '';
  }
  const draw = (edge: typeof toPreview, litAt: number) => {
    const lit = t >= litAt;
    const stroke = lit ? color.mint : color.rule;
    const dx = edge.to.x - edge.from.x;
    const dy = edge.to.y - edge.from.y;
    const length = Math.hypot(dx, dy);
    const ux = dx / length;
    const uy = dy / length;
    const head = `M${edge.to.x - ux * 12 - uy * 8} ${edge.to.y - uy * 12 + ux * 8}L${edge.to.x} ${edge.to.y}L${edge.to.x - ux * 12 + uy * 8} ${edge.to.y - uy * 12 - ux * 8}`;
    return (
      line(edge.from, edge.to, stroke, lit ? 4 : 3) +
      `<path d="${head}" stroke="${stroke}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    );
  };
  return place(draw(toPreview, T.previewFlight) + draw(toMock, T.mockFlight), {
    opacity: ease.out(span(t, T.recipeIn, 0.4)),
  });
}

// The component preview: a small rendered user card.
const PREVIEW_NAME: Point = { x: PREVIEW.x + 150, y: CARDS.y + 130 };

function previewUser(
  name: string,
  role: string,
  tone: 'mint' | 'coral' | 'plain',
  missingRole = false
) {
  const initials = name
    .split(' ')
    .filter((part) => /^[A-Z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  const parts = [
    `<circle cx="${PREVIEW.x + 86}" cy="${CARDS.y + 124}" r="44" fill="${tone === 'coral' ? color.coralSoft : color.mintSoft}" stroke="${tone === 'coral' ? color.coral : color.mint}" stroke-width="2.5"/>`,
    text(PREVIEW.x + 86, CARDS.y + 136, initials, { size: 32, weight: 700, anchor: 'middle' }),
    text(PREVIEW_NAME.x, PREVIEW_NAME.y, name, { size: 40, weight: 700 }),
  ];
  if (!missingRole) {
    parts.push(
      pill({ x: PREVIEW_NAME.x + 52, y: CARDS.y + 176 }, role, {
        size: 22,
        weight: 700,
        background: color.mint,
        height: 34,
        padding: 14,
      }).svg
    );
  }
  return parts.join('');
}

function previewCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [
    box(PREVIEW.x, CARDS.y, PREVIEW.width, CARDS.height, {
      radius: 22,
      fill: color.card,
      stroke: color.rule,
    }),
    label(PREVIEW.x + 32, CARDS.y + 44, 'COMPONENT PREVIEW'),
  ];
  const content = (at: number, svg: string) =>
    place(svg, {
      scale: 0.92 + 0.08 * ease.back(span(t, at, 0.3)),
      origin: { x: PREVIEW.x + 380, y: CARDS.y + 130 },
    });
  if (t < T.recipe) {
    parts.push(
      tag(PREVIEW.x + PREVIEW.width - 28, CARDS.y + 38, 'HAND-WRITTEN', 'plain', t, T.cardsIn)
    );
    if (t >= T.handPreview) {
      parts.push(
        place(previewUser('Test User', 'reader', t >= T.drift ? 'coral' : 'plain'), {
          opacity: Math.min(
            ease.out(span(t, T.handPreview, 0.3)),
            1 - span(t, T.recipe - 0.3, 0.3)
          ),
        })
      );
    }
  } else if (t < T.previewFlight + T.flight) {
    parts.push(
      text(PREVIEW.x + 32, CARDS.y + 136, 'loaded.user  —', {
        size: 30,
        family: MONO,
        fill: color.faint,
      })
    );
  } else if (t < T.edited) {
    parts.push(
      tag(
        PREVIEW.x + PREVIEW.width - 28,
        CARDS.y + 38,
        'loaded.user',
        'mint',
        t,
        T.previewFlight + T.flight
      )
    );
    parts.push(content(T.previewFlight + T.flight, previewUser(NAME, 'reader', 'mint')));
  } else if (t < T.nextFlight + T.flight) {
    parts.push(
      tag(PREVIEW.x + PREVIEW.width - 28, CARDS.y + 38, 'EDITED IN THIS TEST', 'plain', t, T.edited)
    );
    const leaving = t >= T.nextFlight ? 1 - span(t, T.nextFlight, T.flight * 0.45) : 1;
    parts.push(
      place(content(T.edited, previewUser('Edited in preview', 'reader', 'plain')), {
        opacity: leaving,
      })
    );
  } else {
    parts.push(
      tag(
        PREVIEW.x + PREVIEW.width - 28,
        CARDS.y + 38,
        'NEXT LOAD · FRESH',
        'mint',
        t,
        T.nextFlight + T.flight
      )
    );
    parts.push(content(T.nextFlight + T.flight, previewUser(NAME, 'reader', 'mint')));
  }
  if (t >= T.drift && t < T.recipe) {
    const centre = { x: PREVIEW.x + PREVIEW.width - 52, y: CARDS.y + 120 };
    parts.push(
      place(popIn(verdict(centre, false, 18), t, T.drift, centre), {
        opacity: 1 - span(t, T.recipe - 0.3, 0.3),
      })
    );
  }
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

// The HTTP mock: a status, a content type and a JSON body.
function mockCard(t: number) {
  const opacity = presence(t, T.cardsIn, T.endIn);
  if (opacity <= 0) {
    return '';
  }
  const parts = [
    box(MOCK.x, CARDS.y, MOCK.width, CARDS.height, {
      radius: 22,
      fill: color.card,
      stroke: color.rule,
    }),
    label(MOCK.x + 32, CARDS.y + 44, 'HTTP MOCK'),
    text(MOCK.x + 32 + estimateSans('HTTP MOCK', 20, 700, 1.6) + 18, CARDS.y + 44, 'GET /user', {
      size: 24,
      family: MONO,
      fill: color.muted,
    }),
  ];
  if (t < T.handMock) {
    parts.push(
      text(MOCK.x + 32, CARDS.y + 136, 'response  —', { size: 30, family: MONO, fill: color.faint })
    );
  } else if (t < T.recipe) {
    const fade = Math.min(ease.out(span(t, T.handMock, 0.3)), 1 - span(t, T.recipe - 0.3, 0.3));
    const wrong = t >= T.drift;
    parts.push(
      tag(MOCK.x + MOCK.width - 28, CARDS.y + 38, 'HAND-WRITTEN', 'plain', t, T.cardsIn),
      place(
        text(MOCK.x + 32, CARDS.y + 120, 'body', { size: 24, fill: color.muted }) +
          code(['{"name":"Jane Doe"}'], {
            x: MOCK.x + 120,
            y: CARDS.y + 120,
            size: 30,
            lineHeight: 46,
            fill: color.ink,
            spans: wrong ? [{ line: 0, from: 9, to: 17, fill: color.coralText }] : [],
          }) +
          (wrong
            ? text(MOCK.x + 32, CARDS.y + 180, 'Different name, and no role at all.', {
                size: 26,
                weight: 600,
              })
            : ''),
        { opacity: fade }
      )
    );
    if (wrong) {
      const centre = { x: MOCK.x + MOCK.width - 52, y: CARDS.y + 110 };
      parts.push(place(popIn(verdict(centre, false, 18), t, T.drift, centre), { opacity: fade }));
    }
  } else if (t < T.mockFlight + T.flight) {
    parts.push(
      text(MOCK.x + 32, CARDS.y + 136, 'response  —', { size: 30, family: MONO, fill: color.faint })
    );
  } else {
    const at = T.mockFlight + T.flight;
    const unchanged = t >= T.edited && t < T.endIn;
    parts.push(
      tag(
        MOCK.x + MOCK.width - 28,
        CARDS.y + 38,
        unchanged ? 'UNCHANGED' : 'NEW RESPONSE',
        'mint',
        t,
        unchanged ? T.edited : at
      ),
      place(
        pill({ x: MOCK.x + 32 + 44, y: CARDS.y + 108 }, '200', {
          size: 26,
          family: MONO,
          weight: 700,
          background: color.mint,
          height: 40,
          padding: 16,
        }).svg +
          text(MOCK.x + 140, CARDS.y + 117, 'application/json; charset=utf-8', {
            size: 24,
            family: MONO,
            fill: color.muted,
          }) +
          text(MOCK.x + 32, CARDS.y + 180, BODY, { size: 26, family: MONO }),
        {
          scale: 0.92 + 0.08 * ease.back(span(t, at, 0.3)),
          origin: { x: MOCK.x + 380, y: CARDS.y + 140 },
        }
      )
    );
  }
  return place(parts.join(''), { opacity, y: (1 - ease.out(span(t, T.cardsIn, 0.4))) * 14 });
}

// ---------------------------------------------------------------------------
// The code strip

interface Writing {
  from: number;
  until: number;
  lines: string[];
  typed: Typing[];
  marks?: { line: number; value: string; fill: string; at: number }[];
}
const recipeLines = [
  "const users = fromFaker((faker) => ({ name: faker.person.fullName(), role: 'reader' }),",
  '  options);',
];
const previewLine = "const loadUser = fixtureLoader('user', buildUser);";
const mockLine = 'const resolveUser = jsonResponseResolver(buildUser);';
const freshLines = ["first.user.name = 'Edited in preview';", 'const next = await loadUser({});'];
const handLines = [
  "const previewUser = { name: 'Test User', role: 'reader' };",
  "const mockBody = { name: 'Jane Doe' };",
];
const writing: Writing[] = [
  {
    from: 0,
    until: T.recipe,
    lines: handLines,
    typed: [typing(handLines, T.handTyping, 40)],
    marks: [
      { line: 0, value: "'Test User'", fill: color.coral, at: T.drift },
      { line: 1, value: "'Jane Doe'", fill: color.coral, at: T.drift },
    ],
  },
  {
    from: T.recipe,
    until: T.preview,
    lines: recipeLines,
    typed: [typing(recipeLines, T.recipeTyping, 40)],
    marks: [{ line: 0, value: 'fromFaker', fill: color.mint, at: T.recipeIn }],
  },
  {
    from: T.preview,
    until: T.mock,
    lines: [previewLine],
    typed: [typing([previewLine], T.previewTyping, 36)],
    marks: [{ line: 0, value: 'fixtureLoader', fill: color.mint, at: T.previewFlight }],
  },
  {
    from: T.mock,
    until: T.fresh,
    lines: [mockLine],
    typed: [typing([mockLine], T.mockTyping, 36)],
    marks: [{ line: 0, value: 'jsonResponseResolver', fill: color.mint, at: T.mockFlight }],
  },
  {
    from: T.fresh,
    until: T.endIn,
    lines: freshLines,
    typed: [
      typing(freshLines.slice(0, 1), T.editTyping, 36),
      typing(freshLines, T.nextTyping, 36, 1),
    ],
    marks: [
      { line: 0, value: "'Edited in preview'", fill: color.coral, at: T.edited },
      { line: 1, value: 'loadUser', fill: color.mint, at: T.nextFlight },
    ],
  },
];
const typedAt = (entry: Writing, t: number) =>
  entry.typed.reduce(
    (active, candidate) => (t >= candidate.start - 0.2 ? candidate : active),
    entry.typed[0] as Typing
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
    const typed = typedAt(entry, t);
    const spans = (entry.marks ?? [])
      .filter((mark) => t >= mark.at)
      .map((mark) => {
        const from = (entry.lines[mark.line] ?? '').indexOf(mark.value);
        return { line: mark.line, from, to: from + mark.value.length, fill: mark.fill };
      });
    const caret =
      t >= typed.start - 0.2 &&
      t <= typed.end + 0.6 &&
      (t < typed.end || Math.floor(t * 3) % 2 === 0)
        ? (() => {
            const at = typed.caret(t, stripLayout);
            return box(at.x + 1, at.y - 17, 3, 34, { fill: color.mint });
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
// Each call sends a freshly built user from the recipe down to its consumer.

interface Flight {
  start: number;
  edge: typeof toPreview;
}
const flights: Flight[] = [
  { start: T.previewFlight, edge: toPreview },
  { start: T.mockFlight, edge: toMock },
  { start: T.nextFlight, edge: toPreview },
];
const flightPoint = (flight: Flight, t: number): Point => {
  const p = ease.inOut(span(t, flight.start, T.flight));
  return {
    x: lerp(flight.edge.from.x, flight.edge.to.x, p),
    y: lerp(flight.edge.from.y, flight.edge.to.y, p),
  };
};

/** Each call sends a freshly built user down its arrow, shown as a pulse. */
function pulses(t: number) {
  return flights
    .map((flight) => {
      if (t < flight.start || t >= flight.start + T.flight) {
        return '';
      }
      const at = flightPoint(flight, t);
      return `<circle cx="${at.x}" cy="${at.y}" r="12" fill="${color.mint}" stroke="${color.ink}" stroke-width="3"/>`;
    })
    .join('');
}

function endCard(t: number) {
  const opacity = ease.out(span(t, T.endIn + 0.35, 0.45));
  if (opacity <= 0) {
    return '';
  }
  const installPill = pill(
    { x: 960, y: 726 },
    'npm i -D @mimlet/faker @mimlet/consumers @faker-js/faker',
    {
      size: 30,
      family: MONO,
      background: color.ink,
      fill: color.paper,
      height: 68,
      padding: 32,
    }
  );
  return place(
    wordmark(960 - 150.5 * 1.8, 392, 1.8) +
      text(960, 630, 'jeffreynijs.github.io/mimlet', { size: 44, weight: 700, anchor: 'middle' }) +
      installPill.svg +
      text(960, 832, 'Storybook-style loaders · MSW or Fetch mocks · beta', {
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
  return entry ? typedAt(entry, t).caret(t, stripLayout) : { x: 960, y: 360 };
};
const follow = (index: number) => (t: number) => {
  const flight = flights[index];
  return flight ? flightPoint(flight, t) : { x: 960, y: 600 };
};
const PREVIEW_AT: Point = { x: PREVIEW.x + 330, y: CARDS.y + 120 };
const MOCK_AT: Point = { x: MOCK.x + 330, y: CARDS.y + 170 };

const gaze: Key<Point>[] = [
  { at: 0, value: PREVIEW_AT },
  { at: 1.4, value: MOCK_AT },
  { at: T.drift, value: { x: PREVIEW.x + 330, y: CARDS.y + 120 } },
  { at: T.drift + 0.9, value: { x: MOCK.x + 300, y: CARDS.y + 120 } },
  { at: T.recipeTyping - 0.1, value: caretOf(0) },
  { at: T.recipeValue, value: { x: RECIPE.x + 200, y: RECIPE.y + 93 } },
  { at: T.previewTyping - 0.1, value: caretOf(1) },
  { at: T.previewFlight, value: follow(0) },
  { at: T.previewFlight + T.flight, value: PREVIEW_AT },
  { at: T.mockTyping - 0.1, value: caretOf(2) },
  { at: T.mockFlight, value: follow(1) },
  { at: T.mockFlight + T.flight, value: MOCK_AT },
  { at: T.editTyping - 0.1, value: caretOf(3) },
  { at: T.edited, value: PREVIEW_AT },
  { at: T.edited + 0.6, value: MOCK_AT },
  { at: T.nextTyping - 0.1, value: caretOf(3) },
  { at: T.nextFlight, value: follow(2) },
  { at: T.nextFlight + T.flight, value: PREVIEW_AT },
  { at: T.endIn + 0.3, value: { x: 960, y: 560 } },
];

const mouths: Key<Mouth>[] = [
  { at: 0, value: 'smile' },
  { at: T.drift, value: 'worried' },
  { at: T.recipe, value: 'smile' },
  { at: T.previewFlight + T.flight, value: 'grin' },
  { at: T.previewFlight + T.flight + 1.2, value: 'smile' },
  { at: T.edited, value: 'open' },
  { at: T.edited + 0.8, value: 'smile' },
  { at: T.nextFlight + T.flight, value: 'grin' },
  { at: T.nextFlight + T.flight + 1.4, value: 'smile' },
  { at: T.endIn + 0.4, value: 'grin' },
];

const blinks = [2.0, 5.4, 8.6, 11.8, 16.2, 19.6, 23.4, 26.0, 29.6, 33.2];
const hops = [T.previewFlight + T.flight, T.nextFlight + T.flight, T.endIn + 0.6];

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
  { at: T.drift, kind: 'error' },
  ...writing.flatMap((entry) =>
    entry.typed.flatMap((typed) => typed.keystrokes.map((at): Cue => ({ at, kind: 'key' })))
  ),
  { at: T.recipeIn, kind: 'line' },
  { at: T.recipeValue, kind: 'pop' },
  ...flights.flatMap((flight): Cue[] => [
    { at: flight.start, kind: 'whoosh' },
    { at: flight.start + T.flight, kind: 'pop' },
  ]),
  { at: T.previewFlight + T.flight + 0.1, kind: 'success' },
  { at: T.mockFlight + T.flight + 0.1, kind: 'success' },
  { at: T.edited, kind: 'pop' },
  { at: T.nextFlight + T.flight + 0.1, kind: 'success' },
  { at: T.endIn + 0.4, kind: 'chime' },
];

const video: Video = {
  id: 'consumers',
  duration: T.end,
  cues,
  frame(t) {
    return frameSvg(
      [
        chrome('One recipe, every consumer'),
        captions(beats, t),
        strip(t),
        recipeCard(t),
        arrows(t),
        previewCard(t),
        mockCard(t),
        pulses(t),
        endCard(t),
        character(t),
      ].join('')
    );
  },
};

export default video;
