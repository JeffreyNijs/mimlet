/** Install freshly packed workspace packages into local projects, so fixes are tried before a release. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWorkspace } from './check-workspace.mjs';

const START = '# mimlet local trial: start';
const END = '# mimlet local trial: end';
const KEEP = 3;

export function localTrialOptions(args) {
  const restore = args.includes('--restore');
  const projects = args.filter((arg) => arg !== '--restore');
  if (
    projects.some((arg) => arg.startsWith('-')) ||
    args.filter((arg) => arg === '--restore').length > 1
  )
    throw new Error('Usage: node scripts/local-trial.mjs [--restore] [<project>...]');
  if (restore && projects.length === 0) throw new Error('--restore needs at least one project');
  return { restore, projects: projects.map((project) => resolve(project)) };
}

/** Removes the marked override block from a pnpm-workspace.yaml text. */
export function stripOverrides(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((line) => line.trim() === START);
  if (start === -1) return text;
  const end = lines.findIndex((line, index) => index > start && line.trim() === END);
  if (end === -1) throw new Error(`pnpm-workspace.yaml has "${START}" without "${END}"`);
  lines.splice(start, end - start + 1);
  return lines.join('\n');
}

/** Points every package name at its tarball through pnpm overrides, inside a marked block. */
export function applyOverrides(text, tarballs) {
  const base = stripOverrides(text);
  const entries = Object.entries(tarballs).map(
    ([name, path]) => `  ${JSON.stringify(name)}: ${JSON.stringify(`file:${path}`)}`
  );
  const key = base.match(/^(?:overrides|"overrides"|'overrides'):(.*)$/m);
  if (key && key[1].trim() !== '')
    throw new Error(
      'pnpm-workspace.yaml has an inline overrides value; turn it into a block first'
    );
  if (key) {
    const at = base.indexOf('\n', key.index) + 1 || base.length;
    return `${base.slice(0, at)}  ${START}\n${entries.join('\n')}\n  ${END}\n${base.slice(at)}`;
  }
  const separator = base === '' || base.endsWith('\n') ? '' : '\n';
  return `${base}${separator}${START}\noverrides:\n${entries.join('\n')}\n${END}\n`;
}

const run = (file, args, cwd, options = {}) =>
  execFileSync(file, args, { cwd, stdio: 'inherit', ...options });
const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const tracked = (cwd, file) => {
  try {
    git(cwd, ['ls-files', '--error-unmatch', file]);
    return true;
  } catch {
    return false;
  }
};

function manager(project) {
  if (!existsSync(join(project, 'package.json'))) throw new Error(`${project} has no package.json`);
  if (existsSync(join(project, 'pnpm-lock.yaml'))) return 'pnpm';
  if (existsSync(join(project, 'package-lock.json'))) return 'npm';
  throw new Error(
    `${project} has no pnpm-lock.yaml or package-lock.json; only pnpm and npm are supported`
  );
}

async function pack(root) {
  const commit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  const dirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim() !== '';
  // Turbo writes a root AGENTS.md on some runs; remove it so a later release:prepare sees a clean tree.
  const agents = join(root, 'AGENTS.md');
  const hadAgents = existsSync(agents);
  run('pnpm', ['build'], root);
  if (!hadAgents && existsSync(agents)) await unlink(agents);
  const workspace = await readWorkspace(root);
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}-${commit}${dirty ? '-dirty' : ''}`;
  const parent = join(root, '.local-trial');
  const output = join(parent, stamp);
  await mkdir(output, { recursive: true });
  // The npm of the active Node, as release:prepare uses, so the archives match a release's.
  const npmCli = [
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
  ].find(existsSync);
  if (!npmCli) throw new Error('Cannot locate npm for the active Node installation');
  const packed = JSON.parse(
    execFileSync(
      process.execPath,
      [
        npmCli,
        'pack',
        ...workspace.packages.map(({ directory }) => directory),
        '--ignore-scripts',
        '--json',
        '--pack-destination',
        output,
      ],
      {
        cwd: root,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
        maxBuffer: 64 * 1024 * 1024,
      }
    )
  );
  const tarballs = Object.fromEntries(
    packed.map((item) => [item.name, join(output, item.filename)])
  );
  const older = (await readdir(parent))
    .filter((entry) => entry !== stamp)
    .sort()
    .reverse();
  for (const entry of older.slice(KEEP - 1))
    await rm(join(parent, entry), { recursive: true, force: true });
  console.log(
    `Packed ${packed.length} packages from ${commit}${dirty ? ' with uncommitted changes' : ''} into ${output}`
  );
  return tarballs;
}

async function usePnpm(project, tarballs) {
  const file = join(project, 'pnpm-workspace.yaml');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (
    !text.includes(START) &&
    tracked(project, 'pnpm-lock.yaml') &&
    git(project, ['status', '--porcelain', '--', 'pnpm-lock.yaml'])
  )
    throw new Error(
      `${project}: commit or discard the pnpm-lock.yaml changes first; --restore resets it to the last commit`
    );
  await writeFile(file, applyOverrides(text, tarballs));
  run('pnpm', ['install', '--no-frozen-lockfile'], project);
}

async function restorePnpm(project) {
  const file = join(project, 'pnpm-workspace.yaml');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  if (!text.includes(START)) throw new Error(`${project} has no local trial to restore`);
  const rest = stripOverrides(text);
  if (rest.trim() === '' && !tracked(project, 'pnpm-workspace.yaml')) await unlink(file);
  else await writeFile(file, rest);
  if (!tracked(project, 'pnpm-lock.yaml')) {
    run('pnpm', ['install', '--no-frozen-lockfile'], project);
    return;
  }
  git(project, ['checkout', '--', 'pnpm-lock.yaml']);
  run('pnpm', ['install', '--frozen-lockfile'], project);
}

function useNpm(project, tarballs) {
  // --no-save leaves package.json and package-lock.json alone; `npm ci` restores the locked tree.
  const installed = Object.keys(tarballs).filter((name) =>
    existsSync(join(project, 'node_modules', name))
  );
  if (installed.length === 0)
    throw new Error(`${project} has none of the packages installed; run npm ci first`);
  run(
    'npm',
    ['install', '--no-save', '--no-audit', '--no-fund', ...installed.map((name) => tarballs[name])],
    project
  );
}

export async function localTrial(root, { restore, projects }) {
  if (restore) {
    for (const project of projects) {
      if (manager(project) === 'pnpm') await restorePnpm(project);
      else run('npm', ['ci', '--no-audit', '--no-fund'], project);
      console.log(`Restored ${project} to its locked dependencies`);
    }
    return;
  }
  const kinds = projects.map(manager);
  const tarballs = await pack(root);
  for (const [index, project] of projects.entries()) {
    if (kinds[index] === 'pnpm') await usePnpm(project, tarballs);
    else useNpm(project, tarballs);
    console.log(
      `Installed the local packages into ${project}; undo with: pnpm trial:local --restore ${project}`
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await localTrial(
    resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    localTrialOptions(process.argv.slice(2))
  );
