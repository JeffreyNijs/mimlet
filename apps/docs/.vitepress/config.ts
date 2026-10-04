import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitepress';
import { base, codeTheme, hostname, identity } from '../content';

const repository = 'JeffreyNijs/mimlet';
const ref = process.env.DOCS_SOURCE_REF ?? 'main';
const inventory = JSON.parse(
  readFileSync(new URL('../.generated/site-manifest.json', import.meta.url), 'utf8')
) as { packages: string[] };

export default defineConfig({
  title: identity.name,
  titleTemplate: ':title · Mimlet',
  description: identity.description,
  lang: 'en',
  base,
  srcDir: '.generated',
  srcExclude: ['public/**'],
  cleanUrls: false,
  lastUpdated: false,
  // The public static site targets current evergreen browsers. The toolkit's
  // independent browser/runtime matrix retains its existing targets.
  vite: {
    build: { target: 'es2022' },
    esbuild: { target: 'es2022' },
    optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  },
  markdown: { theme: codeTheme },
  sitemap: { hostname: `${hostname}${base}` },
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}brand/favicon.svg` }],
    ['meta', { property: 'og:site_name', content: 'Mimlet' }],
    ['meta', { property: 'og:type', content: 'website' }],
    ['meta', { property: 'og:image', content: `${hostname}${base}brand/social.png` }],
    ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
    ['meta', { name: 'theme-color', content: '#faf7ee' }],
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'SoftwareSourceCode',
        name: identity.name,
        description: identity.description,
        codeRepository: `https://github.com/${repository}`,
        license: `https://github.com/${repository}/blob/${ref}/LICENSE`,
        programmingLanguage: 'TypeScript',
        url: `${hostname}${base}`,
      }),
    ],
  ],
  transformPageData(pageData) {
    if (pageData.relativePath.startsWith('guide/')) {
      pageData.filePath = `docs/${pageData.relativePath.slice(6)}`;
    } else if (pageData.relativePath.startsWith('packages/')) {
      pageData.filePath = pageData.relativePath.replace(/\.md$/, '/README.md');
    }
  },
  transformHead({ pageData }) {
    const route = pageData.relativePath.replace(/\.md$/, '.html').replace(/^index\.html$/, '');
    const title = pageData.frontmatter.title ?? pageData.title;
    return [
      ['link', { rel: 'canonical', href: `${hostname}${base}${route}` }],
      [
        'link',
        { rel: 'alternate', type: 'text/markdown', href: `${base}${pageData.relativePath}` },
      ],
      ['link', { rel: 'describedby', href: `${base}llms.txt` }],
      ['meta', { property: 'og:title', content: title }],
      [
        'meta',
        { property: 'og:description', content: pageData.description || identity.description },
      ],
      ['meta', { property: 'og:url', content: `${hostname}${base}${route}` }],
    ];
  },
  themeConfig: {
    logo: { light: '/brand/mark.svg', dark: '/brand/mark-dark.svg', alt: '' },
    siteTitle: 'mimlet',
    outline: [2, 3],
    search: { provider: 'local' },
    nav: [
      { text: 'Get started', link: '/guide/getting-started' },
      { text: 'The toolkit', link: '/guide/adapters' },
      { text: 'Try it', link: '/guide/try-it' },
      { text: 'For agents', link: '/guide/agents' },
    ],
    socialLinks: [{ icon: 'github', link: `https://github.com/${repository}` }],
    editLink: { pattern: `https://github.com/${repository}/edit/${ref}/:path` },
    sidebar: [
      {
        text: 'Start here',
        items: [
          { text: 'Getting started', link: '/guide/getting-started' },
          { text: 'Try it in your browser', link: '/guide/try-it' },
          { text: 'Interactive demo', link: '/guide/scenario-demo' },
          { text: 'Find a checkout bug', link: '/guide/checkout-example' },
          { text: 'Compare fixture approaches', link: '/guide/checkout-comparison' },
          { text: 'Choose an adapter', link: '/guide/adapters' },
          { text: 'Zod and ArkType', link: '/guide/zod-and-arktype' },
          { text: 'For coding agents', link: '/guide/agents' },
        ],
      },
      {
        text: 'Build your test world',
        items: [
          { text: 'Builders and schemas', link: '/guide/schema-independent-builders' },
          { text: 'Named setters', link: '/guide/fluent-builders' },
          { text: 'CLI diagnostics', link: '/guide/cli-diagnostics' },
          { text: 'Error codes', link: '/guide/error-codes' },
          { text: 'Correlated scenarios', link: '/guide/correlated-scenarios' },
          { text: 'Sessions and replay', link: '/guide/sessions-and-replay' },
          { text: 'Mock APIs with MSW', link: '/guide/mock-service-worker' },
          { text: 'Seed a database', link: '/guide/database-seeding' },
          { text: 'Fixture capture', link: '/guide/fixture-capture' },
          { text: 'Union variants', link: '/guide/union-variants' },
          { text: 'Generated builders', link: '/guide/generated-facades-and-paths' },
        ],
      },
      {
        text: 'Package reference',
        items: inventory.packages.map((name) => ({
          text: name,
          link: `/packages/${name.replace('@mimlet/', '')}`,
        })),
      },
      {
        text: 'Compatibility and releases',
        items: [
          { text: 'Supported versions', link: '/guide/compatibility' },
          { text: 'Stable release contract', link: '/guide/stability' },
          { text: 'Beta readiness', link: '/guide/beta-readiness' },
          { text: 'Beta feedback kit', link: '/guide/beta-feedback' },
          { text: 'Mimlet migration', link: '/guide/mimlet-migration' },
          { text: 'Hey API migration', link: '/guide/hey-api-migration' },
          { text: 'Roadmap', link: '/guide/product-roadmap' },
          { text: 'Releases', link: '/guide/releases' },
          { text: 'Website launch', link: '/guide/mimlet-launch' },
        ],
      },
    ],
    footer: {
      message: 'Mimlet · beta · MIT licensed',
      copyright: 'Made by Jeffrey Nijs',
    },
  },
});
