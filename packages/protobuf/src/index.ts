import type {
  GenerationSession,
  SchemaBuilder,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { createSchemaBuilder, createSession } from '@mimlet/core';
import type { Namespace, Root } from 'protobufjs';
import protobuf from 'protobufjs';
import { createProtobufCodecs } from './codecs.js';
import { createProtobufGenerator } from './generation.js';
import { prepareProtobufSchema } from './schema.js';
import type { ProtobufFixtureOptions } from './types.js';
import { createProtobufValidation } from './validation.js';
import { ProtobufFixtureError, bound, fail } from './values.js';

export type { ProtobufFixtureOptions } from './types.js';
export { ProtobufFixtureError } from './errors.js';
/** Runtime values use bigint for 64-bit integers, numeric enums and Uint8Array bytes. */
export function protobufAdapter(
  source: string | Readonly<Record<string, unknown>>,
  messageName: string,
  supplied: ProtobufFixtureOptions = {}
) {
  const options = Object.freeze({ ...supplied });
  const maxDepth = bound(options.maxDepth, 16, 64);
  const maxNodes = bound(options.maxNodes, 10_000, 100_000);
  const maxBytes = bound(options.maxBytes, 1_000_000, 10_000_000);
  const maxSchemaCharacters = bound(options.maxSchemaCharacters, 1_000_000, 10_000_000);
  const listLength = bound(options.listLength, 2, 1000);
  const profile = options.profile ?? 'minimal';
  if (!['minimal', 'random', 'boundary', 'defaults'].includes(profile)) {
    return fail('Unknown Protobuf profile');
  }
  if (
    typeof messageName !== 'string' ||
    !/^\.?[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*$/.test(messageName)
  ) {
    return fail('A qualified message name is required');
  }
  if (options.keepCase !== undefined && typeof options.keepCase !== 'boolean') {
    return fail('keepCase must be a boolean');
  }
  const { root, type, shape } = prepareProtobufSchema({
    source,
    messageName,
    options,
    maxDepth,
    maxNodes,
    maxSchemaCharacters,
  });
  const identity = Object.freeze({
    fingerprint: JSON.stringify({ shape, message: type.fullName }),
    provider: 'test-builders/protobufjs@8.8.0/v1',
    configuration: JSON.stringify({ profile, listLength, maxDepth, maxNodes, maxBytes }),
  });
  const session = (seed: string | number = 1) => createSession({ ...identity, seed });
  const { checked, normalize } = createProtobufValidation({ type, maxNodes, maxDepth, maxBytes });
  const issues = (value: unknown): ValidationIssue[] => {
    try {
      checked(value);
      return [];
    } catch (cause) {
      return [
        {
          message:
            cause instanceof ProtobufFixtureError ? cause.message : 'Protobuf validation failed',
          path: cause instanceof ProtobufFixtureError ? cause.path : [],
        },
      ];
    }
  };
  const standard: StandardSchemaV1<Record<string, unknown>> = {
    '~standard': {
      version: 1,
      vendor: 'test-builders/protobuf',
      validate(value) {
        const found = issues(value);
        return found.length ? { issues: found } : { value: normalize(value) };
      },
    },
  };
  const create = createProtobufGenerator({
    type,
    session,
    maxDepth,
    maxNodes,
    profile,
    listLength,
    normalize,
  });
  const { encode, decode } = createProtobufCodecs({ type, checked, maxBytes });
  const services: Array<{
    name: string;
    methods: Array<{
      name: string;
      request: string;
      response: string;
      requestStream: boolean;
      responseStream: boolean;
    }>;
  }> = [];
  const inspect = (namespace: Namespace | Root): void => {
    for (const member of namespace.nestedArray) {
      if (member instanceof protobuf.Service) {
        services.push({
          name: member.fullName,
          methods: member.methodsArray.map((method) => ({
            name: method.name,
            request: method.resolvedRequestType!.fullName,
            response: method.resolvedResponseType!.fullName,
            requestStream: Boolean(method.requestStream),
            responseStream: Boolean(method.responseStream),
          })),
        });
      } else if (member instanceof protobuf.Namespace) {
        inspect(member);
      }
    }
  };
  inspect(root);
  return Object.freeze({
    identity,
    session,
    standard,
    create,
    normalize,
    encode,
    decode,
    clone: (value: unknown) => checked(value),
    check: (value: unknown) => issues(value).length === 0,
    issues,
    builder: () => createSchemaBuilder(standard, create, { ...options, defaultSession: session }),
    metadata: Object.freeze({
      message: type.fullName,
      nativeVersion: '8.8.0',
      network: false,
      integers64: 'bigint',
      unknownWireFields: 'discarded',
      fields: type.fieldsArray.map((field) =>
        Object.freeze({
          name: field.name,
          number: field.id,
          type: field.resolvedType?.fullName ?? field.type,
          required: field.required,
          repeated: field.repeated,
          map: field.map,
          presence: Boolean(field.hasPresence),
          oneof: field.partOf?.name,
        })
      ),
      services,
    }),
  });
}
export function fromProtobuf(
  source: string | Readonly<Record<string, unknown>>,
  message: string,
  options: ProtobufFixtureOptions = {}
): SchemaBuilder<
  Record<string, unknown>,
  Record<string, unknown>,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return protobufAdapter(source, message, options).builder();
}
