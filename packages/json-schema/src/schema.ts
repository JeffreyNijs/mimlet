/** Data-only schema preparation. No URLs or file paths are fetched or executed. */
export type JsonSchema = boolean | JsonSchemaObject;
export interface JsonSchemaObject {
  readonly $schema?: string;
  readonly $id?: string;
  readonly $ref?: string;
  readonly type?: string | ReadonlyArray<string>;
  readonly minItems?: number;
  readonly maxItems?: number;
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly [keyword: string]: unknown;
}
export type SchemaDialect = 'draft-07' | 'draft-2019-09' | 'draft-2020-12';
export interface SchemaLimits {
  readonly maxSchemaNodes?: number;
  readonly maxSchemaDepth?: number;
  readonly maxSchemaCharacters?: number;
  readonly maxArrayLength?: number;
  readonly maxStringLength?: number;
  readonly maxValueDepth?: number;
  readonly maxValueNodes?: number;
  readonly maxAttempts?: number;
}
export interface SchemaPreparationErrorOptions extends ErrorOptions {
  /** URI of the supplied reference that `schemaPath` points into. */
  readonly reference?: string;
  /** A `$ref` target that was neither supplied nor defined in the schema. */
  readonly missingReference?: string;
}
const reasons = new WeakMap<SchemaPreparationError, string>();
export const clipUri = (uri: string): string =>
  uri.length > 200 ? `${uri.slice(0, 197)}...` : uri;
export class SchemaPreparationError extends Error {
  readonly code = 'SCHEMA_PREPARATION_FAILED';
  /** Set when the failure is inside a supplied reference; `schemaPath` is then relative to it. */
  readonly reference?: string;
  /** Set when a `$ref` could not be resolved; `schemaPath` points at that `$ref`. */
  readonly missingReference?: string;
  constructor(
    message: string,
    readonly schemaPath: string,
    options?: SchemaPreparationErrorOptions
  ) {
    const reference = options?.reference;
    super(
      `${message} at ${schemaPath || '/'}${reference === undefined ? '' : ` in reference ${clipUri(reference)}`}`,
      options && 'cause' in options ? { cause: options.cause } : undefined
    );
    this.name = 'SchemaPreparationError';
    if (reference !== undefined) {
      this.reference = reference;
    }
    if (options?.missingReference !== undefined) {
      this.missingReference = options.missingReference;
    }
    reasons.set(this, message);
  }
}
/** Attribute a failure inside a supplied reference to that reference. */
export function inReference(error: unknown, uri: string): SchemaPreparationError {
  const prepared = error instanceof SchemaPreparationError ? error : undefined;
  const reason = prepared && reasons.get(prepared);
  if (!prepared || reason === undefined) {
    // The validator rejected a reference that preparation accepted.
    return new SchemaPreparationError('Invalid referenced schema', '', {
      cause: error,
      reference: uri,
    });
  }
  // Preparation failures carry no cause; the reference replaces the missing context.
  return new SchemaPreparationError(reason, prepared.schemaPath, { reference: uri });
}
export class SchemaGenerationError extends Error {
  readonly code = 'SCHEMA_GENERATION_FAILED';
  constructor(
    message: string,
    readonly attempts: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'SchemaGenerationError';
  }
}
export const pointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');
export const unpointer = (path: string): string[] =>
  path === ''
    ? []
    : path
        .slice(1)
        .split('/')
        .map((key) => key.replace(/~1/g, '/').replace(/~0/g, '~'));
