import { update } from './path-update.js';
import type { OptionalKeys } from './types.js';

export { BuilderPathError } from './path-update.js';

type Union<T, Whole = T> = T extends Whole ? ([Whole] extends [T] ? false : true) : never;
type Leaf =
  | Date
  | RegExp
  | Error
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | ArrayBuffer
  | ArrayBufferView
  | ((...args: never[]) => unknown);
type Index<T extends readonly unknown[]> = number extends T['length']
  ? number
  : Exclude<keyof T, keyof (readonly unknown[])> extends infer K
    ? K extends `${infer N extends number}`
      ? N
      : never
    : never;
type Keys<T> =
  true extends Union<T>
    ? never
    : T extends Leaf
      ? never
      : T extends readonly unknown[]
        ? Index<T>
        : T extends object
          ? keyof T
          : never;
/** Paths stop at unions and native values; replace a complete variant rather than its discriminant. */
export type ValuePath<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? readonly []
  : | readonly []
    | {
        [K in Keys<T>]: K extends keyof T
          ? readonly [K, ...ValuePath<T[K], readonly [...Depth, 0]>]
          : never;
      }[Keys<T>];
export type PathValue<T, P> = P extends readonly []
  ? T
  : P extends readonly [infer K extends keyof T, ...infer R extends readonly PropertyKey[]]
    ? PathValue<T[K], R>
    : never;
export type OptionalPath<T, Depth extends readonly unknown[] = []> = Depth['length'] extends 8
  ? never
  : {
      [K in Keys<T>]: K extends keyof T
        ? | (K extends OptionalKeys<T> ? readonly [K] : never)
          | (OptionalPath<T[K], readonly [...Depth, 0]> extends infer P extends
              readonly PropertyKey[]
              ? readonly [K, ...P]
              : never)
        : never;
    }[Keys<T>];
type CheckedPath<
  T,
  P extends readonly PropertyKey[],
  Omit extends boolean = false,
  Depth extends readonly unknown[] = [],
> = P extends readonly []
  ? Omit extends true
    ? never
    : P
  : Depth['length'] extends 8
    ? never
    : P extends readonly [infer K, ...infer R extends readonly PropertyKey[]]
      ? K extends Keys<T> & keyof T
        ? Omit extends true
          ? R extends readonly []
            ? K extends OptionalKeys<T>
              ? P
              : never
            : readonly [K, ...CheckedPath<T[K], R, true, readonly [...Depth, 0]>]
          : readonly [K, ...CheckedPath<T[K], R, false, readonly [...Depth, 0]>]
        : never
      : never;
/** Immutable explicit leaf replacement; an absent intermediate must be replaced as a whole. */
export function setPath<T, const P extends readonly PropertyKey[]>(
  value: T,
  path: P & CheckedPath<NoInfer<T>, P>,
  replacement: NoInfer<PathValue<T, P>>
): T {
  return update(value, path, replacement, false) as T;
}
/** Remove an optional own property, without changing undefined/null or shifting arrays. */
export function omitPath<T, const P extends readonly PropertyKey[]>(
  value: T,
  path: P & CheckedPath<NoInfer<T>, P, true>
): T {
  return update(value, path, undefined, true) as T;
}
