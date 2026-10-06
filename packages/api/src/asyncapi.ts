import { BuilderValidationError, createSchemaBuilder, createSession } from '@mimlet/core';
import type {
  GenerationSession,
  SchemaBuilder,
  StandardSchemaV1,
  ValidationIssue,
} from '@mimlet/core';
import { jsonSchemaAdapter } from '@mimlet/json-schema';
import {
  ApiContractError,
  Documents,
  object,
  projectSchema,
  snapshot,
  type ContractOptions,
  type JsonObject,
  type Located,
  type SchemaMode,
} from './document.js';
import { envelope, type FixturePart } from './envelope.js';
import { encodeContent, mediaType, type ContentCodecs } from './http.js';
import {
  applyTraits,
  copyMessage,
  immediate,
  messageExpression,
  type MessageFormatFactory,
  type MessageSchemaAdapter,
} from './message.js';

export type MessageAction = 'send' | 'receive';
export interface AsyncApiOptions extends ContractOptions {
  /** Native schema-format adapters. No dependency is loaded by a schemaFormat string. */
  readonly schemaFormats?: Readonly<Record<string, MessageFormatFactory>>;
}
export interface MessageSelector {
  readonly operationId?: string;
  readonly channel?: string;
  readonly action?: MessageAction;
  readonly messageId?: string;
  readonly reply?: boolean;
}
export interface MessageFixture {
  readonly headers?: Record<string, unknown>;
  readonly payload?: unknown;
}
export interface MessageTransportOptions {
  readonly parameters?: Readonly<Record<string, string | number | boolean>>;
  /** Explicit address for a channel whose address is unspecified. */
  readonly address?: string;
  /** Original request fixture, required for a runtime reply address. */
  readonly request?: MessageFixture;
  readonly contentType?: string;
  readonly codecs?: ContentCodecs;
  /** Protocol-specific address escaping; plain topic names are not automatically URL encoded. */
  readonly encodeParameter?: (value: string) => string;
}
export interface SerializedMessage {
  readonly action: MessageAction;
  readonly address: string;
  readonly headers: Readonly<Record<string, unknown>>;
  readonly payload?: string | Uint8Array<ArrayBuffer>;
  readonly contentType?: string;
  readonly correlationId?: unknown;
}
interface MessageOperation {
  readonly id: string;
  readonly channelId: string;
  readonly channel: Located;
  readonly location: Located;
  readonly action: MessageAction;
}
interface Choice {
  readonly id: string;
  readonly location: Located;
}
const dataEntries = (value: unknown): JsonObject => object(value ?? {});
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) {
    throw new ApiContractError(`${label} must be a nonempty string`);
  }
  return value;
}
function formatMode(format: string): SchemaMode | undefined {
  if (
    /^application\/vnd\.aai\.asyncapi(?:\+json|\+yaml)?;version=(?:2\.[0-6]|3\.[01])\.\d+$/.test(
      format
    )
  ) {
    return 'asyncapi';
  }
  if (/^application\/schema(?:\+json|\+yaml)?;version=draft-07$/.test(format)) {
    return 'asyncapi';
  }
  if (/^application\/vnd\.oai\.openapi(?:\+json|\+yaml)?;version=3\.0\.\d+$/.test(format)) {
    return 'openapi-3.0';
  }
  if (/^application\/vnd\.oai\.openapi(?:\+json|\+yaml)?;version=3\.[12]\.\d+$/.test(format)) {
    return 'openapi-3.1';
  }
  return undefined;
}
/** AsyncAPI documents describe fixture contracts, not executable broker configuration. */
export function asyncApi(source: unknown, supplied: AsyncApiOptions = {}) {
  const options: AsyncApiOptions = Object.freeze({
    ...supplied,
    schemaFormats: Object.freeze({ ...supplied.schemaFormats }),
  });
  const documents = new Documents(source, options);
  const root = object(documents.root.value);
  const version = text(root.asyncapi, 'AsyncAPI version');
  if (!/^(?:2\.[0-6]|3\.[01])\.\d+$/.test(version)) {
    throw new ApiContractError('Expected AsyncAPI 2.0–2.6, 3.0 or 3.1');
  }
  const legacy = version.startsWith('2.');
  const channelsLocation = documents.child(documents.root, 'channels');
  const channels = new Map<string, Located>();
  for (const name of Object.keys(dataEntries(channelsLocation.value))) {
    channels.set(name, documents.child(channelsLocation, name));
  }
  const channelReference = (reference: Located): { id: string; location: Located } => {
    const ref = object(reference.value).$ref;
    if (typeof ref !== 'string') {
      throw new ApiContractError('Operations require a channel reference', reference.pointer);
    }
    const target = documents.reference(ref, reference);
    const found = [...channels.entries()].find(
      ([, entry]) => entry.uri === target.uri && entry.pointer === target.pointer
    );
    if (!found) {
      throw new ApiContractError(
        'An operation channel must reference the root channels map',
        reference.pointer
      );
    }
    return { id: found[0], location: documents.resolve(found[1]) };
  };
  const operations: MessageOperation[] = [];
  const operationIds = new Set<string>();
  const add = (
    id: string,
    channelId: string,
    channel: Located,
    location: Located,
    action: MessageAction
  ) => {
    if (!id || operationIds.has(id)) {
      throw new ApiContractError('Operation IDs must be unique and nonempty');
    }
    operationIds.add(id);
    operations.push({
      id,
      channelId,
      channel,
      location: applyTraits(documents, location, 'operation'),
      action,
    });
  };
  if (legacy) {
    for (const [id, entry] of channels) {
      const channel = documents.resolve(entry);
      const data = object(channel.value);
      for (const method of ['publish', 'subscribe']) {
        if (data[method] === undefined) {
          continue;
        }
        const location = documents.resolve(documents.child(channel, method));
        const op = object(location.value);
        // AsyncAPI 2 describes the counterpart: publish means the application RECEIVES.
        add(
          op.operationId === undefined ? `${method}:${id}` : text(op.operationId, 'Operation ID'),
          id,
          channel,
          location,
          method === 'publish' ? 'receive' : 'send'
        );
      }
    }
  } else {
    const operationsLocation = documents.child(documents.root, 'operations');
    for (const id of Object.keys(dataEntries(operationsLocation.value))) {
      const location = documents.resolve(documents.child(operationsLocation, id));
      const data = object(location.value);
      if (data.action !== 'send' && data.action !== 'receive') {
        throw new ApiContractError('Operation action must be send or receive', location.pointer);
      }
      const channel = channelReference(documents.child(location, 'channel'));
      add(id, channel.id, channel.location, location, data.action);
    }
  }
  const prepareSchema = (location: Located, legacyFormat?: string): MessageSchemaAdapter => {
    let schema = location;
    let format = legacyFormat;
    if (
      !legacy &&
      schema.value &&
      typeof schema.value === 'object' &&
      Object.hasOwn(schema.value, 'schemaFormat')
    ) {
      const wrapper = object(schema.value);
      format = text(wrapper.schemaFormat, 'Schema format');
      if (!Object.hasOwn(wrapper, 'schema')) {
        throw new ApiContractError('Multi-format schema is missing its schema', schema.pointer);
      }
      schema = documents.child(schema, 'schema');
    }
    const native = format === undefined ? undefined : options.schemaFormats?.[format];
    if (native) {
      if (!native.id || typeof native.id !== 'string' || typeof native.prepare !== 'function') {
        throw new ApiContractError(
          'Native schema formats require a versioned ID and prepare callback'
        );
      }
      const prepared = immediate(
        native.prepare(snapshot(schema.value, options)),
        'Schema preparation'
      );
      if (
        !prepared ||
        !prepared.identity ||
        typeof prepared.identity.fingerprint !== 'string' ||
        !prepared.identity.fingerprint ||
        typeof prepared.identity.provider !== 'string' ||
        !prepared.identity.provider ||
        typeof prepared.create !== 'function' ||
        typeof prepared.issues !== 'function' ||
        (prepared.clone !== undefined && typeof prepared.clone !== 'function')
      ) {
        throw new ApiContractError('Invalid native message schema adapter');
      }
      const create = prepared.create.bind(prepared);
      const issues = prepared.issues.bind(prepared);
      const clone = prepared.clone?.bind(prepared);
      return Object.freeze({
        identity: Object.freeze({
          ...prepared.identity,
          provider: `${native.id}/${prepared.identity.provider}`,
        }),
        create(session?: GenerationSession) {
          return immediate(create(session), 'Native generation');
        },
        issues(value: unknown) {
          const result = immediate(issues(value), 'Native validation');
          if (
            !Array.isArray(result) ||
            result.some((issue) => !issue || typeof issue.message !== 'string')
          ) {
            throw new ApiContractError('Native validation must return an issue array');
          }
          return result;
        },
        ...(clone ? { clone: (value: unknown) => immediate(clone(value), 'Native cloning') } : {}),
      });
    }
    const mode = format === undefined ? 'asyncapi' : formatMode(format);
    if (!mode) {
      throw new ApiContractError(
        'Schema format requires an explicit native adapter',
        schema.pointer
      );
    }
    const projected = projectSchema(documents, schema, mode, 'message');
    return jsonSchemaAdapter(projected.schema, { ...options, dialect: projected.dialect });
  };
  const selectOperation = (selector: MessageSelector): MessageOperation => {
    const matches = operations.filter(
      (op) =>
        (selector.operationId === undefined || op.id === selector.operationId) &&
        (selector.channel === undefined || op.channelId === selector.channel) &&
        (selector.action === undefined || op.action === selector.action)
    );
    if (matches.length !== 1) {
      throw new ApiContractError('Select exactly one message operation');
    }
    return matches[0]!;
  };
  const choicesFor = (operation: Located, channel: Located): Choice[] => {
    if (legacy) {
      const location = documents.resolve(documents.child(operation, 'message'));
      const message = object(location.value);
      const entries =
        message.oneOf === undefined
          ? [location]
          : Array.isArray(message.oneOf)
            ? message.oneOf.map((value, index) => ({
                value,
                uri: location.uri,
                pointer: `${location.pointer}/oneOf/${index}`,
              }))
            : undefined;
      if (!entries?.length) {
        throw new ApiContractError('Messages require a nonempty oneOf or a message object');
      }
      const ids = new Set<string>();
      return entries.map((entry, index) => {
        const target = documents.resolve(entry);
        const data = object(target.value);
        const id = data.messageId ?? data.name ?? `message${index}`;
        text(id, 'Message ID');
        if (ids.has(id as string)) {
          throw new ApiContractError('Message IDs must be unique');
        }
        ids.add(id as string);
        return { id: id as string, location: applyTraits(documents, target, 'message') };
      });
    }
    const messageMap = documents.child(channel, 'messages');
    const entries = Object.keys(dataEntries(messageMap.value)).map((id) => ({
      id,
      location: documents.child(messageMap, id),
    }));
    const allowed = object(operation.value).messages;
    let choices = entries;
    if (allowed !== undefined) {
      if (!Array.isArray(allowed) || !allowed.length) {
        throw new ApiContractError('Operation messages must be a nonempty reference array');
      }
      const seen = new Set<string>();
      choices = allowed.map((value, index) => {
        const owner = {
          value,
          uri: operation.uri,
          pointer: `${operation.pointer}/messages/${index}`,
        };
        const target = documents.reference(text(object(value).$ref, 'Message reference'), owner);
        const entry = entries.find(
          (entry) => entry.location.uri === target.uri && entry.location.pointer === target.pointer
        );
        if (!entry || seen.has(entry.id)) {
          throw new ApiContractError(
            'Operation messages must be unique references into its channel messages'
          );
        }
        seen.add(entry.id);
        return entry;
      });
    }
    if (!choices.length) {
      throw new ApiContractError('The operation has no message definitions');
    }
    return choices.map(({ id, location }) => ({
      id,
      location: applyTraits(documents, documents.resolve(location), 'message'),
    }));
  };
  const message = (selector: MessageSelector = {}) => {
    const operation = selectOperation(selector);
    let channel = operation.channel;
    let channelId = operation.channelId;
    let location = operation.location;
    let action = operation.action;
    let replyAddress: string | undefined;
    if (selector.reply) {
      if (legacy) {
        throw new ApiContractError('AsyncAPI 2 has no native request/reply operation contract');
      }
      const reply = documents.resolve(documents.child(location, 'reply'));
      const data = object(reply.value);
      const reference = channelReference(documents.child(reply, 'channel'));
      channel = reference.location;
      channelId = reference.id;
      location = reply;
      action = action === 'send' ? 'receive' : 'send';
      if (data.address !== undefined) {
        const address = documents.resolve(documents.child(reply, 'address'));
        replyAddress = text(object(address.value).location, 'Reply address expression');
        if (object(channel.value).address !== null && object(channel.value).address !== undefined) {
          throw new ApiContractError(
            'Runtime reply addresses require an unspecified channel address'
          );
        }
      }
    }
    const choices = choicesFor(location, channel);
    const selected =
      selector.messageId === undefined && choices.length === 1
        ? choices[0]
        : choices.find((choice) => choice.id === selector.messageId);
    if (!selected) {
      throw new ApiContractError('Select an explicitly declared message ID');
    }
    const prepared = choices.map((choice) => {
      const data = object(choice.location.value);
      const parts: FixturePart[] = [];
      const native = new Map<string, MessageSchemaAdapter>();
      for (const field of ['headers', 'payload']) {
        if (data[field] === undefined) {
          continue;
        }
        const adapter = prepareSchema(
          documents.child(choice.location, field),
          legacy && field === 'payload' && data.schemaFormat !== undefined
            ? text(data.schemaFormat, 'Schema format')
            : undefined
        );
        native.set(field, adapter);
        parts.push({ group: field, required: true, adapter });
      }
      const base = envelope<MessageFixture>(
        parts,
        `asyncapi/${operation.id}/${selector.reply ? 'reply' : 'message'}/${choice.id}`,
        options,
        (value) => copyMessage(value, native, options)
      );
      return { choice, data, native, base };
    });
    const candidate = prepared.find((p) => p.choice.id === selected.id)!;
    const inspect = (value: unknown): StandardSchemaV1.Result<MessageFixture> => {
      const errors = [...candidate.base.issues(value)];
      if (errors.length) {
        return { issues: errors };
      }
      const result = candidate.base.checked(value);
      if (result.headers !== undefined) {
        try {
          object(result.headers);
        } catch {
          return {
            issues: [{ message: 'Application headers must be an object', path: ['headers'] }],
          };
        }
      }
      const matches = prepared.filter((p) => p.base.check(result)).length;
      if (matches !== 1) {
        return {
          issues: [{ message: 'A message must match exactly one operation message definition' }],
        };
      }
      return { value: result };
    };
    const standard: StandardSchemaV1<MessageFixture> = {
      '~standard': { version: 1, vendor: 'test-builders/asyncapi', validate: inspect },
    };
    const identity = Object.freeze({
      fingerprint: JSON.stringify(prepared.map((p) => [p.choice.id, p.base.identity])),
      provider: `test-builders/asyncapi-v1/${version}/${operation.id}/${selected.id}/${selector.reply ? 'reply' : 'message'}`,
    });
    const session = (seed: string | number = 1) => createSession({ ...identity, seed });
    const checked = (value: unknown): MessageFixture => {
      const result = inspect(value);
      if (result.issues) {
        throw new BuilderValidationError(result.issues);
      }
      return result.value;
    };
    const attempts = options.maxAttempts ?? 20;
    if (!Number.isSafeInteger(attempts) || attempts < 1 || attempts > 1000) {
      throw new ApiContractError('Message attempts must be an integer from 1 to 1000');
    }
    const create = (execution: GenerationSession = session()): MessageFixture => {
      let last: readonly ValidationIssue[] = [];
      for (let attempt = 0; attempt < attempts; attempt++) {
        const examples = candidate.data.examples;
        const proposed =
          options.profile === 'examples' &&
          attempt === 0 &&
          Array.isArray(examples) &&
          examples.length
            ? (() => {
                const item = object(examples[0]);
                return Object.fromEntries(
                  ['headers', 'payload']
                    .filter((name) => Object.hasOwn(item, name))
                    .map((name) => [name, item[name]])
                );
              })()
            : candidate.base.create(execution);
        const result = inspect(proposed);
        if (!result.issues) {
          return result.value;
        }
        last = result.issues;
      }
      throw new ApiContractError(
        'No unambiguous message was found within the generation budget',
        selected.location.pointer,
        { cause: new BuilderValidationError(last) }
      );
    };
    const messageData = candidate.data;
    const contentType = messageData.contentType ?? root.defaultContentType;
    if (contentType !== undefined) {
      mediaType(text(contentType, 'Content type'));
    }
    let correlation: string | undefined;
    if (messageData.correlationId !== undefined) {
      correlation = text(
        object(documents.resolve(documents.child(selected.location, 'correlationId')).value)
          .location,
        'Correlation expression'
      );
    }
    const channelData = object(channel.value);
    const declaredAddress = legacy ? channelId : channelData.address;
    if (
      declaredAddress !== undefined &&
      declaredAddress !== null &&
      typeof declaredAddress !== 'string'
    ) {
      throw new ApiContractError('Channel address must be a string or null');
    }
    const parametersLocation = documents.child(channel, 'parameters');
    const parameters = Object.keys(dataEntries(parametersLocation.value)).map((name) => {
      const owner = documents.resolve(documents.child(parametersLocation, name));
      const data = object(owner.value);
      const adapter =
        legacy && data.schema !== undefined
          ? prepareSchema(documents.child(owner, 'schema'))
          : undefined;
      if (!legacy) {
        if (data.schema !== undefined) {
          throw new ApiContractError(
            'AsyncAPI 3 channel parameters use enum/default/examples, not schema'
          );
        }
        if (
          data.enum !== undefined &&
          (!Array.isArray(data.enum) ||
            !data.enum.length ||
            data.enum.some((value) => typeof value !== 'string'))
        ) {
          throw new ApiContractError('Channel parameter enum must contain strings');
        }
        if (data.default !== undefined && typeof data.default !== 'string') {
          throw new ApiContractError('Channel parameter default must be a string');
        }
      }
      return { name, data, adapter };
    });
    const address = (value: MessageFixture, transport: MessageTransportOptions = {}): string => {
      const input = checked(value);
      let pattern: unknown = replyAddress
        ? messageExpression(replyAddress, transport.request)
        : (declaredAddress ?? transport.address);
      if (typeof pattern !== 'string' || !pattern || /[\r\n\0]/.test(pattern)) {
        throw new ApiContractError('A concrete channel address is required');
      }
      const required = new Set([...pattern.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!));
      for (const name of Object.keys(transport.parameters ?? {})) {
        if (!parameters.some((p) => p.name === name)) {
          throw new ApiContractError('Unknown channel parameter');
        }
      }
      for (const name of required) {
        const parameter = parameters.find((p) => p.name === name);
        if (!parameter) {
          throw new ApiContractError('Address placeholder has no parameter declaration');
        }
        const explicit = transport.parameters?.[name];
        const located =
          parameter.data.location === undefined
            ? undefined
            : messageExpression(text(parameter.data.location, 'Parameter expression'), input);
        if (located !== undefined && explicit !== undefined && located !== explicit) {
          throw new ApiContractError(
            'Explicit channel parameter disagrees with its message expression'
          );
        }
        const selected = located ?? explicit ?? parameter.data.default;
        if (
          (typeof selected !== 'string' &&
            typeof selected !== 'boolean' &&
            !(typeof selected === 'number' && Number.isFinite(selected))) ||
          (!legacy && typeof selected !== 'string')
        ) {
          throw new ApiContractError('Channel parameter is missing or not a supported scalar');
        }
        if (Array.isArray(parameter.data.enum) && !parameter.data.enum.includes(selected)) {
          throw new ApiContractError('Channel parameter is outside its declared enum');
        }
        if (parameter.adapter && parameter.adapter.issues(selected).length) {
          throw new ApiContractError('Channel parameter violates its schema');
        }
        const encoded = transport.encodeParameter
          ? immediate(transport.encodeParameter(String(selected)), 'Address encoding')
          : String(selected);
        if (typeof encoded !== 'string' || /[{}\r\n\0]/.test(encoded)) {
          throw new ApiContractError('Address parameter encoding is invalid');
        }
        pattern = (pattern as string).split(`{${name}}`).join(encoded);
      }
      if (typeof pattern !== 'string' || /[{}\r\n\0]/.test(pattern)) {
        throw new ApiContractError('Channel address has unresolved placeholders');
      }
      return pattern;
    };
    return Object.freeze({
      identity,
      session,
      standard,
      create,
      check: (value: unknown) => inspect(value).issues === undefined,
      issues: (value: unknown) => inspect(value).issues ?? [],
      builder: () =>
        createSchemaBuilder(standard, create, {
          ...options,
          defaultSession: session,
        }) as unknown as SchemaBuilder<
          MessageFixture,
          MessageFixture,
          [session?: GenerationSession],
          [session: GenerationSession]
        >,
      metadata: Object.freeze({
        operationId: operation.id,
        messageId: selected.id,
        channel: channelId,
        action,
        reply: selector.reply === true,
        address: declaredAddress,
        contentType,
        correlationId: correlation,
        source: `${selected.location.uri}#${selected.location.pointer}`,
        bindings: snapshot(
          {
            operation: object(location.value).bindings ?? {},
            channel: channelData.bindings ?? {},
            message: messageData.bindings ?? {},
          },
          options
        ),
        security: snapshot(object(location.value).security ?? [], options),
        servers: snapshot(channelData.servers ?? root.servers ?? {}, options),
      }),
      correlationId(value: MessageFixture): unknown {
        return correlation === undefined
          ? undefined
          : messageExpression(correlation, checked(value));
      },
      address,
      serialize(value: MessageFixture, transport: MessageTransportOptions = {}): SerializedMessage {
        const input = checked(value);
        const selectedContent = transport.contentType ?? contentType;
        const payload = Object.hasOwn(input, 'payload')
          ? encodeContent(
              text(selectedContent, 'Payload content type'),
              input.payload,
              transport.codecs
            )
          : undefined;
        return {
          action,
          address: address(input, transport),
          headers: input.headers ?? {},
          ...(payload === undefined ? {} : { payload }),
          ...(selectedContent === undefined ? {} : { contentType: String(selectedContent) }),
          ...(correlation === undefined
            ? {}
            : { correlationId: messageExpression(correlation, input) }),
        };
      },
    });
  };
  return Object.freeze({
    operations: () =>
      operations.map((op) =>
        Object.freeze({ operationId: op.id, channel: op.channelId, action: op.action })
      ),
    messages(selector: MessageSelector = {}) {
      const op = selectOperation(selector);
      return choicesFor(op.location, op.channel).map(({ id, location }) => ({
        messageId: id,
        source: `${location.uri}#${location.pointer}`,
      }));
    },
    message,
    reply(selector: Omit<MessageSelector, 'reply'> = {}) {
      return message({ ...selector, reply: true });
    },
  });
}
export function fromAsyncApiMessage(
  source: unknown,
  selector: MessageSelector = {},
  options: AsyncApiOptions = {}
): SchemaBuilder<
  MessageFixture,
  MessageFixture,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return asyncApi(source, options).message(selector).builder();
}
