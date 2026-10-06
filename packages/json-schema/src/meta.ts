/**
 * A quick check that a schema satisfies its dialect's meta-schema, so the validator can skip
 * compiling the meta-schema itself (several milliseconds in every new process).
 *
 * It only ever answers "certainly valid": every keyword it accepts has a value of the kind the
 * meta-schema requires. Anything else (an unfamiliar keyword, `$id`, anchors, an unusual value)
 * returns false, and the validator's full meta-schema validation then runs as before and
 * reports any error in the same words. So a schema that this check accepts is one the
 * meta-schema accepts, and the outcome of preparing any schema is unchanged. It also applies
 * the formats the meta-schemas name (`regex`, `uri`, `uri-reference`) with the validator's own
 * format functions. Ajv does not check formats during meta-schema validation, so this only
 * makes the check stricter, and keeps it sound if a later Ajv version does.
 */
import type { SchemaDialect } from './schema.js';

/** Root `$schema` values that select the validator's default meta-schema in each dialect. */
const rootDialects: Readonly<Record<SchemaDialect, ReadonlySet<string>>> = {
  'draft-07': new Set([
    'http://json-schema.org/draft-07/schema#',
    'http://json-schema.org/draft-07/schema',
  ]),
  'draft-2019-09': new Set(['https://json-schema.org/draft/2019-09/schema']),
  'draft-2020-12': new Set(['https://json-schema.org/draft/2020-12/schema']),
};
const simpleTypes = new Set(['array', 'boolean', 'integer', 'null', 'number', 'object', 'string']);
const strings = new Set([
  '$comment',
  'title',
  'description',
  'format',
  'contentEncoding',
  'contentMediaType',
]);
const booleans = new Set(['readOnly', 'writeOnly', 'deprecated', 'uniqueItems']);
const numbers = new Set(['maximum', 'minimum', 'exclusiveMaximum', 'exclusiveMinimum']);
const counts = new Set([
  'maxLength',
  'minLength',
  'maxItems',
  'minItems',
  'maxProperties',
  'minProperties',
  'maxContains',
  'minContains',
]);
const subschemas = new Set([
  'additionalItems',
  'contains',
  'additionalProperties',
  'propertyNames',
  'not',
  'if',
  'then',
  'else',
  'unevaluatedProperties',
  'unevaluatedItems',
  'contentSchema',
]);
const schemaMaps = new Set(['properties', '$defs', 'definitions', 'dependentSchemas']);
const schemaLists = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);

type JsonRecord = Readonly<Record<string, unknown>>;
const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = (value: unknown) => Number.isInteger(value) && (value as number) >= 0;
const isUniqueStrings = (value: unknown) =>
  Array.isArray(value) &&
  value.every((item) => typeof item === 'string') &&
  new Set(value).size === value.length;
const isPrimitive = (value: unknown) =>
  value === null || ['string', 'number', 'boolean'].includes(typeof value);

/**
 * Whether the format the validator registered under `name` accepts `value`, decided the way a
 * compiled `format` keyword decides it. Unknown or asynchronous formats are not decided here.
 */
function acceptsFormat(
  formats: Readonly<Record<string, unknown>>,
  name: string,
  value: string
): boolean {
  const definition = Object.hasOwn(formats, name) ? formats[name] : undefined;
  const check =
    definition instanceof RegExp || typeof definition === 'function'
      ? definition
      : isRecord(definition) && definition.async !== true
        ? definition.validate
        : undefined;
  if (check instanceof RegExp) {
    return !check.global && !check.sticky && check.test(value);
  }
  return typeof check === 'function' && (check as (value: string) => unknown)(value) === true;
}

/**
 * True when `schema` certainly satisfies the meta-schema of `dialect` as the validator with
 * these `formats` would check it; false when unsure. See the module comment.
 */
export function certainlyValidSchema(
  schema: unknown,
  dialect: SchemaDialect,
  formats: Readonly<Record<string, unknown>>
): boolean {
  let nodes = 0;
  const valid = (node: unknown, depth: number): boolean => {
    if (typeof node === 'boolean') {
      return true;
    }
    if (!isRecord(node) || ++nodes > 100_000 || depth > 256) {
      return false;
    }
    const all = (items: ReadonlyArray<unknown>) => items.every((item) => valid(item, depth + 1));
    for (const key of Object.keys(node)) {
      const value = node[key];
      let accepted: boolean;
      if (key === '$schema') {
        accepted =
          typeof value === 'string' &&
          (depth === 0 ? rootDialects[dialect].has(value) : acceptsFormat(formats, 'uri', value));
      } else if (key === '$ref') {
        accepted = typeof value === 'string' && acceptsFormat(formats, 'uri-reference', value);
      } else if (strings.has(key)) {
        accepted = typeof value === 'string';
      } else if (key === 'default' || key === 'const') {
        accepted = true;
      } else if (key === 'examples') {
        accepted = Array.isArray(value);
      } else if (booleans.has(key)) {
        accepted = typeof value === 'boolean';
      } else if (numbers.has(key)) {
        accepted = typeof value === 'number';
      } else if (key === 'multipleOf') {
        accepted = typeof value === 'number' && value > 0;
      } else if (counts.has(key)) {
        accepted = isCount(value);
      } else if (key === 'type') {
        accepted =
          (typeof value === 'string' && simpleTypes.has(value)) ||
          (Array.isArray(value) &&
            value.length > 0 &&
            isUniqueStrings(value) &&
            value.every((item) => simpleTypes.has(item as string)));
      } else if (key === 'enum') {
        // Draft-07 also requires a nonempty list of distinct values.
        accepted =
          Array.isArray(value) &&
          (dialect !== 'draft-07' ||
            (value.length > 0 && value.every(isPrimitive) && new Set(value).size === value.length));
      } else if (key === 'pattern') {
        accepted = typeof value === 'string' && acceptsFormat(formats, 'regex', value);
      } else if (key === 'required') {
        accepted = isUniqueStrings(value);
      } else if (key === 'dependentRequired') {
        accepted = isRecord(value) && Object.values(value).every(isUniqueStrings);
      } else if (key === 'dependencies') {
        accepted =
          isRecord(value) &&
          Object.values(value).every((item) => isUniqueStrings(item) || valid(item, depth + 1));
      } else if (key === 'items') {
        accepted =
          valid(value, depth + 1) ||
          (dialect !== 'draft-2020-12' && Array.isArray(value) && value.length > 0 && all(value));
      } else if (subschemas.has(key)) {
        accepted = valid(value, depth + 1);
      } else if (schemaLists.has(key)) {
        accepted = Array.isArray(value) && value.length > 0 && all(value);
      } else if (schemaMaps.has(key)) {
        accepted = isRecord(value) && all(Object.values(value));
      } else if (key === 'patternProperties') {
        accepted =
          isRecord(value) &&
          Object.keys(value).every((pattern) => acceptsFormat(formats, 'regex', pattern)) &&
          all(Object.values(value));
      } else {
        // $id, anchors, vocabularies and extension keywords: leave them to the validator.
        accepted = false;
      }
      if (!accepted) {
        return false;
      }
    }
    return true;
  };
  return valid(schema, 0);
}
