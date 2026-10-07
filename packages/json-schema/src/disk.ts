/**
 * Opt-in on-disk cache of compiled validators, for test runners that start a new process or
 * worker for every spec file. Off unless configured; Node only.
 *
 * An entry holds Ajv's standalone code for one compiled validator, plus the format names and
 * the supplied references the validator was prepared with. Its file name is the SHA-256 of a
 * key made of the schema and reference text, every option that changes the compiled code, and
 * the versions of this package, Ajv, ajv-formats and the Node major. Loading an entry runs its
 * code, so an entry is used only when its HMAC matches a random key that this cache created in
 * the directory, readable only by the current user. Anyone who can write files as that user
 * can still run code through the cache, as through `node_modules`.
 *
 * Writes go to a temporary file that is renamed into place, so concurrent workers see a whole
 * entry or none. Any failure to read, verify or load an entry is a miss: the validator is
 * compiled in memory as without the cache, and the entry is written again. Node built-ins are
 * reached through `process.getBuiltinModule()`, so browser bundles never load them.
 */
import { packageVersion } from './version.js';

/** Bump when the entry layout changes. Part of every key. */
const entryFormat = 'mimlet-generator-cache 1';
export const defaultDiskEntries = 2000;
export const defaultDiskBytes = 128 * 1024 * 1024;
const entryName = /^[0-9a-f]{64}\.entry$/;
const temporaryName = /^(?:[0-9a-f]{64}\.entry|key)\.\d+\.[0-9a-f]{12}\.tmp$/;
/** Temporary files older than this were left by a process that stopped while writing. */
const staleTemporaryMs = 10 * 60 * 1000;
/** Prune after the first write of a process and then after every this many writes. */
const writesPerPrune = 64;
/** The modules Ajv's standalone code may load: its runtime helpers and ajv-formats' formats. */
const runtimeModules =
  /^(?:ajv\/dist\/runtime\/(?:equal|ucs2length|uri|validation_error|quote|re2|timestamp|parseJson)|ajv-formats\/dist\/formats)$/;
const requireCall = /\brequire\(("(?:[^"\\]|\\.)*")\)/g;

export interface GeneratorDiskCacheOptions {
  /**
   * Directory for the entries. A relative path is resolved against the working directory.
   * Default: `node_modules/.cache/mimlet` in the working directory, or in the nearest
   * directory above it, that has a `package.json`.
   */
  readonly directory?: string;
  /** Entries kept (default 2000). The least recently used are removed first. */
  readonly maxEntries?: number;
  /** Total size of the entries in bytes (default 128 MiB). */
  readonly maxBytes?: number;
}
export interface GeneratorDiskCacheState {
  readonly directory: string;
  readonly maxEntries: number;
  readonly maxBytes: number;
  /** Validators this process loaded from disk. */
  readonly hits: number;
  /** Lookups this process compiled instead: no entry, or one that could not be used. */
  readonly misses: number;
}

/** The parts of an entry that preparation uses. */
export interface DiskEntry {
  readonly formats: ReadonlyArray<string>;
  readonly references: ReadonlyArray<string>;
  readonly validate: (value: unknown) => unknown;
}

