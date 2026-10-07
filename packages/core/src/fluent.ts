import { facadeClass, facadeMethods } from './facade-class.js';
import type { FacadeFor } from './facade.js';
import { withPathKey } from './path-update.js';
import type { AnyFactory, BuilderDescription, BuilderPatch } from './types.js';

type Source = { buildAsync: AnyFactory; describe(): BuilderDescription };
/** The record setters patch: the parameter of `replace()`, which `map()` does not change. */
type Input<B extends Source> = B extends { replace(value: infer I): unknown }
  ? I
  : Awaited<ReturnType<B['buildAsync']>>;
/** What the wrapped builder's builds return. */
type Built<B extends Source> = Awaited<ReturnType<B['buildAsync']>>;
/** What the wrapped builder's callbacks receive. */
type ReceivedBy<B> = B extends { withFactory(factory: (...args: infer R) => never): unknown }
  ? R
  : never;
/** Schema builders have no `map()`: their validator's output is what `buildValidated()` returns. */
type Validates<B> = B extends { buildValidatedAsync: AnyFactory } ? true : false;
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
/**
 * A path alias: a top-level field, then up to 7 keys inside it (array indexes as numbers).
 * `Explicit` checks each key, so that a wrong one is named in the error.
 */
type PathAlias = readonly [string, ...(string | number | symbol)[]];
type Selection<I> = readonly PatchKey<I>[] | Readonly<Record<string, PatchKey<I> | PathAlias>>;
/**
 * What `fluent()` accepts before checking: any field names, so that a wrong one reaches
 * `Explicit`, which names it in the error, instead of failing the constraint without a name.
 */
type FieldList = readonly string[];
type AliasMap = Readonly<Record<string, string | PathAlias>>;
/** A schema field list, by its marker, so a list of another package copy is one too. */
type Listed = { readonly '~schemaFields': unknown };
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

/**
 * `F` when it is one field that `fluent()` can set. A start of field names, such as `''` while
 * typing, becomes those fields, so editors complete them; anything else becomes an error that
 * names it (never for a union or a plain string, which cannot promise a particular setter).
 */
type CheckedField<F, I> = [F] extends [string]
  ? [Single<F>] extends [never]
    ? never
    : [F] extends [PatchKey<I>]
      ? F
      : [Extract<PatchKey<I>, `${F}${string}`>] extends [never]
        ? [PatchKey<I>] extends [never]
          ? `${F} cannot get a setter: fluent() needs a builder input of one record with known fields`
          : `${F} is not a field of the builder input`
        : Extract<PatchKey<I>, `${F}${string}`>
  : never;
/** `P` when each of its keys exists in the input, otherwise an error that names the path. */
type CheckedPath<P, I> = [RootedAlias<I, P>] extends [never]
  ? `${Joined<P>} is not a path of plain records and arrays in the builder input`
  : P;
/** A field of a tuple: also an error when its automatic name is a builder method. */
type TupleEntry<F, I> = [F] extends [CheckedField<F, I>]
  ? Method<F & string> extends Capability
    ? `${F & string} would get ${Method<F & string>}(), a builder method: name its setter in an alias map`
    : F
  : CheckedField<F, I>;
/** An entry of an alias map: a field or a path, under a name that is not a builder method. */
type AliasEntry<N, T, I> = [T] extends [readonly unknown[]]
  ? CheckedPath<T, I>
  : [T] extends [CheckedField<T, I>]
    ? N extends Capability
      ? `${N} is a builder method: choose another setter name`
      : T
    : CheckedField<T, I>;
/**
 * A literal field tuple or alias map, with each wrong entry replaced by an error that names it.
 * `fluent()` checks its argument against this type, so a typo reports the named error only.
 * Runtime-length tuples and maps with computed names cannot promise setters.
 */
type Explicit<S, I> = S extends readonly unknown[]
  ? number extends S['length']
    ? 'fluent() needs a literal field tuple, such as ["name"], or a schema field list'
    : S extends readonly []
      ? 'fluent() needs at least one field'
      : { readonly [K in keyof S]: TupleEntry<S[K], I> }
  : string extends keyof S
    ? 'fluent() needs an alias map with literal setter names'
    : [keyof S] extends [never]
      ? 'fluent() needs at least one setter'
      : { readonly [K in keyof S]: AliasEntry<K, S[K], I> };
/** The type of a checked argument: the argument itself when it is valid, so that it is inferred. */
type Checked<S, E> = [S] extends [E] ? S : NoInfer<E>;
/** Whether a setter of an alias map sets what the field list's setter of that name sets. */
type SameTarget<T, F> = [T] extends [F] ? true : [T] extends [readonly [F]] ? true : false;
/**
 * The alias map that follows a field list. Names follow the nesting rules: a name of a tuple
 * field may repeat that field, not set another; a schema field list skips the map's names.
 */
