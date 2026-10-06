import * as Schema from 'effect/Schema';
import * as Arbitrary from 'effect/Arbitrary';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';
import * as Cause from 'effect/Cause';
import * as AST from 'effect/SchemaAST';
import effectPackage from 'effect/package.json' with { type: 'json' };
import { createSchemaBuilder, schemaFields } from '@mimlet/core';
import type {
  AnyFactory,
  DefaultedSessionFor,
  DefaultSessionConfig,
  DefaultSessionFor,
  GenerationSession,
  SchemaBuilder,
  AsyncSchemaBuilder,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaFields,
  StandardSchemaV1,
} from '@mimlet/core';

/**
 * The loaded Effect release. Effect marks its Arbitrary engine unstable and does not promise
 * identical samples across releases, so metadata names the release that actually generates.
 */
const EFFECT_VERSION: string = effectPackage.version;
// Every sampling option is explicit, so `Arbitrary.configureGlobal` defaults cannot alter replay.
const SAMPLING = Object.freeze({ count: 1, size: 10, maxDiscards: 100 });

// Effect 3 resolves these module paths too; fail with an actionable message instead of a native crash.
if (
  typeof Arbitrary.sampleEffect !== 'function' ||
  typeof Schema.toStandardSchemaV1 !== 'function'
) {
  throw new TypeError(
    `@mimlet/effect requires Effect 4 (effect@>=4.0.0 <5), but effect@${EFFECT_VERSION} is loaded; Effect 3 users must pin the 0.1.0-alpha.3 Mimlet train`
  );
}

export interface EffectOptions extends SchemaBuilderConfig {
  /** Native parse options; default rejects excess object properties. */
  readonly parseOptions?: AST.ParseOptions;
}

