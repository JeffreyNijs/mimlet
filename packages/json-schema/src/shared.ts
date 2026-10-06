/**
 * Process-wide reuse of prepared generators.
 *
 * Preparing a generator compiles a JSON Schema validator, which is most of the cost of a first
 * build. A test runner that loads modules again, or a module that converts equal schemas from
 * different objects, would otherwise prepare the same schema again. Prepared generators are kept
 * by the exact JSON text of the schema and its references plus the generation options, so equal
 * content reuses one preparation and anything that differs prepares its own.
 *
 * The store lives on `globalThis` under `Symbol.for('mimlet.generators.v1')`, so it survives a
 * module being evaluated again in the same JavaScript realm, and it is keyed by this package's
 * version, so two versions loaded into one process never share entries. A separate worker, child
 * process, browser frame or `vm` context has its own `globalThis` and its own store. Only
 * preparations without callbacks (custom keywords or formats) are shared.
 */
import { packageVersion } from './version.js';

/** Bump when the registry's shape changes. Stores inside it are keyed by package version. */
const registryKey = Symbol.for('mimlet.generators.v1');
const storeName = `@mimlet/json-schema@${packageVersion}`;
/** Prepared generators kept per process when nothing is configured. */
export const defaultGeneratorCacheEntries = 256;
/** Shared validator instances, one per dialect, limits, annotations and reference set. */
const validatorContexts = 16;
const environmentVariable = 'MIMLET_GENERATOR_CACHE';

/** A bounded map that drops its least recently used entry first. */
export class LeastRecentlyUsed<V> {
  readonly #entries = new Map<string, V>();
  #limit: number;
  constructor(limit: number) {
    this.#limit = limit;
  }
  get size(): number {
    return this.#entries.size;
  }
  get limit(): number {
    return this.#limit;
  }
  set limit(limit: number) {
    this.#limit = limit;
    this.#trim();
  }
  get(key: string): V | undefined {
    const value = this.#entries.get(key);
    if (value !== undefined) {
      this.#entries.delete(key);
      this.#entries.set(key, value);
    }
    return value;
  }
  set(key: string, value: V): void {
    if (this.#limit <= 0) {
      return;
    }
    this.#entries.delete(key);
    this.#entries.set(key, value);
    this.#trim();
  }
  delete(key: string): void {
    this.#entries.delete(key);
  }
  clear(): void {
    this.#entries.clear();
  }
  #trim(): void {
    // Map iteration follows insertion order, and get() moves an entry to the end.
    for (const key of this.#entries.keys()) {
      if (this.#entries.size <= this.#limit) {
        break;
      }
      this.#entries.delete(key);
    }
  }
}

export interface GeneratorStore {
  readonly prepared: LeastRecentlyUsed<object>;
  readonly validators: LeastRecentlyUsed<object>;
}

export interface GeneratorCacheOptions {
  /**
   * Prepared generators kept per process (default 256). The least recently used is dropped
   * when another is added. `0` turns sharing off: every generator then prepares its own
   * validator, as before this cache existed.
   */
  readonly maxEntries?: number;
}
export interface GeneratorCacheState {
  readonly maxEntries: number;
  readonly entries: number;
}

/** A limit from the option (a number) or the environment variable (text, or `off`). */
function entryLimit(value: unknown, source: string): number {
  let limit = value;
  if (typeof value === 'string' && source === environmentVariable) {
    limit = /^\s*(?:off|false)\s*$/i.test(value)
      ? 0
      : /^\s*\d{1,7}\s*$/.test(value)
        ? Number(value)
        : value;
  }
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0 || limit > 1_000_000) {
    throw new RangeError(
      `${source} must be ${source === environmentVariable ? 'off or ' : ''}a number of prepared generators from 0 to 1000000`
    );
  }
  return limit;
}

/** The variable is read when the store is created; browsers have no `process` and use the default. */
function configuredLimit(): number {
  const environment = (
    globalThis as { readonly process?: { readonly env?: Record<string, string | undefined> } }
  ).process?.env;
  const value = environment?.[environmentVariable];
  return value === undefined || value === ''
    ? defaultGeneratorCacheEntries
    : entryLimit(value, environmentVariable);
}

function createStore(): GeneratorStore {
  return Object.freeze({
    prepared: new LeastRecentlyUsed<object>(configuredLimit()),
    validators: new LeastRecentlyUsed<object>(validatorContexts),
  });
}

function isStore(value: unknown): value is GeneratorStore {
  const store = value as Partial<GeneratorStore> | null | undefined;
  return typeof store?.prepared?.get === 'function' && typeof store?.validators?.get === 'function';
}

let local: GeneratorStore | undefined;
/**
 * This version's store. A registry that another library replaced with something unexpected,
 * or a frozen `globalThis`, leaves this module with a store of its own.
 */
export function generatorStore(): GeneratorStore {
  if (local) {
    return local;
  }
  let registry: Map<string, unknown> | undefined;
  try {
    const holder = globalThis as unknown as Record<symbol, unknown>;
    const existing = holder[registryKey] as Map<string, unknown> | undefined;
    if (existing === undefined) {
      registry = new Map();
      Object.defineProperty(globalThis, registryKey, { value: registry, configurable: true });
    } else if (typeof existing?.get === 'function' && typeof existing?.set === 'function') {
      registry = existing;
    }
  } catch {
    registry = undefined;
  }
  const found = registry?.get(storeName);
  const store = isStore(found) ? found : createStore();
  if (store !== found) {
    try {
      registry?.set(storeName, store);
    } catch {
      // Keep the store for this module only.
    }
  }
  local = store;
  return store;
}

/**
 * Read or change how many prepared generators this process keeps. The setting applies to every
 * copy of this package version in the same realm. The `MIMLET_GENERATOR_CACHE` environment
 * variable sets the starting value: `off` or `0` turns sharing off, a number sets the limit.
 */
export function configureGeneratorCache(options: GeneratorCacheOptions = {}): GeneratorCacheState {
  const store = generatorStore();
  if (options.maxEntries !== undefined) {
    const limit = entryLimit(options.maxEntries, 'maxEntries');
    store.prepared.limit = limit;
    if (limit === 0) {
      store.validators.clear();
    }
  }
  return { maxEntries: store.prepared.limit, entries: store.prepared.size };
}

/** Drop every prepared generator and shared validator this package version keeps. */
export function clearGeneratorCache(): void {
  const store = generatorStore();
  store.prepared.clear();
  store.validators.clear();
}

/**
 * Exact JSON text of copied schema data, or `undefined` when JSON text would lose information
 * (a negative zero prints as `0`), so that data is never shared.
 */
export function exactJson(value: unknown): string | undefined {
  let exact = true;
  const text = JSON.stringify(value, (_key, item: unknown) => {
    if (item === 0 && Object.is(item, -0)) {
      exact = false;
    }
    return item;
  });
  return exact ? text : undefined;
}
