import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { it } from 'node:test';
import { URL } from 'node:url';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');
const workflow = await read('.github/workflows/runtime-compatibility.yml');
const job = (id) => {
  const match = new RegExp(`^ {2}${id}:\\n((?: {4}.*\\n|\\n)+)`, 'm').exec(workflow);
  assert(match, `runtime-compatibility.yml must define the ${id} job`);
  return match[1];
};
// The exact compiler a job installs outside the workspace, and the version its name claims.
const compilerJob = (id) => {
  const text = job(id);
  const installed = /--no-fund typescript@(\d+\.\d+\.\d+)$/m.exec(text)?.[1];
  const named = /^ {4}name: TypeScript (\d+\.\d+\.\d+) \//m.exec(text)?.[1];
  assert(installed, `${id} must install one exact TypeScript version`);
  assert.equal(named, installed, `${id} must be named after the compiler it installs`);
  return installed;
};

it('pins the minimum and newest consumer compilers and documents both', async () => {
  const minimum = compilerJob('minimum-compiler');
  const newest = compilerJob('newest-compiler');
  const workspace = JSON.parse(await read('package.json')).devDependencies.typescript;
  assert.match(workspace, /^6\.\d+\.\d+$/, 'the workspace builds with an exact TypeScript 6');
  assert.match(newest, /^7\./);
  const compatibility = await read('docs/compatibility.md');
  for (const version of [minimum, workspace, newest])
    assert(compatibility.includes(`**TypeScript ${version}**`), `document TypeScript ${version}`);
  // The newest job type-checks with its compiler only; the packages stay built by the workspace.
  assert.match(job('newest-compiler'), /export TOOLKIT_CONSUMER_TYPESCRIPT_COMPILER=/);
  assert.doesNotMatch(job('newest-compiler'), /TOOLKIT_TYPESCRIPT_COMPILER=/);
});

it('runs the Hey API side-by-side setup with the same TypeScript 7 release', async () => {
  const newest = compilerJob('newest-compiler');
  assert.match(job('newest-compiler'), /run: node scripts\/validate-package\.mjs --typescript-7$/m);
  const script = await read('scripts/validate-package.mjs');
  assert(script.includes(`'@typescript/native@npm:typescript@${newest}'`));
  const typescript6 = /'typescript@npm:@typescript\/typescript6@(\d+\.\d+\.\d+)'/.exec(script)?.[1];
  assert(typescript6, 'the side-by-side setup must pin @typescript/typescript6 exactly');
  const snippet = `"typescript": "npm:@typescript/typescript6@${typescript6}"`;
  const native = `"@typescript/native": "npm:typescript@${newest}"`;
  for (const path of ['docs/compatibility.md', 'packages/hey-api-builders/README.md']) {
    const text = await read(path);
    assert(text.includes(snippet) && text.includes(native), `${path} shows the tested aliases`);
  }
});
