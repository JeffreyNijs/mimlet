/**
 * Write each package's manifest version into its `src/version.ts`, for packages that declare
 * their version at runtime. `pnpm version-packages` runs this after `changeset version`;
 * `check-workspace.mjs` rejects a mismatch.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runtimeVersion, runtimeVersionPattern } from './check-workspace.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
for (const entry of await readdir(join(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const directory = join(root, 'packages', entry.name);
  const declared = await runtimeVersion(directory);
  if (declared === undefined) continue;
  const { version } = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
  if (declared === version) continue;
  const file = join(directory, 'src', 'version.ts');
  const source = await readFile(file, 'utf8');
  await writeFile(
    file,
    source.replace(runtimeVersionPattern, `export const packageVersion = '${version}';`)
  );
  console.log(`packages/${entry.name}/src/version.ts: ${declared} -> ${version}`);
}