const defaults: Required<SchemaLimits> = {
  maxSchemaNodes: 10_000,
  maxSchemaDepth: 64,
  maxSchemaCharacters: 1_000_000,
  maxArrayLength: 1_000,
  maxStringLength: 10_000,
  maxValueDepth: 12,
  maxValueNodes: 100_000,
  maxAttempts: 20,
};
export function limits(options: SchemaLimits): Required<SchemaLimits> {
  const result = { ...defaults };
  for (const key of Object.keys(defaults) as (keyof SchemaLimits)[]) {
    const value = options[key];
    if (value === undefined) {
      continue;
    }
    if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) {
      throw new RangeError(`${key} must be an integer between 0 and 10000000`);
    }
    result[key] = value;
  }
  if (result.maxSchemaDepth > 128 || result.maxValueDepth > 64) {
    throw new RangeError('Schema/value depth must not exceed 128/64');
  }
  return Object.freeze(result);
}
export function copyJson(
  value: unknown,
  maximum: Required<SchemaLimits>,
  schema = true,
  standardMetadata = false
): unknown {
  let nodes = 0;
  let characters = 0;
  const stack = new WeakSet<object>();
  function visit(value: unknown, depth: number, path: string): unknown {
    nodes += 1;
    if (
      nodes > (schema ? maximum.maxSchemaNodes : maximum.maxValueNodes) ||
      depth > (schema ? maximum.maxSchemaDepth : maximum.maxValueDepth)
    ) {
      throw new SchemaPreparationError('Node or depth budget exhausted', path);
    }
    if (value === null || typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      characters += value.length;
      if (
        characters > maximum.maxSchemaCharacters ||
        (!schema && value.length > maximum.maxStringLength)
      ) {
        throw new SchemaPreparationError('String budget exhausted', path);
      }
      return value;
    }
    if (typeof value !== 'object' || value === null || stack.has(value)) {
      throw new SchemaPreparationError('Expected acyclic JSON data', path);
    }
    const array = Array.isArray(value);
    if (
      !array &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) {
      throw new SchemaPreparationError('Expected a plain JSON record', path);
    }
    if (array && value.length > (schema ? maximum.maxSchemaNodes : maximum.maxArrayLength)) {
      throw new SchemaPreparationError('Array budget exhausted', path);
    }
    stack.add(value);
    const result: Record<string, unknown> | unknown[] = array ? [] : {};
    const keys = Reflect.ownKeys(value).filter((key) => {
      if (array && key === 'length') {
        return false;
      }
      // Standard conversion may attach its original protocol non-enumerably (e.g. Zod).
      // Strip only this known root metadata, not arbitrary hidden fields or accessors.
      if (standardMetadata && depth === 0 && key === '~standard') {
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (descriptor && !descriptor.enumerable && 'value' in descriptor) {
          return false;
        }
      }
      return true;
    });
    if (array && keys.length !== value.length) {
      throw new SchemaPreparationError('Sparse arrays are not JSON', path);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (
        typeof key !== 'string' ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        (array && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
      ) {
        throw new SchemaPreparationError('Expected own enumerable JSON data properties', path);
      }
      characters += key.length;
      if (characters > maximum.maxSchemaCharacters) {
        throw new SchemaPreparationError('Character budget exhausted', path);
      }
      Object.defineProperty(result, key, {
        value: visit(descriptor.value, depth + 1, `${path}/${pointer(key)}`),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    stack.delete(value);
    return result;
  }
  return visit(value, 0, '');
}
const common = new Set([
  '$schema',
  '$id',
  '$ref',
  '$comment',
  'title',
  'description',
  'default',
  'examples',
  'readOnly',
  'writeOnly',
  'deprecated',
  'type',
  'enum',
  'const',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'items',
  'contains',
  'minItems',
  'maxItems',
  'uniqueItems',
  'properties',
  'required',
  'additionalProperties',
  'patternProperties',
  'minProperties',
  'maxProperties',
  'propertyNames',
  'allOf',
  'anyOf',
  'oneOf',
  'not',
  'if',
  'then',
  'else',
  'contentEncoding',
  'contentMediaType',
]);
const maps = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const singles = new Set([
  'additionalProperties',
  'propertyNames',
  'contains',
  'not',
  'if',
  'then',
  'else',
  'contentSchema',
  'unevaluatedProperties',
  'unevaluatedItems',
]);
const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
export function dialect(source: JsonSchema, requested?: SchemaDialect): SchemaDialect {
  if (
    source === null ||
    (typeof source !== 'boolean' && (typeof source !== 'object' || Array.isArray(source)))
  ) {
    throw new SchemaPreparationError('A schema must be a boolean or record', '');
  }
  if (
    requested !== undefined &&
    !['draft-07', 'draft-2019-09', 'draft-2020-12'].includes(requested)
  ) {
    throw new SchemaPreparationError('Unsupported requested dialect', '/$schema');
  }
  const declared = typeof source === 'object' ? source.$schema : undefined;
  if (declared !== undefined && typeof declared !== 'string') {
    throw new SchemaPreparationError('A dialect must be a string', '/$schema');
  }
  const found =
    declared === undefined
      ? undefined
      : /^(https?:\/\/json-schema.org\/draft-07\/schema#?)$/.test(declared)
        ? 'draft-07'
        : /^https?:\/\/json-schema.org\/draft\/2020-12\/schema#?$/.test(declared)
          ? 'draft-2020-12'
          : /^https?:\/\/json-schema.org\/draft\/2019-09\/schema#?$/.test(declared)
            ? 'draft-2019-09'
            : undefined;
  if (
    (declared !== undefined && found === undefined) ||
    (requested && found && requested !== found)
  ) {
    throw new SchemaPreparationError('Unsupported or conflicting JSON Schema dialect', '/$schema');
  }
  return found ?? requested ?? 'draft-2020-12';
}
/** Normalize draft-07 only for the generation backend; validation keeps the original dialect. */
export function prepare(
  source: unknown,
  selected: SchemaDialect,
  maximum: Required<SchemaLimits>,
  knownFormats?: ReadonlySet<string>,
  extensions: ReadonlySet<string> = new Set()
): JsonSchema {
  if (typeof source === 'boolean') {
    return source;
  }
  if (typeof source !== 'object' || source === null || Array.isArray(source)) {
    throw new SchemaPreparationError('A schema must be a boolean or JSON object', '');
  }
  function visit(schema: JsonSchema, path: string): JsonSchema {
    if (typeof schema === 'boolean') {
      return schema;
    }
    if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
      throw new SchemaPreparationError('Invalid subschema', path);
    }
    const allowed = new Set([
      ...common,
      ...(selected === 'draft-07'
        ? ['definitions', 'dependencies', 'additionalItems']
        : [
            '$defs',
            ...(selected === 'draft-2020-12'
              ? ['prefixItems']
              : ['definitions', 'dependencies', 'additionalItems']),
            'minContains',
            'maxContains',
            'dependentSchemas',
            'dependentRequired',
            'unevaluatedProperties',
            'unevaluatedItems',
            'contentSchema',
          ]),
    ]);
    if (typeof schema.format === 'string' && knownFormats && !knownFormats.has(schema.format)) {
      throw new SchemaPreparationError('Unknown format', `${path}/format`);
    }
    for (const key of Object.keys(schema)) {
      if (!allowed.has(key) && !extensions.has(key)) {
        throw new SchemaPreparationError(
          `Unsupported schema keyword ${key}`,
          `${path}/${pointer(key)}`
        );
      }
    }
    for (const [minimum, bound] of [
      ['minItems', maximum.maxArrayLength],
      ['minLength', maximum.maxStringLength],
      ['minProperties', maximum.maxValueNodes],
    ] as const) {
      if (typeof schema[minimum] === 'number' && schema[minimum] > bound) {
        throw new SchemaPreparationError(`${minimum} exceeds generation budget`, path);
      }
    }
    if (schema.$schema !== undefined && dialect(schema, selected) !== selected) {
      throw new SchemaPreparationError('Nested dialect changes are not supported', path);
    }
    const result: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(schema)) {
      if (extensions.has(name)) {
        continue;
      }
      if (
        selected === 'draft-07' &&
        schema.$ref !== undefined &&
        !['$id', '$schema', '$ref', 'definitions'].includes(name)
      ) {
        continue;
      }
      if (name === '$schema') {
        result[name] = 'https://json-schema.org/draft/2020-12/schema';
        continue;
      }
      if (name === '$ref') {
        if (typeof value !== 'string') {
          throw new SchemaPreparationError('A reference must be a string', path);
        }
        result[name] =
          selected !== 'draft-2020-12' ? value.replace(/#\/definitions\//g, '#/$defs/') : value;
      } else if (maps.has(name)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new SchemaPreparationError('Invalid subschema map', path);
        }
        const children: Record<string, JsonSchema> = {};
        for (const [key, child] of Object.entries(value)) {
          if (key === '__proto__') {
            throw new SchemaPreparationError(
              'The provider cannot safely represent this property name',
              `${path}/${name}/${pointer(key)}`
            );
          }
          Object.defineProperty(children, key, {
            value: visit(child, `${path}/${name}/${pointer(key)}`),
            enumerable: true,
          });
        }
        result[name === 'definitions' ? '$defs' : name] = children;
      } else if (arrays.has(name) || (name === 'items' && Array.isArray(value))) {
        if (!Array.isArray(value)) {
          throw new SchemaPreparationError('Invalid schema array', path);
        }
        if (name === 'items' && selected === 'draft-2020-12') {
          throw new SchemaPreparationError('Tuple items require draft-07 or draft-2019-09', path);
        }
        result[name === 'items' ? 'prefixItems' : name] = value.map((s, i) =>
          visit(s, `${path}/${name}/${i}`)
        );
        if (name === 'items') {
          result.items = visit(
            (schema.additionalItems ?? true) as JsonSchema,
            `${path}/additionalItems`
          );
        }
      } else if (singles.has(name) || name === 'items') {
        result[name] = visit(value as JsonSchema, `${path}/${name}`);
      } else if (name === 'additionalItems') {
        // Normalized together with tuple-form items. Ignored for non-tuples in draft-07.
      } else if (name === 'dependencies') {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          throw new SchemaPreparationError('Invalid dependency map', path);
        }
        const required: Record<string, unknown> = {};
        const schemas: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value)) {
          if (key === '__proto__') {
            throw new SchemaPreparationError(
              'The provider cannot safely represent this property name',
              `${path}/${name}/${pointer(key)}`
            );
          }
          Object.defineProperty(Array.isArray(child) ? required : schemas, key, {
            value: Array.isArray(child)
              ? child
              : visit(child, `${path}/dependencies/${pointer(key)}`),
            enumerable: true,
          });
        }
        result.dependentRequired = required;
        result.dependentSchemas = schemas;
      } else {
        Object.defineProperty(result, name, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    // Narrow the sampling domain without widening or dropping original constraints.
    if (schema.type === 'array' || schema.items !== undefined || schema.prefixItems !== undefined) {
      result.maxItems = Math.min(
        schema.maxItems ?? Math.max(schema.minItems ?? 0, 3),
        maximum.maxArrayLength
      );
    }
    // An enum or const already fixes the values; a length hint would only drop valid ones.
    const finite = schema.enum !== undefined || schema.const !== undefined;
    if (
      !finite &&
      (schema.type === 'string' || schema.pattern !== undefined || schema.format !== undefined)
    ) {
      result.maxLength = Math.min(
        schema.maxLength ??
          (schema.pattern !== undefined || schema.format !== undefined
            ? maximum.maxStringLength
            : Math.max(schema.minLength ?? 0, 16)),
        maximum.maxStringLength
      );
    }
    return result as JsonSchema;
  }
  return visit(source as JsonSchema, '');
}
export function fingerprint(value: unknown): string {
  function canonical(v: unknown): string {
    if (Array.isArray(v)) {
      return `[${v.map(canonical).join(',')}]`;
    }
    if (v && typeof v === 'object') {
      return `{${Object.keys(v)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
        .join(',')}}`;
    }
    return JSON.stringify(v);
  }
  let hash = 0xcbf29ce484222325n;
  for (const character of canonical(value)) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(character.codePointAt(0)!)) * 0x100000001b3n);
  }
  return `json-fnv1a64-v1:${hash.toString(16).padStart(16, '0')}`;
}

