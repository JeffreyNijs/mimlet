export const identity = {
  name: 'Mimlet',
  tagline: 'Test data, with character.',
  description: 'Typed fixtures. Coherent scenarios. Failures you can replay.',
  releaseStatus: 'Published beta',
  releaseVersion: '0.1.0-beta.4',
  introduction:
    'Give your tests a little life. Build fixtures that fit your schemas, keep related data connected, and bring a failing case back on cue.',
};

export const alphaStatus = `Beta ${identity.releaseVersion} on npm’s latest tag. APIs can still change before a stable release, and there is no production adoption to point to yet.`;

export const feedbackUrl =
  'https://github.com/JeffreyNijs/mimlet/issues/new?template=beta-feedback.yml';

/**
 * The homepage video follows the tested examples/recipes/checkout.ts recipe at seed 12345.
 * Keep these numbers in sync with that recipe and its regression fixture.
 */
export const demo = {
  title: 'Two units. Charged for one.',
  video: 'demo/mimlet-checkout-demo.mp4',
  poster: 'demo/mimlet-checkout-demo-poster.jpg',
  duration: '46 seconds',
  size: '2.2 MB',
  label: 'Checkout demo: a planted quantity bug is found, shrunk, replayed and fixed',
  summary:
    'A checkout test passes with one item, but the code forgets to multiply by quantity. Generated orders find the bug, shrink it to 2 units at 1¢ charged as 1¢, replay it from a saved record, and keep it as a regression test.',
  credit:
    'fast-check generates and shrinks the orders. A Mimlet scenario rebuilds the linked customer, order and lines for every candidate, and a replay record checked against the same versions and configuration brings the failure back.',
};

/** A copyable first fixture. The code block is rendered from this tested recipe. */
export const quickstart = {
  recipe: 'zod',
  install: `npm install --save-dev @mimlet/zod@${identity.releaseVersion} zod@4.6.5`,
  run: 'node fixture.mts',
  output: "{ name: 'Ada', age: '42' } { name: 'Ada', age: 42 }",
};

/** Implemented in source, but excluded from the currently published release train. */
export const previewPackages: readonly string[] = [];

export const stories = [
  {
    number: '01',
    title: 'Your schema. Its natural habitat.',
    description:
      'Keep your native types, validation and codecs. Start with a supported generator, or bring a factory for the details only you know.',
    illustration: 'schema.svg',
    link: '/guide/adapters',
    action: 'Find your adapter',
  },
  {
    number: '02',
    title: 'A whole world, connected.',
    description:
      'A customer, their order, the right total. Describe the relationships once, then build a coherent scenario for the test in front of you.',
    illustration: 'scenarios.svg',
    link: '/guide/correlated-scenarios',
    action: 'Build a scenario',
  },
  {
    number: '03',
    title: 'That failure? Bring it back.',
    description:
      'When a generated test fails, shrink it to the smallest failing case and save it. Replaying the record brings back the same failure, relationships intact.',
    illustration: 'replay.svg',
    link: '/guide/sessions-and-replay',
    action: 'Meet replay and shrinking',
  },
] as const;

export const agentBenefits = [
  [
    'Less API guesswork',
    'Typed builders and tested recipes make the intended operations explicit.',
  ],
  ['More repeatable debugging', 'Save a compatible replay record and return to the failing case.'],
  [
    'A clear path through the docs',
    'Read concise Markdown, choose an adapter, and know when to use a factory.',
  ],
] as const;

export const base = '/mimlet/';
export const hostname = 'https://jeffreynijs.github.io';
export const codeTheme = {
  light: 'github-light-high-contrast',
  dark: 'github-dark-high-contrast',
} as const;
