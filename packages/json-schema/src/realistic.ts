import type { GenerationSession } from '@mimlet/core';
import { copyJson, resolveUri, unpointer, type JsonSchema, type SchemaLimits } from './schema.js';

/** Part of the replay identity. Change it whenever realistic candidates change. */
export const realisticIdentity = 'realistic-v1';

/** Unconstrained numbers are drawn from this window; declared bounds always win. */
const preferred = { minimum: 1, maximum: 100 } as const;
/** A declared range at most this wide is already plausible and is kept as it is. */
const narrowRange = 1000;
const readableLength = 24;
const words = [
  'amber',
  'anchor',
  'aspen',
  'atlas',
  'beacon',
  'birch',
  'breeze',
  'bridge',
  'canyon',
  'cedar',
  'clover',
  'comet',
  'coral',
  'crest',
  'delta',
  'ember',
  'falcon',
  'fern',
  'field',
  'forest',
  'garden',
  'harbor',
  'hazel',
  'horizon',
  'island',
  'juniper',
  'lagoon',
  'lantern',
  'maple',
  'meadow',
  'mesa',
  'north',
  'oak',
  'ocean',
  'orchard',
  'pebble',
  'pine',
  'prairie',
  'quartz',
  'river',
  'saffron',
  'sierra',
  'spruce',
  'summit',
  'tide',
  'timber',
  'valley',
  'willow',
] as const;

type Node = Record<string, unknown>;
const record = (value: unknown): value is Node =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const types = (node: Node): readonly unknown[] | undefined =>
  typeof node.type === 'string' ? [node.type] : Array.isArray(node.type) ? node.type : undefined;
const finite = (node: Node) => node.const !== undefined || node.enum !== undefined;
const nullOnly = (schema: unknown) =>
  record(schema) &&
  Object.keys(schema).every((key) => key === 'type') &&
  (schema.type === 'null' ||
    (Array.isArray(schema.type) && schema.type.length === 1 && schema.type[0] === 'null'));

/** Schema positions whose subschemas generate values. `not`, `if` and `propertyNames` are left alone. */
const singles = ['additionalProperties', 'items', 'contains', 'then', 'else'] as const;
const maps = ['properties', 'patternProperties', '$defs', 'dependentSchemas'] as const;
const lists = ['allOf', 'anyOf', 'oneOf', 'prefixItems'] as const;
/** Keywords whose values map names (which can be any string) to subschemas. */
const schemaMaps = new Set(['properties', 'patternProperties', 'dependentSchemas']);
const unresolved = Symbol('unresolved');

interface Document {
  readonly uri: string;
  readonly schema: JsonSchema;
  /** A nested `$id` changes the base of the references below it; treat them all as unknown. */
  readonly nestedIds: boolean;
}

/**
 * Finds the subschemas that can recurse. Required fields and non-empty arrays are only
 * added where the generated value cannot grow without bound through a `$ref` cycle.
 */
function recursion(documents: readonly Document[]) {
  const byUri = new Map<string, Document>();
  for (const document of documents) {
    byUri.set(resolveUri(document.uri, ''), document);
    if (record(document.schema) && typeof document.schema.$id === 'string') {
      byUri.set(resolveUri(document.schema.$id, document.uri), document);
    }
  }
  const base = (document: Document) =>
    record(document.schema) && typeof document.schema.$id === 'string'
      ? resolveUri(document.schema.$id, document.uri)
      : document.uri;
  const target = (reference: string, document: Document): Node | boolean | typeof unresolved => {
    if (document.nestedIds) {
      return unresolved;
    }
    const resolved = resolveUri(reference, base(document));
    const hash = resolved.indexOf('#');
    const uri = hash < 0 ? resolved : resolved.slice(0, hash);
    const fragment = hash < 0 ? '' : resolved.slice(hash + 1);
    const owner = uri === '' || uri === base(document) ? document : byUri.get(uri);
    if (!owner || (fragment !== '' && !fragment.startsWith('/'))) {
      return unresolved;
    }
    let value: unknown = owner.schema;
    let path: string[];
    try {
      path = unpointer(decodeURIComponent(fragment));
    } catch {
      return unresolved;
    }
    for (const key of path) {
      if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) {
        return unresolved;
      }
      value = (value as Node)[key];
    }
    return typeof value === 'boolean' || record(value) ? value : unresolved;
  };
  const owners = new WeakMap<object, Document>();
  const claim = (schema: unknown, document: Document): void => {
    if (!schema || typeof schema !== 'object' || owners.has(schema)) {
      return;
    }
    owners.set(schema, document);
    for (const child of Array.isArray(schema) ? schema : Object.values(schema)) {
      claim(child, document);
    }
  };
  for (const document of documents) {
    claim(document.schema, document);
  }
  /** The targets referenced in a subtree, without entering definitions or other targets. */
  const edges = (schema: unknown): Array<Node | boolean | typeof unresolved> => {
    const found: Array<Node | boolean | typeof unresolved> = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!record(value)) {
        return;
      }
      if (typeof value.$ref === 'string') {
        found.push(target(value.$ref, owners.get(value)!));
      }
      for (const [key, child] of Object.entries(value)) {
        if (schemaMaps.has(key) && record(child)) {
          Object.values(child).forEach(visit);
        } else if (!['$defs', 'const', 'enum', 'default', 'examples'].includes(key)) {
          // Definitions are only entered through a reference; instance data is never a schema.
          visit(child);
        }
      }
    };
    visit(schema);
    return found;
  };
  const memo = new WeakMap<object, boolean>();
  const visiting = new Set<object>();
  /** Whether a reference target is on, or leads to, a reference cycle or an unknown target. */
  const cyclic = (node: Node | boolean | typeof unresolved): boolean => {
    if (node === unresolved) {
      return true;
    }
    if (typeof node === 'boolean') {
      return false;
    }
    const known = memo.get(node);
    if (known !== undefined) {
      return known;
    }
    if (visiting.has(node)) {
      return true;
    }
    visiting.add(node);
    const result = edges(node).some(cyclic);
    visiting.delete(node);
    memo.set(node, result);
    return result;
  };
  const risky = new WeakMap<object, boolean>();
  return (schema: unknown): boolean => {
    if (!schema || typeof schema !== 'object') {
      return false;
    }
    let result = risky.get(schema);
    if (result === undefined) {
      result = edges(schema).some(cyclic);
      risky.set(schema, result);
    }
    return result;
  };
}

