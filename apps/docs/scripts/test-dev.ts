/** Exercise the real development optimizer and canonical-source watcher, not just the static build. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const app = fileURLToPath(new URL('../', import.meta.url));
const socket = createServer();
await new Promise<void>((resolve) => socket.listen(0, '127.0.0.1', resolve));
const address = socket.address();
assert(address && typeof address !== 'string');
const port = address.port;
await new Promise<void>((resolve) => socket.close(() => resolve()));
const child = spawn(process.execPath, ['scripts/dev.ts', '--port', String(port), '--strictPort'], {
  cwd: app,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const stopped = new Promise<void>((resolve) => child.once('exit', () => resolve()));
let log = '';
child.stdout.on('data', (value: Buffer) => {
  log = (log + value.toString()).slice(-4000);
});
child.stderr.on('data', (value: Buffer) => {
  log = (log + value.toString()).slice(-4000);
});
const slug = `mimlet-watch-${randomUUID()}`;
const source = new URL(`../../../docs/${slug}.md`, import.meta.url);
const output = new URL(`../.generated/guide/${slug}.md`, import.meta.url);
const url = `http://127.0.0.1:${port}/mimlet/`;
let created = false;
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
async function until(check: () => Promise<boolean>): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) {
      throw new Error(`Development server stopped:\n${log}`);
    }
    if (await check()) {
      return;
    }
    await delay(250);
  }
  throw new Error(`Development watcher timed out:\n${log}`);
}
try {
  browser = await chromium.launch();
  await until(() =>
    globalThis.fetch(url).then(
      (response) => response.ok,
      () => false
    )
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await expect(page.getByRole('switch', { name: /Switch to/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Test data, with character.' })).toBeVisible();
  // The sandbox runtime is built before the dev server starts and served from public/.
  await page.goto(`${url}guide/try-it.html`);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.locator('.mimlet-sandbox').getByRole('status')).toHaveText(
    /^The program threw BuilderValidationError after \d+ ms\.$/,
    { timeout: 30_000 }
  );
  await writeFile(source, '# Mimlet watcher probe\n\nFirst value.\n', { flag: 'wx' });
  created = true;
  await until(() =>
    readFile(output, 'utf8').then(
      (value) => value.includes('First value.'),
      () => false
    )
  );
  await page.goto(`${url}guide/${slug}.html`);
  await expect(page.getByText('First value.', { exact: true })).toBeVisible();
  await writeFile(source, '# Mimlet watcher probe\n\nSecond value.\n');
  await expect(page.getByText('Second value.', { exact: true })).toBeVisible({ timeout: 15_000 });
  assert.deepEqual(errors, []);
  await rm(source);
  created = false;
  await until(() =>
    readFile(output).then(
      () => false,
      () => true
    )
  );
  console.log(
    'Development mode passed: hydrated page, sandbox run, source creation, live edits and deletion.'
  );
} finally {
  if (created) {
    await rm(source);
  }
  try {
    await browser?.close();
  } finally {
    child.kill('SIGTERM');
    await stopped;
  }
}
