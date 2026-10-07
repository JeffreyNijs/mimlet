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
import { createDiskCache, type DiskCache, type GeneratorDiskCacheOptions } from './disk.js';
import type { GeneratorDiskCacheState } from './disk.js';
export type { GeneratorDiskCacheOptions, GeneratorDiskCacheState } from './disk.js';

/** Bump when the registry's shape changes. Stores inside it are keyed by package version. */
const registryKey = Symbol.for('mimlet.generators.v1');
const storeName = `@mimlet/json-schema@${packageVersion}`;
/** Prepared generators kept per process when nothing is configured. */
export const defaultGeneratorCacheEntries = 256;
/** Shared validator instances, one per dialect, limits, annotations and reference set. */
const validatorContexts = 16;
const environmentVariable = 'MIMLET_GENERATOR_CACHE';
const directoryVariable = 'MIMLET_GENERATOR_CACHE_DIR';

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
  /** The configured disk cache, if any; see `disk.ts`. */
  readonly disk: { cache: DiskCache | undefined };
}

export interface GeneratorCacheOptions {
  /**
   * Prepared generators kept per process (default 256). The least recently used is dropped
   * when another is added. `0` turns sharing off: every generator then prepares its own
   * validator, as before this cache existed.
   */
  readonly maxEntries?: number;
  /**
   * Keep compiled validators on disk, so a new process or test worker loads them instead of
   * compiling them again. Off by default, and only in Node. `true` uses
   * `node_modules/.cache/mimlet` in the nearest directory with a `package.json`; settings
   * choose the directory and its bounds; `false` turns it off.
   */
  readonly disk?: boolean | GeneratorDiskCacheOptions;
}
export interface GeneratorCacheState {
  readonly maxEntries: number;
  readonly entries: number;
  /** Present while a disk cache is configured and usable in this process. */
  readonly disk?: GeneratorDiskCacheState;
}

/** A limit from the option (a number) or the environment variable (text, or `off`). */
function entryLimit(value: unknown, source: string): number {
  let limit = value;
  if (typeof value === 'string' && source === environmentVariable) {
    limit = /^\s*(?:off|false)\s*$/i.test(value)
      ? 0
      : /^\s*disk\s*$/i.test(value)
        ? defaultGeneratorCacheEntries
        : /^\s*\d{1,7}\s*$/.test(value)
          ? Number(value)
          : value;
  }
  if (typeof limit !== 'number' || !Number.isSafeInteger(limit) || limit < 0 || limit > 1_000_000) {
    throw new RangeError(
      `${source} must be ${source === environmentVariable ? 'off, disk or ' : ''}a number of prepared generators from 0 to 1000000`
    );
  }
  return limit;
}

/**
 * The variables are read when the store is created; browsers have no `process` and use the
 * defaults. `MIMLET_GENERATOR_CACHE=disk` turns the disk cache on in its default directory,
 * and `MIMLET_GENERATOR_CACHE_DIR` turns it on in that directory.
 */
function createStore(): GeneratorStore {
  const environment = (
    globalThis as { readonly process?: { readonly env?: Record<string, string | undefined> } }
  ).process?.env;
  const value = environment?.[environmentVariable];
  const limit =
    value === undefined || value === ''
      ? defaultGeneratorCacheEntries
      : entryLimit(value, environmentVariable);
  const directory = environment?.[directoryVariable];
  const disk =
    directory !== undefined && directory.trim() !== ''
      ? { directory }
      : value !== undefined && /^\s*disk\s*$/i.test(value);
  return Object.freeze({
    prepared: new LeastRecentlyUsed<object>(limit),
    validators: new LeastRecentlyUsed<object>(validatorContexts),
    disk: { cache: createDiskCache(disk) },
  });
}

function isStore(value: unknown): value is GeneratorStore {
  const store = value as Partial<GeneratorStore> | null | undefined;
  return (
    typeof store?.prepared?.get === 'function' &&
    typeof store?.validators?.get === 'function' &&
    typeof store?.disk === 'object' &&
    store.disk !== null
  );
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
 * Read or change how many prepared generators this process keeps, and whether compiled
 * validators are kept on disk. The settings apply to every copy of this package version in the
 * same realm. The `MIMLET_GENERATOR_CACHE` environment variable sets the starting value: `off`
 * or `0` turns sharing off, a number sets the limit, and `disk` also turns the disk cache on.
 * `MIMLET_GENERATOR_CACHE_DIR` turns the disk cache on in that directory.
 */
export function configureGeneratorCache(options: GeneratorCacheOptions = {}): GeneratorCacheState {
  const store = generatorStore();
  const limit =
    options.maxEntries === undefined ? undefined : entryLimit(options.maxEntries, 'maxEntries');
  if (options.disk !== undefined) {
    store.disk.cache = createDiskCache(options.disk);
  }
  if (limit !== undefined) {
    store.prepared.limit = limit;
    if (limit === 0) {
      store.validators.clear();
    }
  }
  const disk = store.disk.cache;
  return {
    maxEntries: store.prepared.limit,
    entries: store.prepared.size,
    ...(disk?.usable ? { disk: disk.state() } : {}),
  };
}

/**
 * Drop every prepared generator and shared validator this package version keeps in memory.
 * The disk cache keeps its entries; delete its directory to clear it.
 */
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
