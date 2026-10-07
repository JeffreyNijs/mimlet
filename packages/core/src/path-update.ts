// Internal: the copy-on-write path update behind setPath(), omitPath() and fluent() path
// aliases. index.ts re-exports BuilderPathError through path.ts, nothing else from here.
import { classInstance, classNameOf } from './class-instance.js';
import { formatPath } from './issues.js';

export class BuilderPathError extends TypeError {
  readonly code = 'INVALID_BUILDER_PATH';
  /** The default message is the one `setPath()` and `omitPath()` report. */
  constructor(
    message = 'A path must traverse existing own data properties on plain records or arrays'
  ) {
    super(message);
    this.name = 'BuilderPathError';
  }
}

/**
 * Registered, so a `fluent()` builder and the builder it wraps can come from different copies
 * of `@mimlet/core`. A builder's method under this key appends a path update to its patches:
 * `builder[withPathKey](path, value, label)`. It is not part of the public API.
 */
export const withPathKey: unique symbol = Symbol.for('mimlet.builder.withPath');

function container(value: unknown): value is Record<PropertyKey, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return Array.isArray(value) || prototype === Object.prototype || prototype === null;
}

/** Why the value at `at` cannot hold a key, for a path setter's message. Reads no field. */
function notAContainer(value: unknown, at: string): string {
  if (value === undefined) {
    return `${at} is missing; set ${at} first (with .with() or its own setter) or give it a default in the factory`;
  }
  if (value === null) {
    return `${at} is null; set ${at} first (with .with() or its own setter) or give it a default in the factory`;
  }
  if (classInstance(value)) {
    return `${at} is a ${classNameOf(value)} instance, and path setters only change plain records and arrays; set ${at} as a whole instead`;
  }
  const kind = typeof value === 'object' ? classNameOf(value) : typeof value;
  return `${at} is a ${kind} value, not a plain record or an array`;
}

/**
 * `value` with `replacement` at `path` (or without the last key, for `omit`), copying each
 * record and array on the way and keeping their prototypes and property descriptors. Every
 * key but the last must exist. With a `label`, such as `withLimit()`, a failure explains
 * itself in terms of the path; the message names keys only, never values.
 */
export function update(
  value: unknown,
  path: readonly PropertyKey[],
  replacement: unknown,
  omit: boolean,
  label?: string
): unknown {
  if (
    !Array.isArray(path) ||
    path.length > 8 ||
    path.some((key) => !['string', 'number', 'symbol'].includes(typeof key))
  ) {
    throw new BuilderPathError();
  }
  const fail = (reason: () => string): never => {
    throw new BuilderPathError(
      label === undefined ? undefined : `${label} cannot set ${formatPath(path)}: ${reason()}`
    );
  };
  const visit = (current: unknown, offset: number): unknown => {
    if (offset === path.length) {
      return replacement;
    }
    const at = () => (offset === 0 ? 'the value being built' : formatPath(path.slice(0, offset)));
    if (!container(current)) {
      return fail(() =>
        offset === 0 ? `${at()} is not a plain record or an array` : notAContainer(current, at())
      );
    }
    const key = path[offset] as PropertyKey;
    const array = Array.isArray(current);
    if (
      array &&
      (typeof key !== 'number' || !Number.isSafeInteger(key) || key < 0 || key >= current.length)
    ) {
      return fail(() => `${at()} has no item ${String(key)}`);
    }
    const property = Object.getOwnPropertyDescriptor(current, key);
    if (property && !('value' in property)) {
      return fail(
        () => `${formatPath(path.slice(0, offset + 1))} is an accessor, not a data field`
      );
    }
    if (!property && offset + 1 !== path.length) {
      return fail(() => notAContainer(undefined, formatPath(path.slice(0, offset + 1))));
    }
    const copy: Record<PropertyKey, unknown> = array
      ? []
      : Object.create(Object.getPrototypeOf(current));
    for (const name of Reflect.ownKeys(current)) {
      if (array && name === 'length') {
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor || !('value' in descriptor)) {
        return fail(() => `${at()} has an accessor; path setters copy data fields only`);
      }
      Object.defineProperty(copy, name, { ...descriptor, configurable: true, writable: true });
    }
    if (array) {
      copy.length = current.length;
    }
    if (omit && offset + 1 === path.length) {
      if (array) {
        throw new BuilderPathError();
      }
      delete copy[key];
    } else {
      Object.defineProperty(copy, key, {
        value: visit(property?.value, offset + 1),
        enumerable: property?.enumerable ?? true,
        configurable: true,
        writable: true,
      });
    }
    return copy;
  };
  if (omit && path.length === 0) {
    throw new BuilderPathError();
  }
  return visit(value, 0);
}
