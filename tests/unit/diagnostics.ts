import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as ts from 'typescript';

/** Each workspace package by its name, mapped to its TypeScript sources. */
const packages = new URL('../../packages/', import.meta.url);
const paths = Object.fromEntries(
  readdirSync(packages).map((directory) => {
    const manifest = JSON.parse(
      readFileSync(new URL(`${directory}/package.json`, packages), 'utf8')
    ) as { name: string };
    return [manifest.name, [fileURLToPath(new URL(`${directory}/src/index.ts`, packages))]];
  })
);

export interface Diagnostic {
  /** The 1-based line of `source` that the message is reported on. */
  line: number;
  message: string;
}

/**
 * The compiler's messages for `source`, compiled as a test file of the repository with the
 * sources of the workspace packages (`import { fluent } from '@mimlet/core'` works), so a test
 * can assert the exact text a user sees. Compiling takes seconds: give tests a generous timeout.
 */
export function diagnose(source: string): Diagnostic[] {
  // The compiler names files with forward slashes on every platform, also on Windows.
  const file = fileURLToPath(new URL('./diagnostics.virtual.ts', import.meta.url)).replaceAll(
    '\\',
    '/'
  );
  const isFile = (name: string) => name.replaceAll('\\', '/') === file;
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    exactOptionalPropertyTypes: true,
    allowImportingTsExtensions: true,
    noEmit: true,
    skipLibCheck: true,
    types: [],
    paths,
  };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (name) => isFile(name) || fileExists(name);
  host.getSourceFile = (name, language, ...rest) =>
    isFile(name)
      ? ts.createSourceFile(name, source, language)
      : getSourceFile(name, language, ...rest);
  const program = ts.createProgram([file], options, host);
  const sourceFile = program.getSourceFile(file);
  return ts.getPreEmitDiagnostics(program, sourceFile).map((diagnostic) => ({
    line:
      diagnostic.file && diagnostic.start !== undefined
        ? diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start).line + 1
        : 0,
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
  }));
}