function seed(session: GenerationSession): number {
  // Native schemas cannot be fingerprinted, so there is no adapter-owned default session.
  if (typeof (session as Partial<GenerationSession> | undefined)?.integer !== 'function') {
    throw new TypeError(
      'Effect generation requires an explicit GenerationSession; pass createSession({ seed, fingerprint, provider }) to each build or list call'
    );
  }
  return session.integer(-0x80000000, 0x7fffffff);
}
function failure(cause: Cause.Cause<Arbitrary.SampleError>): unknown {
  const error = Cause.findErrorOption(cause);
  if (error._tag === 'Some') {
    return new RangeError(
      `Native Effect sampling discarded ${error.value.discards} candidates without a value; use fromEffectFactory when filters reject most samples`,
      { cause: error.value }
    );
  }
  const defect = Cause.squash(cause);
  if (Cause.isAsyncFiberError(defect)) {
    return new TypeError(
      'Native Effect generation for this schema is asynchronous; use fromEffectAsync',
      { cause: defect }
    );
  }
  return defect;
}
function draw<A>(arbitrary: () => Arbitrary.Arbitrary<A>, session: GenerationSession) {
  return Arbitrary.sampleEffect(arbitrary(), { ...SAMPLING, seed: seed(session) });
}
function sample<A>(arbitrary: () => Arbitrary.Arbitrary<A>, session: GenerationSession): A {
  const exit = Effect.runSyncExit(draw(arbitrary, session));
  if (Exit.isSuccess(exit)) {
    return exit.value[0] as A;
  }
  throw failure(exit.cause);
}
async function sampleAsync<A>(
  arbitrary: () => Arbitrary.Arbitrary<A>,
  session: GenerationSession
): Promise<A> {
  // The seed is drawn synchronously so concurrent async builds consume the session in call order.
  const exit = await Effect.runPromiseExit(draw(arbitrary, session));
  if (Exit.isSuccess(exit)) {
    return exit.value[0] as A;
  }
  throw failure(exit.cause);
}
/** A sync encode of an async codec fails inside Effect; point callers to the async builder. */
function synchronous<A, I>(encode: (value: A) => I): (value: A) => I {
  return (value) => {
    try {
      return encode(value);
    } catch (error) {
      const cause = (error as { readonly cause?: unknown } | null)?.cause;
      if (Cause.isCause(cause) && Cause.isAsyncFiberError(Cause.squash(cause))) {
        throw new TypeError(
          'Native Effect encoding for this schema is asynchronous; use fromEffectAsync',
          { cause: error }
        );
      }
      throw error;
    }
  };
}
/** `Schema.is` takes no parse options in Effect 4; schema issues are false, defects still throw. */
function guard(schema: Schema.Decoder<unknown>, options: AST.ParseOptions) {
  const decode = Schema.decodeUnknownResult(schema, options);
  return (value: unknown): boolean => decode(value)._tag === 'Success';
}
/** Effect 4's native arbitrary/encoder path preserves declarations that JSON cannot represent. */
export function effectAdapter<A, I>(source: Schema.Codec<A, I>, options: EffectOptions = {}) {
  const parseOptions: AST.ParseOptions = Object.freeze({
    onExcessProperty: 'error' as const,
    ...options.parseOptions,
  });
  // Effect 4 attaches `~standard` to the schema it receives and keeps the first options it saw,
  // so convert a fresh wrapper of the same AST instead of mutating the caller's schema.
  const standard: StandardSchemaV1<I, A> = Schema.toStandardSchemaV1(
    Schema.make<Schema.Codec<A, I>>(source.ast),
    { parseOptions }
  );
  const decode = Schema.decodeUnknownSync(source, parseOptions);
  const decodeAsync = Schema.decodeUnknownPromise(source, parseOptions);
  const encode = synchronous(Schema.encodeSync(source, parseOptions));
  const encodeAsync = Schema.encodePromise(source, parseOptions);
  // Lazy preparation keeps arbitrary derivation optional for custom-factory consumers.
  let output: Arbitrary.Arbitrary<A> | undefined;
  const outputArbitrary = () => (output ??= Arbitrary.schema(source));
  return Object.freeze({
    source,
    standard,
    decode,
    decodeAsync,
    encode,
    encodeAsync,
    checkInput: guard(Schema.toEncoded(source), parseOptions),
    checkOutput: guard(Schema.toType(source), parseOptions),
    outputArbitrary,
    /** Native Effect arbitrary: each shrink is re-encoded through the original schema. */
    inputArbitrary: (): Arbitrary.Arbitrary<I> => Arbitrary.map(outputArbitrary(), encode),
    create: (session: GenerationSession) => encode(sample(outputArbitrary, session)),
    createAsync: async (session: GenerationSession) =>
      encodeAsync(await sampleAsync(outputArbitrary, session)),
    metadata: Object.freeze({
      vendor: 'effect',
      version: EFFECT_VERSION,
      arbitraryVersion: EFFECT_VERSION,
      generation: 'native-output-then-encode',
      shrinking: 'native-effect-arbitrary-4',
      sampling: SAMPLING,
    }),
  });
}
/**
 * The builder `fromEffect(schema, options)` returns for a `Schema.Codec<A, I>`: synchronous,
 * with encoded input `I`, decoded output `A` and a required session. With `Defaulted` (a
 * configured `defaultSession`), builds may omit the session.
 */
export type EffectBuilder<A, I, Defaulted extends boolean = false> = SchemaBuilder<
  I,
  A,
  Defaulted extends true ? [session?: GenerationSession] : [session: GenerationSession],
  [session: GenerationSession]
>;

/**
 * The builder `fromEffectFactory(schema, factory, options)` returns for a factory of type `F`:
 * the factory's arguments, and synchronous build methods unless `F` returns a promise. Pass
 * the factory's own type as `F`. As with the function, sync or async is decided once `I` is known.
 * Pass `true` as `Defaulted` when the options configure a `defaultSession`.
 */
