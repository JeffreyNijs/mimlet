import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const output = (page: Page) => page.getByRole('region', { name: 'Output' });
const status = (page: Page) => page.locator('.mimlet-sandbox').getByRole('status');
const code = (page: Page) => page.getByRole('textbox', { name: 'Code' });

async function run(page: Page, finished: RegExp | string): Promise<void> {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(status(page)).toHaveText(finished, { timeout: 30_000 });
}

test('the sandbox loads only on its page, runs every example locally and shows validation paths', async ({
  page,
  request,
}) => {
  const requests: string[] = [];
  page.on('request', (req) => requests.push(req.url()));
  await page.goto('./');
  await expect(page.getByRole('link', { name: /Try it in your browser/ })).toHaveAttribute(
    'href',
    '/mimlet/guide/try-it.html'
  );
  expect(requests.filter((url) => /MimletSandbox|\/sandbox\/runtime-/.test(url))).toEqual([]);
  await page.getByRole('link', { name: /Try it in your browser/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Try Mimlet in your browser', level: 1 })
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Try it', exact: true }).first()).toHaveAttribute(
    'href',
    '/mimlet/guide/try-it.html'
  );
  await expect(code(page)).toHaveValue(/fromZod\(User\)/);
  expect(requests.filter((url) => url.includes('/sandbox/runtime-'))).toEqual([]);

  await run(page, /^The program threw BuilderValidationError after \d+ ms\.$/);
  expect(requests.filter((url) => url.includes('/sandbox/runtime-'))).toHaveLength(1);
  const log = output(page).getByRole('list', { name: 'Console output' }).getByRole('listitem');
  await expect(log).toHaveCount(1);
  await expect(log.first()).toHaveText(/^\{ name: 'Ada', email: '[^']+@[^']+', age: \d+ \}$/);
  const error = output(page).getByRole('group', { name: 'Error' });
  await expect(error).toContainText('BuilderValidationError · VALIDATION_FAILED · line 18');
  await expect(error).toContainText('Schema validation failed');
  await expect(error.getByRole('list', { name: 'Validation issues' })).toHaveText(
    'age: Too small: expected number to be >=18'
  );

  // The example invites an edit. Fix the age and run it again.
  await code(page).fill((await code(page).inputValue()).replace('age: 12', 'age: 42'));
  await run(page, /^Finished in \d+ ms\.$/);
  await expect(log).toHaveCount(2);
  await expect(log.nth(1)).toContainText('age: 42');
  await expect(error).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset example' }).click();
  await expect(code(page)).toHaveValue(/age: 12/);

  await page.getByLabel('Example').selectOption({ label: 'Named setters with fluent()' });
  await expect(log).toHaveCount(0);
  await run(page, /^Finished in \d+ ms\.$/);
  await expect(log.first()).toHaveText(/^\{ name: 'Ada', role: 'reader', email: '[^']+' \}$/);
  await expect(log.nth(2)).toContainText('VALIDATION_FAILED');

  await page
    .getByLabel('Example')
    .selectOption({ label: 'Connected scenario: customer, order, lines' });
  await run(page, /^Finished in \d+ ms\.$/);
  await expect(log.first()).toContainText(
    "order: { id: 'order-1', customerId: 'customer-1', totalCents: 3500 }"
  );
  await expect(log.nth(1)).toHaveText('5000 [ 3, 1 ]');

  await page.getByLabel('Example').selectOption({ label: 'Valibot adapter' });
  await run(page, /^The program threw BuilderValidationError/);
  await expect(log.first()).toContainText("status: 'DELIVERED'");
  await expect(error.getByRole('listitem')).toHaveText(/^address\.postcode: Invalid format/);

  // Each run fetched nothing new, and nothing left this origin.
  expect(requests.filter((url) => url.includes('/sandbox/runtime-'))).toHaveLength(1);
  const origin = new URL(page.url()).origin;
  expect(
    requests.filter((url) => !url.startsWith('blob:') && new URL(url).origin !== origin)
  ).toEqual([]);
  const markdown = await (await request.get('guide/try-it.md')).text();
  expect(markdown).toContain('[Open the sandbox in your browser](/mimlet/guide/try-it.html).');
  expect(markdown).not.toMatch(/<MimletSandbox|<!-- interactive:|github-only/);
  expect(await (await request.get('llms.txt')).text()).toContain(
    '[Try it](/mimlet/guide/try-it.md)'
  );
});

test('visitor code is isolated from the page, stops on request and within its time limit', async ({
  page,
  baseURL,
}) => {
  await page.goto('guide/try-it.html');
  await page.evaluate(() => globalThis.localStorage.setItem('mimlet-sandbox-probe', 'secret'));
  await code(page).fill(
    [
      'console.log(typeof document, typeof window, typeof localStorage, self.origin);',
      'try {',
      `  await fetch(${JSON.stringify(baseURL)});`,
      "  console.log('network allowed');",
      '} catch (error) {',
      "  console.log('network blocked', error.name);",
      '}',
    ].join('\n')
  );
  await run(page, /^Finished in \d+ ms\.$/);
  const log = output(page).getByRole('listitem');
  await expect(log).toHaveText(['undefined undefined undefined null', 'network blocked TypeError']);

  await code(page).fill("console.log('looping');\nwhile (true) {}");
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(log).toHaveText(['looping']);
  await expect(status(page)).toHaveText('Running.');
  // The loop runs in a worker, so the page stays responsive while it spins.
  expect(await page.evaluate(() => 1 + 1)).toBe(2);
  const stopped = Date.now();
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(status(page)).toHaveText('Stopped.');
  expect(Date.now() - stopped).toBeLessThan(2_000);
  await expect(page.locator('iframe')).toHaveCount(0);

  await page.getByLabel('Time limit').selectOption({ label: '2 seconds' });
  await code(page).focus();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Running.');
  await expect(status(page)).toHaveText('Stopped after the 2 second time limit.', {
    timeout: 10_000,
  });

  await code(page).fill('while (true) {}');
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Running.');
  await page.keyboard.press('Escape');
  await expect(status(page)).toHaveText('Stopped.');

  // Choosing another example ends a running program, and its result never arrives later.
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(status(page)).toHaveText('Running.');
  await page.getByLabel('Example').selectOption({ label: 'Valibot adapter' });
  await expect(status(page)).toHaveText('Example loaded. Run it when you are ready.');
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(status(page)).toHaveText('Example loaded. Run it when you are ready.');
  await page.getByLabel('Example').selectOption({ label: 'Zod: build and validate' });
  await expect(code(page)).toHaveValue('while (true) {}');

  await code(page).fill("const user: string = 'Ada';");
  await run(page, /^The program threw SyntaxError/);
  await expect(output(page).getByRole('group', { name: 'Error' })).toContainText(
    'If you pasted TypeScript, remove the type annotations'
  );
  await code(page).fill("import { readFile } from 'node:fs';");
  await run(page, /^The program threw SandboxError/);
  await expect(output(page).getByRole('group', { name: 'Error' })).toContainText(
    'The sandbox cannot import "node:fs"'
  );
  expect(await page.evaluate(() => globalThis.localStorage.getItem('mimlet-sandbox-probe'))).toBe(
    'secret'
  );
});

test('the sandbox works with keyboard input, a mobile layout and the dark theme', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.goto('guide/try-it.html');
  await page.getByLabel('Example').focus();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Time limit')).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Zod and ArkType guide' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(code(page)).toBeFocused();
  // Tab is not captured by the editor.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(status(page)).toHaveText(/^The program threw BuilderValidationError/, {
    timeout: 30_000,
  });
  await expect(page.getByRole('button', { name: 'Run', exact: true })).toBeFocused();
  expect(
    await page.evaluate(
      () => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth
    )
  ).toBe(true);
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(
    audit.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))
  ).toEqual([]);
  await page.screenshot({ path: 'test-results/sandbox-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
