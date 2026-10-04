import { cloneFixture } from '@mimlet/core';
export type MaybePromise<T> = T | PromiseLike<T>;
export interface FixtureConsumerOptions<T> {
  /** Portable fixture cloning is the default; use a native clone hook for other values. */
  readonly clone?: (value: T) => T;
  readonly signal?: AbortSignal;
}
function callable(value: unknown): void {
  if (typeof value !== 'function') {
    throw new TypeError('Fixture consumers require functions');
  }
}
function maximum(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Fixture consumer budgets must be nonnegative safe integers');
  }
}
function clone<T>(value: T, copy: (value: T) => T): T {
  const result = copy(value);
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    typeof (result as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(result).catch(() => {});
    throw new TypeError(
      'Fixture clone hooks must be synchronous; wrap promise-valued data explicitly'
    );
  }
  return result;
}

/** Structural Storybook loader contract: a fresh value under context.loaded[key] on every call. */
export function fixtureLoader<Key extends string, Context, Value>(
  key: Key,
  source: (context: Context) => MaybePromise<Value>,
  options: FixtureConsumerOptions<Value> = {}
): (context: Context) => Promise<Record<Key, Value>> {
  callable(source);
  const copy: (value: Value) => Value = options.clone ?? cloneFixture;
  callable(copy);
  if (typeof key !== 'string' || !key) {
    throw new TypeError('A loader requires a nonempty key');
  }
  const signal = options.signal;
  return async (context) => {
    signal?.throwIfAborted();
    const value = await source(context);
    signal?.throwIfAborted();
    // Computed own keys avoid invoking Object.prototype.__proto__ setters.
    return { [key]: clone<Value>(value, copy) } as Record<Key, Value>;
  };
}

export interface JsonResponseOptions {
  readonly status?: number;
  /**
   * Anything the global `Headers` constructor accepts. This is `HeadersInit` with the DOM
   * library, and the same type from `@types/node` when DOM declarations are not loaded.
   */
  readonly headers?: NonNullable<ConstructorParameters<typeof Headers>[0]>;
  readonly maxBodyBytes?: number;
}
/** Plug into MSW or a Fetch mock explicitly. This never installs a global interceptor or makes requests. */
export function jsonResponseResolver<Value>(
  source: (request: Request) => MaybePromise<Value>,
  options: JsonResponseOptions = {}
): (request: Request) => Promise<Response> {
  callable(source);
  const status = options.status ?? 200;
  if (
    !Number.isInteger(status) ||
    status < 200 ||
    status > 599 ||
    [204, 205, 304].includes(status)
  ) {
    throw new RangeError(
      'A JSON fixture response requires a body-bearing status between 200 and 599'
    );
  }
  const maxBodyBytes = options.maxBodyBytes ?? 1_048_576;
  maximum(maxBodyBytes);
  const headers = new Headers(options.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  return async (request) => {
    request.signal.throwIfAborted();
    const value = await source(request);
    request.signal.throwIfAborted();
    // JSON serialization errors are not converted into successful fake responses.
    const json = JSON.stringify(value);
    if (json === undefined) {
      throw new TypeError('The fixture cannot be represented as a JSON response');
    }
    const bytes = new TextEncoder().encode(json);
    if (bytes.byteLength > maxBodyBytes) {
      throw new RangeError('Fixture response exceeds maxBodyBytes');
    }
    return new Response(request.method === 'HEAD' ? null : bytes, { status, headers });
  };
}

export interface PersistenceOptions<Value> extends FixtureConsumerOptions<Value> {
  readonly maxItems?: number;
}
/** Prepare the complete batch before the single explicit persistence callback is allowed to run. */
export async function persistFixtureBatch<Context, Value, Result>(
  count: number,
  source: (index: number, context: Context, signal?: AbortSignal) => MaybePromise<Value>,
  persist: (
    values: readonly Value[],
    context: Context,
    signal?: AbortSignal
  ) => MaybePromise<Result>,
  context: Context,
  options: PersistenceOptions<Value> = {}
): Promise<Result> {
  callable(source);
  callable(persist);
  const copy: (value: Value) => Value = options.clone ?? cloneFixture;
  callable(copy);
  const maxItems = options.maxItems ?? 1_000;
  maximum(maxItems);
  maximum(count);
  if (count > maxItems) {
    throw new RangeError('Fixture batch exceeds maxItems');
  }
  const values: Value[] = [];
  const signal = options.signal;
  signal?.throwIfAborted();
  for (let index = 0; index < count; index++) {
    signal?.throwIfAborted();
    const value = await source(index, context, signal);
    signal?.throwIfAborted();
    values.push(clone<Value>(value, copy));
  }
  signal?.throwIfAborted();
  // Transaction/rollback and cancellation during I/O belong to the explicitly supplied sink.
  return await persist(Object.freeze(values), context, signal);
}
