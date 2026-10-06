/** Deterministic test-data sessions. These generators are NOT cryptographic. */
export type SessionKey = string | number;
export interface SessionIdentity {
  readonly fingerprint: string;
  readonly provider: string;
  readonly configuration?: string;
}
export interface SessionOptions extends SessionIdentity {
  readonly seed: SessionKey;
  readonly referenceTime?: string;
  readonly maxOperations?: number;
  readonly maxKeys?: number;
  readonly maxUniqueValues?: number;
  readonly maxAttempts?: number;
}
interface Settings extends Required<Omit<SessionOptions, 'seed'>> {
  readonly seedToken: string;
}
interface Sequence {
  start: number;
  step: number;
  index: number;
}
export interface SessionSnapshot {
  readonly format: 'test-builders/session';
  readonly version: 1;
  readonly algorithm: 'splitmix64-fnv1a64-utf16-v1';
  readonly settings: Readonly<Settings>;
  readonly scope: ReadonlyArray<string>;
  readonly operations: number;
  readonly streams: ReadonlyArray<readonly [string, number]>;
  readonly sequences: ReadonlyArray<readonly [string, Readonly<Sequence>]>;
  readonly unique: ReadonlyArray<readonly [string, ReadonlyArray<string>]>;
}
export class SessionBudgetError extends Error {
  readonly code = 'SESSION_BUDGET_EXHAUSTED';
  constructor(budget: string) {
    super(`Generation session exhausted its ${budget} budget`);
    this.name = 'SessionBudgetError';
  }
}
export class SessionReplayError extends Error {
  readonly code = 'INVALID_SESSION_REPLAY';
  constructor(message: string) {
    super(message);
    this.name = 'SessionReplayError';
  }
}
const MASK = (1n << 64n) - 1n;
const SPACE = 1n << 64n;
const ALGORITHM = 'splitmix64-fnv1a64-utf16-v1' as const;
const safe = (value: number) => Number.isSafeInteger(value);
function key(value: SessionKey): string {
  if (typeof value === 'string' && value.length <= 4096) {
    return `s${value.length}:${value}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `n:${Object.is(value, -0) ? '-0' : value}`;
  }
  throw new TypeError('Session keys must be finite numbers or strings of at most 4096 characters');
}
function hash(value: string): bigint {
  let result = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    result = ((result ^ BigInt(unit & 255)) * 0x100000001b3n) & MASK;
    result = ((result ^ BigInt(unit >>> 8)) * 0x100000001b3n) & MASK;
  }
  return result;
}
/** SplitMix64 mixing function, adapted from Vigna's public-domain reference implementation. */
function word(seed: bigint, index: number): bigint {
  let value = (seed + 0x9e3779b97f4a7c15n * BigInt(index + 1)) & MASK;
  value = ((value ^ (value >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
  value = ((value ^ (value >> 27n)) * 0x94d049bb133111ebn) & MASK;
  return value ^ (value >> 31n);
}
function settings(options: SessionOptions): Settings {
  key(options.seed);
  if (
    typeof options.fingerprint !== 'string' ||
    !options.fingerprint ||
    typeof options.provider !== 'string' ||
    !options.provider ||
    (options.configuration !== undefined && typeof options.configuration !== 'string')
  ) {
    throw new TypeError(
      'A session requires a fingerprint, provider/version, and optional configuration identity'
    );
  }
  const referenceTime = options.referenceTime ?? '2000-01-01T00:00:00.000Z';
  if (
    typeof referenceTime !== 'string' ||
    !Number.isFinite(Date.parse(referenceTime)) ||
    new Date(referenceTime).toISOString() !== referenceTime
  ) {
    throw new TypeError('referenceTime must be a canonical ISO UTC date string');
  }
  const result = {
    fingerprint: options.fingerprint,
    provider: options.provider,
    configuration: options.configuration ?? '',
    seedToken: key(options.seed),
    referenceTime: new Date(referenceTime).toISOString(),
    maxOperations: options.maxOperations ?? 1_000_000,
    maxKeys: options.maxKeys ?? 10_000,
    maxUniqueValues: options.maxUniqueValues ?? 100_000,
    maxAttempts: options.maxAttempts ?? 100,
  };
  for (const name of ['maxOperations', 'maxKeys', 'maxUniqueValues', 'maxAttempts'] as const) {
    if (!safe(result[name]) || result[name] < 0) {
      throw new RangeError(`${name} must be a nonnegative safe integer`);
    }
  }
  return Object.freeze(result);
}
interface State {
  settings: Settings;
  operations: number;
  streams: Map<string, number>;
  sequences: Map<string, Sequence>;
  unique: Map<string, Set<string>>;
  uniqueCount: number;
}
function primitive(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  switch (typeof value) {
    case 'string':
      return key(value);
    case 'number':
      return `n:${Object.is(value, -0) ? '-0' : String(value)}`;
    case 'bigint':
      return `i:${value}`;
    case 'boolean':
      return `b:${value}`;
    case 'undefined':
      return 'undefined';
    default:
      throw new TypeError('Object uniqueness requires a primitive keyOf result');
  }
}
function consume(state: State): void {
  if (state.operations >= state.settings.maxOperations) {
    throw new SessionBudgetError('operations');
  }
  state.operations += 1;
}
function reserve(state: State): void {
  if (state.streams.size + state.sequences.size + state.unique.size >= state.settings.maxKeys) {
    throw new SessionBudgetError('tracked keys');
  }
}
export interface GenerationSession {
  /** Views share this session's counters; different names use independent streams. */
  scope(...keys: SessionKey[]): GenerationSession;
  random(): number;
  integer(minimum: number, maximum: number): number;
  boolean(probability?: number): boolean;
  pick<T>(values: ReadonlyArray<T>): T;
  sequence(name: SessionKey, start?: number, step?: number): number;
  unique<T>(
    name: SessionKey,
    factory: () => T,
    options?: {
      readonly keyOf?: (value: T) => unknown;
      readonly attempts?: number;
    }
  ): T;
  /** A fresh Date on every access; no ambient clock is read. */
  referenceDate(): Date;
  snapshot(): SessionSnapshot;
}
function session(state: State, scope: ReadonlyArray<string>): GenerationSession {
  const namespace = JSON.stringify(scope);
  const seed = hash(`${state.settings.seedToken}|${namespace}`);
  const next = (): bigint => {
    const index = state.streams.get(namespace) ?? 0;
    if (!state.streams.has(namespace)) {
      reserve(state);
    }
    consume(state);
    state.streams.set(namespace, index + 1);
    return word(seed, index);
  };
  const api: GenerationSession = {
    scope(...names) {
      names.forEach(key);
      if (scope.length + names.length > 64) {
        throw new RangeError('Session scope depth exceeds 64');
      }
      return session(state, [...scope, ...names.map(key)]);
    },
    random() {
      return Number(next() >> 11n) / 0x20000000000000;
    },
    integer(minimum, maximum) {
      if (!safe(minimum) || !safe(maximum) || minimum > maximum) {
        throw new RangeError('Integer bounds must be ordered safe integers');
      }
      const span = BigInt(maximum) - BigInt(minimum) + 1n;
      const limit = SPACE - (SPACE % span);
      let value: bigint;
      do {
        value = next();
      } while (value >= limit);
      return Number(BigInt(minimum) + (value % span));
    },
    boolean(probability = 0.5) {
      if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
        throw new RangeError('Probability must be between zero and one');
      }
      return api.random() < probability;
    },
    pick(values) {
      if (!Array.isArray(values) || values.length === 0) {
        throw new RangeError('pick() requires a nonempty array');
      }
      const index = api.integer(0, values.length - 1);
      if (!Object.hasOwn(values, index)) {
        throw new TypeError('pick() does not accept sparse arrays');
      }
      return values[index] as (typeof values)[number];
    },
    sequence(name, start = 0, step = 1) {
      const id = `${namespace}|${key(name)}`;
      if (!safe(start) || !safe(step) || step === 0) {
        throw new RangeError('Sequence start/step must be safe integers with nonzero step');
      }
      let entry = state.sequences.get(id);
      if (entry && (entry.start !== start || entry.step !== step)) {
        throw new TypeError('A named sequence cannot change its start or step');
      }
      if (!entry) {
        reserve(state);
        entry = { start, step, index: 0 };
      }
      const value = BigInt(start) + BigInt(step) * BigInt(entry.index);
      if (value < BigInt(Number.MIN_SAFE_INTEGER) || value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('Sequence exhausted the safe integer range');
      }
      consume(state);
      entry.index += 1;
      state.sequences.set(id, entry);
      return Number(value);
    },
    unique(name, factory, options = {}) {
      const id = `${namespace}|${key(name)}`;
      const attempts = options.attempts ?? state.settings.maxAttempts;
      if (!safe(attempts) || attempts < 1 || attempts > state.settings.maxAttempts) {
        throw new RangeError('Uniqueness attempts must fit the configured positive attempt budget');
      }
      if (
        typeof factory !== 'function' ||
        (options.keyOf !== undefined && typeof options.keyOf !== 'function')
      ) {
        throw new TypeError('Uniqueness requires callable factory and keyOf functions');
      }
      let seen = state.unique.get(id);
      if (!seen) {
        reserve(state);
        seen = new Set();
        state.unique.set(id, seen);
      }
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (state.uniqueCount >= state.settings.maxUniqueValues) {
          throw new SessionBudgetError('unique values');
        }
        consume(state);
        const value = factory();
        // Uniqueness is synchronous; observe an accidental rejected promise before rejecting it.
        if (
          value !== null &&
          (typeof value === 'object' || typeof value === 'function') &&
          typeof (value as { then?: unknown }).then === 'function'
        ) {
          void Promise.resolve(value).catch(() => {});
          throw new TypeError('unique() requires a synchronous factory');
        }
        const identity = primitive(options.keyOf ? options.keyOf(value) : value);
        if (!seen.has(identity)) {
          seen.add(identity);
          state.uniqueCount += 1;
          return value;
        }
      }
      throw new SessionBudgetError('uniqueness attempts');
    },
    referenceDate() {
      return new Date(state.settings.referenceTime);
    },
    snapshot() {
      return {
        format: 'test-builders/session',
        version: 1,
        algorithm: ALGORITHM,
        settings: { ...state.settings },
        scope: [...scope],
        operations: state.operations,
        streams: [...state.streams].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        sequences: [...state.sequences].map(([id, value]) => [id, { ...value }] as const),
        unique: [...state.unique].map(([id, values]) => [id, [...values]] as const),
      };
    },
  };
  return Object.freeze(api);
}
/**
 * Values depend on the seed and the scope path only. The fingerprint, provider and
 * configuration identify the producer for `restoreSession()`, which rejects a mismatch;
 * they do not change the generated values.
 */
export function createSession(options: SessionOptions): GenerationSession {
  return session(
    {
      settings: settings(options),
      operations: 0,
      streams: new Map(),
      sequences: new Map(),
      unique: new Map(),
      uniqueCount: 0,
    },
    []
  );
}
/** The identity of every `createTestSession()` session; pass it to `restoreSession()`. */
export const testSessionIdentity: SessionIdentity = Object.freeze({
  fingerprint: 'mimlet/test-session',
  provider: 'mimlet/test-session@1',
});
/** Session settings other than the seed and identity, such as `referenceTime` and budgets. */
export type TestSessionOptions = Omit<SessionOptions, 'seed' | keyof SessionIdentity>;
/**
 * A session to share across the builds of one test or test file, so consecutive builds
 * continue its streams and sequences instead of repeating the first value. The seed defaults
 * to 1, the seed of the adapters' default sessions, so an unnamed adapter builder's `build()`
 * equals `build(createTestSession())`. Use `createSession()` with your own identity when a
 * saved replay must fail after your recipe changes.
 */
export function createTestSession(
  seed: SessionKey = 1,
  options: TestSessionOptions = {}
): GenerationSession {
  return createSession({ ...options, ...testSessionIdentity, seed });
}
/** Restore a checkpoint only after the consumer confirms the exact producer identity. */
export function restoreSession(
  snapshot: SessionSnapshot,
  expected: SessionIdentity
): GenerationSession {
  const fail = (): never => {
    throw new SessionReplayError('Malformed or incompatible generation session replay');
  };
  if (
    !snapshot ||
    snapshot.format !== 'test-builders/session' ||
    snapshot.version !== 1 ||
    snapshot.algorithm !== ALGORITHM ||
    !snapshot.settings
  ) {
    fail();
  }
  const validToken = (token: string) => {
    if (typeof token !== 'string') {
      return false;
    }
    if (token.startsWith('n:')) {
      const number = Number(token.slice(2));
      return Number.isFinite(number) && key(number) === token;
    }
    const match = /^s(0|[1-9][0-9]*):/.exec(token);
    return (
      match !== null &&
      Number(match[1]) <= 4096 &&
      token.length - match[0].length === Number(match[1])
    );
  };
  if (!validToken(snapshot.settings.seedToken)) {
    fail();
  }
  const config = Object.freeze({
    ...settings({ ...snapshot.settings, seed: '' }),
    seedToken: snapshot.settings.seedToken,
  });
  if (
    expected.fingerprint !== config.fingerprint ||
    expected.provider !== config.provider ||
    (expected.configuration ?? '') !== config.configuration
  ) {
    throw new SessionReplayError(
      'Replay fingerprint, provider/version, or configuration does not match'
    );
  }
  if (
    !Array.isArray(snapshot.scope) ||
    snapshot.scope.length > 64 ||
    !safe(snapshot.operations) ||
    snapshot.operations < 0 ||
    snapshot.operations > config.maxOperations ||
    !Array.isArray(snapshot.streams) ||
    !Array.isArray(snapshot.sequences) ||
    !Array.isArray(snapshot.unique)
  ) {
    fail();
  }
  if (
    snapshot.streams.length + snapshot.sequences.length + snapshot.unique.length > config.maxKeys ||
    snapshot.scope.some((token) => !validToken(token))
  ) {
    fail();
  }
  const state: State = {
    settings: config,
    operations: snapshot.operations,
    streams: new Map(),
    sequences: new Map(),
    unique: new Map(),
    uniqueCount: 0,
  };
  const entries = <T>(input: ReadonlyArray<readonly [string, T]>, map: Map<string, T>) => {
    for (const entry of input) {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        entry[0].length > 300_000 ||
        map.has(entry[0])
      ) {
        fail();
      }
      reserve(state);
      map.set(entry[0], entry[1]);
    }
  };
  entries(snapshot.streams, state.streams);
  entries(snapshot.sequences, state.sequences);
  const unique = new Map<string, ReadonlyArray<string>>();
  entries(snapshot.unique, unique);
  let consumed = 0;
  for (const count of state.streams.values()) {
    if (!safe(count) || count < 0 || count > snapshot.operations) {
      fail();
    }
    consumed += count;
  }
  for (const [id, value] of state.sequences) {
    if (
      !value ||
      !safe(value.start) ||
      !safe(value.step) ||
      value.step === 0 ||
      !safe(value.index) ||
      value.index < 0 ||
      value.index > snapshot.operations
    ) {
      fail();
    }
    consumed += value.index;
    state.sequences.set(id, { ...value });
  }
  for (const [id, values] of unique) {
    if (
      !Array.isArray(values) ||
      values.some((value) => typeof value !== 'string') ||
      new Set(values).size !== values.length
    ) {
      fail();
    }
    state.uniqueCount += values.length;
    if (state.uniqueCount > config.maxUniqueValues) {
      fail();
    }
    state.unique.set(id, new Set(values));
  }
  if (consumed + state.uniqueCount > snapshot.operations) {
    fail();
  }
  return session(state, [...snapshot.scope]);
}