function narrowNumbers(node: Node): void {
  const declared = types(node);
  if (!declared?.some((type) => type === 'number' || type === 'integer')) {
    return;
  }
  let low = -Infinity;
  let high = Infinity;
  let lowExclusive = false;
  let highExclusive = false;
  if (typeof node.minimum === 'number') {
    low = node.minimum;
  }
  if (typeof node.exclusiveMinimum === 'number' && node.exclusiveMinimum >= low) {
    low = node.exclusiveMinimum;
    lowExclusive = true;
  }
  if (typeof node.maximum === 'number') {
    high = node.maximum;
  }
  if (typeof node.exclusiveMaximum === 'number' && node.exclusiveMaximum <= high) {
    high = node.exclusiveMaximum;
    highExclusive = true;
  }
  if (high - low <= narrowRange) {
    return;
  }
  const span = preferred.maximum - preferred.minimum;
  let from = Math.max(low, preferred.minimum);
  let to = Math.min(high, preferred.maximum);
  const empty = (a: number, b: number) =>
    a > b || (a === b && ((a === low && lowExclusive) || (b === high && highExclusive)));
  if (empty(from, to)) {
    // The declared range lies wholly below or above the preferred window: stay near its edge.
    [from, to] =
      high <= preferred.minimum
        ? [Math.max(low, high - span), high]
        : [low, Math.min(high, low + span)];
  }
  if (typeof node.multipleOf === 'number' && node.multipleOf > 0) {
    const multiple = Math.ceil(from / node.multipleOf) * node.multipleOf;
    if (multiple > to || (multiple === to && to === high && highExclusive)) {
      return;
    }
  }
  if (from > low) {
    node.minimum = from;
    delete node.exclusiveMinimum;
  }
  if (to < high) {
    node.maximum = to;
    delete node.exclusiveMaximum;
  }
}

function hint(schema: JsonSchema, risky: (schema: unknown) => boolean): void {
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (!record(value) || seen.has(value)) {
      return;
    }
    seen.add(value);
    const node = value;
    // A nullable field gets a value: drop the null alternative from the candidate copy only.
    if (Array.isArray(node.type) && node.type.includes('null') && node.type.length > 1) {
      node.type = node.type.filter((type) => type !== 'null');
    }
    const declared = types(node);
    for (const key of ['anyOf', 'oneOf'] as const) {
      const branches = node[key];
      if (Array.isArray(branches) && branches.some(nullOnly) && !branches.every(nullOnly)) {
        node[key] = branches.filter((branch) => !nullOnly(branch));
      }
    }
    if (!finite(node)) {
      narrowNumbers(node);
      const array =
        declared?.includes('array') || node.items !== undefined || node.prefixItems !== undefined;
      if (
        array &&
        node.contains === undefined &&
        !(node.items === false && node.prefixItems === undefined)
      ) {
        const minimum = typeof node.minItems === 'number' ? node.minItems : 0;
        const maximum = typeof node.maxItems === 'number' ? node.maxItems : Math.max(minimum, 3);
        const recursive =
          risky(node.items) ||
          (Array.isArray(node.prefixItems) && node.prefixItems.some((item) => risky(item)));
        const floor = recursive ? minimum : Math.max(minimum, Math.min(1, maximum));
        node.minItems = floor;
        node.maxItems = Math.min(maximum, Math.max(floor, 3));
      }
      if (record(node.properties)) {
        const required = new Set(
          Array.isArray(node.required) ? node.required.map((key) => String(key)) : []
        );
        const extra = Object.entries(node.properties)
          .filter(([key, child]) => !required.has(key) && child !== false && !risky(child))
          .map(([key]) => key);
        if (
          extra.length &&
          (typeof node.maxProperties !== 'number' ||
            required.size + extra.length <= node.maxProperties)
        ) {
          node.required = [...required, ...extra];
        }
      }
    }
    for (const key of singles) {
      visit(node[key]);
    }
    for (const key of maps) {
      if (record(node[key])) {
        Object.values(node[key]).forEach(visit);
      }
    }
    for (const key of lists) {
      if (Array.isArray(node[key])) {
        node[key].forEach(visit);
      }
    }
  };
  visit(schema);
}