export type EffectFactoryBuilder<
  A,
  I,
  F extends (...args: never[]) => I | PromiseLike<I>,
  Defaulted extends boolean = false,
> = SchemaBuilderFor<StandardSchemaV1<I, A>, F, Defaulted>;
type DefaultedEffectOptions = EffectOptions & Required<DefaultSessionConfig>;

/**
 * With your own `defaultSession`, builds may omit the session. The adapter has no default of
 * its own because native schemas cannot be fingerprinted for replay.
 */
export function fromEffect<A, I>(
  source: Schema.Codec<A, I>,
  options: DefaultedEffectOptions
): EffectBuilder<A, I, true>;
/** Deterministic native generation requires an explicit session; codecs must encode synchronously. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromEffect<A, I>(
  source: Schema.Codec<A, I>,
  options?: EffectOptions
): EffectBuilder<A, I>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromEffect<A, I>(source: Schema.Codec<A, I>, options: EffectOptions = {}): unknown {
  const adapter = effectAdapter(source, options);
  return createSchemaBuilder(adapter.standard, adapter.create, options);
}
/** With your own `defaultSession`, builds may omit the session; see `fromEffect()`. */
export function fromEffectAsync<A, I>(
  source: Schema.Codec<A, I>,
  options: DefaultedEffectOptions
): AsyncSchemaBuilder<I, A, [session?: GenerationSession], [session: GenerationSession]>;
/** Native asynchronous generation and encoding, followed by asynchronous-capable decoding only when requested. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromEffectAsync<A, I>(
  source: Schema.Codec<A, I>,
  options?: EffectOptions
): AsyncSchemaBuilder<I, A, [session: GenerationSession]>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromEffectAsync<A, I>(
  source: Schema.Codec<A, I>,
  options: EffectOptions = {}
): unknown {
  const adapter = effectAdapter(source, options);
  return createSchemaBuilder(adapter.standard, adapter.createAsync, options);
}
/**
 * With a `defaultSession`, builds may omit the leading session, and the factory, patch
 * factories and transforms always receive one, so the factory may declare it as required.
 */
export function fromEffectFactory<
  A,
  I,
  F extends (session: GenerationSession) => NoInfer<I> | PromiseLike<NoInfer<I>>,
>(
  source: Schema.Codec<A, I>,
  factory: F,
  options: EffectOptions & DefaultedSessionFor<F>
): EffectFactoryBuilder<A, I, F, true>;
/** Escape hatch for one-way codecs, service-provided data or unsupported native arbitrary derivation. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromEffectFactory<
  A,
  I,
  F extends (...args: never[]) => NoInfer<I> | PromiseLike<NoInfer<I>>,
>(
  source: Schema.Codec<A, I>,
  factory: F,
  options?: EffectOptions & DefaultSessionFor<F>
): EffectFactoryBuilder<A, I, F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromEffectFactory<A, I>(
  source: Schema.Codec<A, I>,
  factory: AnyFactory,
  options: EffectOptions = {}
): unknown {
  return createSchemaBuilder(
    effectAdapter(source, options).standard,
    factory as (...args: never[]) => I,
    options
  );
}

/**
 * The struct's top-level encoded property names, for a setter per field:
 * `fluent(fromEffect(schema), effectFields(schema))`. Builders take encoded input, so keys
 * renamed with `Schema.encodeKeys` are listed by their encoded name. Symbol keys are skipped.
 */
export function effectFields<A, I extends object>(
  schema: Schema.Codec<A, I>
): SchemaFields<Extract<keyof I, string>> {
  const encoded = schema?.ast ? AST.toEncoded(schema.ast) : undefined;
  if (!encoded || !AST.isObjects(encoded)) {
    throw new TypeError('Expected an Effect struct schema');
  }
  const names = encoded.propertySignatures
    .map((property) => property.name)
    .filter((name): name is string => typeof name === 'string');
  return schemaFields(names as Extract<keyof I, string>[]);
}
