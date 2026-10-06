import type {
  GenerationSession,
  SchemaBuilder,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { createSchemaBuilder, createSession } from '@mimlet/core';
import { getVariableValues } from 'graphql';
import { createGraphQLExecutor } from './execution.js';
import { createGraphQLGenerators } from './generation.js';
import { prepareGraphQLSchema } from './schema.js';
import type { GraphQLFixtureOptions, GraphQLFixtureResult } from './types.js';
import {
  bounded,
  createGraphQLWireValues,
  GraphQLFixtureError,
  record,
  redact,
  same,
} from './values.js';

export type {
  GraphQLFieldContext,
  GraphQLFixtureIssue,
  GraphQLFixtureOptions,
  GraphQLFixtureResult,
  GraphQLScalarFixture,
} from './types.js';
export { GraphQLFixtureError } from './errors.js';
/** SDL and operation text are data. Live application resolvers are never loaded. */
export function graphqlAdapter(
  schemaText: string,
  operationText: string,
  supplied: GraphQLFixtureOptions = {}
) {
  const options = Object.freeze({ ...supplied });
  const maxDepth = bounded(options.maxDepth, 16, 64);
  const maxNodes = bounded(options.maxNodes, 10_000, 100_000);
  const maxCharacters = bounded(options.maxDocumentCharacters, 1_000_000, 10_000_000);
  const maxTokens = bounded(options.maxTokens, 10_000, 100_000);
  const listLength = bounded(options.listLength, 1, 1000);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary'].includes(profile)) {
    throw new GraphQLFixtureError('Unknown GraphQL fixture profile');
  }
  if (
    typeof schemaText !== 'string' ||
    typeof operationText !== 'string' ||
    schemaText.length + operationText.length > maxCharacters
  ) {
    throw new GraphQLFixtureError('Schema and operation must be bounded SDL strings');
  }
  const { clone, wire } = createGraphQLWireValues({ maxNodes, maxDepth, maxCharacters });
  const { schema, document, scalars, fields, abstractTypes, operation, variableDefinitions } =
    prepareGraphQLSchema({ schemaText, operationText, options, maxTokens });
  const identity = Object.freeze({
    fingerprint: JSON.stringify({ schemaText, operationText, name: options.operationName ?? '' }),
    provider: 'test-builders/graphql@17.0.2/v1',
    configuration: JSON.stringify({
      profile,
      listLength,
      maxDepth,
      maxNodes,
      scalars: Object.entries(scalars)
        .map(([name, scalar]) => [name, scalar.id])
        .sort(),
      fields: options.fieldsIdentity ?? '',
      abstractTypes,
    }),
  });
  const session = (seed: number | string = 1) => createSession({ ...identity, seed });
  const errors = (value: unknown): StandardSchemaV1.Result<Record<string, unknown>> => {
    let variables;
    try {
      variables = record(wire(value));
    } catch {
      return { issues: [{ message: 'Expected bounded variable data' }] };
    }
    const result = getVariableValues(schema, variableDefinitions, variables, {
      maxErrors: 20,
      hideSuggestions: true,
    });
    if (result.errors) {
      return { issues: redact(result.errors) };
    }
    return { value: { ...result.variableValues.coerced } };
  };
  const variableStandard: StandardSchemaV1<Record<string, unknown>, Record<string, unknown>> = {
    '~standard': { version: 1, vendor: 'test-builders/graphql', validate: errors },
  };
  const { scalarValue, createVariables } = createGraphQLGenerators({
    schema,
    variableDefinitions,
    scalars,
    profile,
    listLength,
    maxDepth,
    maxNodes,
    session,
    errors,
  });
  const variableBuilder = () =>
    createSchemaBuilder(variableStandard, createVariables, { ...options, defaultSession: session });
  const execute = createGraphQLExecutor({
    schema,
    document,
    options,
    fields,
    abstractTypes,
    scalars,
    clone,
    wire,
    maxNodes,
    maxDepth,
    listLength,
    profile,
    scalarValue,
  });
  const response = (variables: Record<string, unknown> = {}) => {
    const inputs = record(wire(variables));
    const create = (execution: GenerationSession = session()): Record<string, unknown> => {
      const result = execute(inputs, execution);
      if (result.errors?.length || !result.data) {
        throw new GraphQLFixtureError('Could not create a valid GraphQL response', result.errors);
      }
      return clone(result.data) as Record<string, unknown>;
    };
    const inspect = (value: unknown): StandardSchemaV1.Result<Record<string, unknown>> => {
      let result;
      let data;
      try {
        data = wire(value);
        result = execute(inputs, session(), data, true);
      } catch {
        return { issues: [{ message: 'Expected bounded GraphQL response data' }] };
      }
      if (result.errors?.length) {
        return { issues: result.errors };
      }
      if (!same(data, result.data)) {
        return {
          issues: [
            { message: 'Response fields or scalar encodings differ from the selected operation' },
          ],
        };
      }
      return { value: result.data as Record<string, unknown> };
    };
    const standard: StandardSchemaV1<Record<string, unknown>> = {
      '~standard': { version: 1, vendor: 'test-builders/graphql-response', validate: inspect },
    };
    return Object.freeze({
      create,
      standard,
      check: (value: unknown) => inspect(value).issues === undefined,
      issues: (value: unknown): readonly ValidationIssue[] => inspect(value).issues ?? [],
      builder: () => createSchemaBuilder(standard, create, { ...options, defaultSession: session }),
    });
  };
  return Object.freeze({
    identity,
    session,
    metadata: Object.freeze({
      operation: operation.operation as 'query' | 'mutation' | 'subscription',
      operationName: operation.name?.value,
      network: false,
      nativeVersion: '17.0.2',
    }),
    variables: Object.freeze({
      create: createVariables,
      standard: variableStandard,
      builder: variableBuilder,
      check: (value: unknown) => errors(value).issues === undefined,
      issues: (value: unknown): readonly ValidationIssue[] => errors(value).issues ?? [],
    }),
    response,
    result(
      variables: Record<string, unknown> = {},
      execution: GenerationSession = session()
    ): GraphQLFixtureResult {
      return execute(variables, execution);
    },
  });
}
export function fromGraphQLVariables(
  schema: string,
  operation: string,
  options: GraphQLFixtureOptions = {}
): SchemaBuilder<
  Record<string, unknown>,
  Record<string, unknown>,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return graphqlAdapter(schema, operation, options).variables.builder();
}
export function fromGraphQLResponse(
  schema: string,
  operation: string,
  variables: Record<string, unknown> = {},
  options: GraphQLFixtureOptions = {}
): SchemaBuilder<
  Record<string, unknown>,
  Record<string, unknown>,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return graphqlAdapter(schema, operation, options).response(variables).builder();
}
