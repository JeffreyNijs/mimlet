import type { JsonSchema, JsonSchemaOptions, SchemaDialect } from '@mimlet/json-schema';

export class ApiContractError extends Error {
  readonly code = 'API_CONTRACT_FAILED';
  constructor(
    message: string,
    readonly location = '',
    options?: ErrorOptions
  ) {
    super(`${message}${location ? ` at ${location}` : ''}`, options);
    this.name = 'ApiContractError';
  }
}
export type JsonObject = Record<string, unknown>;
export interface ContractOptions extends Omit<JsonSchemaOptions, 'references'> {
  /** Absolute document URI. Resolution is in memory only; no resource is fetched. */
  readonly documentUri?: string;
  readonly documents?: Readonly<Record<string, unknown>>;
}
export function object(value: unknown, location = ''): JsonObject {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) {
    throw new ApiContractError('Expected an object', location);
  }
  return value as JsonObject;
}
export const escapePointer = (key: string): string => key.replace(/~/g, '~0').replace(/\//g, '~1');
/** What a non-JSON value is, for error messages. Never includes the value itself. */
export function describeValue(value: unknown): string {
  if (value === undefined) {
    return 'undefined';
  }
  if (typeof value === 'number') {
    return Number.isNaN(value) ? 'NaN' : value > 0 ? 'Infinity' : '-Infinity';
  }
  if (typeof value !== 'object' || value === null) {
    return `a ${typeof value}`;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  const constructor =
    prototype && typeof prototype === 'object'
      ? Object.getOwnPropertyDescriptor(prototype, 'constructor')?.value
      : undefined;
  const name: unknown =
    typeof constructor === 'function'
      ? Object.getOwnPropertyDescriptor(constructor, 'name')?.value
      : undefined;
  return typeof name === 'string' && /^[A-Za-z_$][A-Za-z0-9_$]{0,63}$/.test(name)
    ? `an instance of ${name}`
    : 'an object that is not a plain record';
}
/**
 * Copy bounded JSON data, rejecting non-JSON values with their location and kind. With
 * `omitUndefined`, used for API documents, object properties whose value is `undefined` are
 * left out as `JSON.stringify` does, so an in-memory document (such as one a framework builds)
 * behaves like its serialized form. Fixture values keep rejecting them.
 */
export function snapshot(
  value: unknown,
  options: ContractOptions = {},
  omitUndefined = false
): unknown {
  let nodes = 0;
  let characters = 0;
  const active = new Set<object>();
  const maxNodes = options.maxSchemaNodes ?? 10_000;
  const maxDepth = options.maxSchemaDepth ?? 64;
  const maxCharacters = options.maxSchemaCharacters ?? 1_000_000;
  for (const n of [maxNodes, maxDepth, maxCharacters]) {
    if (!Number.isSafeInteger(n) || n < 0 || n > 10_000_000) {
      throw new ApiContractError('Invalid document resource budget');
    }
  }
  if (maxDepth > 128) {
    throw new ApiContractError('Document depth must not exceed 128');
  }
  const visit = (value: unknown, depth: number, path: string): unknown => {
    if (++nodes > maxNodes || depth > maxDepth) {
      throw new ApiContractError('Document resource budget exhausted', path || '/');
    }
    if (typeof value === 'string') {
      characters += value.length;
      if (characters > maxCharacters) {
        throw new ApiContractError('Document character budget exhausted', path || '/');
      }
      return value;
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    ) {
      return value;
    }
    if (typeof value !== 'object') {
      throw new ApiContractError(`Expected JSON data, found ${describeValue(value)}`, path || '/');
    }
    if (active.has(value)) {
      throw new ApiContractError(
        'Expected acyclic JSON data, found a reference back to an enclosing value',
        path || '/'
      );
    }
    if (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      throw new ApiContractError(
        `Expected a plain JSON object, found ${describeValue(value)}`,
        path || '/'
      );
    }
    active.add(value);
    const result: unknown[] | JsonObject = Array.isArray(value) ? [] : {};
    for (const key of Reflect.ownKeys(value)) {
      if (Array.isArray(value) && key === 'length') {
        continue;
      }
      const entry = Object.getOwnPropertyDescriptor(value, key)!;
      if (typeof key !== 'string') {
        throw new ApiContractError('JSON data must not contain symbol keys', path || '/');
      }
      const location = `${path}/${escapePointer(key)}`;
      if (!entry.enumerable || !('value' in entry)) {
        throw new ApiContractError(
          'JSON data must not contain accessors or non-enumerable properties',
          location
        );
      }
      if (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key)) {
        throw new ApiContractError('Invalid JSON array property', location);
      }
      if (omitUndefined && entry.value === undefined && !Array.isArray(value)) {
        continue;
      }
      characters += key.length;
      if (characters > maxCharacters) {
        throw new ApiContractError('Document character budget exhausted', location);
      }
      Object.defineProperty(result, key, {
        value: visit(entry.value, depth + 1, location),
        enumerable: true,
        configurable: true,
        writable: true,
      });
    }
    if (Array.isArray(value) && Object.keys(value).length !== value.length) {
      throw new ApiContractError('Sparse arrays are not JSON data', path || '/');
    }
    active.delete(value);
    return result;
  };
  return visit(value, 0, '');
}
export interface Located {
  readonly value: unknown;
  readonly uri: string;
  readonly pointer: string;
}
export class Documents {
  readonly root: Located;
  private readonly documents = new Map<string, unknown>();
  constructor(
    source: unknown,
    readonly options: ContractOptions
  ) {
    const uri = this.url(options.documentUri ?? 'https://test-builders.invalid/document');
    if (uri.hash) {
      throw new ApiContractError('Document URI cannot have a fragment');
    }
    this.root = { value: snapshot(source, options, true), uri: uri.href, pointer: '' };
    this.documents.set(uri.href, this.root.value);
    for (const [id, value] of Object.entries(options.documents ?? {})) {
      const target = this.url(id);
      if (target.hash || this.documents.has(target.href)) {
        throw new ApiContractError('Duplicate document URI or fragment');
      }
      this.documents.set(target.href, snapshot(value, options, true));
    }
  }
  private url(value: string, base?: string): URL {
    try {
      return new URL(value, base);
    } catch (cause) {
      throw new ApiContractError('Invalid document reference URI', '', { cause });
    }
  }
  reference(ref: string, from: Located): Located {
    const url = this.url(ref, from.uri);
    let pointer: string;
    try {
      pointer = decodeURIComponent(url.hash.slice(1));
    } catch (cause) {
      throw new ApiContractError('Invalid reference fragment', from.pointer, { cause });
    }
    url.hash = '';
    if (!this.documents.has(url.href)) {
      throw new ApiContractError('Referenced document was not supplied in memory', from.pointer);
    }
    let value: unknown = this.documents.get(url.href);
    if (pointer && !pointer.startsWith('/')) {
      throw new ApiContractError(
        'Only JSON Pointer document references are supported',
        from.pointer
      );
    }
    for (const part of pointer ? pointer.slice(1).split('/') : []) {
      if (/~(?:[^01]|$)/.test(part)) {
        throw new ApiContractError('Malformed JSON Pointer', from.pointer);
      }
      const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
        throw new ApiContractError('Reference target does not exist', pointer);
      }
      value = (value as JsonObject)[key];
    }
    return { value, uri: url.href, pointer };
  }
  resolve(from: Located): Located {
    const seen = new Set<string>();
    let current = from;
    while (
      current.value &&
      typeof current.value === 'object' &&
      typeof (current.value as JsonObject).$ref === 'string'
    ) {
      const key = current.uri + '#' + current.pointer;
      if (seen.has(key) || seen.size >= (this.options.maxSchemaDepth ?? 64)) {
        throw new ApiContractError('Cyclic or excessive document reference', current.pointer);
      }
      seen.add(key);
      current = this.reference((current.value as JsonObject).$ref as string, current);
    }
    return current;
  }
  child(from: Located, key: string): Located {
    return {
      value: object(from.value, from.pointer)[key],
      uri: from.uri,
      pointer: `${from.pointer}/${escapePointer(key)}`,
    };
  }
}

