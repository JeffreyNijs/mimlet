/**
 * Compile-time checks for the keys a factory returns. TypeScript reports excess properties of
 * an object literal only where it is written directly against a narrower type, not when a
 * function returns it, so a misspelled field in an unannotated factory would otherwise compile.
 */
import type { AnyFactory } from './types.js';

type AnyFunction = (...args: never[]) => unknown;
type Same<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
/** Values whose keys are not checked: primitives, built-in objects, promises and functions. */
type Leaf =
  | string
  | number
  | boolean
  | bigint
  | symbol
  | null
  | undefined
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | PromiseLike<unknown>
  | AnyFunction;
/** Remaining nesting levels, counted down; deeper values are not checked. */
type Next = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8];
type MaxDepth = 9;
/** The members of a declared type whose keys a nested record is checked against. */
type Records<S> = S extends Leaf | ReadonlyArray<unknown> ? never : S extends object ? S : never;
type Items<S> = S extends ReadonlyArray<infer Item> ? Item : never;
/** A key that any member of a union declares is accepted. */
type KeysOf<S> = S extends unknown ? keyof S : never;
type At<S, K> = S extends unknown ? (K extends keyof S ? S[K] : never) : never;

/** The type an unknown key gets: the message TypeScript reports. */
type NotAField<K> = K extends string | number ? `${K} is not a field of the class` : never;
/** The same, naming a key that the class `Declared` has as a method or as a field typed never. */
type UnknownField<K, Declared> = K extends string | number
  ? K extends keyof Declared
    ? [Exclude<Declared[K], undefined>] extends [never]
      ? `${K} is typed never in the class and cannot be set`
      : Declared[K] extends AnyFunction
        ? `${K} is a method of the class, not a field`
        : NotAField<K>
    : NotAField<K>
  : never;

/**
 * Keys of a nested value `R` that the declared type `S` does not have. Only plain records and
 * arrays are checked: a declared type without keys (`object`, `unknown`) or with an index
 * signature accepts any key, and a key whose value is a function (such as a method of a
 * class instance) is skipped.
 */
type NestedUnknown<R, S, D extends number> = [D] extends [never]
  ? never
  : R extends Leaf
    ? never
    : R extends ReadonlyArray<infer Item>
      ? NestedUnknown<Item, Items<S>, Next[D]>
      : R extends object
        ? [KeysOf<Records<S>>] extends [never]
          ? never
          : {
              [K in keyof R]-?: R[K] extends AnyFunction
                ? never
                : K extends KeysOf<Records<S>>
                  ? NestedUnknown<R[K], At<Records<S>, K>, Next[D]>
                  : K;
            }[keyof R]
        : never;
/** `R` with each nested key that `S` does not have typed as an error message. */
type NestedKnown<R, S, D extends number> = [D] extends [never]
  ? R
  : R extends Leaf
    ? R
    : R extends ReadonlyArray<unknown>
      ? { [I in keyof R]: NestedKnown<R[I], Items<S>, Next[D]> }
      : R extends object
        ? [KeysOf<Records<S>>] extends [never]
          ? R
          : {
              [K in keyof R]: R[K] extends AnyFunction
                ? R[K]
                : K extends KeysOf<Records<S>>
                  ? NestedKnown<R[K], At<Records<S>, K>, Next[D]>
                  : NotAField<K>;
            }
        : R;

/** Keys of the record `R` (or of any member of a union) that `Shape` does not declare. */
type UnknownKeys<R, Shape, Nested extends boolean> = R extends unknown
  ? | Exclude<keyof R, keyof Shape>
    | (Nested extends true
        ? { [K in keyof R & keyof Shape]-?: NestedUnknown<R[K], Shape[K], MaxDepth> }[keyof R &
            keyof Shape]
        : never)
  : never;
type KnownFieldsOf<R, Shape, Declared, Nested extends boolean> = R extends unknown
  ? {
      [K in keyof R]: K extends keyof Shape
        ? Nested extends true
          ? NestedKnown<R[K], Shape[K], MaxDepth>
          : R[K]
        : UnknownField<K, Declared>;
    }
  : never;
type KnownFieldsReturn<R, Shape, Declared, Nested extends boolean> =
  R extends PromiseLike<infer V>
    ? PromiseLike<KnownFieldsOf<V, Shape, Declared, Nested>>
    : KnownFieldsOf<R, Shape, Declared, Nested>;
/**
 * A factory declared to return exactly `Shape` (or a promise of it) is not checked: an annotated
 * return type already reports unknown keys, and in a generic helper whose factory returns
 * `DtoInput<T>` the keys depend on a type parameter and cannot be compared. Each comparison is
 * its own conditional, so one that a type parameter leaves undecided does not hide the others.
 */
type Check<F extends AnyFactory, Shape, Declared, Nested extends boolean> =
  Same<ReturnType<F>, Shape> extends true
    ? unknown
    : Same<ReturnType<F>, Promise<Shape>> extends true
      ? unknown
      : Same<ReturnType<F>, PromiseLike<Shape>> extends true
        ? unknown
        : unknown extends ReturnType<F>
          ? unknown
          : [UnknownKeys<Awaited<ReturnType<F>>, Shape, Nested>] extends [never]
            ? unknown
            : (...args: Parameters<F>) => KnownFieldsReturn<ReturnType<F>, Shape, Declared, Nested>;

/**
 * The check `createInstanceBuilder()` applies to its factory, for a factory parameter typed
 * `F & KnownFieldsFactory<F, Shape>`. It is `unknown` when every key the factory returns is a
 * key of `Shape` (or the return type is `any`, or exactly `Shape`), and otherwise a signature
 * that types each unknown key as a message such as `"lastNmae is not a field of the class"`.
 * `Declared` is the class: a key it declares as a method or as `never` gets a message that
 * says so. Only the returned record's own keys are checked; see `KnownNestedFieldsFactory`.
 */
export type KnownFieldsFactory<F extends AnyFactory, Shape, Declared = Shape> = Check<
  F,
  Shape,
  Declared,
  false
>;
/**
 * `KnownFieldsFactory` that also checks nested plain records and arrays, for payload types
 * such as `DtoInput<T>` whose nested values are plain data. A nested type without keys
 * (`object`, `unknown`) or with an index signature accepts any key, and nested keys whose
 * value is a function are not checked.
 */
export type KnownNestedFieldsFactory<F extends AnyFactory, Shape, Declared = Shape> = Check<
  F,
  Shape,
  Declared,
  true
>;
