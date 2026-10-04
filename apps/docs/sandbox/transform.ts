/**
 * Turns a small ES module program into the body of an async function.
 *
 * This is deliberately not a JavaScript parser. It rewrites the import declarations at the
 * top of the program into reads from an allowlisted module table, removes `export` keywords
 * so exported values can be shown, and keeps every line on its original line number so
 * runtime errors can point at the visitor's code. Everything else is left to the engine.
 */
import { LIMITS, SANDBOX_MODULES } from './protocol.ts';

/** A problem in the program text or its imports, found before any of it runs. */
export class SandboxSourceError extends Error {
  constructor(
    message: string,
    readonly line?: number
  ) {
    super(message);
    // Shown to visitors next to the message, so keep it short.
    this.name = 'SandboxError';
  }
}

export interface ImportBinding {
  readonly module: string;
  /** Named imports as `[exported, local]` pairs. */
  readonly named: readonly (readonly [string, string])[];
  readonly defaultName?: string;
  readonly namespace?: string;
  readonly line: number;
}
export interface PreparedProgram {
  /** Async function body. Line N of the body is line N of the source. */
  readonly body: string;
  readonly imports: readonly ImportBinding[];
  /** Exported names in source order. `default` is used for `export default`. */
  readonly exports: readonly string[];
}

/** The parameter through which the program reads its imports. */
export const MODULES_PARAMETER = '__mimletSandboxModules';
const DEFAULT_EXPORT = '__mimletSandboxDefault';
const identifier = /^[A-Za-z_$][\w$]*$/;
const allowed = SANDBOX_MODULES.join(', ');

function lineAt(source: string, index: number): number {
  let line = 1;
  for (let position = 0; position < index; position++) {
    if (source.charCodeAt(position) === 10) {
      line++;
    }
  }
  return line;
}

/** Skips whitespace and comments, returning the index of the next code character. */
function skipTrivia(source: string, index: number): number {
  for (;;) {
    const rest = source.slice(index);
    const space = /^\s+/.exec(rest);
    if (space) {
      index += space[0].length;
      continue;
    }
    if (rest.startsWith('//')) {
      const end = source.indexOf('\n', index);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (rest.startsWith('/*')) {
      const end = source.indexOf('*/', index + 2);
      if (end === -1) {
        throw new SandboxSourceError('This comment is never closed.', lineAt(source, index));
      }
      index = end + 2;
      continue;
    }
    return index;
  }
}

function parseSpecifiers(list: string, line: number): [string, string][] {
  const named: [string, string][] = [];
  for (const part of list.split(',')) {
    const specifier = part.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '').trim();
    if (!specifier || /^type\s/.test(specifier)) {
      continue;
    }
    const match = /^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/.exec(specifier);
    if (!match) {
      throw new SandboxSourceError(`This import is not supported: ${specifier}`, line);
    }
    const [, name = '', local = name] = match;
    named.push([name, local]);
  }
  return named;
}

