import { facadeClass, facadeMethods } from './facade-class.js';
import type { FacadeFor } from './facade.js';
import type { AnyFactory, BuilderDescription, BuilderPatch } from './types.js';

type Source = { buildAsync: AnyFactory; describe(): BuilderDescription };
type Input<B extends Source> = Awaited<ReturnType<B['buildAsync']>>;
type PatchKey<I> = [I] extends [object]
  ? string extends keyof I
    ? never
    : number extends keyof I
      ? never
      : symbol extends keyof I
        ? never
        : [Partial<I>] extends [BuilderPatch<I>]
          ? Extract<keyof I, string>
          : never
  : never;
type Selection<I> = readonly PatchKey<I>[] | Readonly<Record<string, PatchKey<I>>>;
type IsUnion<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type Single<T> = true extends IsUnion<T> ? never : string extends T ? never : T;
type Letter =
  | 'a'
  | 'b'
  | 'c'
  | 'd'
  | 'e'
  | 'f'
  | 'g'
  | 'h'
  | 'i'
  | 'j'
  | 'k'
  | 'l'
  | 'm'
  | 'n'
  | 'o'
  | 'p'
  | 'q'
  | 'r'
  | 's'
  | 't'
  | 'u'
  | 'v'
  | 'w'
  | 'x'
  | 'y'
  | 'z';
type AlphaNumeric =
  Letter | Uppercase<Letter> | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9';
type Pascal<
  S extends string,
  Word extends string = '',
  Result extends string = '',
  Depth extends 0[] = [],
> = S extends ''
  ? `${Result}${Capitalize<Word>}`
  : Depth['length'] extends 64
    ? never
    : S extends `${infer Head}${infer Tail}`
      ? Head extends AlphaNumeric
        ? Pascal<Tail, `${Word}${Head}`, Result, [...Depth, 0]>
        : Pascal<Tail, '', `${Result}${Capitalize<Word>}`, [...Depth, 0]>
      : never;
type Method<K extends string> = `with${Pascal<K> extends '' ? 'Value' : Pascal<K>}`;
type FieldMap<S> = S extends readonly string[] ? { [K in S[number] as Method<K>]: K } : S;
type LiteralSelection<S> = S extends readonly string[]
  ? number extends S['length']
    ? never
    : {
        readonly [K in keyof S]: S[K] extends string
          ? Method<S[K]> extends never
            ? never
            : Single<S[K]>
          : never;
      }
  : string extends keyof S
    ? never
    : { readonly [K in keyof S]: Single<S[K]> };

/**
 * What a patch may assign to one field. Indexed access adds `undefined` to every optional key,
 * so keep it only where the property accepts it (respecting `exactOptionalPropertyTypes`).
 */
type SetterValue<T, K extends keyof T> =
  { [P in K]: undefined } extends Pick<T, K> ? T[K] : Exclude<T[K], undefined>;

/** Names fluent() never adds as a setter or carries over from the builder it wraps. */
type Capability =
  | 'with'
  | 'replace'
  | 'withFactory'
  | 'replaceFactory'
  | 'omit'
  | 'transform'
  | 'transformAsync'
  | 'usingValidation'
  | 'build'
  | 'buildAsync'
  | 'buildList'
  | 'buildListAsync'
  | 'describe'
  | 'buildValidated'
  | 'buildValidatedAsync'
  | 'buildValidatedList'
  | 'buildValidatedListAsync'
  | 'constructor'
  | 'then'
  | 'toJSON';
/**
 * The methods a builder has beyond its capabilities, such as the setters of an inner fluent()
 * call or the methods of a generated class. fluent() keeps them.
 */
type Kept<B> = {
  [
    K in Extract<keyof B, string> as K extends Capability
      ? never
      : B[K] extends (...args: never[]) => unknown
        ? K
        : never
  ]: B[K];
};
/** A kept method returns the outer builder wherever the wrapped one returned itself. */
type Forwarded<F, B, Self> = F extends (...args: infer A) => infer R
  ? (...args: A) => R extends B ? Self : R
  : never;

/**
 * Named input setters over the same immutable runtime and native validation contract.
 * Methods of the wrapped builder, such as the setters of an inner fluent() call, are kept.
 * Where a selected name matches a kept method, the selected setter's type is the one that
 * applies: it repeats an inner setter for the same field or replaces a class method (another
 * field throws at runtime).
 */
export type FluentBuilder<B extends Source, S extends Selection<Input<B>>> = FacadeFor<B> & {
  [M in keyof Kept<B> as M extends keyof FieldMap<S> ? never : M]: Forwarded<
    Kept<B>[M],
    B,
    FluentBuilder<B, S>
  >;
} & {
  [M in keyof FieldMap<S>]: (
    value: SetterValue<Input<B>, FieldMap<S>[M] & keyof Input<B>>
  ) => FluentBuilder<B, S>;
};

