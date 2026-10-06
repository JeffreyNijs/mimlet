import type { JsonSchema, SchemaDialect } from '@mimlet/json-schema';

const escape = (name: string) => name.replace(/~/g, '~0').replace(/\//g, '~1');
const maps = new Set([
  'properties',
  'patternProperties',
  '$defs',
  'definitions',
  'dependentSchemas',
]);
const singles = new Set([
  'additionalProperties',
  'additionalItems',
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
const lists = new Set(['allOf', 'anyOf', 'oneOf']);
/** Keywords that let an object hold properties its `properties` do not declare. */
const openers = ['additionalProperties', 'patternProperties', 'unevaluatedProperties'];
/**
 * A copy of a declaration input in which every object schema that declares at least one
 * property and none of `additionalProperties`, `patternProperties` and `unevaluatedProperties`
 * has `additionalProperties: false`, so its declaration has no index signature. An object
 * schema without properties (a free-form object) stays open. Only schema positions are visited.
 */
export function closeObjects(schema: JsonSchema): JsonSchema {
  if (typeof schema === 'boolean') {
    return schema;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    let next = value;
    if ((maps.has(key) || key === 'dependencies') && value && typeof value === 'object') {
      next = Object.fromEntries(
        Object.entries(value as Record<string, JsonSchema | string[]>).map(([name, child]) => [
          name,
          Array.isArray(child) ? child : closeObjects(child),
        ])
      );
    } else if (
      (lists.has(key) || key === 'prefixItems' || key === 'items') &&
      Array.isArray(value)
    ) {
      next = (value as JsonSchema[]).map(closeObjects);
    } else if ((singles.has(key) || key === 'items') && value !== null && value !== undefined) {
      next = closeObjects(value as JsonSchema);
    }
    Object.defineProperty(result, key, {
      value: next,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }
  // `properties: {}` (a NestJS class without documented properties) declares nothing: closing
  // it would give the type `{}`, which accepts any value, so it stays a free-form object.
  const declares =
    result.properties !== null &&
    typeof result.properties === 'object' &&
    !Array.isArray(result.properties) &&
    Object.keys(result.properties).length > 0;
  if (declares && openers.every((keyword) => result[keyword] === undefined)) {
    result.additionalProperties = false;
  }
  return result;
}
/**
 * Whether the declaration of `schema` is a plain object type without an index signature, so
 * `with()` takes a `Partial` of it: an object type that declares its properties, closes them
 * with `additionalProperties: false` and does not combine or reference other schemas.
 */
export function plainObjectType(schema: JsonSchema): boolean {
  if (typeof schema !== 'object' || schema === null) {
    return false;
  }
  return (
    schema.type === 'object' &&
    schema.additionalProperties === false &&
    schema.properties !== null &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties) &&
    [
      'patternProperties',
      'unevaluatedProperties',
      'allOf',
      'anyOf',
      'oneOf',
      'not',
      'if',
      'then',
      'else',
      '$ref',
      '$dynamicRef',
      '$recursiveRef',
      'enum',
      'const',
      'tsType',
    ].every((keyword) => schema[keyword] === undefined)
  );
}
interface Prepared {
  readonly schema: JsonSchema;
  readonly locations: Map<string, string>;
}
/** The declaration compiler understands tuple-form items, not 2020-12 prefixItems. */
export function declarationInputs(
  source: JsonSchema,
  references: Readonly<Record<string, JsonSchema>>,
  dialect: SchemaDialect
): { schema: JsonSchema; references: Record<string, JsonSchema> } {
  function prepare(input: JsonSchema): Prepared {
    const locations = new Map<string, string>();
    const visit = (schema: JsonSchema, before: string, after: string): JsonSchema => {
      locations.set(before, after);
      if (typeof schema === 'boolean') {
        return schema;
      }
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(schema)) {
        if (
          dialect === 'draft-07' &&
          schema.$ref !== undefined &&
          !['$id', '$schema', '$ref', 'definitions'].includes(key)
        ) {
          continue;
        }
        let name = key;
        if (dialect === 'draft-2020-12') {
          if (key === 'prefixItems') {
            name = 'items';
          } else if (key === 'items' && schema.prefixItems !== undefined) {
            name = 'additionalItems';
          }
        }
        const oldPath = `${before}/${escape(key)}`;
        const newPath = `${after}/${escape(name)}`;
        let next = value;
        if (maps.has(key) || key === 'dependencies') {
          next = Object.fromEntries(
            Object.entries(value as Record<string, JsonSchema | string[]>).map(
              ([property, child]) => [
                property,
                Array.isArray(child)
                  ? child
                  : visit(
                      child,
                      `${oldPath}/${escape(property)}`,
                      `${newPath}/${escape(property)}`
                    ),
              ]
            )
          );
        } else if (
          lists.has(key) ||
          key === 'prefixItems' ||
          (key === 'items' && Array.isArray(value))
        ) {
          next = (value as JsonSchema[]).map((child, index) =>
            visit(child, `${oldPath}/${index}`, `${newPath}/${index}`)
          );
        } else if (singles.has(key) || key === 'items') {
          next = visit(value as JsonSchema, oldPath, newPath);
        }
        Object.defineProperty(result, name, {
          value: next,
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
      return result;
    };
    return { schema: visit(input, '', ''), locations };
  }
  const root = prepare(source);
  const external = new Map(
    Object.entries(references).map(([uri, schema]) => [uri, prepare(schema)])
  );
  function rewrite(value: unknown, document: Prepared): void {
    if (!value || typeof value !== 'object') {
      return;
    }
    const node = value as Record<string, unknown>;
    if (typeof node.$ref === 'string') {
      const [uri = '', encoded] = node.$ref.split('#');
      const referred = uri === '' ? document : external.get(uri);
      if (encoded !== undefined && referred) {
        const pointer = decodeURIComponent(encoded);
        const path = referred.locations.get(pointer);
        if (path !== undefined) {
          node.$ref = `${uri}#${encodeURI(path)}`;
        }
      }
    }
    // Only schema positions are visited: default/enum/example data may contain literal $refs.
    for (const [key, child] of Object.entries(node)) {
      if (maps.has(key) || key === 'dependencies') {
        for (const item of Object.values(child as object)) {
          if (!Array.isArray(item)) {
            rewrite(item, document);
          }
        }
      } else if (lists.has(key) || (key === 'items' && Array.isArray(child))) {
        for (const item of child as unknown[]) {
          rewrite(item, document);
        }
      } else if (singles.has(key) || key === 'items') {
        rewrite(child, document);
      }
    }
  }
  rewrite(root.schema, root);
  for (const document of external.values()) {
    rewrite(document.schema, document);
  }
  return {
    schema: root.schema,
    references: Object.fromEntries([...external].map(([uri, value]) => [uri, value.schema])),
  };
}
