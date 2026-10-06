import { openApiComponents, type ContractOptions } from '@mimlet/api';
import type { JsonSchemaOptions } from '@mimlet/json-schema';
import {
  CodegenError,
  emitJsonSchemaBuilders,
  type EmitOptions,
  type GeneratedFile,
  type JsonBuilderTarget,
} from './emit.js';

export type OpenApiDirection = 'request' | 'response';
/** One component schema, with an optional builder class name and direction. */
export interface OpenApiSchemaTarget {
  /** The key under `components.schemas`. */
  readonly schema: string;
  /** The builder class name. Defaults to the component name in PascalCase plus `Builder`. */
  readonly name?: string;
  readonly direction?: OpenApiDirection;
}
/** Data-only generation settings for every builder of one OpenAPI document. */
export type OpenApiGenerationOptions = Pick<
  JsonSchemaOptions,
  'profile' | 'maxArrayLength' | 'maxStringLength' | 'maxValueDepth' | 'maxAttempts'
>;
export interface OpenApiSchemas {
  /** `'all'` or the component schemas to emit builders for. */
  readonly schemas: 'all' | ReadonlyArray<string | OpenApiSchemaTarget>;
  /**
   * `request` leaves out `readOnly` properties and `response` (the default) leaves out
   * `writeOnly` ones, like `openApi().request()` and `.response()` in `@mimlet/api`.
   */
  readonly direction?: OpenApiDirection;
  readonly options?: OpenApiGenerationOptions;
  /**
   * Type an object schema that declares properties but not `additionalProperties` as
   * closed: without the `[k: string]: unknown` index signature that OpenAPI's default
   * (additional properties allowed) produces. Only the generated types change; generation and
   * validation keep the document's rules. Documents from NestJS's Swagger module never
   * declare `additionalProperties`, so their builders need this to fit typed code.
   */
  readonly closedObjects?: boolean;
}
export interface OpenApiBuilderTarget extends JsonBuilderTarget {
  /** The component schema this builder was projected from. */
  readonly component: string;
  readonly direction: OpenApiDirection;
}

const generationOptions = new Set([
  'profile',
  'maxArrayLength',
  'maxStringLength',
  'maxValueDepth',
  'maxAttempts',
]);
/** Whole documents are larger than one schema; the emitted schemas keep the default budgets. */
const documentBudget: ContractOptions = {
  maxSchemaNodes: 1_000_000,
  maxSchemaCharacters: 10_000_000,
  maxSchemaDepth: 128,
};
const plain = (value: unknown): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const dataOnly = (value: Record<string, unknown>, allowed: ReadonlySet<string>) =>
  Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return typeof key === 'string' && allowed.has(key) && !!descriptor && 'value' in descriptor;
  });
const reason = (cause: unknown) => (cause instanceof Error ? cause.message : 'unknown failure');
const quoted = (name: string) =>
  JSON.stringify(name.length > 128 ? `${name.slice(0, 125)}...` : name);
/** The own enumerable data properties of a record: an accessor is never called. */
function dataProperties(value: Record<string, unknown>): Record<string, unknown> {
  const entry: Record<string, unknown> = {};
  for (const key of Object.keys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && 'value' in descriptor) {
      Object.defineProperty(entry, key, { value: descriptor.value, enumerable: true });
    }
  }
  return entry;
}
const primitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);
/** A configuration entry for a message: JSON with its primitive fields, at most 200 characters. */
function shown(value: unknown): string {
  if (!plain(value)) {
    return primitive(value)
      ? JSON.stringify(value)
      : Array.isArray(value)
        ? 'an array'
        : `a value of type ${typeof value}`;
  }
  const entry = dataProperties(value);
  const text = JSON.stringify(
    Object.fromEntries(
      Object.entries(entry).map(([key, field]) => [
        key,
        primitive(field) ? field : Array.isArray(field) ? '<array>' : `<${typeof field}>`,
      ])
    )
  );
  return text.length > 200 ? `${text.slice(0, 197)}...` : text;
}
const componentReference = /^#\/components\/schemas\/(.+)$/;
/** The component a string names: its name, or a `#/components/schemas/<name>` reference. */
function componentName(value: unknown, names: readonly string[]): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const captured = componentReference.exec(value)?.[1];
  const name = captured === undefined ? value : captured.replace(/~1/g, '/').replace(/~0/g, '~');
  return names.includes(name) ? name : undefined;
}
/**
 * The `{ schema, name?, direction? }` entry an invalid entry most likely means, when it names
 * a component: in `schema`, in another key such as `name` or `component`, or as a reference.
 * `moved` is true when the component was not in `schema`.
 */
function correctedEntry(
  input: unknown,
  names: readonly string[]
): { readonly entry: string; readonly moved: boolean } | undefined {
  if (!plain(input)) {
    return undefined;
  }
  const entry = dataProperties(input);
  const inSchema = componentName(entry.schema, names);
  const schema =
    inSchema ??
    Object.entries(entry)
      .filter(([key]) => key !== 'direction')
      .map(([, value]) => componentName(value, names))
      .find((name) => name !== undefined) ??
    (entry.schema === undefined && typeof entry.name === 'string' ? entry.name : undefined);
  if (schema === undefined) {
    return undefined;
  }
  const builder =
    typeof entry.name === 'string' &&
    entry.name !== schema &&
    componentName(entry.name, names) === undefined
      ? entry.name
      : undefined;
  return {
    entry: JSON.stringify({
      schema,
      ...(builder === undefined ? {} : { name: builder }),
      ...(entry.direction === 'request' || entry.direction === 'response'
        ? { direction: entry.direction }
        : {}),
    }),
    moved: inSchema === undefined,
  };
}