/**
 * Candidate hints for the `realistic` profile: optional fields are filled, nullable fields get
 * a value, arrays hold one to three items and unconstrained numbers stay small. Only the
 * sampling copy changes; every candidate is still checked against the original schema.
 */
export function realisticHints(
  source: JsonSchema,
  references: ReadonlyMap<string, JsonSchema>,
  maximum: Required<SchemaLimits>
): { readonly schema: JsonSchema; readonly references: Map<string, JsonSchema> } {
  const hasNestedIds = (schema: unknown, depth = 0): boolean => {
    if (Array.isArray(schema)) {
      return schema.some((item) => hasNestedIds(item, depth + 1));
    }
    if (!record(schema)) {
      return false;
    }
    return Object.entries(schema).some(([key, child]) => {
      if (key === '$id') {
        return typeof child === 'string' && depth > 0;
      }
      if ((schemaMaps.has(key) || key === '$defs') && record(child)) {
        return Object.values(child).some((item) => hasNestedIds(item, depth + 1));
      }
      return (
        !['const', 'enum', 'default', 'examples'].includes(key) && hasNestedIds(child, depth + 1)
      );
    });
  };
  const document = (uri: string, schema: JsonSchema): Document => {
    const copy = copyJson(schema, maximum) as JsonSchema;
    return { uri, schema: copy, nestedIds: hasNestedIds(copy) };
  };
  const root = document('', source);
  const supplied = [...references].map(([uri, schema]) => document(uri, schema));
  const risky = recursion([root, ...supplied]);
  for (const { schema } of [root, ...supplied]) {
    hint(schema, risky);
  }
  return {
    schema: root.schema,
    references: new Map(supplied.map(({ uri, schema }) => [uri, schema])),
  };
}

function readable(stream: GenerationSession, minimum: number, maximum: number): string {
  const lower = Math.min(Math.max(minimum, 3), maximum);
  const upper = Math.min(maximum, Math.max(lower, readableLength));
  if (upper <= 0) {
    return '';
  }
  const count = stream.integer(1, 3);
  let text = '';
  let previous = -1;
  for (let index = 0; (index < count || text.length < lower) && text.length < upper; index++) {
    // Never repeat the previous word; the shift keeps one draw per word.
    let next = stream.integer(0, words.length - 1);
    next = next === previous ? (next + 1) % words.length : next;
    previous = next;
    text = text ? `${text} ${words[next]}` : `${words[next]}`;
  }
  if (text.length > upper) {
    // Prefer whole words; cut inside a word only when the minimum length requires it.
    const space = text.lastIndexOf(' ', upper);
    text = space >= lower && space > 0 ? text.slice(0, space) : text.slice(0, upper);
  }
  if (text.endsWith(' ')) {
    text = `${text.slice(0, -1)}s`;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function within(value: number, node: Node): boolean {
  return (
    (typeof node.minimum !== 'number' || value >= node.minimum) &&
    (typeof node.maximum !== 'number' || value <= node.maximum) &&
    (typeof node.exclusiveMinimum !== 'number' || value > node.exclusiveMinimum) &&
    (typeof node.exclusiveMaximum !== 'number' || value < node.exclusiveMaximum)
  );
}

/**
 * Replaces a sampled plain string with readable words and rounds a sampled decimal to two
 * places. Formats, patterns, enums, constants and schema examples keep the provider's value.
 */
export function realisticValue(
  value: unknown,
  schema: unknown,
  stream: GenerationSession,
  examples: boolean
): unknown {
  if (!record(schema) || finite(schema)) {
    return value;
  }
  if (examples && Array.isArray(schema.examples) && schema.examples.length > 0) {
    return value;
  }
  const declared = types(schema);
  if (typeof value === 'string') {
    if (
      schema.format !== undefined ||
      schema.pattern !== undefined ||
      schema.contentEncoding !== undefined ||
      schema.contentMediaType !== undefined ||
      (declared !== undefined && !declared.includes('string'))
    ) {
      return value;
    }
    const minimum = typeof schema.minLength === 'number' ? schema.minLength : 0;
    const maximum = typeof schema.maxLength === 'number' ? schema.maxLength : Infinity;
    return readable(stream, minimum, maximum);
  }
  if (typeof value === 'number' && !Number.isInteger(value) && schema.multipleOf === undefined) {
    const rounded = Math.round(value * 100) / 100;
    return within(rounded, schema) ? rounded : value;
  }
  return value;
}
