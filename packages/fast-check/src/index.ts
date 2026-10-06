import { __version, check, property, asyncProperty, sample, readConfigureGlobal } from 'fast-check';
import type { Arbitrary, RunDetails } from 'fast-check';
import {
  createBuilder,
  createSchemaBuilder,
  createSession,
  cloneFixture,
  BuilderValidationError,
} from '@mimlet/core';
import type {
  BuilderFor,
  BuilderConfig,
  DefaultSessionConfig,
  SchemaBuilderFor,
  SchemaBuilderConfig,
  StandardSchemaV1,
  SchemaInput,
  SchemaOutput,
  GenerationSession,
  SessionIdentity,
  SessionOptions,
} from '@mimlet/core';

export class PropertyIntegrationError extends Error {
  constructor(
    readonly code: 'PROPERTY_CONFIGURATION' | 'PROPERTY_REPLAY',
    message: string
  ) {
    super(message);
    this.name = 'PropertyIntegrationError';
  }
}
function hermetic(): void {
  if (Object.keys(readConfigureGlobal()).length !== 0) {
    throw new PropertyIntegrationError(
      'PROPERTY_CONFIGURATION',
      'Deterministic wrappers require an unmodified fast-check global configuration; mapped arbitraries may still be used with native fast-check runners'
    );
  }
}
function synchronous<T>(value: T | PromiseLike<T>): T {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as { then?: unknown }).then === 'function'
  ) {
    void Promise.resolve(value).catch(() => {});
    throw new PropertyIntegrationError(
      'PROPERTY_CONFIGURATION',
      'Arbitrary mapping must be synchronous; use an async property to await asynchronous validation or application work'
    );
  }
  return value as T;
}
function sampleOne<T>(source: Arbitrary<T>, session: GenerationSession): T {
  hermetic();
  return sample(source, { seed: session.integer(-0x80000000, 0x7fffffff), numRuns: 1 })[0] as T;
}
/** With a `defaultSession`, builds may omit the session that seeds each sample. */
export function fromArbitrary<T>(
  source: Arbitrary<T>,
  config: BuilderConfig & Required<DefaultSessionConfig>
): BuilderFor<(session: GenerationSession) => T, true>;
/** Samples a real arbitrary with a session-controlled seed. Use mapFixtureArbitrary to retain shrinking. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromArbitrary<T>(
  source: Arbitrary<T>,
  config?: BuilderConfig
): BuilderFor<(session: GenerationSession) => T>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromArbitrary<T>(source: Arbitrary<T>, config?: BuilderConfig): unknown {
  return createBuilder((session: GenerationSession) => sampleOne(source, session), config);
}
/** With a `defaultSession`, builds may omit the session that seeds each sample. */
export function fromSchemaArbitrary<S extends StandardSchemaV1>(
  schema: S,
  source: Arbitrary<NoInfer<SchemaInput<S>>>,
  config: SchemaBuilderConfig & Required<DefaultSessionConfig>
): SchemaBuilderFor<S, (session: GenerationSession) => SchemaInput<S>, true>;
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromSchemaArbitrary<S extends StandardSchemaV1>(
  schema: S,
  source: Arbitrary<NoInfer<SchemaInput<S>>>,
  config?: SchemaBuilderConfig
): SchemaBuilderFor<S, (session: GenerationSession) => SchemaInput<S>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromSchemaArbitrary<S extends StandardSchemaV1>(
  schema: S,
  source: Arbitrary<NoInfer<SchemaInput<S>>>,
  config?: SchemaBuilderConfig
): unknown {
  return createSchemaBuilder(
    schema,
    (session: GenerationSession) => sampleOne(source, session),
    config
  );
}
export interface MappingOptions<Input> {
  /** Defaults to cloning supported fixture graphs before invoking application code. */
  readonly clone?: (value: Input) => Input;
  /** Needed only to shrink user-supplied examples that did not come from this arbitrary. */
  readonly unmapper?: (value: unknown) => Input;
}
function mapInput<Input, Output>(
  source: Arbitrary<Input>,
  mapper: (value: Input) => Output,
  options: MappingOptions<Input> = {}
): Arbitrary<Output> {
  const clone: (value: Input) => Input = options.clone ?? cloneFixture;
  return source.map(
    (value) => synchronous<Output>(mapper(synchronous<Input>(clone(value)))),
    options.unmapper
  );
}
/** Retains source shrink context; each shrink recomputes the entire pure mapping. */
export function mapFixtureArbitrary<Input, Output>(
  source: Arbitrary<Input>,
  mapper: ((value: Input) => Output) &
    ([Extract<Output, PromiseLike<unknown>>] extends [never] ? unknown : never),
  options: MappingOptions<Input> = {}
): Arbitrary<Output> {
  return mapInput(source, mapper, options);
}
/** A source arbitrary must generate valid input; invalid candidates are errors, not hidden retries. */
export function schemaFixtureArbitrary<S extends StandardSchemaV1>(
  schema: S,
  source: Arbitrary<NoInfer<SchemaInput<S>>>,
  options: MappingOptions<SchemaInput<S>> = {}
): Arbitrary<SchemaOutput<S>> {
  const standard = schema?.['~standard'];
  if (!standard || standard.version !== 1 || typeof standard.validate !== 'function') {
    throw new PropertyIntegrationError(
      'PROPERTY_CONFIGURATION',
      'Expected a Standard Schema v1 validator'
    );
  }
  return mapInput(
    source,
    (value) => {
      const result = synchronous(standard.validate(value));
      if (result.issues !== undefined) {
        throw new BuilderValidationError(result.issues);
      }
      return result.value as SchemaOutput<S>;
    },
    options
  );
}
/** Shrink the scenario's explicit input parameters and recompute dependent values after each shrink. */
export function scenarioArbitrary<Input, Output extends object>(
  source: Arbitrary<Input>,
  recipe: (value: Input) => { build(session: GenerationSession): Output },
  sessionOptions: SessionOptions,
  options?: MappingOptions<Input>
): Arbitrary<Output> {
  // Copy caller-owned configuration once; later mutations must not alter shrink semantics.
  const config = Object.freeze({ ...sessionOptions });
  createSession(config);
  return mapInput(source, (value) => recipe(value).build(createSession(config)), options);
}
export interface PropertyOptions {
  readonly identity: SessionIdentity;
  readonly seed: number;
  readonly numRuns?: number;
  readonly maxSkipsPerRun?: number;
}
export interface PropertyReplay {
  readonly format: 'test-builders/property';
  readonly version: 1;
  readonly engine: string;
  readonly identity: SessionIdentity;
  readonly seed: number;
  readonly path: string;
}
export interface PropertyReport<T> {
  readonly details: RunDetails<[T]>;
  readonly replay?: PropertyReplay;
}
function validIdentity(identity: SessionIdentity): void {
  if (
    !identity ||
    typeof identity.fingerprint !== 'string' ||
    !identity.fingerprint ||
    typeof identity.provider !== 'string' ||
    !identity.provider ||
    (identity.configuration !== undefined && typeof identity.configuration !== 'string')
  ) {
    throw new PropertyIntegrationError(
      'PROPERTY_CONFIGURATION',
      'Property checks require an explicit fingerprint and provider/version'
    );
  }
}
function parameters(options: PropertyOptions) {
  hermetic();
  validIdentity(options.identity);
  if (!Number.isInteger(options.seed) || options.seed < -0x80000000 || options.seed > 0x7fffffff) {
    throw new RangeError('Property seed must be a signed 32-bit integer');
  }
  const numRuns = options.numRuns ?? 100;
  const maxSkipsPerRun = options.maxSkipsPerRun ?? 100;
  if (
    !Number.isSafeInteger(numRuns) ||
    numRuns < 1 ||
    numRuns > 1_000_000 ||
    !Number.isSafeInteger(maxSkipsPerRun) ||
    maxSkipsPerRun < 0 ||
    maxSkipsPerRun > 10_000
  ) {
    throw new RangeError('Property run/skip counts exceed the supported budget');
  }
  return { seed: options.seed, numRuns, maxSkipsPerRun };
}
function report<T>(details: RunDetails<[T]>, identity: SessionIdentity): PropertyReport<T> {
  if (!details.failed || details.counterexamplePath === null) {
    return { details };
  }
  return {
    details,
    replay: {
      format: 'test-builders/property',
      version: 1,
      engine: `fast-check@${__version}`,
      identity: { ...identity },
      seed: details.seed,
      path: details.counterexamplePath,
    },
  };
}
/** Does not log, throw the counterexample, or disable shrinking. Inspect details.failed. */
export function checkFixtureProperty<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  options: PropertyOptions
): PropertyReport<T> {
  const config = parameters(options);
  return report(check(property(source, predicate), config), options.identity);
}
export async function checkFixturePropertyAsync<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  options: PropertyOptions
): Promise<PropertyReport<T>> {
  const config = parameters(options);
  return report(await check(asyncProperty(source, predicate), config), options.identity);
}
function replayParameters(replay: PropertyReplay, expected: SessionIdentity) {
  validIdentity(expected);
  if (
    !replay ||
    replay.format !== 'test-builders/property' ||
    replay.version !== 1 ||
    replay.engine !== `fast-check@${__version}` ||
    !replay.identity ||
    typeof replay.path !== 'string' ||
    replay.path.length > 100_000 ||
    !/^\d+(?::\d+)*$/.test(replay.path) ||
    replay.identity.fingerprint !== expected.fingerprint ||
    replay.identity.provider !== expected.provider ||
    (replay.identity.configuration ?? '') !== (expected.configuration ?? '')
  ) {
    throw new PropertyIntegrationError(
      'PROPERTY_REPLAY',
      'Property replay version, engine, identity, or path does not match'
    );
  }
  return {
    ...parameters({ identity: expected, seed: replay.seed, numRuns: 1 }),
    path: replay.path,
    endOnFailure: true,
  };
}
export function replayFixtureProperty<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  replay: PropertyReplay,
  expected: SessionIdentity
): PropertyReport<T> {
  return report(check(property(source, predicate), replayParameters(replay, expected)), expected);
}
export async function replayFixturePropertyAsync<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  replay: PropertyReplay,
  expected: SessionIdentity
): Promise<PropertyReport<T>> {
  return report(
    await check(asyncProperty(source, predicate), replayParameters(replay, expected)),
    expected
  );
}

export class FixturePropertyError<T = unknown> extends Error {
  readonly code = 'PROPERTY_FAILED';
  readonly #report: PropertyReport<T>;
  constructor(report: PropertyReport<T>) {
    super('Fixture property failed; inspect report for the counterexample and replay');
    this.name = 'FixturePropertyError';
    this.#report = report;
  }
  /** Counterexamples are available explicitly, not enumerable default error metadata. */
  get report(): PropertyReport<T> {
    return this.#report;
  }
}
export function assertFixtureProperty<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => boolean | void,
  options: PropertyOptions
): void {
  const result = checkFixtureProperty(source, predicate, options);
  if (result.details.failed) {
    throw new FixturePropertyError(result);
  }
}
export async function assertFixturePropertyAsync<T>(
  source: Arbitrary<T>,
  predicate: (value: T) => Promise<boolean | void>,
  options: PropertyOptions
): Promise<void> {
  const result = await checkFixturePropertyAsync(source, predicate, options);
  if (result.details.failed) {
    throw new FixturePropertyError(result);
  }
}