// The package compiles without Node's types, so the few built-ins used here are described.
interface FileStats {
  readonly uid: number;
  readonly mode: number;
  readonly size: number;
  readonly mtimeMs: number;
  isFile(): boolean;
  isDirectory(): boolean;
}
interface FileSystem {
  readonly constants: {
    readonly O_RDONLY: number;
    readonly O_NOFOLLOW?: number;
    readonly O_NONBLOCK?: number;
  };
  readFileSync(path: string | number, encoding: 'utf8'): string;
  openSync(path: string, flags: number): number;
  fstatSync(descriptor: number): FileStats;
  closeSync(descriptor: number): void;
  writeFileSync(path: string, data: string, options: { mode: number; flag: string }): void;
  renameSync(from: string, to: string): void;
  linkSync(existing: string, created: string): void;
  unlinkSync(path: string): void;
  mkdirSync(path: string, options: { recursive: boolean; mode: number }): unknown;
  statSync(path: string): FileStats;
  readdirSync(path: string): string[];
  utimesSync(path: string, atime: Date, mtime: Date): void;
}
interface PathApi {
  resolve(...paths: string[]): string;
  join(...paths: string[]): string;
  dirname(path: string): string;
}
interface Digest {
  update(data: string): Digest;
  digest(encoding: 'hex'): string;
}
interface CryptoApi {
  createHash(algorithm: string): Digest;
  createHmac(algorithm: string, key: string): Digest;
  randomBytes(size: number): { toString(encoding: 'hex'): string };
}
interface ProcessApi {
  readonly pid: number;
  readonly platform: string;
  readonly versions: { readonly node?: string };
  readonly env?: Record<string, string | undefined>;
  getBuiltinModule?(id: string): unknown;
  getuid?(): number;
  cwd(): string;
  emitWarning(warning: string, options: { code: string }): void;
}
interface NodeApi {
  readonly fs: FileSystem;
  readonly path: PathApi;
  readonly crypto: CryptoApi;
  readonly process: ProcessApi;
  readonly require: (id: string) => unknown;
}

/** Node's built-ins, or `undefined` in a browser or any runtime without them. */
function nodeApi(): NodeApi | undefined {
  const runtime = (globalThis as { readonly process?: ProcessApi }).process;
  if (
    typeof runtime?.getBuiltinModule !== 'function' ||
    typeof runtime.versions?.node !== 'string'
  ) {
    return undefined;
  }
  try {
    const load = runtime.getBuiltinModule.bind(runtime);
    const fs = load('node:fs') as FileSystem | undefined;
    const path = load('node:path') as PathApi | undefined;
    const crypto = load('node:crypto') as CryptoApi | undefined;
    const module = load('node:module') as
      { createRequire?(from: string): (id: string) => unknown } | undefined;
    if (!fs || !path || !crypto || typeof module?.createRequire !== 'function') {
      return undefined;
    }
    // Resolves Ajv and ajv-formats from this package, the copies it compiles with.
    return { fs, path, crypto, process: runtime, require: module.createRequire(import.meta.url) };
  } catch {
    return undefined;
  }
}

const errorCode = (error: unknown): unknown => (error as { readonly code?: unknown } | null)?.code;

/**
 * Rename a complete file into place. Windows can refuse a rename for a moment while another
 * process renames or reads the same target, so it is tried a few more times there.
 */
function renameIntoPlace(api: NodeApi, from: string, to: string): void {
  for (let attempt = 0; ; attempt += 1) {
    try {
      api.fs.renameSync(from, to);
      return;
    } catch (error) {
      if (
        api.process.platform !== 'win32' ||
        attempt >= 4 ||
        !['EPERM', 'EACCES', 'EBUSY'].includes(errorCode(error) as string)
      ) {
        throw error;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1));
    }
  }
}

function warn(api: NodeApi, message: string): void {
  try {
    api.process.emitWarning(`Mimlet's generator disk cache is not used: ${message}`, {
      code: 'MIMLET_GENERATOR_CACHE',
    });
  } catch {
    // A warning is only a hint.
  }
}

/** `node_modules/.cache/mimlet` in the nearest directory with a `package.json`. */
function defaultDirectory(api: NodeApi): string | undefined {
  let directory = api.path.resolve(api.process.cwd());
  for (;;) {
    try {
      if (api.fs.statSync(api.path.join(directory, 'package.json')).isFile()) {
        return api.path.join(directory, 'node_modules', '.cache', 'mimlet');
      }
    } catch {
      // Not here; look in the parent.
    }
    const parent = api.path.dirname(directory);
    if (parent === directory) {
      return undefined;
    }
    directory = parent;
  }
}

