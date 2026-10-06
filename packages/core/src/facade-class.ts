// Internal: shared by builderClass() and fluent(). index.ts does not re-export this module.

const configurationMethods = new Set([
  'with',
  'replace',
  'withFactory',
  'replaceFactory',
  'omit',
  'transform',
  'transformAsync',
  // PROTOTYPE (docs/proposals/class-instances.md)
  'map',
  'usingValidation',
]);
/** Every builder capability a facade defines, whether or not its builder provides it. */
export const facadeMethods: readonly string[] = [
  ...configurationMethods,
  'build',
  'buildAsync',
  'buildList',
  'buildListAsync',
  'describe',
  'buildValidated',
  'buildValidatedAsync',
  'buildValidatedList',
  'buildValidatedListAsync',
];
type Runtime = Record<string, (...args: unknown[]) => unknown>;

/**
 * The facade class behind builderClass(). `forwarded` names extra methods of the builder, such
 * as the setters of an inner fluent() builder: each one is called on the current builder, and a
 * result that is a builder of the same kind becomes a new branch of this facade.
 */
export function facadeClass(
  definition: () => unknown,
  forwarded: readonly string[] = []
): new (initial?: unknown) => object {
  if (typeof definition !== 'function') {
    throw new TypeError('Expected a builder definition');
  }
  const states = new WeakMap<object, Runtime>();
  const invoke = (base: Runtime, key: string, args: unknown[]): unknown => {
    const method = base[key];
    if (typeof method !== 'function') {
      throw new TypeError(`Builder capability ${key} is unavailable`);
    }
    return Reflect.apply(method, base, args);
  };
  const sameKind = (result: unknown, base: Runtime): boolean =>
    typeof result === 'object' &&
    result !== null &&
    Object.getPrototypeOf(result) === Object.getPrototypeOf(base) &&
    typeof (result as Runtime).buildAsync === 'function';
  class Facade {
    constructor(initial?: unknown) {
      const result: unknown = Reflect.apply(definition, undefined, []);
      if (
        !result ||
        typeof result !== 'object' ||
        typeof (result as Runtime).buildAsync !== 'function'
      ) {
        if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
          void Promise.resolve(result).catch(() => {});
        }
        throw new TypeError('A definition must return a builder synchronously');
      }
      const base = result as Runtime;
      states.set(this, initial === undefined ? base : (invoke(base, 'with', [initial]) as Runtime));
    }
  }
  const define = (key: string, branches: (result: unknown, base: Runtime) => boolean) => {
    Object.defineProperty(Facade.prototype, key, {
      configurable: true,
      value: function (this: object, ...args: unknown[]) {
        const base = states.get(this);
        if (!base) {
          throw new TypeError('Invalid builder facade receiver');
        }
        const result = invoke(base, key, args);
        if (!branches(result, base)) {
          return result;
        }
        const next: object = Object.create(
          Object.getPrototypeOf(this),
          Object.getOwnPropertyDescriptors(this)
        );
        states.set(next, result as Runtime);
        return next;
      },
    });
  };
  for (const key of facadeMethods) {
    const configuration = configurationMethods.has(key);
    define(key, () => configuration);
  }
  for (const key of forwarded) {
    define(key, sameKind);
  }
  return Facade;
}
