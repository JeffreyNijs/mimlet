import { createRequire } from 'node:module';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createClient } from '@hey-api/openapi-ts';
import * as ts from 'typescript';

import { defineConfig as defineBuildersConfig } from '../../packages/hey-api-builders/src/index';

type CommonJsModule = {
  exports: Record<string, unknown>;
};

export type GeneratedProject = {
  builders: Record<string, unknown>;
  buildersSource: string;
  dispose: () => Promise<void>;
  faker: Record<string, unknown>;
  generatedDirectory: string;
  generatedFiles: ReadonlyArray<string>;
  indexSource: string;
  zod: Record<string, unknown>;
};

export type BuildersConfig = NonNullable<Parameters<typeof defineBuildersConfig>[0]>;

const testDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceDirectory = resolve(testDirectory, '../..');
const fixturesDirectory = join(testDirectory, 'fixtures');

async function listFiles(directory: string, extension: string): Promise<Array<string>> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return listFiles(path, extension);
      }
      return path.endsWith(extension) ? [path] : [];
    })
  );
  return files.flat().sort();
}

function formatDiagnostics(diagnostics: ReadonlyArray<ts.Diagnostic>): string {
  return ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => workspaceDirectory,
    getNewLine: () => '\n',
  });
}

async function compileGeneratedProject(
  generatedDirectory: string,
  compiledDirectory: string
): Promise<ReadonlyArray<string>> {
  const sourceFiles = await listFiles(generatedDirectory, '.ts');
  if (!sourceFiles.length) {
    throw new Error(`Hey API did not generate TypeScript files in ${generatedDirectory}`);
  }

  const compilerOptions: ts.CompilerOptions = {
    paths: {
      '@mimlet/core': [join(workspaceDirectory, 'packages/core/dist/index.d.ts')],
    },
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    exactOptionalPropertyTypes: true,
    forceConsistentCasingInFileNames: true,
    ignoreDeprecations: '6.0',
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmitOnError: true,
    outDir: compiledDirectory,
    rootDir: generatedDirectory,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ES2022,
    verbatimModuleSyntax: false,
  };
  const program = ts.createProgram(sourceFiles, compilerOptions);
  if (program.getCompilerOptions().module !== ts.ModuleKind.CommonJS) {
    throw new Error('E2E runtime compilation must target CommonJS');
  }

  const diagnostics = ts
    .getPreEmitDiagnostics(program)
    .filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);

  if (diagnostics.length) {
    throw new Error(
      `Generated project failed TypeScript compilation:\n${formatDiagnostics(diagnostics)}`
    );
  }

  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    const result = ts.transpileModule(source, {
      compilerOptions,
      fileName: sourceFile,
      reportDiagnostics: true,
    });
    const transpileErrors = (result.diagnostics ?? []).filter(
      (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
    );
    if (transpileErrors.length) {
      throw new Error(
        `Generated module failed runtime compilation:\n${formatDiagnostics(transpileErrors)}`
      );
    }

    const outputFile = emittedFile(sourceFile, generatedDirectory, compiledDirectory);
    await mkdir(dirname(outputFile), { recursive: true });
    await writeFile(outputFile, result.outputText, 'utf8');
  }

  return sourceFiles;
}

function resolveCommonJsModule(fromFile: string, request: string): string {
  const requestedPath = resolve(dirname(fromFile), request);
  const extension = extname(requestedPath);
  const hasExecutableExtension = ['.cjs', '.js', '.json', '.node', '.ts'].includes(extension);
  const candidates = hasExecutableExtension
    ? [extension === '.ts' ? `${requestedPath.slice(0, -3)}.js` : requestedPath]
    : [`${requestedPath}.js`, join(requestedPath, 'index.js')];

  for (const candidate of candidates) {
    try {
      // The generated tree is small. A synchronous existence check keeps the
      // CommonJS-compatible require implementation synchronous as well.
      if (createRequire(import.meta.url).resolve(candidate)) {
        return candidate;
      }
    } catch {
      // Try the next candidate and report the original request below.
    }
  }

  throw new Error(`Unable to resolve generated import ${JSON.stringify(request)} from ${fromFile}`);
}

async function createGeneratedModuleLoader(): Promise<
  (entryFile: string) => Record<string, unknown>
> {
  const nativeRequire = createRequire(import.meta.url);
  const [fakerModule, zodModule, builderModule] = await Promise.all([
    import('@faker-js/faker'),
    import('zod'),
    import('../../packages/core/src/index.js'),
  ]);
  const externalModules = new Map<string, unknown>([
    ['@faker-js/faker', fakerModule],
    ['zod', zodModule],
    ['@mimlet/core', builderModule],
  ]);
  const cache = new Map<string, CommonJsModule>();

  const load = (entryFile: string): Record<string, unknown> => {
    const fileName = resolve(entryFile);
    const cached = cache.get(fileName);
    if (cached) {
      return cached.exports;
    }

    // CommonJS caches the module before evaluation so circular generated
    // imports observe a partially initialized module instead of recursing.
    const module: CommonJsModule = { exports: {} };
    cache.set(fileName, module);

    const localRequire = (request: string): unknown => {
      const external = externalModules.get(request);
      if (external) {
        return external;
      }
      if (request.startsWith('.')) {
        return load(resolveCommonJsModule(fileName, request));
      }
      return nativeRequire(request);
    };

    const source = nativeRequire('node:fs').readFileSync(fileName, 'utf8') as string;
    try {
      const evaluate = new Function(
        'exports',
        'require',
        'module',
        '__filename',
        '__dirname',
        `${source}\n//# sourceURL=${fileName}`
      );
      evaluate(module.exports, localRequire, module, fileName, dirname(fileName));
    } catch (error) {
      throw new Error(
        `Failed to execute compiled generated module ${fileName}:\n${source
          .split('\n')
          .slice(0, 12)
          .join('\n')}`,
        { cause: error }
      );
    }
    return module.exports;
  };

  return load;
}