/**
 * The complete list of a schema's top-level input fields, read from the schema itself by an
 * adapter function such as `typeBoxFields()` or `zodFields()`. Pass it to `fluent()`.
 * The marker is a string key, as in Standard Schema, so lists work across package copies.
 */
export interface SchemaFields<K extends string = string> extends ReadonlyArray<K> {
  readonly '~schemaFields': {
    readonly version: 1;
    /** Type-only: keeps the field union exact, so a list cannot be widened to promise more setters. */
    readonly types?: { readonly field: (field: K) => K };
  };
}
const marker = Object.freeze({ version: 1 as const });

/** An automatic name, or never when the runtime skips the field (longer than 64 characters). */
type AutoMethod<K extends string> = [Pascal<K>] extends [never] ? never : Method<K>;
type AutoFieldMap<K extends string> = { [P in K as AutoMethod<P>]: P };
/**
 * Mirrors the runtime skip rules: names shared by several fields, names of builder methods
 * (including the kept setters of an inner fluent() call) and fields that cannot be patched
 * individually (index signatures, unions, arrays) get no setter.
 */
type SchemaFieldMap<B extends Source, K extends string, M = AutoFieldMap<K>> = {
  [
    N in keyof M as N extends Capability | keyof FacadeFor<B> | keyof Kept<B>
      ? never
      : true extends IsUnion<M[N]>
        ? never
        : M[N] extends PatchKey<Input<B>>
          ? N
          : never
  ]: M[N];
};

/**
 * Named setters for every field a schema lists, minus the names `fluent()` skips. Methods of
 * the wrapped builder, such as the setters of an inner fluent() call, are kept.
 */
export type FluentFieldsBuilder<B extends Source, K extends string> = FacadeFor<B> & {
  [M in keyof Kept<B>]: Forwarded<Kept<B>[M], B, FluentFieldsBuilder<B, K>>;
} & {
  [M in keyof SchemaFieldMap<B, K>]: (
    value: SetterValue<Input<B>, SchemaFieldMap<B, K>[M] & keyof Input<B>>
  ) => FluentFieldsBuilder<B, K>;
};

/**
 * For adapter authors: mark `names` as the complete list of a schema's top-level input fields.
 * The list is copied and frozen. Listing fewer names than the input type has would type setters
 * that do not exist at runtime, so derive the names from the schema, never from a fixture.
 */
export function schemaFields<const K extends string>(names: readonly K[]): SchemaFields<K> {
  if (!Array.isArray(names) || names.length > 1000) {
    throw new TypeError('Expected an array of at most 1000 field names');
  }
  const list = [...uniqueNames(names, names.length)];
  Object.defineProperty(list, '~schemaFields', { value: marker });
  return Object.freeze(list) as unknown as SchemaFields<K>;
}

/** Read data entries without invoking accessors; names must be unique strings. */
function uniqueNames(array: readonly unknown[], count: number): Set<string> {
  const names = new Set<string>();
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(array, index);
    const name: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    if (typeof name !== 'string' || names.has(name)) {
      throw new TypeError('Field names must be unique strings');
    }
    names.add(name);
  }
  return names;
}

/** The field names of a list made by schemaFields(), or undefined for any other selection. */
function listedFields(selection: unknown): string[] | undefined {
  if (!Array.isArray(selection)) {
    return undefined;
  }
  const tag: unknown = Object.getOwnPropertyDescriptor(selection, '~schemaFields')?.value;
  if (!tag || typeof tag !== 'object') {
    return undefined;
  }
  if (Object.getOwnPropertyDescriptor(tag, 'version')?.value !== 1) {
    throw new TypeError('Unsupported schema field list version');
  }
  const count = selection.length;
  if (
    !Object.isFrozen(selection) ||
    count < 1 ||
    count > 1000 ||
    Reflect.ownKeys(selection).length !== count + 2
  ) {
    throw new TypeError('Expected a frozen schema field list of 1 to 1000 fields');
  }
  return [...uniqueNames(selection, count)];
}

function automaticMethod(property: string): string {
  const suffix =
    property
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Value';
  return `with${suffix}`;
}

function entries(selection: unknown): [string, string][] {
  if (!selection || typeof selection !== 'object') {
    throw new TypeError('Expected a field tuple or a method-to-field map');
  }
  const array = Array.isArray(selection);
  const prototype = Object.getPrototypeOf(selection);
  if (
    array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null
  ) {
    throw new TypeError('Field selection must be a plain data structure');
  }
  const keys = Reflect.ownKeys(selection);
  const count = array ? selection.length : keys.length;
  if (count < 1 || count > 1000 || (array && keys.length !== count + 1)) {
    throw new TypeError('Expected between 1 and 1000 explicit fields');
  }
  return Array.from({ length: count }, (_, index) => {
    const key = array ? String(index) : keys[index];
    if (typeof key !== 'string') {
      throw new TypeError('Field selection cannot contain symbols, accessors or hidden entries');
    }
    const descriptor = Object.getOwnPropertyDescriptor(selection, key);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      throw new TypeError('Field selection cannot contain symbols, accessors or hidden entries');
    }
    const property: unknown = descriptor.value;
    if (typeof property !== 'string' || property.length > (array ? 64 : 1024)) {
      throw new TypeError(
        'Expected a bounded string field name; use explicit method names for long fields'
      );
    }
    const method = array ? automaticMethod(property) : key;
    if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(method)) {
      throw new TypeError('Expected a JavaScript method name of at most 128 characters');
    }
    return [method, property];
  });
}