function bound(value: unknown, name: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`disk.${name} must be a positive integer`);
  }
  return value;
}

/** Same text, compared without stopping at the first difference. */
function sameText(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

const isNames = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

/** The disk cache for one directory. Setup (directory and key) happens on first use. */
export class DiskCache {
  readonly directory: string;
  readonly maxEntries: number;
  readonly maxBytes: number;
  hits = 0;
  misses = 0;
  readonly #api: NodeApi;
  /** The HMAC key and the versions part of every key, once set up. */
  #setup: { readonly secret: string; readonly environment: string } | undefined;
  #failed = false;
  #writes = 0;

  constructor(api: NodeApi, directory: string, maxEntries: number, maxBytes: number) {
    this.#api = api;
    this.directory = directory;
    this.maxEntries = maxEntries;
    this.maxBytes = maxBytes;
  }

  /** False once setup failed; the process then compiles in memory only. */
  get usable(): boolean {
    return !this.#failed;
  }

  state(): GeneratorDiskCacheState {
    return {
      directory: this.directory,
      maxEntries: this.maxEntries,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }

  /** Creates the directory and reads or creates the key, once. */
  #ready(): { readonly secret: string; readonly environment: string } | undefined {
    if (this.#setup || this.#failed) {
      return this.#setup;
    }
    const { fs, process } = this.#api;
    try {
      const version = (name: string): string => {
        const manifest = this.#api.require(`${name}/package.json`) as { version?: unknown };
        if (typeof manifest?.version !== 'string') {
          throw new Error(`the version of ${name} is unknown`);
        }
        return manifest.version;
      };
      const environment = JSON.stringify([
        entryFormat,
        `@mimlet/json-schema@${packageVersion}`,
        `ajv@${version('ajv')}`,
        `ajv-formats@${version('ajv-formats')}`,
        `node@${process.versions.node?.split('.')[0]}`,
      ]);
      fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
      if (!fs.statSync(this.directory).isDirectory()) {
        throw new Error(`${this.directory} is not a directory`);
      }
      this.#setup = { secret: this.#loadSecret(), environment };
      return this.#setup;
    } catch (error) {
      this.#failed = true;
      warn(this.#api, error instanceof Error ? error.message : String(error));
      return undefined;
    }
  }

  #temporary(file: string): string {
    return `${file}.${this.#api.process.pid}.${this.#api.crypto.randomBytes(6).toString('hex')}.tmp`;
  }

  /**
   * The content of the key file, or `undefined` when there is none. The checks apply to the
   * opened file itself: a symbolic link is refused rather than followed, and so is anything
   * but a regular file owned by the current user and not readable by anyone else.
   */
  #readSecret(file: string): string | undefined {
    const { fs, process } = this.#api;
    let descriptor: number;
    try {
      descriptor = fs.openSync(
        file,
        fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0)
      );
    } catch (error) {
      if (errorCode(error) === 'ENOENT') {
        return undefined;
      }
      throw errorCode(error) === 'ELOOP' ? new Error(`${file} is not a regular file`) : error;
    }
    try {
      const stats = fs.fstatSync(descriptor);
      if (!stats.isFile()) {
        throw new Error(`${file} is not a regular file`);
      }
      if (
        typeof process.getuid === 'function' &&
        (stats.uid !== process.getuid() || (stats.mode & 0o077) !== 0)
      ) {
        throw new Error(
          `${file} must belong to the current user and be readable only by them (mode 600)`
        );
      }
      return fs.readFileSync(descriptor, 'utf8');
    } finally {
      fs.closeSync(descriptor);
    }
  }

  /** The HMAC key: 32 random bytes as hex in `key`, created with mode 600. */
  #loadSecret(): string {
    const { fs, path, crypto } = this.#api;
    const file = path.join(this.directory, 'key');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const existing = this.#readSecret(file);
      if (existing !== undefined && /^[0-9a-f]{64}$/.test(existing)) {
        return existing;
      }
      // Missing, or not a key this cache wrote: write a new one. Linking a complete file
      // into place never overwrites another worker's key; a rename replaces an invalid one.
      const temporary = this.#temporary(file);
      fs.writeFileSync(temporary, crypto.randomBytes(32).toString('hex'), {
        mode: 0o600,
        flag: 'wx',
      });
      try {
        if (existing !== undefined) {
          renameIntoPlace(this.#api, temporary, file);
        } else {
          try {
            fs.linkSync(temporary, file);
          } catch (error) {
            if (errorCode(error) !== 'EEXIST') {
              // No hard links on this file system.
              renameIntoPlace(this.#api, temporary, file);
            }
          }
        }
      } finally {
        try {
          fs.unlinkSync(temporary);
        } catch {
          // Already renamed.
        }
      }
    }
    throw new Error(`could not create ${file}`);
  }

  #signature(secret: string, body: string): string {
    return this.#api.crypto.createHmac('sha256', secret).update(body).digest('hex');
  }

  /** The entry name for a preparation's key text, or `undefined` when the cache is unusable. */
  digest(key: string): string | undefined {
    const setup = this.#ready();
    return setup
      ? this.#api.crypto
          .createHash('sha256')
          .update(setup.environment)
          .update('\n')
          .update(key)
          .digest('hex')
      : undefined;
  }

  #file(digest: string): string {
    return this.#api.path.join(this.directory, `${digest}.entry`);
  }

  /** The verified and loaded entry, or `undefined` (a miss) for anything else. */
  read(digest: string): DiskEntry | undefined {
    const { fs } = this.#api;
    const file = this.#file(digest);
    const setup = this.#ready();
    let entry: DiskEntry | undefined;
    try {
      entry = setup && this.#load(fs.readFileSync(file, 'utf8'), digest, setup.secret);
    } catch {
      entry = undefined;
    }
    if (!entry) {
      this.misses += 1;
      return undefined;
    }
    this.hits += 1;
    try {
      // The modification time orders entries for pruning.
      const now = new Date();
      fs.utimesSync(file, now, now);
    } catch {
      // Removed by another worker's pruning, or a read-only directory.
    }
    return entry;
  }

  #load(text: string, digest: string, secret: string): DiskEntry | undefined {
    const first = text.indexOf('\n');
    const second = text.indexOf('\n', first + 1);
    if (first < 0 || second < 0 || text.slice(0, first) !== entryFormat) {
      return undefined;
    }
    const body = text.slice(second + 1);
    if (!sameText(text.slice(first + 1, second), this.#signature(secret, body))) {
      return undefined;
    }
    const third = body.indexOf('\n');
    if (third < 0) {
      return undefined;
    }
    const header = JSON.parse(body.slice(0, third)) as {
      readonly key?: unknown;
      readonly formats?: unknown;
      readonly references?: unknown;
    } | null;
    if (header?.key !== digest || !isNames(header.formats) || !isNames(header.references)) {
      return undefined;
    }
    const module: { exports: unknown } = { exports: {} };
    const load = (id: string): unknown => {
      if (typeof id !== 'string' || !runtimeModules.test(id)) {
        throw new Error('A cached validator may load only Ajv runtime helpers');
      }
      return this.#api.require(id);
    };
    // The same evaluation Ajv performs for a validator it compiles, of code this cache wrote.
    new Function('require', 'module', 'exports', body.slice(third + 1))(
      load,
      module,
      module.exports
    );
    const validate = module.exports;
    return typeof validate === 'function'
      ? {
          formats: header.formats,
          references: header.references,
          validate: validate as DiskEntry['validate'],
        }
      : undefined;
  }

  /**
   * Store a compiled validator. `code` produces Ajv's standalone code; it is called only when
   * the cache is usable. Failures leave the cache as it was.
   */
  write(
    digest: string,
    formats: ReadonlyArray<string>,
    references: ReadonlyArray<string>,
    code: () => string
  ): void {
    const setup = this.#ready();
    if (!setup) {
      return;
    }
    const { fs } = this.#api;
    const file = this.#file(digest);
    let temporary: string | undefined;
    try {
      const source = code();
      // Ajv's standalone code loads its runtime helpers with require(). Anything else would
      // fail to load later, so it is not stored.
      for (const [, id] of source.matchAll(requireCall)) {
        if (!runtimeModules.test(JSON.parse(id ?? '""') as string)) {
          return;
        }
      }
      const body = `${JSON.stringify({ key: digest, formats, references })}\n${source}`;
      temporary = this.#temporary(file);
      fs.writeFileSync(
        temporary,
        `${entryFormat}\n${this.#signature(setup.secret, body)}\n${body}`,
        {
          mode: 0o600,
          flag: 'wx',
        }
      );
      renameIntoPlace(this.#api, temporary, file);
      temporary = undefined;
    } catch {
      if (temporary !== undefined) {
        try {
          fs.unlinkSync(temporary);
        } catch {
          // Nothing was written.
        }
      }
      return;
    }
    this.#writes += 1;
    if (this.#writes === 1 || this.#writes % writesPerPrune === 0) {
      this.prune();
    }
  }

  /**
   * Keep the most recently used entries within both bounds and remove temporary files left
   * by stopped writers. Only files this cache names are removed.
   */
  prune(): void {
    const { fs, path } = this.#api;
    let names: string[];
    try {
      names = fs.readdirSync(this.directory);
    } catch {
      return;
    }
    const now = Date.now();
    const entries: { file: string; size: number; time: number }[] = [];
    for (const name of names) {
      const file = path.join(this.directory, name);
      try {
        if (entryName.test(name)) {
          const stats = fs.statSync(file);
          entries.push({ file, size: stats.size, time: stats.mtimeMs });
        } else if (temporaryName.test(name) && now - fs.statSync(file).mtimeMs > staleTemporaryMs) {
          fs.unlinkSync(file);
        }
      } catch {
        // Removed meanwhile by another worker.
      }
    }
    entries.sort((left, right) => right.time - left.time);
    let bytes = 0;
    for (const [index, entry] of entries.entries()) {
      bytes += entry.size;
      if (index >= this.maxEntries || bytes > this.maxBytes) {
        try {
          fs.unlinkSync(entry.file);
        } catch {
          // Removed meanwhile by another worker.
        }
      }
    }
  }
}

