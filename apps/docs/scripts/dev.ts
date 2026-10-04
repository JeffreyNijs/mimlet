import { watch } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { clearTimeout, setTimeout } from 'node:timers';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepare, root } from './prepare.ts';
import { buildSandboxRuntime } from './sandbox-runtime.ts';

await prepare();
// Built once per dev session; restart after changing apps/docs/sandbox or a bundled package.
await buildSandboxRuntime();
const child = spawn(
  process.execPath,
  [
    fileURLToPath(new URL('../node_modules/vitepress/bin/vitepress.js', import.meta.url)),
    'dev',
    '.',
    '--host',
    '127.0.0.1',
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' }
);
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let pending = false;
async function rebuild(): Promise<void> {
  pending = true;
  if (running) {
    return;
  }
  running = true;
  try {
    while (pending) {
      pending = false;
      await prepare();
    }
  } catch (error) {
    console.error(error);
  } finally {
    running = false;
  }
}
const directories = [
  'docs',
  'examples/recipes',
  'assets/brand',
  ...(await readdir(resolve(root, 'packages'))).map((name) => `packages/${name}`),
];
const watchers = directories.map((directory) =>
  watch(resolve(root, directory), (_, file) => {
    if (!file || !/\.(md|ts|svg|png|json)$/.test(file)) {
      return;
    }
    clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 120);
  })
);
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => child.kill(signal));
}
child.once('exit', (code) => {
  clearTimeout(timer);
  for (const watcher of watchers) {
    watcher.close();
  }
  process.exitCode = code ?? 1;
});