async function findBuildersSource(sourceFiles: ReadonlyArray<string>): Promise<string> {
  for (const sourceFile of sourceFiles) {
    const source = await readFile(sourceFile, 'utf8');
    if (/export\s+(?:abstract\s+)?class\s+\w*Builder\b/.test(source)) {
      return sourceFile;
    }
  }

  const candidates = sourceFiles.filter((file) => /builders?(?:\.gen)?\.ts$/.test(file));
  const [candidate] = candidates;
  if (candidates.length === 1 && candidate) {
    return candidate;
  }

  throw new Error(
    `Could not identify the generated builders module. Generated: ${sourceFiles.join(', ')}`
  );
}

function emittedFile(
  sourceFile: string,
  generatedDirectory: string,
  compiledDirectory: string
): string {
  const relativeFile = relative(generatedDirectory, sourceFile);
  return join(compiledDirectory, relativeFile.replace(/\.ts$/, '.js'));
}

async function loadGeneratedModule(
  sourceFiles: ReadonlyArray<string>,
  generatedDirectory: string,
  compiledDirectory: string,
  load: (entryFile: string) => Record<string, unknown>,
  fileName: string
): Promise<Record<string, unknown>> {
  const sourceFile = sourceFiles.find((file) => basename(file) === fileName);
  if (!sourceFile) {
    throw new Error(
      `Could not identify generated module ${JSON.stringify(fileName)}. Generated: ${sourceFiles.join(', ')}`
    );
  }
  return load(emittedFile(sourceFile, generatedDirectory, compiledDirectory));
}

/**
 * Runs the public Hey API generator, compiles every generated TypeScript file,
 * and evaluates the emitted builder/faker/zod modules. Nothing is mocked.
 */
export async function generateProject(
  fixture: string,
  buildersConfig: BuildersConfig = {}
): Promise<GeneratedProject> {
  const cacheDirectory = join(workspaceDirectory, 'node_modules', '.cache');
  await mkdir(cacheDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(cacheDirectory, 'hey-api-builders-e2e-'));
  const generatedDirectory = join(temporaryDirectory, 'generated');
  const compiledDirectory = join(temporaryDirectory, 'compiled');

  const dispose = async (): Promise<void> => {
    // The path comes directly from mkdtemp with this suite's unique prefix.
    await rm(temporaryDirectory, { force: true, recursive: true });
  };

  try {
    await createClient({
      input: join(fixturesDirectory, fixture),
      logs: {
        file: false,
        level: 'silent',
      },
      output: generatedDirectory,
      plugins: [
        '@hey-api/typescript',
        {
          compatibilityVersion: 10,
          maxCallDepth: 3,
          name: '@faker-js/faker',
        },
        'zod',
        defineBuildersConfig(buildersConfig),
      ],
    });

    if (fixture === 'openapi-3.1.json' && Object.keys(buildersConfig).length === 0) {
      await writeFile(
        join(generatedDirectory, 'builders.acceptance.ts'),
        `
import { PetBuilder, AnimalBuilder } from './hey-api-builders.gen';
const pet = new PetBuilder().withDisplayName('Ada').with({ tags: [] }).withDisplayName2('snake');
pet.build({ includeOptional: true });
const asynchronous = pet.transformAsync(async (value) => value).withDisplayName('async');
asynchronous.buildAsync();
// @ts-expect-error Async fluent chains must not regain sync builds.
asynchronous.withDisplayName('bad').build();
// @ts-expect-error Generated methods retain their field types.
pet.withDisplayName(123);
pet.withNickname(null);
// @ts-expect-error Like with(), an exact optional key is omitted, never set to undefined.
pet.withNickname(undefined);
// @ts-expect-error The same rule as the named helper above.
pet.with({ nickname: undefined });
// @ts-expect-error A required key never accepts undefined.
pet.withDisplayName(undefined);
// @ts-expect-error Object union transitions require complete replacements.
new AnimalBuilder().with({ kind: 'cat' });
`
      );
    }
    const sourceFiles = await compileGeneratedProject(generatedDirectory, compiledDirectory);
    const buildersSourceFile = await findBuildersSource(sourceFiles);
    const load = await createGeneratedModuleLoader();
    const builders = load(emittedFile(buildersSourceFile, generatedDirectory, compiledDirectory));
    const faker = await loadGeneratedModule(
      sourceFiles,
      generatedDirectory,
      compiledDirectory,
      load,
      'faker.gen.ts'
    );
    const zod = await loadGeneratedModule(
      sourceFiles,
      generatedDirectory,
      compiledDirectory,
      load,
      'zod.gen.ts'
    );

    return {
      builders,
      buildersSource: await readFile(buildersSourceFile, 'utf8'),
      dispose,
      faker,
      generatedDirectory,
      generatedFiles: sourceFiles.map((file) => relative(generatedDirectory, file)),
      indexSource: await readFile(join(generatedDirectory, 'index.ts'), 'utf8'),
      zod,
    };
  } catch (error) {
    await dispose();
    throw error;
  }
}

export function getExport<T>(module: Record<string, unknown>, ...names: ReadonlyArray<string>): T {
  for (const name of names) {
    if (name in module) {
      return module[name] as T;
    }
  }
  throw new Error(
    `Expected one of [${names.join(', ')}]. Available exports: ${Object.keys(module).join(', ')}`
  );
}