export type SchemaMode = 'openapi-3.0' | 'openapi-3.1' | 'asyncapi';
/**
 * Project only schema-bearing keywords; defaults/examples are data, never traversed as schemas.
 * Referenced schemas become local definitions named `reference0`, `reference1`, ... unless
 * `naming` returns a name for the target (a definition key that needs no escaping).
 */
export function projectSchema(
  documents: Documents,
  from: Located,
  mode: SchemaMode,
  direction: 'request' | 'response' | 'message',
  naming?: (target: Located) => string | undefined
): { schema: JsonSchema; dialect: SchemaDialect } {
  const definitions: JsonObject = {};
  const refs = new Map<string, string>();
  const used = new Set<string>();
  const dialect: SchemaDialect = mode === 'openapi-3.1' ? 'draft-2020-12' : 'draft-07';
  const definitionsKey = dialect === 'draft-07' ? 'definitions' : '$defs';
  const visit = (node: Located, depth: number): JsonSchema => {
    if (depth > (documents.options.maxSchemaDepth ?? 64)) {
      throw new ApiContractError('Schema projection depth exhausted', node.pointer);
    }
    if (typeof node.value === 'boolean') {
      return node.value;
    }
    const value = object(node.value, node.pointer);
    if (
      value.$id !== undefined ||
      value.$anchor !== undefined ||
      value.$dynamicRef !== undefined ||
      value.$recursiveRef !== undefined
    ) {
      throw new ApiContractError(
        'Embedded schema IDs/anchors require a standalone JSON Schema adapter',
        node.pointer
      );
    }
    const output: JsonObject = {};
    const omittedFields = new Set<string>();
    if (value.$ref !== undefined) {
      if (typeof value.$ref !== 'string') {
        throw new ApiContractError('Expected a schema reference string', node.pointer);
      }
      const target = documents.reference(value.$ref, node);
      const identity = `${target.uri}#${target.pointer}`;
      let name = refs.get(identity);
      if (!name) {
        const preferred = naming?.(target) ?? `reference${refs.size}`;
        name = preferred;
        for (let n = 2; used.has(name); n++) {
          name = `${preferred}_${n}`;
        }
        used.add(name);
        refs.set(identity, name);
        if (refs.size > (documents.options.maxSchemaNodes ?? 10_000)) {
          throw new ApiContractError('Reference budget exhausted', node.pointer);
        }
        definitions[name] = true;
        definitions[name] = visit(target, depth + 1);
      }
      output.$ref = `#/${definitionsKey}/${name}`;
      if (mode !== 'openapi-3.1') {
        return output;
      }
    }
    for (const [key, item] of Object.entries(value)) {
      if (key === '$ref') {
        continue;
      }
      if (key === '$schema') {
        const allowed =
          mode === 'openapi-3.1'
            ? [
                'https://json-schema.org/draft/2020-12/schema',
                'https://spec.openapis.org/oas/3.1/dialect/base',
                'https://spec.openapis.org/oas/3.2/dialect/base',
              ]
            : [
                'http://json-schema.org/draft-07/schema#',
                'https://json-schema.org/draft-07/schema',
              ];
        if (typeof item !== 'string' || !allowed.includes(item)) {
          throw new ApiContractError('Schema dialect differs from its API dialect', node.pointer);
        }
        continue;
      }
      if (
        ['nullable', 'example', 'xml', 'externalDocs', 'discriminator'].includes(key) ||
        key.startsWith('x-')
      ) {
        if (mode === 'asyncapi' && key === 'discriminator') {
          throw new ApiContractError(
            'AsyncAPI inheritance discriminators require explicit schema selection',
            node.pointer
          );
        }
        if (key === 'example' && value.examples === undefined) {
          output.examples = [item];
        }
        continue;
      }
      if (
        ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'].includes(
          key
        )
      ) {
        const entries: JsonObject = {};
        for (const name of Object.keys(object(item, node.pointer))) {
          const child = documents.child(documents.child(node, key), name);
          const resolved = documents.resolve(child).value;
          // OpenAPI 3.1 applies keywords beside $ref, so `{ $ref, readOnly: true }` counts;
          // 3.0 ignores $ref siblings, so only the referenced schema decides there.
          const flagged = (flag: 'readOnly' | 'writeOnly') =>
            [mode === 'openapi-3.1' ? child.value : undefined, resolved].some(
              (schema) =>
                !!schema &&
                typeof schema === 'object' &&
                !Array.isArray(schema) &&
                (schema as JsonObject)[flag] === true
            );
          const omitted =
            key === 'properties' &&
            ((direction === 'request' && flagged('readOnly')) ||
              (direction === 'response' && flagged('writeOnly')));
          if (omitted) {
            omittedFields.add(name);
          }
          Object.defineProperty(entries, name, {
            value: omitted ? false : visit(child, depth + 1),
            enumerable: true,
          });
        }
        output[key] = entries;
      } else if (
        ['allOf', 'anyOf', 'oneOf', 'prefixItems'].includes(key) ||
        (key === 'items' && Array.isArray(item))
      ) {
        if (!Array.isArray(item)) {
          throw new ApiContractError('Expected a schema array', node.pointer);
        }
        output[key] = item.map((value, index) =>
          visit({ value, uri: node.uri, pointer: `${node.pointer}/${key}/${index}` }, depth + 1)
        );
      } else if (
        [
          'items',
          'additionalItems',
          'additionalProperties',
          'contains',
          'not',
          'if',
          'then',
          'else',
          'propertyNames',
          'unevaluatedProperties',
          'unevaluatedItems',
        ].includes(key)
      ) {
        output[key] = visit(documents.child(node, key), depth + 1);
      } else if (key === 'dependencies') {
        const entries: JsonObject = {};
        for (const [name, constraint] of Object.entries(object(item, node.pointer))) {
          Object.defineProperty(entries, name, {
            value: Array.isArray(constraint)
              ? constraint
              : visit(documents.child(documents.child(node, key), name), depth + 1),
            enumerable: true,
          });
        }
        output[key] = entries;
      } else if (
        mode === 'openapi-3.0' &&
        (key === 'exclusiveMinimum' || key === 'exclusiveMaximum')
      ) {
        if (typeof item !== 'boolean') {
          throw new ApiContractError('OpenAPI 3.0 exclusive bounds must be booleans', node.pointer);
        }
        const bound = key === 'exclusiveMinimum' ? 'minimum' : 'maximum';
        if (item) {
          if (typeof value[bound] !== 'number') {
            throw new ApiContractError(
              'Exclusive bound is missing its numeric bound',
              node.pointer
            );
          }
          output[key] = value[bound];
        }
      } else if (
        key === 'format' &&
        typeof item === 'string' &&
        ['int32', 'int64', 'float', 'double', 'binary', 'byte', 'password'].includes(item)
      ) {
        // These OpenAPI format names are handled below or retained as annotations.
      } else {
        Object.defineProperty(output, key, {
          value: item,
          enumerable: true,
          writable: true,
          configurable: true,
        });
      }
    }
    if (mode === 'openapi-3.0' && value.nullable === true && typeof value.type === 'string') {
      output.type = [value.type, 'null'];
    }
    // NestJS and similar generators describe a nullable reference in OpenAPI 3.0 as
    // `{ nullable: true, allOf: [{ $ref }] }`: without a type, accept null beside the composition.
    const nullableComposition =
      mode === 'openapi-3.0' &&
      value.nullable === true &&
      value.type === undefined &&
      (value.allOf !== undefined || value.anyOf !== undefined || value.oneOf !== undefined);
    if (Array.isArray(output.required) && output.properties) {
      output.required = output.required.filter((key) => !omittedFields.has(String(key)));
    }
    if (value.format === 'byte') {
      output.allOf = [
        ...(Array.isArray(output.allOf) ? output.allOf : []),
        {
          type: 'string',
          pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
        },
      ];
    }
    if (value.format === 'int32') {
      output.minimum = Math.max(
        typeof output.minimum === 'number' ? output.minimum : -2147483648,
        -2147483648
      );
      output.maximum = Math.min(
        typeof output.maximum === 'number' ? output.maximum : 2147483647,
        2147483647
      );
    }
    return nullableComposition ? { anyOf: [output, { type: 'null' }] } : output;
  };
  const schema = visit(from, 0);
  if (typeof schema === 'boolean') {
    return { schema, dialect };
  }
  return {
    schema: {
      ...schema,
      [definitionsKey]: { ...object(schema[definitionsKey] ?? {}), ...definitions },
    },
    dialect,
  };
}