const importPattern =
  /import(?:\s+(type)(?=[\s{]))?\s*(?:([A-Za-z_$][\w$]*)\s*(?:,\s*)?)?(?:\*\s*as\s+([A-Za-z_$][\w$]*)\s*|\{([^}]*)\}\s*)?from\s*(['"])([^'"\n]*)\5[ \t]*;?|import\s*(['"])([^'"\n]*)\7[ \t]*;?/y;

function bindingCode(binding: ImportBinding, index: number): string {
  const source = `${MODULES_PARAMETER}[${index}]`;
  const statements: string[] = [];
  if (binding.defaultName) {
    statements.push(`const ${binding.defaultName} = ${source}.default;`);
  }
  if (binding.namespace) {
    statements.push(`const ${binding.namespace} = ${source};`);
  }
  if (binding.named.length) {
    const fields = binding.named.map(([name, local]) =>
      name === local ? name : `${name}: ${local}`
    );
    statements.push(`const { ${fields.join(', ')} } = ${source};`);
  }
  return statements.join(' ');
}

function rewriteExports(body: string, offsetLine: number, exports: string[]): string {
  const lines = body.split('\n');
  return lines
    .map((text, index) => {
      const line = offsetLine + index;
      const match = /^(\s*)export\b(\s*)(.*)$/.exec(text);
      if (!match) {
        if (/^\s*import\s*(?:[\w${*]|['"])/.test(text)) {
          throw new SandboxSourceError(
            'Put imports at the top of the program, before any other code.',
            line
          );
        }
        return text;
      }
      const [, indent = '', , rest = ''] = match;
      const declaration = /^(const|let|var)\s+([^\s=;:,]+)/.exec(rest);
      if (declaration) {
        const name = declaration[2] ?? '';
        if (!identifier.test(name)) {
          throw new SandboxSourceError(
            'Export each value under its own name, for example `export const user = ...`.',
            line
          );
        }
        exports.push(name);
        return `${indent}${rest}`;
      }
      const named =
        /^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)/.exec(rest);
      if (named) {
        exports.push(named[1] ?? named[2] ?? '');
        return `${indent}${rest}`;
      }
      const fallback = /^default\s+(.*)$/.exec(rest);
      if (fallback) {
        exports.push('default');
        return `${indent}const ${DEFAULT_EXPORT} = ${fallback[1]}`;
      }
      const list = /^\{([^}]*)\}\s*;?\s*$/.exec(rest);
      if (list) {
        for (const [local, name] of parseSpecifiers(list[1] ?? '', line)) {
          exports.push(name === local ? local : `${name}=${local}`);
        }
        return indent;
      }
      throw new SandboxSourceError(
        'This export is not supported here. Use `export const name = ...`, or log the value with console.log().',
        line
      );
    })
    .join('\n');
}

/** Prepares visitor source for `executeProgram`. Throws `SandboxSourceError`. */
export function prepareProgram(source: string): PreparedProgram {
  if (source.length > LIMITS.sourceCharacters) {
    throw new SandboxSourceError(
      `The program is longer than ${LIMITS.sourceCharacters.toLocaleString('en-US')} characters.`
    );
  }
  source = source.replace(/\r\n?/g, '\n');
  const imports: ImportBinding[] = [];
  const header: string[] = [];
  let index = 0;
  let copied = 0;
  for (;;) {
    index = skipTrivia(source, index);
    if (!/^import\s*(?:[\w${*]|['"])/.test(source.slice(index, index + 12))) {
      break;
    }
    const line = lineAt(source, index);
    importPattern.lastIndex = index;
    const match = importPattern.exec(source);
    if (!match) {
      throw new SandboxSourceError(
        'This import is not supported. Use `import { name } from "module"`, `import * as name from "module"` or a default import.',
        line
      );
    }
    const statement = match[0];
    header.push(source.slice(copied, index));
    const lines = statement.split('\n').length - 1;
    const module = match[6] ?? match[8] ?? '';
    const typeOnly = match[1] === 'type';
    if (!typeOnly && !(SANDBOX_MODULES as readonly string[]).includes(module)) {
      throw new SandboxSourceError(
        `The sandbox cannot import "${module.slice(0, 200)}". It can import ${allowed}.`,
        line
      );
    }
    if (!typeOnly) {
      const binding: ImportBinding = {
        module,
        named: match[4] !== undefined ? parseSpecifiers(match[4], line) : [],
        ...(match[2] ? { defaultName: match[2] } : {}),
        ...(match[3] ? { namespace: match[3] } : {}),
        line,
      };
      header.push(bindingCode(binding, imports.length));
      imports.push(binding);
    }
    header.push('\n'.repeat(lines));
    index += statement.length;
    copied = index;
  }
  const exports: string[] = [];
  const startLine = lineAt(source, copied);
  const body = rewriteExports(source.slice(copied), startLine, exports);
  const returned = exports.map((name) => {
    if (name === 'default') {
      return `"default": ${DEFAULT_EXPORT}`;
    }
    const [exported, local] = name.includes('=') ? name.split('=') : [name, name];
    return `${JSON.stringify(exported)}: ${local}`;
  });
  return {
    body: `"use strict";${header.join('')}${body}\n;return { ${returned.join(', ')} };`,
    imports,
    exports: exports.map((name) => name.split('=')[0] ?? name),
  };
}
