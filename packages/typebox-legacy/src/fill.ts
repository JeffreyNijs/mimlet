/**
 * Deterministic creation fill. Native `Value.Create` cannot create strings with a format or
 * pattern, unique arrays, or a union whose first member creates an invalid value, and it reads
 * the clock for dates. The fill prepares a creation-only copy of the schema with `default`
 * annotations where native creation would fail; checks and validation keep the original schema.
 * Nodes that native creation handles stay untouched, so their values do not change.
 *
 * This file is kept identical in @mimlet/typebox and @mimlet/typebox-legacy; the library
 * differences live in the `FillNative` operations each adapter supplies.
 */
import { BuilderGenerationError } from '@mimlet/core';

export interface TypeBoxFill {
  /**
   * Canonical ISO UTC instant for dates and for date-time, date and time strings.
   * Default: the session's `referenceDate()`.
   */
  readonly now?: string;
  /** Sample strings by format name, merged over the built-in samples. */
  readonly formats?: Readonly<Record<string, string>>;
  /** Candidates for `pattern` strings. The first that passes the string's own check is used. */
  readonly patterns?: ReadonlyArray<string>;
}
export interface FillSettings {
  readonly now: string | undefined;
  readonly formats: Readonly<Record<string, string>>;
  readonly patterns: ReadonlyArray<string>;
}
export type Node = Record<PropertyKey, unknown>;
export interface FillScope<References> {
  /** Original references, for checks. */
  readonly check: References;
  /** Prepared references, for creation. */
  readonly create: References;
}
export interface FillNative<References> {
  kind(node: Node): unknown;
  create(node: Node, scope: FillScope<References>): unknown;
  check(node: Node, scope: FillScope<References>, value: unknown): boolean;
  clone<T>(value: T): T;
  /** The scope inside a node, for example with its `$defs`. */
  enter(node: Node, scope: FillScope<References>): FillScope<References>;
}

/** A fill that cannot be satisfied. It names the location, never a fixture value. */
export class FillFailure extends BuilderGenerationError {}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isNode = (value: unknown): value is Node => typeof value === 'object' && value !== null;

/** Validate options once, when the adapter is created. `false` disables the fill. */
export function fillSettings(fill: TypeBoxFill | false | undefined): FillSettings | undefined {
  if (fill === false) {
    return undefined;
  }
  if (fill !== undefined && !isNode(fill)) {
    throw new TypeError('fill must be an options object or false');
  }
  const { now, formats = {}, patterns = [] } = fill ?? {};
  if (
    now !== undefined &&
    (typeof now !== 'string' ||
      !Number.isFinite(Date.parse(now)) ||
      new Date(now).toISOString() !== now)
  ) {
    throw new TypeError('fill.now must be a canonical ISO UTC date string');
  }
  if (
    typeof formats !== 'object' ||
    formats === null ||
    Object.values(formats).some((sample) => typeof sample !== 'string')
  ) {
    throw new TypeError('fill.formats must map format names to sample strings');
  }
  if (!Array.isArray(patterns) || patterns.some((candidate) => typeof candidate !== 'string')) {
    throw new TypeError('fill.patterns must be an array of strings');
  }
  return Object.freeze({
    now,
    formats: Object.freeze({ ...formats }),
    patterns: Object.freeze([...(patterns as ReadonlyArray<string>)]),
  });
}

/** Identity of the fill configuration; bump the version when fill output changes. */
export function fillIdentity(settings: FillSettings | undefined): unknown {
  return settings
    ? {
        fill: 'deterministic-fill-v1',
        now: settings.now ?? null,
        formats: Object.entries(settings.formats).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        patterns: settings.patterns,
      }
    : { fill: false };
}