type CheckedAliases<A, I, S> = A extends readonly unknown[]
  ? 'fluent() takes an alias map after the field list, such as { withKey: ["pagination", "key"] }'
  : NamedAliases<Explicit<A, I>, A, S>;
type NamedAliases<E, A, S> = [E] extends [string]
  ? E
  : S extends Listed
    ? E
    : {
        readonly [N in keyof E]: N extends keyof FieldMap<S>
          ? [E[N]] extends [A[N & keyof A]]
            ? SameTarget<E[N], FieldMap<S>[N]> extends true
              ? E[N]
              : `${N & string} already sets ${FieldMap<S>[N] & string} in the field list: choose another setter name`
            : E[N]
          : E[N];
      };
/** The builder a field list makes: one setter per field, as fluent(builder, fields) types it. */
type ListBuilder<B extends Source, S> =
  S extends SchemaFields<infer K>
    ? FluentFieldsBuilder<B, K>
    : S extends Selection<Input<B>>
      ? FluentBuilder<B, S>
      : FluentBuilder<B, never>;

/**
 * What a patch may assign to one field. Indexed access adds `undefined` to every optional key,
 * so keep it only where the property accepts it (respecting `exactOptionalPropertyTypes`).
 */
type SetterValue<T, K extends keyof T> =
  { [P in K]: undefined } extends Pick<T, K> ? T[K] : Exclude<T[K], undefined>;

/** Values a path alias cannot go into: built-in objects with internal state and functions. */
type PathLeaf =
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | ((...args: never[]) => unknown);
type TupleIndex<T extends readonly unknown[]> = number extends T['length']
  ? number
  : Exclude<keyof T, keyof (readonly unknown[])> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;
/**
 * The keys a path alias may take inside `T`: the fields of a record or the indexes of an array.
 * A parent that may be null or undefined is typed as present (the build fails if it is not);
 * a union of records has no keys, as in `setPath()`: set a variant as a whole.
 */
type PathKeys<T> =
  true extends IsUnion<T>
    ? never
    : T extends PathLeaf
      ? never
      : T extends readonly unknown[]
        ? TupleIndex<T>
        : T extends object
          ? keyof T
          : never;
/** `P` when each of its keys exists in `T` (at most 8), otherwise never. */
type CheckedAlias<T, P, Depth extends readonly unknown[] = []> = P extends readonly []
  ? P
  : Depth['length'] extends 8
    ? never
    : P extends readonly [infer K, ...infer R]
      ? K extends PathKeys<NonNullable<T>> & keyof NonNullable<T>
        ? readonly [K, ...CheckedAlias<NonNullable<T>[K], R, readonly [...Depth, 0]>]
        : never
      : never;
/** `P` when its first key is a field `fluent()` can set and every key exists, otherwise never. */
type RootedAlias<I, P> = P extends readonly [infer K extends PatchKey<I>, ...infer R]
  ? readonly [K, ...CheckedAlias<I[K], R, readonly [0]>]
  : never;
/** A path for a message, such as `pagination.limit` or `lines[0].quantity`. */
type Joined<P, First extends boolean = true> = P extends readonly [infer K, ...infer R]
  ? `${K extends number ? `[${K}]` : K extends string ? `${First extends true ? '' : '.'}${K}` : '[symbol]'}${Joined<R, false>}`
  : '';
/** The value a path setter takes: the type at the path, with `.with()`'s optional-key rules. */
type PathValue<T, P> = P extends readonly [infer K]
  ? K extends keyof T
    ? SetterValue<T, K>
    : never
  : P extends readonly [infer K, ...infer R]
    ? K extends keyof T
      ? PathValue<NonNullable<T[K]>, R>
      : never
    : never;
/** The value a selected setter takes: a top-level field or a path alias. */
type AliasValue<I, Target> = Target extends readonly unknown[]
  ? PathValue<I, Target>
  : SetterValue<I, Target & keyof I>;

/** Names fluent() never adds as a setter or carries over from the builder it wraps. */
type Capability =
  | 'with'
  | 'replace'
  | 'withFactory'
  | 'replaceFactory'
  | 'omit'
  | 'transform'
  | 'transformAsync'
  | 'map'
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
export type FluentBuilder<
  B extends Source,
  S extends Selection<Input<B>>,
  O = Built<B>,
