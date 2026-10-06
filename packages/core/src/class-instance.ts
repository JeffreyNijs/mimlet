/**
 * Builders patch plain records. `intoClass()` turns the finished record into an instance of a
 * class as one step of the build, so entity classes (TypeORM, MikroORM or plain domain classes)
 * get `instanceof`, getters and methods without a hand-written transform in every builder.
 */

type AnyFunction = (...args: never[]) => unknown;
type Same<A, B> =
  (<V>() => V extends A ? 1 : 2) extends <V>() => V extends B ? 1 : 2 ? true : false;
/** A getter without a setter is typed as a readonly property; so is a `readonly` field. */
type ReadonlyKey<T, K extends keyof T> =
  Same<Pick<T, K>, { -readonly [P in K]: T[P] }> extends true ? never : K;
/** Methods and fields typed `never` (or only `undefined`) are not data a record can hold. */
type DataKey<T, K extends keyof T> = T[K] extends AnyFunction
  ? never
  : [Exclude<T[K], undefined>] extends [never]
    ? never
    : K;
type Writable<T> = {
  [K in keyof T as K extends ReadonlyKey<T, K> ? never : DataKey<T, K>]: T[K];
};
type Computed<T> = {
  -readonly [K in keyof T as K extends ReadonlyKey<T, K> ? DataKey<T, K> : never]?: T[K];
};

/**
 * The plain record a builder patches before it becomes an instance of `T`: the public data
 * fields of the class, without methods and without fields typed `never`. Readonly properties
 * are optional, because TypeScript types a getter without a setter (such as `get fullName()`)
 * the same way as a `readonly` field: the record may set a readonly field and leaves a computed
 * getter to the class. Private and `#private` members are not part of the record; only the
 * constructor sets them.
 */
export type InstanceInput<T> = {
  [K in keyof (Writable<T> & Computed<T>)]: (Writable<T> & Computed<T>)[K];
};

/** How `intoClass()` creates the instance before it copies the record's fields onto it. */
export type ConstructStrategy = 'new' | 'prototype';
export interface IntoClassOptions {
  /**
   * `'new'` (the default) calls the constructor without arguments, as TypeORM and
   * class-transformer do, so field initializers and `#private` fields exist.
   * `'prototype'` uses `Object.create(Class.prototype)` and runs no constructor code: use it
   * for classes whose constructor requires arguments or has side effects.
   */
  readonly construct?: ConstructStrategy;
}
/** A class whose constructor can run without arguments. */
export type ConstructibleClass = new () => object;
/** Any concrete class. Unless it takes no arguments, `construct: 'prototype'` is required. */
export type AnyClass = new (...args: never[]) => object;
/** The `construct` option a class needs: optional, or `'prototype'` when arguments are required. */
export type ConstructOption<C extends AnyClass> = C extends ConstructibleClass
  ? { readonly construct?: ConstructStrategy }
  : { readonly construct: 'prototype' };

function plainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/** The accessor that an assignment to `key` would reach, on the instance or its prototypes. */
function accessorOf(instance: object, key: PropertyKey): PropertyDescriptor | undefined {
  for (
    let target: object | null = instance, depth = 0;
    target !== null && depth < 64;
    target = Object.getPrototypeOf(target) as object | null, depth++
  ) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor) {
      return 'value' in descriptor ? undefined : descriptor;
    }
  }
  return undefined;
}

function describeKey(key: PropertyKey): string {
  return typeof key === 'symbol' ? `[${String(key.description ?? '')}]` : String(key);
}

/** The class name for messages: never read from the instance or the record. */
export function className(target: AnyClass): string {
  return typeof target.name === 'string' && target.name ? target.name : 'the class';
}

function materialize(target: AnyClass, record: unknown, construct: ConstructStrategy): object {
  if (!plainRecord(record)) {
    throw new TypeError(
      `intoClass(${className(target)}) expects a plain record; patch the record and let the builder create the instance`
    );
  }
  const instance: object =
    construct === 'prototype'
      ? (Object.create(target.prototype as object) as object)
      : (Reflect.construct(target, []) as object);
  for (const key of Reflect.ownKeys(record)) {
    const field = Object.getOwnPropertyDescriptor(record, key);
    if (!field?.enumerable) {
      continue;
    }
    if (!('value' in field)) {
      throw new TypeError('A record cannot hold accessors; use plain data fields');
    }
    const accessor = accessorOf(instance, key);
    if (accessor) {
      if (!accessor.set) {
        throw new TypeError(
          `${describeKey(key)} is computed by ${className(target)} (a getter without a setter); leave it out of the record`
        );
      }
      Reflect.set(instance, key, field.value);
      continue;
    }
    Object.defineProperty(instance, key, {
      value: field.value,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return instance;
}

/** The class each mapper made by `intoClass()` creates, for the runtime's transform check. */
const mappers = new WeakMap<object, AnyClass>();
/** The class a mapper creates, when `intoClass()` made it. */
export function mappedClass(mapper: unknown): AnyClass | undefined {
  return typeof mapper === 'function' ? mappers.get(mapper) : undefined;
}

/**
 * A mapper for `builder.map()` that turns the built record into an instance of `target`:
 * `createBuilder(factory).map(intoClass(User))`. Patches keep applying to the record; each
 * build creates a new instance. `createInstanceBuilder(User, factory)` is the same with the
 * record type taken from the class. Each own enumerable field of the record is defined on the
 * instance, or assigned through the class's setter; a value for a getter without a setter
 * throws. Copying is shallow.
 */
export function intoClass<C extends ConstructibleClass>(
  target: C,
  options?: IntoClassOptions
): (record: InstanceInput<InstanceType<C>>) => InstanceType<C>;
/** A constructor that requires arguments is never called: pass `construct: 'prototype'`. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function intoClass<C extends AnyClass>(
  target: C,
  options: { readonly construct: 'prototype' }
): (record: InstanceInput<InstanceType<C>>) => InstanceType<C>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function intoClass(
  target: AnyClass,
  options: IntoClassOptions = {}
): (record: unknown) => object {
  if (typeof target !== 'function' || typeof target.prototype !== 'object') {
    throw new TypeError('intoClass() requires a class');
  }
  const construct = options.construct ?? 'new';
  if (construct !== 'new' && construct !== 'prototype') {
    throw new TypeError("construct must be 'new' or 'prototype'");
  }
  const mapper = (record: unknown) => materialize(target, record, construct);
  mappers.set(mapper, target);
  return mapper;
}