function samples(now: string): Readonly<Record<string, string>> {
  return {
    'date-time': now,
    date: now.slice(0, 10),
    time: `${now.slice(11, 19)}Z`,
    email: 'user@example.com',
    hostname: 'example.com',
    uri: 'https://example.com/',
    url: 'https://example.com/',
    uuid: '00000000-0000-4000-8000-000000000000',
    ipv4: '192.0.2.1',
    ipv6: '2001:db8::1',
  };
}

function copy(node: Node, changes: Readonly<Record<string, unknown>>, remove?: string): Node {
  const descriptors = Object.getOwnPropertyDescriptors(node);
  if (remove !== undefined) {
    Reflect.deleteProperty(descriptors, remove);
  }
  for (const [key, value] of Object.entries(changes)) {
    descriptors[key] = { value, enumerable: true, writable: true, configurable: true };
  }
  return Object.create(Object.getPrototypeOf(node) as object | null, descriptors) as Node;
}

/** A JSON pointer to the value, where `*` stands for any array item. */
function pointer(path: ReadonlyArray<string>, reference: string | undefined): string {
  const location = path.length
    ? path.map((key) => `/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`).join('')
    : 'the root';
  return reference === undefined
    ? location
    : `${location} of reference ${JSON.stringify(reference)}`;
}

/** Candidates near the native value and the declared bounds, in a fixed order. */
function numbers(node: Node, lowerKeys: string[], upperKeys: string[], stepKey: string): number[] {
  const lower = lowerKeys.map((key) => node[key]).filter(isNumber);
  const upper = upperKeys.map((key) => node[key]).filter(isNumber);
  const values = [
    ...lower.flatMap((bound) => [bound, Math.floor(bound) + 1, bound + 1]),
    ...upper.flatMap((bound) => [bound, Math.ceil(bound) - 1, bound - 1]),
    ...(lower.length && upper.length ? [(Math.max(...lower) + Math.min(...upper)) / 2] : []),
  ];
  const step = node[stepKey];
  return isNumber(step) && step > 0
    ? values.flatMap((value) => [Math.ceil(value / step) * step, Math.floor(value / step) * step])
    : values;
}

/** Literal values an array of unique items can draw from, in schema order. */
function literals(node: Node, kind: (node: Node) => unknown): unknown[] {
  if (Object.hasOwn(node, 'const')) {
    return [node['const']];
  }
  if (Array.isArray(node['enum'])) {
    return [...new Set(node['enum'] as unknown[])];
  }
  if (kind(node) === 'Boolean') {
    return [false, true];
  }
  const members = (node['anyOf'] ?? []) as Node[];
  return members.every((member) => Object.hasOwn(member, 'const'))
    ? [...new Set(members.map((member) => member['const']))]
    : [];
}

export interface PreparedFill<References> {
  /** A creation-only copy of `node`, or `node` itself when nothing needs filling. */
  node(node: Node, scope: FillScope<References>): Node;
  /** Like `node`, but an unfillable reference only fails when native creation reaches it. */
  reference(name: string, node: Node, scope: FillScope<References>): Node;
}

