/** Generate HTML input and agent-readable output from the same canonical Markdown and recipes. */
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMarkdownRenderer } from 'vitepress';
import { buildSandboxRuntime } from './sandbox-runtime.ts';
import {
  agentBenefits,
  alphaStatus,
  base,
  codeTheme,
  demo,
  feedbackUrl,
  identity,
  previewPackages,
  quickstart,
  stories,
} from '../content.ts';

export const root = fileURLToPath(new URL('../../../', import.meta.url));
const generated = resolve(root, 'apps/docs/.generated');
const repository = 'JeffreyNijs/mimlet';
const ref = process.env.DOCS_SOURCE_REF ?? 'main';
const sourceUrl = `https://github.com/${repository}/blob/${encodeURIComponent(ref)}/`;
const read = (file: string) => readFile(resolve(root, file), 'utf8');

async function writeChanged(path: string, content: string): Promise<void> {
  if (
    await readFile(path, 'utf8').then(
      (value) => value === content,
      () => false
    )
  ) {
    return;
  }
  const temporary = `${path}.${randomUUID()}.tmp`;
  await writeFile(temporary, content);
  await rename(temporary, path);
}

export async function prepare(): Promise<void> {
  const documents = new Map<string, string>();
  for (const file of (await readdir(resolve(root, 'docs')))
    .filter((file) => file.endsWith('.md'))
    .sort()) {
    documents.set(`docs/${file}`, `guide/${file}`);
  }
  const packages: { name: string; directory: string }[] = [];
  for (const directory of (await readdir(resolve(root, 'packages'))).sort()) {
    const manifest = JSON.parse(await read(`packages/${directory}/package.json`)) as {
      name: string;
    };
    packages.push({ name: manifest.name, directory });
    documents.set(`packages/${directory}/README.md`, `packages/${directory}.md`);
  }
  const { version } = JSON.parse(await read('packages/core/package.json')) as { version: string };
  const link = (href: string, file: string, markdown: boolean): string => {
    if (/^(?:https?:|mailto:|#|\/\/)/.test(href)) {
      return href.replace(
        'https://github.com/JeffreyNijs/mimlet',
        `https://github.com/${repository}`
      );
    }
    const [target = '', anchor = ''] = href.split('#');
    const resolved = relative(
      root,
      resolve(dirname(resolve(root, file)), decodeURIComponent(target))
    ).replaceAll('\\', '/');
    const route = documents.get(resolved);
    if (route) {
      return `${markdown ? base : '/'}${route.replace(/\.md$/, markdown ? '.md' : '.html')}${anchor ? `#${anchor}` : ''}`;
    }
    if (resolved === 'README.md') {
      return markdown ? `${base}index.md` : '/';
    }
    return `${sourceUrl}${resolved}${anchor ? `#${anchor}` : ''}`;
  };
  const rewriteLinks = (content: string, file: string, markdown: boolean) => {
    // Leave code fences intact; URLs in runnable examples are data, not navigation.
    return content
      .split(/(^```[^\n]*\n[\s\S]*?^```\s*$)/m)
      .map((part, i) =>
        i % 2
          ? part
          : part
              .replace(
                /(\]\()([^\s)]+)(\))/g,
                (_, open: string, href: string, close: string) =>
                  `${open}${link(href, file, markdown)}${close}`
              )
              .replace(
                /^(\[[^\]\n]+\]:\s*)(\S+)/gm,
                (_, prefix: string, href: string) => `${prefix}${link(href, file, markdown)}`
              )
      )
      .join('');
  };
  // Notes for GitHub readers (for example, "open the rendered page") are omitted on the site.
  const withoutGitHubOnly = (source: string) =>
    source.replace(
      /^<!-- github-only -->\r?\n[\s\S]*?^<!-- \/github-only -->\r?\n(?:\r?\n)?/gm,
      ''
    );
  const expandRecipes = async (source: string) => {
    for (const match of source.matchAll(/<!-- recipe:([a-z-]+) -->/g)) {
      const snippet = await read(`examples/recipes/${match[1]}.ts`);
      // A callback inserts literal source. Replacement strings interpret $&, $`,
      // and $' (the latter occurs naturally in anchored regular expressions).
      source = source.replace(match[0], () => `\`\`\`ts\n${snippet.trim()}\n\`\`\``);
    }
    return source;
  };
  await mkdir(resolve(generated, 'public'), { recursive: true });
  await writeChanged(
    resolve(generated, 'scenario-demo.ts'),
    '// Generated verbatim from the packed-consumer recipe.\n' +
      (await read('examples/recipes/scenario-demo.ts'))
  );
  const previous = await readFile(resolve(generated, 'site-manifest.json'), 'utf8').then(
    (text) => JSON.parse(text) as { pages: string[] },
    () => ({ pages: [] })
  );
  for (const route of previous.pages) {
    if (
      /^(guide|packages)\/[a-z0-9-]+\.md$/.test(route) &&
      ![...documents.values()].includes(route)
    ) {
      await rm(resolve(generated, route), { force: true });
      await rm(resolve(generated, 'public', route), { force: true });
    }
  }
  await cp(resolve(root, 'assets/brand'), resolve(generated, 'public/brand'), { recursive: true });
  await cp(resolve(root, 'assets/demo'), resolve(generated, 'public/demo'), { recursive: true });
  // Interactive components render on the website; the Markdown alternate links to that page.
  const interactive: Record<string, { component: string; link: string }> = {
    scenario: {
      component: '<ScenarioDemo />',
      link: `[Open the interactive demo](${base}guide/scenario-demo.html).`,
    },
    sandbox: {
      component: '<MimletSandbox />',
      link: `[Open the sandbox in your browser](${base}guide/try-it.html).`,
    },
  };
  for (const [file, route] of documents) {
    const source = await expandRecipes(withoutGitHubOnly(await read(file)));
    for (const markdown of [false, true]) {
      const destination = resolve(generated, markdown ? 'public' : '', route);
      await mkdir(dirname(destination), { recursive: true });
      await writeChanged(
        destination,
        rewriteLinks(source, file, markdown).replace(
          /<!-- interactive:([a-z-]+) -->/g,
          (_marker, name: string) => {
            const target = interactive[name];
            if (!target) {
              throw new Error(`${file}: unknown interactive component ${name}`);
            }
            return markdown ? target.link : target.component;
          }
        )
      );
    }
  }
  const hero = await read('examples/recipes/hero.ts');
  const quickstartRecipe = await read(`examples/recipes/${quickstart.recipe}.ts`);
  const renderer = await createMarkdownRenderer(root, { theme: codeTheme });
  const highlight = (code: string) => JSON.stringify(renderer.render(`\`\`\`ts\n${code}\n\`\`\``));
  await writeChanged(
    resolve(generated, 'hero.ts'),
    `// Generated from the packed-consumer recipes.\nexport const heroHtml = ${highlight(hero)};\nexport const quickstartHtml = ${highlight(quickstartRecipe)};\nexport const preparedVersion = ${JSON.stringify(version)};\n`
  );
  await writeChanged(
    resolve(generated, 'index.md'),
    `---\nlayout: page\nsidebar: false\ntitle: ${identity.name} — ${identity.tagline}\ndescription: ${identity.description}\n---\n\n<MimletHome />\n`
  );
  const overview =
    `# ${identity.name}\n\n${identity.tagline}\n\n${identity.description}\n\n${identity.introduction}\n\nStatus: published beta ${identity.releaseVersion}, available on npm’s latest tag.\n\n[Get started](${base}guide/getting-started.md) · [Choose an adapter](${base}guide/adapters.md) · [Try it in your browser](${base}guide/try-it.md)\n\n` +
    stories
      .map(
        (story) =>
          `## ${story.title}\n\n${story.description}\n\n[${story.action}](${base}${story.link.slice(1)}.md)\n`
      )
      .join('\n') +
    `\n## For coding agents\n\n` +
    agentBenefits.map(([title, description]) => `- ${title}: ${description}`).join('\n') +
    `\n\n[Agent guide](${base}guide/agents.md)\n\n## A working example\n\n\`\`\`ts\n${hero}\n\`\`\`\n` +
    `\n## ${demo.title}\n\n${demo.summary} ${demo.credit}\n\n[Watch the demo video (MP4, ${demo.duration})](${base}${demo.video}) · [Read the tested checkout example](${base}guide/checkout-example.md) · [Compare with plain fast-check](${base}guide/checkout-comparison.md)\n` +
    `\n## Quickstart with Zod\n\n\`\`\`sh\n${quickstart.install}\n\`\`\`\n\nSave this as \`fixture.mts\`:\n\n\`\`\`ts\n${quickstartRecipe}\`\`\`\n\nAdd \`console.log(input, user)\`, then run \`${quickstart.run}\` on Node 22.18 or newer. It prints \`${quickstart.output}\`.\n` +
    `\n## Status and feedback\n\n${alphaStatus}\n\n[Send beta feedback](${feedbackUrl}) · [Beta feedback kit](${base}guide/beta-feedback.md)\n`;
  await writeChanged(resolve(generated, 'public/index.md'), overview);
  const guides = [
    [
      'Getting started',
      'getting-started',
      'Install the beta and build an executable first fixture',
    ],
    [
      'Adapter selection',
      'adapters',
      'Native semantics, supported generation and factory escape hatches',
    ],
    [
      'Coding agents',
      'agents',
      'Task recipes, validation, replay, shrinking and deterministic code generation',
    ],
    ['Scenarios', 'correlated-scenarios', 'Shared identities and recomputed dependent values'],
    [
      'Class instances',
      'class-instances',
      'Entity builders that patch a record and build class instances; map()',
    ],
    ['Try it', 'try-it', 'Edit and run Mimlet examples in a local, in-browser sandbox'],
    ['Interactive demo', 'scenario-demo', 'Run, shrink and replay a coherent order scenario'],
    ['Checkout regression', 'checkout-example', 'Find, shrink, replay and fix a checkout bug'],
    ['Fixture comparison', 'checkout-comparison', 'Manual factories, native fast-check and Mimlet'],
    [
      'Zod and ArkType',
      'zod-and-arktype',
      'Dedicated native builders, codecs and factories, published since alpha.1',
    ],
    [
      'NestJS DTOs',
      'class-validator',
      'class-validator DTO payloads and the instances ValidationPipe produces',
    ],
    [
      'Replay',
      'sessions-and-replay',
      'Explicit seeds, compatibility identities and bounded sessions',
    ],
    [
      'Mock Service Worker',
      'mock-service-worker',
      'One fixture recipe for unit tests, MSW handlers and Storybook previews',
    ],
    [
      'Database seeding',
      'database-seeding',
      'Deterministic, idempotent seeds for integration tests and local development',
    ],
    ['Migration', 'mimlet-migration', 'New package names and preserved serialized formats'],
    ['Compatibility', 'compatibility', 'Tested versions and runtime boundaries'],
    ['Beta readiness', 'beta-readiness', 'Candidate evidence and proposed beta exit criteria'],
    [
      'Beta feedback',
      'beta-feedback',
      'Two runnable evaluation tasks and a short feedback template',
    ],
  ];
  await writeChanged(
    resolve(generated, 'public/llms.txt'),
    `# Mimlet\n\n> ${identity.description} A modular schema-aware test-data toolkit with a dependency-free core.\n\nPublished beta: ${identity.releaseVersion}, available on npm’s latest tag. Install @mimlet/core and only the adapters you need; see Getting started for matching versions. Generation is capability-specific; arbitrary validators may require a factory.\n\n## Guides\n\n` +
      guides
        .map(
          ([title, slug, description]) => `- [${title}](${base}guide/${slug}.md): ${description}`
        )
        .join('\n') +
      `\n\n## Packages\n\n` +
      packages
        .map(
          ({ name, directory }) =>
            `- [${name}](${base}packages/${directory}.md)${previewPackages.includes(name) ? ': Next-release source preview; not in the published train.' : ''}`
        )
        .join('\n') +
      `\n\n## Optional\n\n- [Mimlet skill](${sourceUrl}skills/mimlet/SKILL.md): Optional agent usage guide; install only when requested.\n`
  );
  await writeChanged(
    resolve(generated, 'site-manifest.json'),
    JSON.stringify(
      {
        pages: ['index.md', ...documents.values()],
        packages: packages.map((p) => p.name),
        version,
        sourceUrl,
      },
      null,
      2
    )
  );
  console.log(
    `Prepared ${documents.size + 1} pages, Markdown alternates and llms.txt from canonical sources.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await prepare();
  await buildSandboxRuntime();
}