/** `create-deal.command` -> `CreateDealCommandBuilder`. */
export function openApiBuilderName(component: string): string {
  const base = component
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join('');
  return `${!base || /^[0-9]/.test(base) ? `Schema${base}` : base}Builder`;
}
function direction(value: unknown, fallback: OpenApiDirection): OpenApiDirection {
  if (value === undefined) {
    return fallback;
  }
  if (value !== 'request' && value !== 'response') {
    throw new CodegenError('An OpenAPI direction must be "request" or "response"');
  }
  return value;
}

/**
 * Project named OpenAPI 3.0/3.1/3.2 component schemas into JSON builder targets with the
 * `@mimlet/api` projection: 3.0 `nullable` and exclusive bounds, component references and
 * request/response handling of `readOnly`/`writeOnly`. Pass them to `emitJsonSchemaBuilders`,
 * or use `emitOpenApiBuilders`, which also names the component in emission errors.
 */
export function openApiBuilderTargets(
  document: unknown,
  selection: OpenApiSchemas
): OpenApiBuilderTarget[] {
  if (
    !plain(selection) ||
    !dataOnly(selection, new Set(['schemas', 'direction', 'options', 'closedObjects']))
  ) {
    throw new CodegenError(
      'OpenAPI selection must be data-only: schemas, direction, options and closedObjects'
    );
  }
  if (selection.closedObjects !== undefined && typeof selection.closedObjects !== 'boolean') {
    throw new CodegenError('closedObjects must be true or false');
  }
  const closedObjects = selection.closedObjects === true;
  const fallback = direction(selection.direction, 'response');
  const options = selection.options ?? {};
  if (!plain(options) || !dataOnly(options, generationOptions)) {
    throw new CodegenError(
      'OpenAPI generation options must be data-only: profile, maxArrayLength, maxStringLength, maxValueDepth and maxAttempts'
    );
  }
  let components: ReturnType<typeof openApiComponents>;
  try {
    components = openApiComponents(document, documentBudget);
  } catch (cause) {
    throw new CodegenError(`The OpenAPI document cannot be read: ${reason(cause)}`, { cause });
  }
  if (
    selection.schemas !== 'all' &&
    (!Array.isArray(selection.schemas) || selection.schemas.length > 1000)
  ) {
    throw new CodegenError('OpenAPI schemas must be "all" or a list of at most 1000 entries');
  }
  const requested = selection.schemas === 'all' ? components.names() : [...selection.schemas];
  return requested.map((entry, index) => {
    const target = typeof entry === 'string' ? { schema: entry } : entry;
    if (
      !plain(target) ||
      !dataOnly(target, new Set(['schema', 'name', 'direction'])) ||
      typeof target.schema !== 'string' ||
      (target.name !== undefined && typeof target.name !== 'string')
    ) {
      const corrected = correctedEntry(entry, components.names());
      const suggestion =
        corrected === undefined
          ? ''
          : ` Did you mean ${corrected.entry}?${
              corrected.moved ? ' "schema" is the component and "name" the builder class name.' : ''
            }`;
      throw new CodegenError(
        `Each OpenAPI schema entry is a component name or { schema, name?, direction? }; schemas[${index}] is ${shown(entry)}.${suggestion}`
      );
    }
    if (!components.names().includes(target.schema)) {
      const schema = target.schema;
      const near =
        componentName(schema, components.names()) ??
        components.names().find((name) => name.toLowerCase() === schema.toLowerCase());
      throw new CodegenError(
        `Unknown OpenAPI component schema ${quoted(schema)}${near === undefined ? '' : `; did you mean ${quoted(near)}?`}`
      );
    }
    const chosen = direction(target.direction, fallback);
    let projected;
    try {
      projected = components.schema(target.schema, chosen);
    } catch (cause) {
      throw new CodegenError(
        `OpenAPI component schema ${quoted(target.schema)} cannot be projected: ${reason(cause)}`,
        { cause }
      );
    }
    return {
      name: target.name ?? openApiBuilderName(target.schema),
      component: target.schema,
      direction: chosen,
      schema: projected.schema,
      options: { dialect: projected.dialect, ...options },
      ...(closedObjects ? { closedObjects } : {}),
    };
  });
}

/**
 * Emit OpenAPI builder targets one at a time, so a schema that cannot be prepared names its
 * component. Names and the selection are checked for the whole set first.
 */
export async function emitOpenApiTargets(
  targets: readonly OpenApiBuilderTarget[],
  options: EmitOptions = {}
): Promise<GeneratedFile[]> {
  // An empty selection checks names and collisions without emitting anything.
  await emitJsonSchemaBuilders(targets, { ...options, select: [] });
  if (
    options.select !== undefined &&
    (!Array.isArray(options.select) ||
      options.select.some((name) => !targets.some((target) => target.name === name)))
  ) {
    throw new CodegenError('Selection contains an unknown target');
  }
  const files: GeneratedFile[] = [];
  for (const target of [...targets].sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (options.select !== undefined && !options.select.includes(target.name)) {
      continue;
    }
    try {
      files.push(
        ...(await emitJsonSchemaBuilders([target], {
          ...(options.runtimeModule === undefined ? {} : { runtimeModule: options.runtimeModule }),
        }))
      );
    } catch (cause) {
      throw new CodegenError(
        `OpenAPI component schema ${quoted(target.component)} (${target.name}): ${reason(cause)}`,
        { cause }
      );
    }
  }
  return files;
}

/** Emit builder classes for named component schemas of an in-memory OpenAPI document. */
export async function emitOpenApiBuilders(
  document: unknown,
  selection: OpenApiSchemas,
  options: EmitOptions = {}
): Promise<GeneratedFile[]> {
  return emitOpenApiTargets(openApiBuilderTargets(document, selection), options);
}
