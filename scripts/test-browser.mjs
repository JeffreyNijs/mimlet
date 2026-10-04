/** Browser acceptance runs against installed npm tarballs, not source aliases. */
import { cp, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
import { browserOptions } from './browser-options.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const options = browserOptions(process.argv.slice(2));
const fixture = join(root, 'tests/browser');
await withPackedConsumer(fixture, async ({ temporary }) => {
  for (const file of await readdir(fixture)) {
    if (
      [
        'node_modules',
        'package.json',
        'package-lock.json',
        'playwright-report',
        'test-results',
      ].includes(file)
    )
      continue;
    await cp(join(fixture, file), join(temporary, file), { recursive: true });
  }
  // The docs sandbox is not a package: smoke-test the exact bundles the website ships,
  // built from the workspace packages the same way `pnpm docs:build` builds them.
  execFileSync('pnpm', ['--dir', 'apps/docs', 'docs:runtime'], {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    timeout: 300_000,
  });
  execFileSync(
    process.execPath,
    [join(root, 'apps/docs/scripts/sandbox-runtime.ts'), '--out', join(temporary, 'sandbox')],
    { cwd: root, stdio: 'inherit', timeout: 300_000 }
  );
  const cli = join(temporary, 'node_modules/@playwright/test/cli.js');
  try {
    if (options.install) {
      execFileSync(
        process.execPath,
        [cli, 'install', '--with-deps', 'chromium', 'firefox', 'webkit'],
        {
          cwd: temporary,
          stdio: 'inherit',
          timeout: 600_000,
        }
      );
    }
    execFileSync(
      process.execPath,
      [
        cli,
        'test',
        ...(options.list ? ['--list'] : []),
        ...(options.project ? ['--project', options.project] : []),
        '--repeat-each',
        String(options.repeat),
      ],
      {
        cwd: temporary,
        stdio: 'inherit',
        timeout: 900_000,
      }
    );
  } finally {
    const result = join(root, 'test-results/browser');
    await mkdir(result, { recursive: true });
    for (const folder of ['playwright-report', 'test-results']) {
      if (existsSync(join(temporary, folder))) {
        await cp(join(temporary, folder), join(result, folder), { recursive: true });
      }
    }
  }
});