/**
 * A disk cache for the option (`true`, `false` or settings) or the environment, or
 * `undefined` when it is off or this runtime has no file system. Throws for invalid settings.
 */
export function createDiskCache(option: unknown): DiskCache | undefined {
  if (option === undefined || option === false) {
    return undefined;
  }
  if (option !== true && (typeof option !== 'object' || option === null || Array.isArray(option))) {
    throw new TypeError('disk must be true, false or an object of disk cache settings');
  }
  const settings = option === true ? {} : (option as GeneratorDiskCacheOptions);
  const maxEntries = bound(settings.maxEntries, 'maxEntries', defaultDiskEntries);
  const maxBytes = bound(settings.maxBytes, 'maxBytes', defaultDiskBytes);
  if (
    settings.directory !== undefined &&
    (typeof settings.directory !== 'string' || settings.directory.trim() === '')
  ) {
    throw new TypeError('disk.directory must be a nonempty path');
  }
  const api = nodeApi();
  if (!api) {
    return undefined;
  }
  const directory =
    settings.directory === undefined
      ? defaultDirectory(api)
      : api.path.resolve(api.process.cwd(), settings.directory);
  if (directory === undefined) {
    warn(
      api,
      'no package.json was found above the working directory; set a directory to use the cache'
    );
    return undefined;
  }
  return new DiskCache(api, directory, maxEntries, maxBytes);
}
