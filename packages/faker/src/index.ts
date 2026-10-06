import { Faker, en } from '@faker-js/faker';
import type { LocaleDefinition } from '@faker-js/faker';
import fakerPackage from '@faker-js/faker/package.json' with { type: 'json' };
import { createBuilder, createSchemaBuilder, createSession } from '@mimlet/core';
import type {
  BuilderFor,
  DefaultSessionConfig,
  GenerationSession,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
  SessionKey,
  SessionOptions,
  StandardSchemaV1,
} from '@mimlet/core';

export interface FakerOptions extends SchemaBuilderConfig {
  /** Version the fixture factory/schema whenever its generation behavior changes. */
  readonly fingerprint: string;
  readonly configuration?: string;
  /** Default is English. Custom locale definitions remain trusted caller-owned data. */
  readonly locale?: LocaleDefinition | readonly LocaleDefinition[];
  /** Required for custom locales, including their fallback order and customizations. */
  readonly localeIdentity?: string;
}
export type FakerSessionOptions = Omit<
  SessionOptions,
  'seed' | 'fingerprint' | 'provider' | 'configuration'
>;
export class FakerSessionError extends Error {
  readonly code = 'FAKER_SESSION_RECONFIGURATION';
  constructor() {
    super(
      'Faker randomness belongs to the generation session; create or restore a session instead of reseeding Faker'
    );
    this.name = 'FakerSessionError';
  }
}

/** No global Faker state, ambient clock, or hidden random generator participates. */
export function fakerAdapter(options: FakerOptions) {
  if (!options || typeof options.fingerprint !== 'string' || !options.fingerprint) {
    throw new TypeError('Faker generation requires a versioned fingerprint');
  }
  if (options.configuration !== undefined && typeof options.configuration !== 'string') {
    throw new TypeError('Faker configuration identity must be a string');
  }
  if (
    (options.locale !== undefined && !options.localeIdentity) ||
    (options.localeIdentity !== undefined &&
      (typeof options.localeIdentity !== 'string' || !options.localeIdentity))
  ) {
    throw new TypeError('Custom Faker locales require a nonempty localeIdentity');
  }
  const locale = options.locale ?? en;
  const locales = Array.isArray(locale) ? [...locale] : [locale as LocaleDefinition];
  if (!locales.length || locales.some((item) => !item || typeof item !== 'object')) {
    throw new TypeError('Faker requires at least one locale definition');
  }
  const localeIdentity = options.localeIdentity ?? 'en';
  const identity = Object.freeze({
    fingerprint: options.fingerprint,
    // The loaded release is part of the stream identity, so replays cannot cross Faker versions.
    provider: `@faker-js/faker@${fakerPackage.version}/session-randomizer-v1`,
    configuration: JSON.stringify([localeIdentity, options.configuration ?? '']),
  });
  return Object.freeze({
    identity,
    metadata: Object.freeze({
      generation: 'realistic-seeded',
      randomness: 'scoped-session',
      referenceTime: 'session',
      localeIdentity,
    }),
    session(seed: SessionKey = 1, settings: FakerSessionOptions = {}): GenerationSession {
      return createSession({ ...settings, ...identity, seed });
    },
    /** Named fields have independent streams; repeated calls in one namespace advance it. */
    instance(execution: GenerationSession, ...keys: SessionKey[]): Faker {
      // Builders reach this before the factory, so a missing session fails before generation.
      if (typeof (execution as Partial<GenerationSession> | undefined)?.scope !== 'function') {
        throw new TypeError(
          'Faker generation requires an explicit GenerationSession; pass provider.session(seed) or a restored session to each build or list call'
        );
      }
      const stream = execution.scope(
        identity.provider,
        identity.fingerprint,
        identity.configuration,
        ...keys
      );
      const faker = new Faker({
        locale: [...locales],
        randomizer: {
          next: () => stream.random(),
          seed() {
            throw new FakerSessionError();
          },
        },
      });
      faker.setDefaultRefDate(() => execution.referenceDate());
      return faker;
    },
  });
}

type FakerFactory = (faker: Faker, session: GenerationSession) => unknown;
function prepare<F extends FakerFactory>(factory: F, options: FakerOptions) {
  if (typeof factory !== 'function') {
    throw new TypeError('A Faker builder requires a factory');
  }
  const adapter = fakerAdapter(options);
  return (session: GenerationSession): ReturnType<F> =>
    factory(adapter.instance(session), session) as ReturnType<F>;
}

type DefaultedFakerOptions = FakerOptions & Required<DefaultSessionConfig>;

/**
 * With a `defaultSession`, such as `() => fakerAdapter(options).session()`, builds may omit
 * the session; the factory, patch factories and transforms always receive one.
 */
export function fromFaker<F extends FakerFactory>(
  factory: F,
  options: DefaultedFakerOptions
): BuilderFor<(session: GenerationSession) => ReturnType<F>, true>;
/** Explicit sessions make list generation and independent test runs reproducible. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromFaker<F extends FakerFactory>(
  factory: F,
  options: FakerOptions
): BuilderFor<(session: GenerationSession) => ReturnType<F>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromFaker(factory: FakerFactory, options: FakerOptions): unknown {
  return createBuilder(prepare(factory, options), options);
}

/** With a `defaultSession`, builds may omit the session; see `fromFaker()`. */
export function fromFakerSchema<
  S extends StandardSchemaV1,
  F extends (
    faker: Faker,
    session: GenerationSession
  ) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  options: DefaultedFakerOptions
): SchemaBuilderFor<S, (session: GenerationSession) => ReturnType<F>, true>;
/** Generate schema input with Faker, then optionally run the original validator exactly once. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromFakerSchema<
  S extends StandardSchemaV1,
  F extends (
    faker: Faker,
    session: GenerationSession
  ) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
>(
  schema: S,
  factory: F,
  options: FakerOptions
): SchemaBuilderFor<S, (session: GenerationSession) => ReturnType<F>>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromFakerSchema(
  schema: StandardSchemaV1,
  factory: FakerFactory,
  options: FakerOptions
): unknown {
  return createSchemaBuilder(schema, prepare(factory, options), options);
}
