/** Execute the checked-in example against real, isolated package tarballs. */
import { execFileSync } from 'node:child_process';
import { cp, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';
import { withPackedConsumer } from './packed-consumer.mjs';
const fixture = fileURLToPath(new URL('../examples/', import.meta.url));
await withPackedConsumer(fixture, async ({ temporary, consumerCompiler, run }) => {
  await cp(new URL('../examples/shop.mjs', import.meta.url), `${temporary}/shop.mjs`);
  await cp(new URL('../examples/shop.test.mjs', import.meta.url), `${temporary}/shop.test.mjs`);
  await cp(new URL('../examples/recipes/', import.meta.url), `${temporary}/recipes`, {
    recursive: true,
  });
  await cp(
    new URL('../examples/recipes.test.mjs', import.meta.url),
    `${temporary}/recipes.test.mjs`
  );
  await writeFile(
    `${temporary}/tsconfig.json`,
    JSON.stringify({
      compilerOptions: {
        target: 'ES2022',
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        lib: ['ES2022', 'DOM'],
        types: ['node'],
        strict: true,
        noUncheckedIndexedAccess: true,
        rootDir: 'recipes',
        outDir: 'compiled',
        skipLibCheck: false,
      },
      include: ['recipes/*.ts'],
    })
  );
  run(consumerCompiler, ['-p', `${temporary}/tsconfig.json`]);
  // Recipes named *-test.ts are test files shown in the guides; run each one as written.
  const recipeTests = (await readdir(`${temporary}/compiled`))
    .filter((name) => name.endsWith('-test.js'))
    .sort()
    .map((name) => `compiled/${name}`);
  execFileSync(process.execPath, ['--test', 'shop.test.mjs', 'recipes.test.mjs', ...recipeTests], {
    cwd: temporary,
    stdio: 'inherit',
    timeout: 30_000,
  });
});