> = (Validates<B> extends true
  ? unknown
  : {
      /** A transform whose result may have another type; the setters stay. See `Builder.map()`. */
      map<Next>(mapper: (value: O, ...args: ReceivedBy<B>) => Next): FluentBuilder<B, S, Next>;
    }) &
  FacadeFor<B, O> & {
    [M in keyof Kept<B> as M extends keyof FieldMap<S> ? never : M]: Forwarded<
      Kept<B>[M],
      B,
      FluentBuilder<B, S, O>
    >;
  } & {
    [M in keyof FieldMap<S>]: (
      value: AliasValue<Input<B>, FieldMap<S>[M]>
    ) => FluentBuilder<B, S, O>;
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
export type FluentFieldsBuilder<
  B extends Source,
  K extends string,
  O = Built<B>,
> = (Validates<B> extends true
  ? unknown
  : {
      /** A transform whose result may have another type; the setters stay. */
      map<Next>(
        mapper: (value: O, ...args: ReceivedBy<B>) => Next
      ): FluentFieldsBuilder<B, K, Next>;
    }) &
  FacadeFor<B, O> & {
    [M in keyof Kept<B>]: Forwarded<Kept<B>[M], B, FluentFieldsBuilder<B, K, O>>;
  } & {
    [M in keyof SchemaFieldMap<B, K>]: (
      value: SetterValue<Input<B>, SchemaFieldMap<B, K>[M] & keyof Input<B>>
    ) => FluentFieldsBuilder<B, K, O>;
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

/** What a setter sets: a top-level field, or the keys of a path alias (2 to 8). */
type Target = string | readonly PropertyKey[];
function sameTarget(a: Target, b: Target): boolean {
  return typeof a === 'string' || typeof b === 'string'
    ? a === b
    : a.length === b.length && a.every((key, index) => Object.is(key, b[index]));
}
/** The fields and paths that already have a setter. */
function targets() {
  const fields = new Set<string>();
  const paths: (readonly PropertyKey[])[] = [];
  return {
    has: (target: Target) =>
      typeof target === 'string'
        ? fields.has(target)
        : paths.some((path) => sameTarget(path, target)),
    add: (target: Target) => (typeof target === 'string' ? fields.add(target) : paths.push(target)),
  };
}

/**
 * A path alias of a method map: a plain array of 1 to 8 keys, read without accessors and
 * frozen. The first key is a field name; later keys are field names, array indexes or symbols.
 * A path of one field is that field.
 */
function aliasPath(value: unknown[]): Target {
  const count = value.length;
  if (
    Object.getPrototypeOf(value) !== Array.prototype ||
    count < 1 ||
    count > 8 ||
    Reflect.ownKeys(value).length !== count + 1
  ) {
    throw new TypeError('A path alias is a plain array of 1 to 8 keys');
  }
  const path: PropertyKey[] = [];
  for (let index = 0; index < count; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    const key: unknown = descriptor && 'value' in descriptor ? descriptor.value : undefined;
    const valid =
      typeof key === 'string'
        ? key.length <= 1024
        : index > 0 &&
          (typeof key === 'symbol' ||
            (typeof key === 'number' && Number.isSafeInteger(key) && key >= 0));
    if (!valid) {
      throw new TypeError(
        'A path alias starts with a field name, followed by field names, array indexes or symbols'
      );
    }
    path.push(key as PropertyKey);
  }
  return count === 1 ? (path[0] as string) : Object.freeze(path);
}

function entries(selection: unknown): [string, Target][] {
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
    if (!array && Array.isArray(property)) {
      const method = key;
      if (!/^[A-Za-z_$][A-Za-z0-9_$]{0,127}$/.test(method)) {
        throw new TypeError('Expected a JavaScript method name of at most 128 characters');
      }
      return [method, aliasPath(property)];
    }
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

/** The field or path behind each setter of a fluent() builder, by the builder's prototype. */
const setterFields = new WeakMap<object, ReadonlyMap<string, Target>>();
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
 * Opt into named methods without executing a factory or inspecting a native schema.
 * Pass a literal field tuple such as `['name']`, an alias map such as
 * `{ withUserName: 'user_name', withLimit: ['pagination', 'limit'] }` (a tuple is a path
 * alias), or a schema field list such as `typeBoxFields(schema)`, which adds a setter for every
 * field and also works in generic helpers.
 * Ambiguous/default collisions require explicit aliases; core methods are never replaced.
 * A schema field list skips names that two fields share, names of builder methods and fields
 * longer than 64 characters, and the setter types leave them out too.
 * Wrapping a fluent() builder keeps its setters. Repeating one of them for the same field is
 * allowed; reusing its name for another field throws, and a schema field list skips it. A name
 * that matches another kept method, such as a generated class method, replaces that method.
 */
export function fluent<B extends Source, const S extends FieldList | AliasMap>(
  builder: B,
  selection: [S] extends [Listed] ? S : Checked<S, Explicit<S, Input<B>>>
): S extends SchemaFields<infer K>
  ? FluentFieldsBuilder<B, K>
  : S extends Selection<Input<B>>
    ? FluentBuilder<B, S>
    : FluentBuilder<B, never>;
/**
 * A field list and an alias map in one call:
 * `fluent(builder, ['filter', 'pagination'], { withPaginationKey: ['pagination', 'key'] })`.
 * The field list is a literal tuple or a schema field list; the alias map names more setters,
 * such as path aliases. The result is the builder of `fluent(fluent(builder, fields), aliases)`,
 * except that a schema field list skips the names the alias map uses.
 */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fluent<
  B extends Source,
  const S extends FieldList | AliasMap,
  const A extends FieldList | AliasMap,
>(
  builder: B,
  fields: [S] extends [Listed]
    ? S
    : Checked<
        S,
        S extends FieldList
          ? Explicit<S, Input<B>>
          : 'fluent() takes a field tuple or a schema field list before the alias map'
      >,
  aliases: Checked<A, CheckedAliases<A, Input<B>, S>>
): ListBuilder<B, S> extends infer L extends Source
  ? A extends Selection<Input<L>>
    ? FluentBuilder<L, A>
    : FluentBuilder<L, never>
  : never;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fluent(builder: Source, selection: unknown, aliases?: unknown): unknown {
  const listed = listedFields(selection);
  if (aliases !== undefined && (!Array.isArray(selection) || Array.isArray(aliases))) {
    throw new TypeError(
      'Pass a field tuple or a schema field list, then an alias map such as { withKey: ["pagination", "key"] }'
    );
  }
  let fields = listed ? [] : entries(selection);
  // The alias map is a second selection over the first, as in fluent(fluent(builder, fields), aliases).
  const named = aliases === undefined ? [] : entries(aliases);
  // Keep what the builder already has, such as the setters of an inner fluent() call.
  const kept = keptMethods(builder);
  const Base = facadeClass(() => builder, kept);
  const known =
    typeof builder === 'object' && builder !== null
      ? setterFields.get(Object.getPrototypeOf(builder) as object)
      : undefined;
  const setters = new Map<string, Target>();
  for (const method of kept) {
    const target = known?.get(method);
    if (target !== undefined) {
      setters.set(method, target);
    }
  }
  const capability = (method: string) =>
    method in Base.prototype || method === 'then' || method === 'toJSON';
  if (listed) {
    // A schema list cannot take aliases, so skip what an explicit selection would reject, and
    // the names that the alias map after it uses.
    const taken = new Set(named.map(([method]) => method));
    const candidates = listed
      .filter((property) => property.length <= 64)
      .map((property): [string, string] => [automaticMethod(property), property]);
    const counts = new Map<string, number>();
    for (const [method] of candidates) {
      counts.set(method, (counts.get(method) ?? 0) + 1);
    }
    fields = candidates.filter(
      ([method]) => counts.get(method) === 1 && !capability(method) && !taken.has(method)
    );
  }
  if (
    [...fields, ...named].some(([, target]) => typeof target !== 'string') &&
    typeof (builder as { [withPathKey]?: unknown })[withPathKey] !== 'function'
  ) {
    throw new TypeError(
      'Path aliases need a builder from @mimlet/core with path setters; this builder comes from an older version or another library'
    );
  }
  // The facade forwards a path setter to the wrapped builder's path operation.
  const withPath = (Base.prototype as { [withPathKey]: (...args: unknown[]) => unknown })[
    withPathKey
  ];
  const forwarded = new Set(kept);
  // The alias map sees the field list's setters as kept setters of an inner call.
  for (const selected of [fields, named]) {
    const used = targets();
    for (const [method, target] of selected) {
      const field = setters.get(method);
      // A kept setter for the same field or path already does what this one would.
      const repeated = field !== undefined && sameTarget(field, target) && !used.has(target);
      // A kept method whose field is unknown, such as a generated class method, is replaced by the
      // explicit setter, as before nesting kept methods. Lists never get here: they skip kept names.
      const replaced = field === undefined && forwarded.has(method) && !used.has(target);
      if (!repeated && !replaced && (capability(method) || used.has(target))) {
        throw new TypeError(
          'Fluent methods must be unique and cannot replace builder capabilities; choose an explicit alias'
        );
      }
      used.add(target);
      if (repeated) {
        continue;
      }
      setters.set(method, target);
      const label = `${method}()`;
      const setter =
        typeof target === 'string'
          ? {
              value(this: object, value: unknown) {
                return Reflect.apply(Base.prototype.with, this, [{ [target]: value }]);
              },
            }
          : {
              value(this: object, value: unknown) {
                return Reflect.apply(withPath, this, [target, value, label]);
              },
            };
      Object.defineProperty(Base.prototype, method, { configurable: false, value: setter.value });
    }
  }
  setterFields.set(Base.prototype as object, setters);
  return new Base();
}