export function prepareFill<References>(
  native: FillNative<References>,
  settings: FillSettings,
  now: Date
): PreparedFill<References> {
  const iso = now.toISOString();
  const formats = { ...samples(iso), ...settings.formats };
  const fixed = (node: Node, value: unknown) => copy(node, { default: () => native.clone(value) });
  const passes = (node: Node, scope: FillScope<References>, value: unknown) => {
    try {
      return native.check(node, scope, value);
    } catch {
      return false;
    }
  };
  const nativeError = (node: Node, scope: FillScope<References>) => {
    try {
      native.create(node, scope);
      return undefined;
    } catch (error) {
      return error;
    }
  };
  const fail = (
    node: Node,
    scope: FillScope<References>,
    location: string,
    reason: string,
    hint: string
  ) =>
    new FillFailure(
      `TypeBox could not create a value at ${location}: ${reason}. ${hint}, or supply fromTypeBoxFactory() for this schema`,
      nativeError(node, scope)
    );

  function visit(
    node: Node,
    path: ReadonlyArray<string>,
    outer: FillScope<References>,
    reference: string | undefined
  ): Node {
    if (!isNode(node) || Object.hasOwn(node, 'default')) {
      return node;
    }
    const scope = native.enter(node, outer);
    const child = (value: unknown, key?: string) =>
      visit(value as Node, key === undefined ? path : [...path, key], scope, reference);
    const location = () => pointer(path, reference);
    switch (native.kind(node)) {
      case 'String': {
        const { format, pattern } = node;
        if (format === undefined && pattern === undefined) {
          return node;
        }
        const candidates = [
          ...(typeof format === 'string' && Object.hasOwn(formats, format)
            ? [formats[format]]
            : []),
          ...(pattern === undefined ? [] : settings.patterns),
        ];
        const found = candidates.find((candidate) => passes(node, scope, candidate));
        if (found !== undefined) {
          return fixed(node, found);
        }
        throw typeof format === 'string'
          ? fail(
              node,
              scope,
              location(),
              `no sample for format ${JSON.stringify(format)} passes this string's checks`,
              'Add one to fill.formats or register the format'
            )
          : fail(
              node,
              scope,
              location(),
              "no fill.patterns candidate passes this string's checks",
              'Add one to fill.patterns'
            );
      }
      case 'Number':
      case 'Integer': {
        if (passes(node, scope, native.create(node, scope))) {
          return node;
        }
        const found = numbers(
          node,
          ['minimum', 'exclusiveMinimum'],
          ['maximum', 'exclusiveMaximum'],
          'multipleOf'
        ).find((candidate) => passes(node, scope, candidate));
        return found === undefined ? node : fixed(node, found);
      }
      case 'Date': {
        // Native creation reads the clock unless a minimum is declared.
        if (node['minimumTimestamp'] !== undefined) {
          return node;
        }
        const found = [
          now.getTime(),
          ...numbers(
            node,
            ['exclusiveMinimumTimestamp'],
            ['maximumTimestamp', 'exclusiveMaximumTimestamp'],
            'multipleOfTimestamp'
          ),
        ]
          .map((time) => new Date(time))
          .find((date) => passes(node, scope, date));
        return fixed(node, found ?? new Date(now.getTime()));
      }
      case 'Array': {
        const minimum = isNumber(node['minItems']) ? node['minItems'] : 0;
        if (node['uniqueItems'] === true && !Object.hasOwn(node, 'contains')) {
          if (minimum <= 1) {
            // At most one item is always unique, so create the array without the constraint.
            return copy(
              node,
              minimum === 1 ? { items: child(node['items'], '*') } : {},
              'uniqueItems'
            );
          }
          const values = literals(node['items'] as Node, native.kind);
          if (values.length < minimum) {
            throw fail(
              node,
              scope,
              location(),
              `fewer than ${minimum} distinct literal values are available for this unique array`,
              'Add a default to the schema'
            );
          }
          return fixed(node, values.slice(0, minimum));
        }
        if (minimum === 0) {
          return node;
        }
        const items = child(node['items'], '*');
        return items === node['items'] ? node : copy(node, { items });
      }
      case 'Tuple': {
        // An empty legacy tuple has no items array.
        const items = (node['items'] ?? []) as Node[];
        const prepared = items.map((item, index) =>
          index < (node['minItems'] as number) ? child(item, String(index)) : item
        );
        return prepared.every((item, index) => item === items[index])
          ? node
          : copy(node, { items: prepared });
      }
      case 'Object': {
        // Native creation only creates required properties, which are always declared.
        const properties = node['properties'] as Node;
        const changes: Record<string, unknown> = {};
        for (const key of (node['required'] ?? []) as string[]) {
          const prepared = child(properties[key], key);
          if (prepared !== properties[key]) {
            changes[key] = prepared;
          }
        }
        return Object.keys(changes).length
          ? copy(node, { properties: copy(properties, changes) })
          : node;
      }
      case 'Intersect': {
        const members = node['allOf'] as Node[];
        const prepared = members.map((member) => child(member));
        return prepared.every((member, index) => member === members[index])
          ? node
          : copy(node, { allOf: prepared });
      }
      case 'Union': {
        // Try members in order, once each: the first value that passes the whole union wins.
        const members = node['anyOf'] as Node[];
        let first: unknown;
        for (const [index, member] of members.entries()) {
          try {
            const prepared = child(member);
            const value = native.create(prepared, scope);
            if (passes(node, scope, value)) {
              if (index > 0) {
                return fixed(node, value);
              }
              return prepared === member
                ? node
                : copy(node, { anyOf: [prepared, ...members.slice(1)] });
            }
          } catch (error) {
            first ??= error;
          }
        }
        if (first instanceof FillFailure) {
          throw first;
        }
        return node;
      }
      case 'Cyclic':
      case 'Import': {
        const definitions = node['$defs'] as Node;
        const changes: Record<string, unknown> = {};
        for (const [name, definition] of Object.entries(definitions)) {
          const prepared = named(name, definition as Node, scope);
          if (prepared !== definition) {
            changes[name] = prepared;
          }
        }
        return Object.keys(changes).length
          ? copy(node, { $defs: copy(definitions, changes) })
          : node;
      }
      default:
        return node;
    }
  }
  /** A definition or reference: an unfillable one fails only if native creation reaches it. */
  function named(name: string, node: Node, scope: FillScope<References>): Node {
    try {
      return visit(node, [], scope, name);
    } catch (error) {
      return copy(node, {
        default: () => {
          throw error;
        },
      });
    }
  }
  return {
    node: (node, scope) => visit(node, [], scope, undefined),
    reference: named,
  };
}