/** The field behind each setter of a fluent() builder, by the builder's prototype. */
const setterFields = new WeakMap<object, ReadonlyMap<string, string>>();
const notKept = new Set([...facadeMethods, 'constructor', 'then', 'toJSON']);

/**
 * The methods a builder has beyond its capabilities, such as the setters of an inner fluent()
 * call or the methods of a generated class. Reads descriptors only, so no accessor runs. The
 * root of a prototype chain (Object.prototype in any realm) is not read.
 */
function keptMethods(builder: unknown): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  let target: unknown = builder;
  for (let depth = 0; typeof target === 'object' && target !== null; depth++) {
    const parent: unknown = Object.getPrototypeOf(target);
    if (parent === null && target !== builder) {
      break;
    }
    if (depth >= 64) {
      throw new TypeError('Expected a builder with at most 64 prototypes');
    }
    for (const name of Object.getOwnPropertyNames(target)) {
      const descriptor = seen.has(name) ? undefined : Object.getOwnPropertyDescriptor(target, name);
      seen.add(name);
      if (descriptor && typeof descriptor.value === 'function' && !notKept.has(name)) {
        names.push(name);
      }
    }
    target = parent;
  }
  return names;
}

/**
 * Add a setter for every field of a schema field list, such as `typeBoxFields(schema)`.
 * Names that two fields share, names of builder methods and fields longer than 64
 * characters are skipped, and the setter types leave them out too. Works in generic helpers.
 * Wrapping a fluent() builder keeps its setters; a field whose name it already has is skipped.
 */
export function fluent<B extends Source, K extends string>(
  builder: B,
  fields: SchemaFields<K>
): FluentFieldsBuilder<B, K>;
/**
 * Opt into named methods without executing a factory or inspecting a native schema.
 * Use a literal field tuple, or a map such as { withUserName: 'user_name' }.
 * Ambiguous/default collisions require explicit aliases; core methods are never replaced.
 * Wrapping a fluent() builder keeps its setters. Repeating one of them for the same field is
 * allowed; reusing its name for another field throws. A name that matches another kept method,
 * such as a generated class method, replaces that method.
 */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fluent<B extends Source, const S extends Selection<Input<B>>>(
  builder: B,
  selection: S & LiteralSelection<S>
): FluentBuilder<B, S>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fluent(builder: Source, selection: unknown): unknown {
  const listed = listedFields(selection);
  let fields = listed ? [] : entries(selection);
  // Keep what the builder already has, such as the setters of an inner fluent() call.
  const kept = keptMethods(builder);
  const Base = facadeClass(() => builder, kept);
  const known =
    typeof builder === 'object' && builder !== null
      ? setterFields.get(Object.getPrototypeOf(builder) as object)
      : undefined;
  const setters = new Map<string, string>();
  for (const method of kept) {
    const property = known?.get(method);
    if (property !== undefined) {
      setters.set(method, property);
    }
  }
  const capability = (method: string) =>
    method in Base.prototype || method === 'then' || method === 'toJSON';
  if (listed) {
    // A schema list cannot take aliases, so skip what an explicit selection would reject.
    const candidates = listed
      .filter((property) => property.length <= 64)
      .map((property): [string, string] => [automaticMethod(property), property]);
    const counts = new Map<string, number>();
    for (const [method] of candidates) {
      counts.set(method, (counts.get(method) ?? 0) + 1);
    }
    fields = candidates.filter(([method]) => counts.get(method) === 1 && !capability(method));
  }
  const forwarded = new Set(kept);
  const used = new Set<string>();
  for (const [method, property] of fields) {
    const field = setters.get(method);
    // A kept setter for the same field already does what this one would.
    const repeated = field === property && !used.has(property);
    // A kept method whose field is unknown, such as a generated class method, is replaced by the
    // explicit setter, as before nesting kept methods. Lists never get here: they skip kept names.
    const replaced = field === undefined && forwarded.has(method) && !used.has(property);
    if (!repeated && !replaced && (capability(method) || used.has(property))) {
      throw new TypeError(
        'Fluent methods must be unique and cannot replace builder capabilities; choose an explicit alias'
      );
    }
    used.add(property);
    if (repeated) {
      continue;
    }
    setters.set(method, property);
    Object.defineProperty(Base.prototype, method, {
      configurable: false,
      value(this: object, value: unknown) {
        return Reflect.apply(Base.prototype.with, this, [{ [property]: value }]);
      },
    });
  }
  setterFields.set(Base.prototype as object, setters);
  return new Base();
}
