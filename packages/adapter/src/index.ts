import { createSchemaBuilder } from '@mimlet/core';
import type {
  AnyFactory,
  DefaultedSessionFor,
  DefaultSessionFor,
  GenerationSession,
  SchemaBuilderConfig,
  SchemaBuilderFor,
  SchemaInput,
  SchemaOutput,
  StandardSchemaV1,
} from '@mimlet/core';

export interface AdapterField {
  readonly name: string;
  readonly required: boolean;
  /** Informational, not a TypeScript expression to execute. */
  readonly description?: string;
}
export interface AdapterOperations<S extends StandardSchemaV1> {
  readonly create?: (...args: never[]) => SchemaInput<S> | PromiseLike<SchemaInput<S>>;
  readonly encode?: (value: SchemaOutput<S>) => SchemaInput<S> | PromiseLike<SchemaInput<S>>;
  readonly checkInput?: (value: unknown) => boolean;
  readonly cloneInput?: (value: SchemaInput<S>) => SchemaInput<S>;
  readonly fields?: readonly AdapterField[];
  /** Native arbitrary handles stay opaque: the SDK does not synthesize a shrinker. */
  readonly arbitrary?: {
    readonly vendor: string;
    readonly version: string;
    readonly representation: 'input' | 'output';
    readonly make: () => unknown;
  };
}
export interface AdapterDefinition<S extends StandardSchemaV1, C extends AdapterOperations<S>> {
  readonly id: string;
  readonly version: string;
  readonly standard: S;
  readonly operations: C;
  readonly source?: unknown;
  readonly limitations?: readonly string[];
}
export interface AdapterInspection {
  readonly id: string;
  readonly version: string;
  readonly validation: 'standard-schema-v1';
  readonly generation: boolean;
  readonly encoding: boolean;
  readonly inputCheck: boolean;
  readonly cloning: boolean;
  readonly fields: readonly AdapterField[] | null;
  readonly arbitrary: {
    readonly vendor: string;
    readonly version: string;
    readonly representation: 'input' | 'output';
  } | null;
  readonly limitations: readonly string[];
}
export class AdapterDefinitionError extends TypeError {
  readonly code = 'INVALID_ADAPTER_DEFINITION';
  constructor(message: string) {
    super(message);
    this.name = 'AdapterDefinitionError';
  }
}
function text(value: unknown, maximum = 256): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > maximum) {
    throw new AdapterDefinitionError('Adapter metadata requires bounded nonempty strings');
  }
}
/** Declare trusted native operations without translating the original schema or probing callbacks. */
export function defineAdapter<S extends StandardSchemaV1, const C extends AdapterOperations<S>>(
  definition: AdapterDefinition<S, C>
) {
  text(definition.id);
  text(definition.version);
  const schema = definition.standard;
  const standard = schema?.['~standard'];
  if (!standard || standard.version !== 1 || typeof standard.validate !== 'function') {
    throw new AdapterDefinitionError('Expected a Standard Schema v1 validator');
  }
  const original = definition.operations;
  if (!original || typeof original !== 'object' || Array.isArray(original)) {
    throw new AdapterDefinitionError('Adapter operations must be an object');
  }
  for (const key of Object.keys(original)) {
    if (!['create', 'encode', 'checkInput', 'cloneInput', 'fields', 'arbitrary'].includes(key)) {
      throw new AdapterDefinitionError('Unknown adapter operation');
    }
  }
  for (const key of ['create', 'encode', 'checkInput', 'cloneInput'] as const) {
    if (original[key] !== undefined && typeof original[key] !== 'function') {
      throw new AdapterDefinitionError('Adapter operations must be functions');
    }
  }
  let fields: readonly AdapterField[] | undefined;
  if (original.fields !== undefined) {
    if (!Array.isArray(original.fields) || original.fields.length > 10_000) {
      throw new AdapterDefinitionError('Expected a bounded field metadata array');
    }
    const seen = new Set<string>();
    fields = Object.freeze(
      original.fields.map((field) => {
        text(field?.name, 4096);
        if (typeof field.required !== 'boolean' || seen.has(field.name)) {
          throw new AdapterDefinitionError(
            'Field names must be unique and required must be boolean'
          );
        }
        seen.add(field.name);
        if (field.description !== undefined) {
          text(field.description, 4096);
        }
        return Object.freeze({
          name: field.name,
          required: field.required,
          ...(field.description === undefined ? {} : { description: field.description }),
        });
      })
    );
  }
  const native = original.arbitrary;
  if (native !== undefined) {
    text(native?.vendor);
    text(native?.version);
    if (!['input', 'output'].includes(native.representation) || typeof native.make !== 'function') {
      throw new AdapterDefinitionError('Native arbitrary needs its representation and factory');
    }
  }
  const limitations = definition.limitations ?? [];
  if (!Array.isArray(limitations) || limitations.length > 1000) {
    throw new AdapterDefinitionError('Expected a bounded limitations array');
  }
  limitations.forEach((limitation) => text(limitation, 4096));
  const operations = Object.freeze({
    ...original,
    ...(fields ? { fields } : {}),
    ...(native ? { arbitrary: Object.freeze({ ...native }) } : {}),
  }) as Readonly<C>;
  const inspection: AdapterInspection = Object.freeze({
    id: definition.id,
    version: definition.version,
    validation: 'standard-schema-v1',
    generation: typeof operations.create === 'function',
    encoding: typeof operations.encode === 'function',
    inputCheck: typeof operations.checkInput === 'function',
    cloning: typeof operations.cloneInput === 'function',
    fields: fields ?? null,
    arbitrary: native
      ? Object.freeze({
          vendor: native.vendor,
          version: native.version,
          representation: native.representation,
        })
      : null,
    limitations: Object.freeze([...limitations]),
  });
  /**
   * With a `defaultSession`, builds may omit the leading session, and the factory, patch
   * factories and transforms always receive one, so the factory may declare it as required.
   */
  function fromFactory<
    F extends (
      session: GenerationSession
    ) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
  >(factory: F, config: SchemaBuilderConfig & DefaultedSessionFor<F>): SchemaBuilderFor<S, F, true>;
  /** Explicit typed escape hatch: the factory supplies schema input. */
  // eslint-disable-next-line no-redeclare -- TypeScript overload
  function fromFactory<
    F extends (...args: never[]) => NoInfer<SchemaInput<S>> | PromiseLike<NoInfer<SchemaInput<S>>>,
  >(factory: F, config?: SchemaBuilderConfig & DefaultSessionFor<F>): SchemaBuilderFor<S, F>;
  // eslint-disable-next-line no-redeclare -- TypeScript overload implementation
  function fromFactory(factory: AnyFactory, config: SchemaBuilderConfig = {}): unknown {
    return createSchemaBuilder(schema, factory as (...args: never[]) => SchemaInput<S>, config);
  }
  return Object.freeze({
    standard: schema,
    source: definition.source,
    operations,
    inspect: (): AdapterInspection => inspection,
    fromFactory,
  });
}
/**
 * With a `defaultSession`, builds may omit the leading session, and `create`, patch factories
 * and transforms always receive one.
 */
export function fromAdapter<
  S extends StandardSchemaV1,
  F extends (session: GenerationSession) => SchemaInput<S> | PromiseLike<SchemaInput<S>>,
>(
  adapter: { readonly standard: S; readonly operations: { readonly create: F } },
  config: SchemaBuilderConfig & DefaultedSessionFor<F>
): SchemaBuilderFor<S, F, true>;
/** The create capability must actually exist; a validation-only adapter is not a generator. */
// eslint-disable-next-line no-redeclare -- TypeScript overload
export function fromAdapter<
  S extends StandardSchemaV1,
  F extends AnyFactory & ((...args: never[]) => SchemaInput<S> | PromiseLike<SchemaInput<S>>),
>(
  adapter: { readonly standard: S; readonly operations: { readonly create: F } },
  config?: SchemaBuilderConfig & DefaultSessionFor<F>
): SchemaBuilderFor<S, F>;
// eslint-disable-next-line no-redeclare -- TypeScript overload implementation
export function fromAdapter(
  adapter: {
    readonly standard: StandardSchemaV1;
    readonly operations: { readonly create: AnyFactory };
  },
  config: SchemaBuilderConfig = {}
): unknown {
  return createSchemaBuilder(adapter.standard, adapter.operations.create, config);
}
