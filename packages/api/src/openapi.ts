import { jsonSchemaAdapter } from '@mimlet/json-schema';
import type { JsonSchema, SchemaDialect } from '@mimlet/json-schema';
import type { GenerationSession, SchemaBuilder } from '@mimlet/core';
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
import {
  encodeContent,
  headerName,
  headerValue,
  mediaType,
  serializeParameter,
  type ContentCodecs,
  type ParameterEncoding,
} from './http.js';
export interface OperationSelector {
  readonly operationId?: string;
  readonly path?: string;
  readonly method?: string;
  readonly webhook?: boolean;
}
export interface OpenApiSelection extends OperationSelector {
  readonly mediaType?: string;
}
export interface OpenApiResponseSelection extends OpenApiSelection {
  readonly status: number;
}
export interface HttpRequestFixture {
  readonly path?: Record<string, unknown>;
  readonly query?: Record<string, unknown>;
  readonly headers?: Record<string, unknown>;
  readonly cookies?: Record<string, unknown>;
  readonly body?: unknown;
}
export interface HttpResponseFixture {
  readonly headers?: Record<string, unknown>;
  readonly body?: unknown;
}
export interface HttpSerializationOptions {
  readonly baseUrl?: string;
  readonly codecs?: ContentCodecs;
}
export interface SerializedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  /** Text, or bytes that own an ordinary `ArrayBuffer`: a valid Fetch `BodyInit`. */
  readonly body?: string | Uint8Array<ArrayBuffer>;
}
export interface SerializedResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  /** Text, or bytes that own an ordinary `ArrayBuffer`: a valid Fetch `BodyInit`. */
  readonly body?: string | Uint8Array<ArrayBuffer>;
}
interface Operation {
  readonly id: string;
  readonly path: string;
  readonly method: string;
  readonly webhook: boolean;
  readonly item: Located;
  readonly operation: Located;
}
const httpMethods = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
  'query',
]);
const groups = { path: 'path', query: 'query', header: 'headers', cookie: 'cookies' } as const;
function entries(value: unknown): JsonObject {
  return object(value ?? {});
}
function media(
  documents: Documents,
  from: Located,
  wanted?: string
): { location: Located; type: string } | undefined {
  if (from.value === undefined) {
    if (wanted !== undefined) {
      throw new ApiContractError('No media type is declared', from.pointer);
    }
    return undefined;
  }
  const content = object(from.value, from.pointer);
  const names = Object.keys(content);
  const selected =
    wanted ??
    (names.includes('application/json')
      ? 'application/json'
      : names.length === 1
        ? names[0]
        : undefined);
  if (!selected || !Object.hasOwn(content, selected)) {
    throw new ApiContractError('Select an explicitly declared media type', from.pointer);
  }
  mediaType(selected);
  return { location: documents.child(from, selected), type: selected };
}
function version(documents: Documents): {
  root: JsonObject & { readonly openapi: string };
  mode: SchemaMode;
} {
  const root = object(documents.root.value);
  if (typeof root.openapi !== 'string' || !/^3\.(0|1|2)\.[0-9]+$/.test(root.openapi)) {
    throw new ApiContractError('Expected OpenAPI 3.0, 3.1 or 3.2');
  }
  return {
    root: root as JsonObject & { readonly openapi: string },
    mode: root.openapi.startsWith('3.0.') ? 'openapi-3.0' : 'openapi-3.1',
  };
}
export interface OpenApiComponentSchema {
  /** A standalone schema; the component schemas it references are local definitions. */
  readonly schema: JsonSchema;
  /** `draft-07` for OpenAPI 3.0 and `draft-2020-12` for 3.1 and 3.2. */
  readonly dialect: SchemaDialect;
}
const componentPointer = /^\/components\/schemas\/([^/]+)$/;
/**
 * Named component schemas (`#/components/schemas/<name>`) as standalone JSON Schemas, with the
 * same projection as operation fixtures: OpenAPI 3.0 `nullable` and exclusive bounds, 3.1
 * reference siblings, and direction-aware `readOnly`/`writeOnly` properties. Referenced
 * components become definitions named after the component. Operations are not read.
 */
