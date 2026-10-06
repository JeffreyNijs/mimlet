/** Offline checks for maintained Markdown file links and the complete public package index. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function markdownFileLinks(markdown: string): string[] {
  // Code samples describe APIs or configuration; their strings are not navigation links.
  const prose = markdown.replace(/(^|\n)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2[ \t]*(?=\n|$)/g, '$1');
  return [...prose.matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)].map((match) => {
    const destination = (match[1] ?? '').trim();
    const angle = /^<([^>]+)>/.exec(destination);
    return angle?.[1] ?? destination.split(/\s+/)[0] ?? '';
  });
}

export async function checkFileLinks(root: string, files: readonly string[]): Promise<number> {
  const errors = [];
  let checked = 0;
  for (const file of files) {
    const markdown = await readFile(join(root, file), 'utf8');
    for (const href of markdownFileLinks(markdown)) {
      if (/^(?:https?:|mailto:|\/\/)/i.test(href) || href.startsWith('#')) {
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        errors.push(`${file}: unsupported link scheme`);
        continue;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(href.split(/[?#]/)[0] ?? '');
      } catch {
        errors.push(`${file}: malformed encoded file link`);
        continue;
      }
      if (!pathname) {
        continue;
      }
      const target = resolve(root, dirname(file), pathname);
      const inside = relative(root, target);
      if (
        isAbsolute(pathname) ||
        inside === '..' ||
        inside.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) ||
        isAbsolute(inside)
      ) {
        errors.push(`${file}: file link escapes the repository`);
        continue;
      }
      try {
        const info = await stat(target);
        if (!info.isFile() && !info.isDirectory()) {
          throw new Error('Not a file or directory');
        }
        checked++;
      } catch {
        errors.push(`${file}: missing local link ${pathname}`);
      }
    }
  }
  if (errors.length) {
    throw new Error(`Documentation links:\n${errors.join('\n')}`);
  }
  return checked;
}

export function checkPackageIndex(markdown: string, directories: readonly string[]): void {
  const links = new Set(markdownFileLinks(markdown));
  const missing = directories.filter((name) => !links.has(`packages/${name}/README.md`));
  if (missing.length) {
    throw new Error(`Documentation package index is missing: ${missing.join(', ')}`);
  }
}

export function checkWorkspacePackageCommands(
  markdown: string,
  directories: readonly string[]
): void {
  for (const fence of markdown.matchAll(/^```(?:sh|bash|shell)\n([\s\S]*?)^```/gm)) {
    for (const path of (fence[1] ?? '').matchAll(
      /(?:\.\/)?packages\/([a-z0-9][a-z0-9-]*)(?=[/\s'"`]|$)/g
    )) {
      if (!directories.includes(path[1] ?? '')) {
        throw new Error(`Documentation command refers to missing workspace package: ${path[1]}`);
      }
    }
  }
}

/**
 * The optional agent skill is read outside the website, from a source checkout or an install.
 * It must not name a current release other than the workspace's own: after a version bump,
 * a stale "current" version would be published with the release.
 */
export function checkSkillVersion(markdown: string, version: string): void {
  const named = [
    ...[
      ...markdown.matchAll(/@mimlet\/[a-z*-]+@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)/g),
    ].map((match) => match[1] ?? ''),
    ...[
      ...markdown.matchAll(/\bcurrent\b[^.\n]*?\b(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]*[0-9A-Za-z])?)/gi),
    ].map((match) => match[1] ?? ''),
  ];
  const stale = [...new Set(named.filter((found) => found !== version))];
  if (stale.length) {
    throw new Error(
      `skills/mimlet/SKILL.md names ${stale.join(', ')} as a current version, but the workspace is ${version}. Refer to the installed version instead, or update the skill with the release.`
    );
  }
}

export async function checkDocumentation(
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
) {
  const packages = (await readdir(join(root, 'packages'), { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const files = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'skills/mimlet/SKILL.md'];
  for (const folder of ['docs', '.changeset']) {
    for (const name of await readdir(join(root, folder))) {
      if (name.endsWith('.md')) {
        files.push(`${folder}/${name}`);
      }
    }
  }
  for (const name of packages) {
    files.push(`packages/${name}/README.md`);
  }
  checkPackageIndex(await readFile(join(root, 'README.md'), 'utf8'), packages);
  const core = JSON.parse(await readFile(join(root, 'packages/core/package.json'), 'utf8')) as {
    version: string;
  };
  checkSkillVersion(await readFile(join(root, 'skills/mimlet/SKILL.md'), 'utf8'), core.version);
  for (const file of files) {
    checkWorkspacePackageCommands(await readFile(join(root, file), 'utf8'), packages);
  }
  const links = await checkFileLinks(root, files);
  return { documents: files.length, packages: packages.length, links };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkDocumentation();
  console.log(
    `Documentation verified: ${result.documents} documents, ${result.packages} packages, ${result.links} local links (anchors and external URLs not inspected).`
  );
}
