#!/usr/bin/env node
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { URL } from 'node:url';
import type { BuilderTarget, JsonBuilderTarget } from './index.js';
import type { OpenApiBuilderTarget, OpenApiSchemas } from './openapi.js';
import type { JsonSchema, SchemaDialect } from '@mimlet/json-schema';
import type { DiagnosticReport } from './diagnostics.js';

class UsageError extends Error {
  readonly code = 'CLI_USAGE_ERROR';
}
const help = `mimlet --config builders.json --out generated [--check] [--self-contained] [--select A,B]
mimlet doctor [--project directory] [--json]
mimlet inspect --schema schema.json [--references refs.json] [--dialect draft-07|draft-2019-09|draft-2020-12] [--json]
mimlet --version
JSON generation config: { "builders": [...module targets], "schemas": [...JSON schema targets],
  "openapi": { "document": "openapi.json", "schemas": "all" | ["Name" | { "schema": "Name", "name"?, "direction"? }, ...],
    "direction"?: "request" | "response", "closedObjects"?: true } }.
OpenAPI document paths are relative to the configuration file.
Application modules are not executed by code generation, doctor or JSON inspection.`;

function flagsFor(
  args: string[],
  values: readonly string[],
  booleans: readonly string[]
): Map<string, string | boolean> {
  const flags = new Map<string, string | boolean>();
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (!flag || ![...values, ...booleans].includes(flag) || flags.has(flag)) {
      throw new UsageError('Unknown or duplicate CLI flag; use mimlet --help');
    }
    if (booleans.includes(flag)) {
      flags.set(flag, true);
    } else {
      const value = args[++index];
      if (!value || value.startsWith('--')) {
        throw new UsageError(`Missing value for ${flag}`);
      }
      flags.set(flag, value);
    }
  }
  return flags;
}
async function readJson(file: string, label: string, megabytes = 2): Promise<unknown> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > megabytes * 1_000_000) {
      throw new Error('size');
    }
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch {
    throw new UsageError(`The ${label} must be a readable JSON file of at most ${megabytes} MB`);
  }
}
type OpenApiConfiguration = OpenApiSchemas & { readonly document: string };
/** Read each configured OpenAPI document and project its component schemas. */
async function openApiTargets(
  configuration: string,
  value: unknown
): Promise<Array<{ readonly document: string; readonly targets: OpenApiBuilderTarget[] }>> {
  if (value === undefined) {
    return [];
  }
  const sources = (Array.isArray(value) ? value : [value]) as unknown[];
  if (sources.length === 0 || sources.length > 100) {
    throw new UsageError('openapi must be one source or a list of at most 100 sources');
  }
  const { openApiBuilderTargets } = await import('./openapi.js');
  const result = [];
  for (const source of sources) {
    if (
      !source ||
      typeof source !== 'object' ||
      Array.isArray(source) ||
      typeof (source as OpenApiConfiguration).document !== 'string' ||
      !(source as OpenApiConfiguration).document
    ) {
      throw new UsageError('Each openapi source needs a "document" path and "schemas"');
    }
    const { document, ...selection } = source as OpenApiConfiguration;
    const parsed = await readJson(
      resolve(dirname(resolve(configuration)), document),
      `OpenAPI document ${JSON.stringify(document)}`,
      16
    );
    try {
      result.push({ document, targets: openApiBuilderTargets(parsed, selection) });
    } catch (error) {
      throw new UsageError(
        `OpenAPI document ${JSON.stringify(document)}: ${error instanceof Error ? error.message : 'invalid input'}`
      );
    }
  }
  return result;
}
function printReport(report: DiagnosticReport, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `Mimlet ${report.command}: ${report.ok ? (report.diagnostics.length ? 'warnings' : report.command === 'inspect' ? 'prepared' : 'checked') : 'needs attention'}`
    );
    for (const entry of report.diagnostics) {
      console.log(
        `${entry.severity.toUpperCase()} ${entry.code}${entry.package ? ` (${entry.package}${entry.dependency ? ` -> ${entry.dependency}` : ''})` : ''}: ${JSON.stringify(entry.message)}`
      );
      console.log(`  ${entry.hint}`);
      if (entry.expected) {
        // An untested peer is still supported, so its range is what was tested, not a requirement.
        const label = entry.code === 'PEER_VERSION_UNTESTED' ? 'Tested' : 'Expected';
        console.log(
          `  ${label}: ${JSON.stringify(entry.expected)}; installed: ${JSON.stringify(entry.actual ?? 'missing')}`
        );
      }
    }
  }
  process.exitCode = report.ok ? 0 : 1;
}
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(help);
    return;
  }
  if (args.length === 1 && args[0] === '--version') {
    const metadata = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as { version: string };
    console.log(metadata.version);
    return;
  }
  if (args[0] === 'doctor') {
    const flags = flagsFor(args.slice(1), ['--project'], ['--json']);
    const { diagnoseProject } = await import('./doctor.js');
    const directory = flags.get('--project');
    const report = await diagnoseProject(typeof directory === 'string' ? directory : process.cwd());
    printReport(report, flags.has('--json'));
    if (!flags.has('--json')) {
      for (const pkg of report.packages) {
        console.log(`  ${pkg.name}@${pkg.version}`);
      }
    }
    return;
  }
  if (args[0] === 'inspect') {
    const flags = flagsFor(args.slice(1), ['--schema', '--references', '--dialect'], ['--json']);
    const path = flags.get('--schema');
    if (typeof path !== 'string') {
      throw new UsageError('--schema is required');
    }
    const dialect = flags.get('--dialect');
    if (
      dialect !== undefined &&
      !['draft-07', 'draft-2019-09', 'draft-2020-12'].includes(String(dialect))
    ) {
      throw new UsageError('Unsupported dialect; use draft-07, draft-2019-09 or draft-2020-12');
    }
    const references = flags.get('--references');
    const { inspectSchema } = await import('./inspect.js');
    const report = inspectSchema((await readJson(path, 'schema')) as JsonSchema, {
      ...(typeof dialect === 'string' ? { dialect: dialect as SchemaDialect } : {}),
      ...(typeof references === 'string'
        ? { references: (await readJson(references, 'references')) as Record<string, JsonSchema> }
        : {}),
    });
    printReport(report, flags.has('--json'));
    if (report.ok && !flags.has('--json')) {
      console.log(
        `  ${report.dialect}: bounded JSON generation and validation. No fixtures were generated.`
      );
    }
    return;
  }
  if (args[0] === 'generate') {
    args.shift();
  }
  const flags = flagsFor(
    args,
    ['--config', '--out', '--select'],
    ['--check', '--self-contained', '--json']
  );
  const {
    emitBuilders,
    emitJsonSchemaBuilders,
    selfContainedRuntime,
    writeGenerated,
    CodegenError,
  } = await import('./index.js');
  const config = flags.get('--config');
  const out = flags.get('--out');
  if (typeof config !== 'string' || typeof out !== 'string') {
    throw new CodegenError('--config and --out are required');
  }
  const input = (await readJson(config, 'configuration')) as {
    builders?: BuilderTarget[];
    schemas?: JsonBuilderTarget[];
    openapi?: unknown;
  };
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['builders', 'schemas', 'openapi'].includes(key))
  ) {
    throw new CodegenError('Invalid data-only generation configuration');
  }
  const openapi = await openApiTargets(config, input.openapi);
  const selection =
    typeof flags.get('--select') === 'string'
      ? String(flags.get('--select')).split(',')
      : undefined;
  const all = [
    ...(input.builders ?? []),
    ...(input.schemas ?? []),
    ...openapi.flatMap((source) => source.targets),
  ];
  if (selection?.some((name) => !all.some((target) => target.name === name))) {
    throw new CodegenError('Unknown selected builder');
  }
  const options = flags.get('--self-contained')
    ? { runtimeModule: './builder-runtime/index.js' }
    : {};
  const { emitOpenApiTargets } = await import('./openapi.js');
  const files = [
    ...emitBuilders(
      (input.builders ?? []).filter((target) => !selection || selection.includes(target.name)),
      options
    ),
    ...(await emitJsonSchemaBuilders(
      (input.schemas ?? []).filter((target) => !selection || selection.includes(target.name)),
      options
    )),
  ];
  for (const source of openapi) {
    try {
      files.push(
        ...(await emitOpenApiTargets(
          source.targets.filter((target) => !selection || selection.includes(target.name)),
          options
        ))
      );
    } catch (error) {
      throw new UsageError(
        `OpenAPI document ${JSON.stringify(source.document)}: ${error instanceof Error ? error.message : 'emission failed'}`
      );
    }
  }
  if (flags.get('--self-contained')) {
    files.push(...(await selfContainedRuntime()));
  }
  const result = await writeGenerated(out, files, { check: flags.get('--check') === true });
  console.log(
    JSON.stringify(
      flags.has('--json')
        ? {
            format: 'mimlet/diagnostics',
            version: 1,
            command: 'generate',
            ok: !flags.get('--check') || result.clean,
            result,
            diagnostics:
              flags.get('--check') && !result.clean
                ? [
                    {
                      code: 'GENERATED_FILES_OUTDATED',
                      severity: 'error',
                      message: result.modified.length
                        ? `Generated files were edited by hand: ${result.modified.join(', ')}.`
                        : 'Generated output differs from the declared configuration.',
                      hint: result.modified.length
                        ? 'Move the edits out of the generated files, delete them, then regenerate.'
                        : 'Regenerate the owned output and review the diff.',
                    },
                  ]
                : [],
          }
        : result
    )
  );
  if (flags.get('--check') && !result.clean) {
    process.exitCode = 1;
  }
}
try {
  await main();
} catch (error) {
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify({
        format: 'mimlet/diagnostics',
        version: 1,
        command: ['doctor', 'inspect'].includes(process.argv[2] ?? '')
          ? process.argv[2]
          : 'generate',
        ok: false,
        diagnostics: [
          {
            code: error instanceof UsageError ? error.code : 'COMMAND_FAILED',
            severity: 'error',
            message:
              error instanceof UsageError ? error.message : 'The requested operation failed.',
            hint: 'Check the command arguments and local input files; use mimlet --help.',
          },
        ],
      })
    );
  } else {
    console.error(error instanceof Error ? error.message : 'Builder generation failed');
  }
  process.exitCode = 2;
}