/** Resolve a reference the way an offline validator does; unresolvable bases stay textual. */
export function resolveUri(reference: string, base: string): string {
  let resolved: string;
  try {
    resolved = new URL(reference, base || undefined).href;
  } catch {
    resolved = reference.startsWith('#') ? `${base.replace(/#.*$/, '')}${reference}` : reference;
  }
  return resolved.endsWith('#') ? resolved.slice(0, -1) : resolved;
}
const dataKeywords = new Set(['const', 'enum', 'default', 'examples']);
/** Find where the schema or one of its references uses a `$ref` that resolves to `target`. */
export function locateReference(
  target: string,
  documents: ReadonlyArray<readonly [reference: string | undefined, schema: unknown]>
): { readonly reference?: string; readonly schemaPath: string } | undefined {
  const wanted = resolveUri(target, '');
  for (const [reference, schema] of documents) {
    const visit = (node: unknown, base: string, path: string): string | undefined => {
      if (!node || typeof node !== 'object') {
        return undefined;
      }
      const record = node as Record<string, unknown>;
      const array = Array.isArray(node);
      const scope = !array && typeof record.$id === 'string' ? resolveUri(record.$id, base) : base;
      if (!array && typeof record.$ref === 'string' && resolveUri(record.$ref, scope) === wanted) {
        return `${path}/$ref`;
      }
      for (const [key, child] of Object.entries(node)) {
        // Instance data can contain a "$ref" key without being a reference.
        const found =
          !array && dataKeywords.has(key)
            ? undefined
            : visit(child, scope, `${path}/${pointer(key)}`);
        if (found !== undefined) {
          return found;
        }
      }
      return undefined;
    };
    const schemaPath = visit(schema, reference ?? '', '');
    if (schemaPath !== undefined) {
      return reference === undefined ? { schemaPath } : { reference, schemaPath };
    }
  }
  return undefined;
}

/** Ajv accepts ref siblings in draft-07; explicitly retain the dialect's older semantics. */
export function draft7ValidationSchema(schema: JsonSchema): JsonSchema {
  if (typeof schema === 'boolean') {
    return schema;
  }
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(schema)) {
    if (schema.$ref !== undefined && !['$schema', '$id', '$ref', 'definitions'].includes(name)) {
      continue;
    }
    let next = value;
    if (maps.has(name) || name === 'dependencies') {
      const children: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, JsonSchema | string[]>)) {
        Object.defineProperty(children, key, {
          value: Array.isArray(child) ? child : draft7ValidationSchema(child),
          enumerable: true,
        });
      }
      next = children;
    } else if (arrays.has(name) || (name === 'items' && Array.isArray(value))) {
      next = (value as JsonSchema[]).map(draft7ValidationSchema);
    } else if (singles.has(name) || name === 'items' || name === 'additionalItems') {
      next = draft7ValidationSchema(value as JsonSchema);
    }
    Object.defineProperty(result, name, { value: next, enumerable: true });
  }
  return result;
}
