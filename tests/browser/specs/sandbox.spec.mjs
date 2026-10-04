/* global document */
import { test, expect } from '@playwright/test';

// Smoke test for the docs site's in-browser sandbox: the same frame host and runtime bundle,
// built from the workspace by apps/docs/scripts/sandbox-runtime.ts, in every engine.
test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4180/sandbox/');
  await expect(page.locator('body')).toHaveAttribute('data-ready', 'true');
});

test('the docs sandbox runs every example and reports validation paths', async ({ page }) => {
  const results = await page.evaluate(async () => {
    const summary = {};
    for (const preset of globalThis.sandboxPresets) {
      const result = await globalThis.runInSandbox(preset.source);
      summary[preset.id] = {
        status: result.status,
        logs: result.entries.map((entry) => entry.text),
        code: result.error?.code,
        paths: result.error?.issues?.map((issue) => issue.path),
      };
    }
    return summary;
  });
  expect(results.zod).toMatchObject({
    status: 'failed',
    code: 'VALIDATION_FAILED',
    paths: ['age'],
  });
  expect(results.zod.logs[0]).toMatch(/^\{ name: 'Ada', email: '[^']+', age: \d+ \}$/);
  expect(results.fluent).toMatchObject({ status: 'completed' });
  expect(results.fluent.logs[0]).toMatch(/^\{ name: 'Ada', role: 'reader', email: '[^']+' \}$/);
  expect(results.scenario).toMatchObject({ status: 'completed' });
  expect(results.scenario.logs[1]).toBe('5000 [ 3, 1 ]');
  expect(results.valibot).toMatchObject({
    status: 'failed',
    code: 'VALIDATION_FAILED',
    paths: ['address.postcode'],
  });
});

test('sandbox programs cannot reach the page or the network, and can be stopped', async ({
  page,
}) => {
  const isolation = await page.evaluate(() =>
    globalThis.runInSandbox(
      [
        'console.log(typeof document, typeof window, typeof localStorage, self.origin);',
        'try {',
        "  await fetch('http://127.0.0.1:4180/sandbox-probe');",
        "  console.log('network allowed');",
        '} catch (error) {',
        "  console.log('network blocked');",
        '}',
      ].join('\n')
    )
  );
  expect(isolation.status).toBe('completed');
  expect(isolation.entries.map((entry) => entry.text)).toEqual([
    'undefined undefined undefined null',
    'network blocked',
  ]);
  expect(await (await page.request.get('http://127.0.0.1:4180/sandbox-probe-count')).text()).toBe(
    '0'
  );

  const timed = await page.evaluate(async () => {
    const started = Date.now();
    const result = await globalThis.runInSandbox('while (true) {}', { timeLimitMs: 500 });
    return { status: result.status, elapsed: Date.now() - started };
  });
  expect(timed.status).toBe('timeout');
  expect(timed.elapsed).toBeLessThan(5_000);

  const stopped = await page.evaluate(() =>
    globalThis.runInSandbox("console.log('spinning'); for (;;) {}", { stopAfterMs: 3_000 })
  );
  expect(stopped).toMatchObject({ status: 'stopped', entries: [{ text: 'spinning' }] });
  await expect.poll(() => page.evaluate(() => document.querySelectorAll('iframe').length)).toBe(0);
});