/**
 * A stable fingerprint of a native schema, including symbol and non-enumerable keys such as
 * TypeBox kinds. Functions (codecs, transforms, custom checks) cannot be fingerprinted and
 * count only as present.
 */
export function fingerprint(value: unknown): string {
  const active = new Set<object>();
  const canonical = (item: unknown): string => {
    switch (typeof item) {
      case 'string':
        return JSON.stringify(item);
      case 'number':
        return Object.is(item, -0) ? '-0' : String(item);
      case 'bigint':
        return `${item}n`;
      case 'boolean':
        return String(item);
      case 'undefined':
        return 'undefined';
      case 'symbol':
        return `@${JSON.stringify(item.description ?? '')}`;
      case 'function':
        return 'function';
    }
    if (typeof item !== 'object' || item === null) {
      return 'null';
    }
    if (active.has(item)) {
      return 'cycle';
    }
    active.add(item);
    let result: string;
    if (item instanceof Date) {
      result = `date(${item.getTime()})`;
    } else if (item instanceof RegExp) {
      result = `regexp(${JSON.stringify(String(item))})`;
    } else if (ArrayBuffer.isView(item)) {
      result = `bytes(${new Uint8Array(item.buffer, item.byteOffset, item.byteLength).join(',')})`;
    } else if (Array.isArray(item)) {
      result = `[${item.map(canonical).join(',')}]`;
    } else {
      const entries = Reflect.ownKeys(item).map((key) => {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        return {
          name:
            typeof key === 'symbol'
              ? `@${JSON.stringify(key.description ?? '')}`
              : JSON.stringify(key),
          entry: descriptor && 'value' in descriptor ? canonical(descriptor.value) : 'accessor',
        };
      });
      entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      result = `{${entries.map(({ name, entry }) => `${name}:${entry}`).join(',')}}`;
    }
    active.delete(item);
    return result;
  };
  const text = canonical(value);
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < text.length; index += 1) {
    hash = BigInt.asUintN(64, (hash ^ BigInt(text.charCodeAt(index))) * 0x100000001b3n);
  }
  return `typebox-fnv1a64-v1:${hash.toString(16).padStart(16, '0')}`;
}