export function openApiComponents(source: unknown, options: ContractOptions = {}) {
  options = Object.freeze({ ...options });
  const documents = new Documents(source, options);
  const { root, mode } = version(documents);
  const components =
    root.components === undefined ? undefined : documents.child(documents.root, 'components');
  const schemas =
    components === undefined || object(components.value, components.pointer).schemas === undefined
      ? undefined
      : documents.child(components, 'schemas');
  const names = schemas === undefined ? [] : Object.keys(object(schemas.value, schemas.pointer));
  const naming = (target: Located) => {
    const match = componentPointer.exec(target.pointer);
    const name = match?.[1]?.replace(/~1/g, '/').replace(/~0/g, '~');
    return name !== undefined && /^[A-Za-z0-9._-]{1,128}$/.test(name) ? name : undefined;
  };
  return Object.freeze({
    openapi: root.openapi,
    dialect: (mode === 'openapi-3.0' ? 'draft-07' : 'draft-2020-12') as SchemaDialect,
    /** Component schema names in document order. */
    names: (): string[] => [...names],
    /**
     * `request` leaves out read-only properties and `response` (the default) leaves out
     * write-only ones, as `openApi().request()` and `.response()` do.
     */
    schema(name: string, direction: 'request' | 'response' = 'response'): OpenApiComponentSchema {
      if (typeof name !== 'string' || !names.includes(name) || schemas === undefined) {
        throw new ApiContractError('Unknown component schema', '/components/schemas');
      }
      if (direction !== 'request' && direction !== 'response') {
        throw new ApiContractError('Expected the request or response direction');
      }
      const projected = projectSchema(
        documents,
        documents.child(schemas, name),
        mode,
        direction,
        naming
      );
      return Object.freeze({ schema: projected.schema, dialect: projected.dialect });
    },
  });
}
/** Data-only OpenAPI operation fixtures. Server descriptions are never used to make requests. */
export function openApi(source: unknown, options: ContractOptions = {}) {
  options = Object.freeze({ ...options });
  const documents = new Documents(source, options);
  const { root, mode } = version(documents);
  const operations: Operation[] = [];
  const ids = new Set<string>();
  for (const group of ['paths', 'webhooks']) {
    const paths = documents.child(documents.root, group);
    for (const path of Object.keys(entries(paths.value))) {
      if (group === 'paths' && !path.startsWith('/')) {
        throw new ApiContractError('API paths must begin with /', path);
      }
      const item = documents.resolve(documents.child(paths, path));
      for (const [method, value] of Object.entries(object(item.value))) {
        if (!httpMethods.has(method)) {
          continue;
        }
        if (method === 'query' && !root.openapi.startsWith('3.2.')) {
          throw new ApiContractError('QUERY requires OpenAPI 3.2', item.pointer);
        }
        const operation = documents.child(item, method);
        const data = object(value, operation.pointer);
        const id = data.operationId === undefined ? `${group}:${method}:${path}` : data.operationId;
        if (typeof id !== 'string' || !id || ids.has(id)) {
          throw new ApiContractError(
            'Operation IDs must be nonempty and unique',
            operation.pointer
          );
        }
        ids.add(id);
        operations.push({ id, path, method, webhook: group === 'webhooks', item, operation });
      }
      if (object(item.value).additionalOperations !== undefined) {
        throw new ApiContractError(
          'Additional HTTP methods require an explicit adapter',
          item.pointer
        );
      }
    }
  }
  const select = (selector: OperationSelector) => {
    const found = operations.filter(
      (op) =>
        (selector.operationId === undefined || op.id === selector.operationId) &&
        (selector.path === undefined || op.path === selector.path) &&
        (selector.method === undefined || op.method === selector.method.toLowerCase()) &&
        (selector.webhook === undefined || op.webhook === selector.webhook)
    );
    if (found.length !== 1) {
      throw new ApiContractError('Operation selection must match exactly one operation');
    }
    return found[0]!;
  };
  const prepare = (location: Located, direction: 'request' | 'response') => {
    const projected = projectSchema(documents, location, mode, direction);
    return jsonSchemaAdapter(projected.schema, { ...options, dialect: projected.dialect });
  };
  const request = (selector: OpenApiSelection) => {
    const operation = select(selector);
    const parameters = new Map<string, { location: Located; data: JsonObject }>();
    for (const owner of [operation.item, operation.operation]) {
      const array = documents.child(owner, 'parameters');
      if (array.value === undefined) {
        continue;
      }
      if (!Array.isArray(array.value)) {
        throw new ApiContractError('Parameters must be an array', array.pointer);
      }
      const local = new Set<string>();
      array.value.forEach((value, index) => {
        const location = documents.resolve({
          value,
          uri: array.uri,
          pointer: `${array.pointer}/${index}`,
        });
        const data = object(location.value);
        for (const field of ['required', 'explode', 'allowReserved']) {
          if (data[field] !== undefined && typeof data[field] !== 'boolean') {
            throw new ApiContractError('Parameter flags must be booleans', location.pointer);
          }
        }
        if (
          typeof data.name !== 'string' ||
          !data.name ||
          typeof data.in !== 'string' ||
          !Object.hasOwn(groups, data.in)
        ) {
          throw new ApiContractError('Unsupported parameter location or name', location.pointer);
        }
        const name = data.in === 'header' ? headerName(data.name) : data.name;
        if (data.in === 'header' && ['accept', 'content-type', 'authorization'].includes(name)) {
          return;
        }
        if (data.in === 'path' && data.required !== true) {
          throw new ApiContractError('Path parameters must be required', location.pointer);
        }
        const key = `${data.in}:${name}`;
        if (local.has(key)) {
          throw new ApiContractError('Duplicate parameter declaration', location.pointer);
        }
        local.add(key);
        parameters.set(key, { location, data: { ...data, name } });
      });
    }
    const parts: FixturePart[] = [];
    const encodings: Array<{ encoding: ParameterEncoding; contentType?: string }> = [];
    for (const { data, location } of parameters.values()) {
      const encoding = {
        name: data.name as string,
        in: data.in as ParameterEncoding['in'],
        ...(data.style === undefined ? {} : { style: String(data.style) }),
        ...(data.explode === undefined ? {} : { explode: Boolean(data.explode) }),
        ...(data.allowReserved === undefined ? {} : { allowReserved: Boolean(data.allowReserved) }),
      };
      let schema = documents.child(location, 'schema');
      let contentType: string | undefined;
      if (data.content !== undefined) {
        if (data.schema !== undefined) {
          throw new ApiContractError(
            'Parameters cannot declare both schema and content',
            location.pointer
          );
        }
        const selected = media(documents, documents.child(location, 'content'))!;
        contentType = selected.type;
        schema = documents.child(selected.location, 'schema');
      }
      if (schema.value === undefined) {
        throw new ApiContractError('Parameter schema is missing', location.pointer);
      }
      parts.push({
        group: groups[encoding.in],
        name: encoding.name,
        required: data.required === true,
        adapter: prepare(schema, 'request'),
      });
      encodings.push({ encoding, ...(contentType === undefined ? {} : { contentType }) });
    }
    if (!operation.webhook) {
      const expected = new Set(
        [...operation.path.matchAll(/\{([^{}]+)\}/g)].map((match) => match[1]!)
      );
      const declared = [...parameters.values()]
        .filter(({ data }) => data.in === 'path')
        .map(({ data }) => data.name as string);
      if (expected.size !== declared.length || declared.some((name) => !expected.has(name))) {
        throw new ApiContractError('Path templates and path parameters differ', operation.path);
      }
    }
    let contentType: string | undefined;
    const bodyLocation = documents.child(operation.operation, 'requestBody');
    if (bodyLocation.value !== undefined) {
      const body = documents.resolve(bodyLocation);
      const selected = media(documents, documents.child(body, 'content'), selector.mediaType)!;
      if (!selected) {
        throw new ApiContractError('Request body must declare content', body.pointer);
      }
      const mediaObject = object(selected.location.value);
      if (mediaObject.encoding !== undefined || mediaObject.itemSchema !== undefined) {
        throw new ApiContractError(
          'Encoded/streaming bodies require an explicit transport adapter',
          selected.location.pointer
        );
      }
      const schema = documents.child(selected.location, 'schema');
      parts.push({
        group: 'body',
        required: object(body.value).required === true,
        adapter: prepare({ ...schema, value: schema.value ?? true }, 'request'),
      });
      contentType = selected.type;
    } else if (selector.mediaType !== undefined) {
      throw new ApiContractError('This operation has no request body');
    }
    const base = envelope<HttpRequestFixture>(parts, `openapi/request/${operation.id}`, options);
    return Object.freeze({
      ...base,
      metadata: Object.freeze({
        operationId: operation.id,
        path: operation.path,
        method: operation.method.toUpperCase(),
        webhook: operation.webhook,
        mediaType: contentType,
        security: snapshot(object(operation.operation.value).security ?? root.security ?? []),
        source: `${operation.operation.uri}#${operation.operation.pointer}`,
      }),
      serialize(
        input: HttpRequestFixture,
        transport: HttpSerializationOptions = {}
      ): SerializedRequest {
        const value = base.checked(input);
        let path = operation.path;
        const query: Array<readonly [string, string]> = [];
        const cookies: Array<readonly [string, string]> = [];
        const headers: Record<string, string> = {};
        for (const { encoding, contentType: content } of encodings) {
          const group = value[groups[encoding.in]];
          if (!group || !Object.hasOwn(group, encoding.name)) {
            continue;
          }
          let parameter = group[encoding.name];
          if (content) {
            parameter = encodeContent(content, parameter, transport.codecs);
            if (typeof parameter !== 'string') {
              throw new ApiContractError('Binary parameter content needs a custom transport');
            }
          }
          const serialized = serializeParameter(encoding, parameter);
          if (encoding.in === 'path') {
            path = path.split(`{${encoding.name}}`).join(serialized.value);
          } else if (encoding.in === 'query') {
            query.push(...serialized.pairs);
          } else if (encoding.in === 'cookie') {
            cookies.push(...serialized.pairs);
          } else {
            Object.defineProperty(headers, encoding.name, {
              value: serialized.value,
              enumerable: true,
              configurable: true,
              writable: true,
            });
          }
        }
        if (operation.webhook || /[{}]/.test(path)) {
          throw new ApiContractError('A concrete path is required for request serialization');
        }
        const suffix = query.length
          ? `?${query.map(([key, value]) => `${key}=${value}`).join('&')}`
          : '';
        if (cookies.length) {
          headers.cookie = cookies.map(([key, value]) => `${key}=${value}`).join('; ');
        }
        let body: string | Uint8Array<ArrayBuffer> | undefined;
        if (Object.hasOwn(value, 'body')) {
          body = encodeContent(contentType!, value.body, transport.codecs);
          headers['content-type'] = headerValue(contentType!);
        }
        let url = path + suffix;
        if (transport.baseUrl !== undefined) {
          const target = new URL(transport.baseUrl);
          if (
            !['http:', 'https:'].includes(target.protocol) ||
            target.search ||
            target.hash ||
            target.username ||
            target.password
          ) {
            throw new ApiContractError(
              'baseUrl must be an HTTP(S) base without credentials/query/fragment'
            );
          }
          url = target.href.replace(/\/$/, '') + path + suffix;
        }
        return {
          method: operation.method.toUpperCase(),
          url,
          headers,
          ...(body === undefined ? {} : { body }),
        };
      },
    });
  };
  const response = (selector: OpenApiResponseSelection) => {
    const operation = select(selector);
    if (!Number.isInteger(selector.status) || selector.status < 100 || selector.status > 599) {
      throw new ApiContractError('Expected an HTTP response status');
    }
    const responses = documents.child(operation.operation, 'responses');
    const values = entries(responses.value);
    const code = String(selector.status);
    const key = Object.hasOwn(values, code)
      ? code
      : Object.hasOwn(values, `${code[0]}XX`)
        ? `${code[0]}XX`
        : 'default';
    if (!Object.hasOwn(values, key)) {
      throw new ApiContractError('Response status is not declared', responses.pointer);
    }
    const selectedResponse = documents.resolve(documents.child(responses, key));
    const headersLocation = documents.child(selectedResponse, 'headers');
    const parts: FixturePart[] = [];
    const encodings: Array<{ name: string; explode: boolean; contentType?: string }> = [];
    const names = new Set<string>();
    for (const rawName of Object.keys(entries(headersLocation.value))) {
      const name = headerName(rawName);
      if (name === 'content-type') {
        continue;
      }
      if (names.has(name)) {
        throw new ApiContractError('Duplicate case-insensitive response header');
      }
      names.add(name);
      const location = documents.resolve(documents.child(headersLocation, rawName));
      const data = object(location.value);
      if (data.style !== undefined && data.style !== 'simple') {
        throw new ApiContractError('Response headers use simple serialization');
      }
      let schema = documents.child(location, 'schema');
      let contentType: string | undefined;
      if (data.content !== undefined) {
        if (data.schema !== undefined) {
          throw new ApiContractError('Headers cannot declare schema and content');
        }
        const selected = media(documents, documents.child(location, 'content'))!;
        contentType = selected.type;
        schema = documents.child(selected.location, 'schema');
      }
      if (schema.value === undefined) {
        throw new ApiContractError('Response header schema is missing');
      }
      parts.push({
        group: 'headers',
        name,
        required: data.required === true,
        adapter: prepare(schema, 'response'),
      });
      encodings.push({
        name,
        explode: data.explode === true,
        ...(contentType === undefined ? {} : { contentType }),
      });
    }
    const selected = media(
      documents,
      documents.child(selectedResponse, 'content'),
      selector.mediaType
    );
    if (selected) {
      if (
        selector.status === 204 ||
        selector.status === 304 ||
        selector.status < 200 ||
        operation.method === 'head'
      ) {
        throw new ApiContractError('This response must not contain a message body');
      }
      const data = object(selected.location.value);
      if (data.encoding !== undefined || data.itemSchema !== undefined) {
        throw new ApiContractError('Encoded/streaming responses require an explicit adapter');
      }
      const schema = documents.child(selected.location, 'schema');
      parts.push({
        group: 'body',
        required: true,
        adapter: prepare({ ...schema, value: schema.value ?? true }, 'response'),
      });
    }
    const base = envelope<HttpResponseFixture>(
      parts,
      `openapi/response/${operation.id}/${code}/${selected?.type ?? ''}`,
      options
    );
    return Object.freeze({
      ...base,
      metadata: Object.freeze({
        operationId: operation.id,
        method: operation.method.toUpperCase(),
        path: operation.path,
        status: selector.status,
        responseKey: key,
        mediaType: selected?.type,
        source: `${selectedResponse.uri}#${selectedResponse.pointer}`,
      }),
      serialize(
        input: HttpResponseFixture,
        transport: Pick<HttpSerializationOptions, 'codecs'> = {}
      ): SerializedResponse {
        const value = base.checked(input);
        const headers: Record<string, string> = {};
        for (const encoding of encodings) {
          if (!value.headers || !Object.hasOwn(value.headers, encoding.name)) {
            continue;
          }
          let header = value.headers[encoding.name];
          if (encoding.contentType) {
            header = encodeContent(encoding.contentType, header, transport.codecs);
          }
          Object.defineProperty(headers, encoding.name, {
            value: serializeParameter(
              { name: encoding.name, in: 'header', explode: encoding.explode },
              header
            ).value,
            enumerable: true,
            configurable: true,
            writable: true,
          });
        }
        if (selected) {
          headers['content-type'] = headerValue(selected.type);
        }
        return {
          status: selector.status,
          headers,
          ...(Object.hasOwn(value, 'body')
            ? { body: encodeContent(selected!.type, value.body, transport.codecs) }
            : {}),
        };
      },
    });
  };
  return Object.freeze({
    operations: () =>
      operations.map(({ id, path, method, webhook }) =>
        Object.freeze({ operationId: id, path, method: method.toUpperCase(), webhook })
      ),
    request,
    response,
    schema(pointer: string, direction: 'request' | 'response' = 'response') {
      return prepare(documents.reference(pointer, documents.root), direction);
    },
  });
}
export function fromOpenApiRequest(
  source: unknown,
  selector: OpenApiSelection,
  options: ContractOptions = {}
): SchemaBuilder<
  HttpRequestFixture,
  HttpRequestFixture,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return openApi(source, options).request(selector).builder();
}
export function fromOpenApiResponse(
  source: unknown,
  selector: OpenApiResponseSelection,
  options: ContractOptions = {}
): SchemaBuilder<
  HttpResponseFixture,
  HttpResponseFixture,
  [session?: GenerationSession],
  [session: GenerationSession]
> {
  return openApi(source, options).response(selector).builder();
}
