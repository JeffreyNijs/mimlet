/* global Request, Response */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import {
  ApiContractError,
  encodeContent,
  fromOpenApiRequest,
  fromOpenApiResponse,
  headerName,
  headerValue,
  openApi,
  openApiComponents,
  serializeParameter,
} from '@mimlet/api';
import { BuilderValidationError, restoreSession } from '@mimlet/core';
const content = (schema, type = 'application/json') => ({ content: { [type]: { schema } } });
const parameter = (name, location = 'query', schema = { type: 'string' }, extra = {}) => ({
  name,
  in: location,
  schema,
  ...extra,
});
function document(operation = {}, version = '3.1.0', path = '/users') {
  return {
    openapi: version,
    paths: {
      [path]: {
        post: {
          operationId: 'users',
          responses: { 200: content({ type: 'string' }) },
          ...operation,
        },
      },
    },
  };
}
const select = { operationId: 'users' };
const fail = (fn, text) => assert.throws(fn, text ?? ApiContractError);

describe('parameter and content serialization', () => {
  it('covers supported URI template shapes without flattening nested data', () => {
    const cases = [
      ['path', 'simple', false, 'x', 'x'],
      ['path', 'simple', false, ['a', 'b'], 'a,b'],
      ['path', 'simple', true, { a: 1, b: 2 }, 'a=1,b=2'],
      ['path', 'simple', false, { a: 1, b: 2 }, 'a,1,b,2'],
      ['path', 'label', true, ['a', 'b'], '.a.b'],
      ['path', 'label', false, ['a', 'b'], '.a,b'],
      ['path', 'label', true, { a: 1, b: 2 }, '.a=1.b=2'],
      ['path', 'label', false, { a: 1, b: 2 }, '.a,1,b,2'],
      ['path', 'matrix', true, ['a', 'b'], ';id=a;id=b'],
      ['path', 'matrix', true, ['', 'b'], ';id;id=b'],
      ['path', 'matrix', true, { a: 1, b: 2 }, ';a=1;b=2'],
      ['path', 'matrix', false, ['a', 'b'], ';id=a,b'],
      ['path', 'matrix', false, '', ';id'],
      ['path', 'label', true, 'a/b', '.a%2Fb'],
      ['header', 'simple', true, { a: 1, b: 2 }, 'a=1,b=2'],
    ];
    for (const [location, style, explode, value, expected] of cases)
      assert.equal(
        serializeParameter({ name: 'id', in: location, style, explode }, value).value,
        expected
      );
    assert.deepEqual(serializeParameter({ name: 'q', in: 'query' }, ['a', 'b']).pairs, [
      ['q', 'a'],
      ['q', 'b'],
    ]);
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', explode: false }, ['a', 'b']).pairs,
      [['q', 'a,b']]
    );
    assert.deepEqual(serializeParameter({ name: 'q', in: 'query' }, { a: 1 }).pairs, [['a', '1']]);
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', explode: false }, { a: 1, b: 2 }).pairs,
      [['q', 'a,1,b,2']]
    );
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', style: 'deepObject' }, { a: 'b&c' }).pairs,
      [['q%5Ba%5D', 'b%26c']]
    );
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', style: 'spaceDelimited' }, ['a', 'b']).pairs,
      [['q', 'a%20b']]
    );
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', style: 'pipeDelimited' }, ['a', 'b']).pairs,
      [['q', 'a%7Cb']]
    );
    assert.deepEqual(
      serializeParameter({ name: 'q', in: 'query', allowReserved: true }, 'a/b&x=1#f+[]%20%z')
        .pairs,
      [['q', 'a/b%26x%3D1%23f%2B%5B%5D%20%25z']]
    );
    assert.deepEqual(serializeParameter({ name: 'a', in: 'cookie', style: 'cookie' }, true).pairs, [
      ['a', 'true'],
    ]);
    assert.equal(serializeParameter({ name: 'id', in: 'path' }, null).value, '');
  });
  it('rejects undefined serialization semantics and HTTP injection', () => {
    for (const p of [
      null,
      { name: '', in: 'query' },
      { name: 'x', in: 'body' },
      { name: 'x', in: 'header', style: 'form' },
    ])
      fail(() => serializeParameter(p, 'a'));
    for (const value of [undefined, NaN, Infinity, () => 0, { a: { b: 1 } }, [[1]], new Date()])
      fail(() => serializeParameter({ name: 'x', in: 'query' }, value));
    fail(() => serializeParameter({ name: 'x', in: 'query', style: 'deepObject' }, []));
    fail(() =>
      serializeParameter({ name: 'x', in: 'query', style: 'deepObject', explode: false }, { a: 1 })
    );
    fail(() => serializeParameter({ name: 'x', in: 'query', style: 'pipeDelimited' }, {}));
    fail(() =>
      serializeParameter({ name: 'x', in: 'query', style: 'spaceDelimited', explode: true }, [])
    );
    fail(() => serializeParameter({ name: 'x', in: 'header' }, 'hello\r\nInjected: yes'));
    fail(() => serializeParameter({ name: 'x', in: 'header' }, { 'bad\nkey': 1 }));
    assert.equal(headerName('X-Request-Id'), 'x-request-id');
    assert.equal(headerValue('value'), 'value');
    fail(() => headerName('bad header'));
  });
  it('serializes known content and requires explicit synchronous custom codecs', async () => {
    assert.equal(encodeContent('application/problem+json', { x: 1 }), '{' + '"x":1}');
    assert.equal(encodeContent('text/plain', 42), '42');
    assert.equal(
      encodeContent('application/x-www-form-urlencoded', { a: ['one', 'two'], b: 'x y' }),
      'a=one&a=two&b=x%20y'
    );
    assert.deepEqual(
      encodeContent('application/octet-stream', 'data', {
        'application/octet-stream': { encode: () => new Uint8Array([1]) },
      }),
      new Uint8Array([1])
    );
    assert.equal(
      encodeContent('application/custom;charset=utf-8', 'data', {
        'application/custom': { encode: () => 'custom' },
      }),
      'custom'
    );
    for (const type of ['', 'bad', 'application/json\nX: 1']) fail(() => encodeContent(type, 1));
    fail(() => encodeContent('application/json', undefined));
    fail(() => encodeContent('application/octet-stream', 'data'));
    fail(() => encodeContent('text/plain', {}, { 'text/plain': { encode: () => 1 } }));
    fail(() =>
      encodeContent('text/plain', 'x', {
        'text/plain': { encode: () => Promise.reject(new Error('observed')) },
      })
    );
    await setImmediate();
  });
  it('returns bytes that Fetch accepts as a body, copying shared memory', async () => {
    const owned = new Uint8Array([1, 2]);
    const shared = new Uint8Array(new SharedArrayBuffer(4), 1, 2);
    shared.set([3, 4]);
    const codec = (bytes) => ({ 'application/octet-stream': { encode: () => bytes } });
    assert.equal(encodeContent('application/octet-stream', 'x', codec(owned)), owned);
    const copied = encodeContent('application/octet-stream', 'x', codec(shared));
    assert.ok(copied.buffer instanceof ArrayBuffer);
    assert.deepEqual([...copied], [3, 4]);
    shared.set([5, 6]);
    assert.deepEqual([...copied], [3, 4]);
    const binary = {
      openapi: '3.1.0',
      paths: {
        '/files': {
          put: {
            operationId: 'upload',
            requestBody: { required: true, content: { 'application/octet-stream': {} } },
            responses: { 200: { content: { 'application/octet-stream': {} } } },
          },
        },
      },
    };
    const api = openApi(binary);
    const request = api
      .request({ operationId: 'upload' })
      .serialize({ body: 'x' }, { baseUrl: 'https://example.com', codecs: codec(shared) });
    const response = api
      .response({ operationId: 'upload', status: 200 })
      .serialize({ body: 'x' }, { codecs: codec(shared) });
    const fetched = new Request(request.url, { method: request.method, body: request.body });
    assert.deepEqual([...new Uint8Array(await fetched.arrayBuffer())], [5, 6]);
    assert.deepEqual([...new Uint8Array(await new Response(response.body).arrayBuffer())], [5, 6]);
  });
});

describe('OpenAPI request and response contracts', () => {
  it('preserves read/write direction, reference semantics, encoded input and replay', () => {
    const user = {
      type: 'object',
      properties: {
        id: { type: 'integer', readOnly: true },
        password: { type: 'string', writeOnly: true },
        name: { type: 'string', minLength: 2 },
      },
      required: ['id', 'password', 'name'],
      additionalProperties: false,
    };
    const body = content({ $ref: '#/components/schemas/User' });
    for (const version of ['3.0.4', '3.1.2', '3.2.0']) {
      const source = document(
        { requestBody: { ...body, required: true }, responses: { 200: body } },
        version
      );
      source.components = { schemas: { User: user } };
      const api = openApi(source);
      const request = api.request(select);
      const response = api.response({ ...select, status: 200 });
      const execution = request.session(123);
      const before = execution.snapshot();
      const input = request.builder().buildValidated(execution);
      assert.equal(Object.hasOwn(input.body, 'id'), false);
      assert.equal(typeof input.body.password, 'string');
      assert.equal(request.check({ ...input, body: { ...input.body, id: 1 } }), false);
      assert.deepEqual(input, request.create(restoreSession(before, request.identity)));
      const output = response.create();
      assert.equal(Object.hasOwn(output.body, 'password'), false);
      assert.equal(typeof output.body.id, 'number');
      assert.equal(response.serialize(output).status, 200);
      assert.equal(JSON.parse(request.serialize(input).body).name, input.body.name);
    }
  });
  it('retains inherited parameters with operation-level overrides and every request group', () => {
    const source = document(
      {
        parameters: [
          parameter('id', 'path', { type: 'integer', const: 7 }, { required: true }),
          parameter(
            'tags',
            'query',
            { type: 'array', items: { type: 'string' } },
            { required: true }
          ),
          parameter(
            'filter',
            'query',
            { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] },
            { style: 'deepObject', required: true }
          ),
          parameter('X-Trace', 'header', { type: 'string' }, { required: true }),
          parameter('session', 'cookie', { type: 'string' }, { required: true }),
          parameter('skip'),
        ],
        requestBody: {
          ...content({
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
            additionalProperties: false,
          }),
          required: true,
        },
      },
      '3.1.0',
      '/users/{id}'
    );
    source.paths['/users/{id}'].parameters = [
      parameter('id', 'path', { type: 'integer', const: 1 }, { required: true }),
    ];
    const prepared = openApi(source).request(select);
    const input = prepared
      .builder()
      .with({
        query: { tags: ['a', 'b'], filter: { q: 'x y' } },
        headers: { 'x-trace': 'trace' },
        cookies: { session: 'token' },
        body: { name: 'Ada' },
      })
      .buildValidated();
    assert.equal(input.path.id, 7);
    assert.equal(input.query.skip, undefined);
    const request = prepared.serialize(input, { baseUrl: 'https://example.com/api/' });
    assert.deepEqual(request, {
      method: 'POST',
      url: 'https://example.com/api/users/7?tags=a&tags=b&filter%5Bq%5D=x%20y',
      headers: { 'x-trace': 'trace', cookie: 'session=token', 'content-type': 'application/json' },
      body: '{"name":"Ada"}',
    });
    for (const invalid of [
      { ...input, bad: true },
      { ...input, query: { unexpected: 1 } },
      { ...input, headers: [] },
      { ...input, path: {} },
      null,
      { body: new Date() },
    ])
      assert.equal(prepared.check(invalid), false);
    assert.deepEqual(prepared.issues({ ...input, path: {} })[0].path, ['path', 'id']);
    assert.throws(
      () =>
        prepared
          .builder()
          .with({ path: { id: 2 } })
          .buildValidated(),
      BuilderValidationError
    );
    for (const baseUrl of [
      'file:///tmp',
      'https://user:pass@example.com',
      'https://example.com/?q=1',
      'https://example.com/#x',
    ])
      fail(() => prepared.serialize(input, { baseUrl }));
  });
  it('handles optional presence, caller mutation isolation and schema-only factories', () => {
    const options = { profile: 'boundary' };
    const source = document({
      parameters: [parameter('q')],
      requestBody: content({ type: 'string' }),
    });
    const api = openApi(source, options);
    source.paths['/users'].post.parameters = [];
    options.profile = 'minimal';
    const p = api.request(select);
    assert.equal(typeof p.create().query.q, 'string');
    assert.equal(typeof p.create().body, 'string');
    assert.equal(p.check({}), true);
    assert.deepEqual(
      openApi(document({ parameters: [parameter('q')] }))
        .request(select)
        .create(),
      {}
    );
    const random = openApi(document({ parameters: [parameter('q')] }), {
      profile: 'random',
    }).request(select);
    const s = random.session(2);
    const present = new Set(
      Array.from({ length: 30 }, () => Object.hasOwn(random.create(s), 'query'))
    );
    assert.equal(present.size, 2);
    assert.equal(
      typeof fromOpenApiRequest(
        document({ requestBody: { ...content({ type: 'number' }), required: true } }),
        select
      ).buildValidated().body,
      'number'
    );
    assert.equal(
      typeof fromOpenApiResponse(document(), { ...select, status: 200 }).buildValidated().body,
      'string'
    );
  });
  it('supports JSON parameter content, response headers, status classes and default responses', () => {
    const source = document({
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          ...content({
            type: 'object',
            properties: { x: { const: 1 } },
            required: ['x'],
            additionalProperties: false,
          }),
        },
        parameter('Authorization', 'header'),
      ],
      responses: {
        200: {
          ...content({ const: { ok: true } }),
          headers: {
            'X-Id': { required: true, schema: { const: 'abc' } },
            'X-Json': { required: true, ...content({ const: { n: 1 } }) },
            'Content-Type': { schema: { const: 'ignored' } },
          },
        },
        '2XX': content({ const: 'class' }),
        default: { description: 'no body' },
      },
    });
    const api = openApi(source);
    const request = api.request(select);
    assert.equal(request.serialize(request.create()).url, '/users?q=%7B%22x%22%3A1%7D');
    const response = api.response({ ...select, status: 200 });
    assert.deepEqual(response.serialize(response.create()), {
      status: 200,
      headers: { 'x-id': 'abc', 'x-json': '{"n":1}', 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
    assert.equal(api.response({ ...select, status: 201 }).create().body, 'class');
    assert.deepEqual(api.response({ ...select, status: 404 }).serialize({}), {
      status: 404,
      headers: {},
    });
    assert.equal(response.metadata.responseKey, '200');
    assert.deepEqual(api.operations(), [
      { operationId: 'users', path: '/users', method: 'POST', webhook: false },
    ]);
    assert.equal(api.request({ path: '/users', method: 'POST' }).metadata.operationId, 'users');
  });
  it('keeps content selection explicit and invokes only caller-selected codecs', () => {
    const source = document({
      requestBody: {
        required: true,
        content: {
          'application/xml': { schema: { const: '<user/>' } },
          'text/plain': { schema: { const: 'user' } },
        },
      },
      responses: { 200: content({ const: '<user/>' }, 'application/xml') },
    });
    fail(() => openApi(source).request(select));
    const p = openApi(source).request({ ...select, mediaType: 'application/xml' });
    fail(() => p.serialize(p.create()));
    assert.equal(
      p.serialize(p.create(), { codecs: { 'application/xml': { encode: (value) => value } } }).body,
      '<user/>'
    );
    assert.equal(
      openApi(source)
        .request({ ...select, mediaType: 'text/plain' })
        .serialize({ body: 'user' }).body,
      'user'
    );
    fail(() => openApi(source).request({ ...select, mediaType: 'application/json' }));
    const response = openApi(source).response({ ...select, status: 200 });
    assert.equal(
      response.serialize(response.create(), {
        codecs: { 'application/xml': { encode: (value) => value } },
      }).body,
      '<user/>'
    );
    const binary = document({
      parameters: [
        {
          name: 'x',
          in: 'query',
          required: true,
          ...content({ const: 'data' }, 'application/octet-stream'),
        },
      ],
    });
    const q = openApi(binary).request(select);
    fail(() =>
      q.serialize(q.create(), {
        codecs: { 'application/octet-stream': { encode: () => new Uint8Array([1]) } },
      })
    );
  });
  it('preserves webhook and security metadata without running network or security code', () => {
    const source = {
      openapi: '3.2.0',
      security: [{ oauth: ['read'] }],
      webhooks: {
        created: {
          post: {
            operationId: 'created',
            requestBody: { ...content({ const: 1 }), required: true },
            responses: { 204: { description: 'ok' } },
          },
        },
      },
    };
    const api = openApi(source);
    const request = api.request({ webhook: true });
    assert.deepEqual(request.metadata.security, [{ oauth: ['read'] }]);
    assert.equal(request.metadata.webhook, true);
    fail(() => request.serialize(request.create()));
    assert.equal(api.response({ operationId: 'created', status: 204 }).metadata.status, 204);
    assert.equal(
      openApi({
        openapi: '3.2.1',
        paths: { '/': { query: { responses: { 200: {} } } } },
      }).operations()[0].method,
      'QUERY'
    );
  });
  it('fails preparation on malformed/ambiguous operations and incompatible selections', () => {
    for (const source of [
      null,
      {},
      { openapi: '2.0' },
      { openapi: '3.1.0', paths: [] },
      { openapi: '3.1.0', paths: { x: {} } },
      { openapi: '3.1.0', paths: { '/': { post: 1 } } },
      { openapi: '3.1.0', paths: { '/': { query: {} } } },
      { openapi: '3.2.0', paths: { '/': { additionalOperations: {} } } },
    ])
      fail(() => openApi(source));
    const duplicate = document();
    duplicate.paths['/other'] = duplicate.paths['/users'];
    fail(() => openApi(duplicate));
    fail(() => openApi(document({ operationId: '' })));
    fail(() => openApi({ openapi: '3.1.0' }).request({}));
    const many = document();
    many.paths['/other'] = { get: { responses: { 200: {} } } };
    fail(() => openApi(many).request({}));
    for (const status of [99, 600, 200.5])
      fail(() => openApi(document()).response({ ...select, status }));
    fail(() => openApi(document()).response({ ...select, status: 404 }));
    fail(() => openApi(document()).request({ ...select, mediaType: 'application/json' }));
    fail(() =>
      openApi(document({ responses: { 204: {} } })).response({
        ...select,
        status: 204,
        mediaType: 'application/json',
      })
    );
    for (const status of [101, 204, 304])
      fail(() =>
        openApi(document({ responses: { [status]: content({ type: 'string' }) } })).response({
          ...select,
          status,
        })
      );
    const head = {
      openapi: '3.1.0',
      paths: { '/': { head: { responses: { 200: content({ type: 'string' }) } } } },
    };
    fail(() => openApi(head).response({ status: 200 }));
  });
  it('rejects invalid parameter/header contracts rather than guessing', () => {
    const cases = [
      {},
      { parameters: {} },
      { parameters: [parameter('x', 'body')] },
      { parameters: [parameter('x', 'path')] },
      { parameters: [parameter('x'), parameter('x')] },
      { parameters: [{ name: 'x', in: 'query' }] },
      { parameters: [{ ...parameter('x'), ...content({ type: 'string' }) }] },
      { parameters: [parameter('x', 'path', { type: 'string' }, { required: true })] },
    ];
    for (const c of cases.slice(1)) fail(() => openApi(document(c)).request(select));
    fail(() => openApi(document({}, '3.1.0', '/users/{missing}')).request(select));
    const encoded = { content: { 'application/json': { schema: {}, encoding: {} } } };
    fail(() => openApi(document({ requestBody: encoded })).request(select));
    fail(() =>
      openApi(document({ responses: { 200: encoded } })).response({ ...select, status: 200 })
    );
    for (const headers of [
      { X: { schema: {} }, x: { schema: {} } },
      { x: { style: 'form', schema: {} } },
      { x: { schema: {}, ...content({}) } },
      { x: {} },
    ])
      fail(() =>
        openApi(document({ responses: { 200: { headers } } })).response({ ...select, status: 200 })
      );
  });
});

describe('schema projection and offline reference boundaries', () => {
  const schema = (value, version = '3.1.0', options = {}) => {
    const source = document({}, version);
    source.components = { schemas: { Value: value } };
    return openApi(source, options).schema('#/components/schemas/Value');
  };
  it('keeps nullable, exclusive bounds, byte and integer format constraints', () => {
    assert.equal(
      schema({ type: 'number', nullable: true, minimum: 0, exclusiveMinimum: true }, '3.0.4').check(
        null
      ),
      true
    );
    assert.equal(
      schema({ type: 'number', minimum: 0, exclusiveMinimum: true }, '3.0.4').check(0),
      false
    );
    assert.equal(
      schema({ type: 'number', maximum: 10, exclusiveMaximum: false }, '3.0.4').check(10),
      true
    );
    assert.equal(
      schema({ type: 'number', maximum: 10, exclusiveMaximum: true }, '3.0.4').check(10),
      false
    );
    assert.equal(schema({ type: 'integer', format: 'int32' }).check(2147483648), false);
    assert.equal(
      schema({ type: 'integer', format: 'int32', minimum: 4, maximum: 8 }).check(3),
      false
    );
    const bytes = schema({ type: 'string', format: 'byte', pattern: '^QQ' });
    assert.equal(bytes.check('QQ=='), true);
    assert.equal(bytes.check('QQ'), false);
    assert.equal(bytes.check('Qg=='), false);
    assert.equal(
      schema({
        type: 'string',
        format: 'password',
        example: 'safe',
        xml: { name: 'x' },
        externalDocs: { url: 'x' },
        'x-note': 'annotation',
      }).check('x'),
      true
    );
    assert.equal(
      schema({ type: 'object', properties: { forbidden: false }, required: ['forbidden'] }).check(
        {}
      ),
      false
    );
  });
  it('projects compositions, dependencies, tuples and property schemas', () => {
    const complex = {
      type: 'object',
      properties: {
        flag: { const: true },
        tuple: { type: 'array', prefixItems: [{ const: 1 }], items: false },
        names: {
          type: 'object',
          patternProperties: { '^x': { type: 'integer' } },
          additionalProperties: false,
          propertyNames: { minLength: 1 },
        },
      },
      required: ['flag'],
      dependentSchemas: { flag: { properties: { flag: { const: true } } } },
      allOf: [
        {
          if: { required: ['tuple'] },
          then: { required: ['names'] },
          else: { not: { required: ['names'] } },
        },
      ],
      anyOf: [{ required: ['flag'] }, { required: ['names'] }],
      oneOf: [
        { properties: { flag: { const: true } } },
        { properties: { flag: { const: false } } },
      ],
    };
    assert.equal(schema(complex).check({ flag: true }), true);
    assert.equal(
      schema(
        {
          type: 'object',
          properties: { x: { type: 'integer' }, y: { type: 'integer' } },
          dependencies: { x: ['y'], y: { required: ['x'] } },
        },
        '3.0.4'
      ).check({ x: 1 }),
      false
    );
    assert.equal(
      schema({ type: 'array', items: [{ const: 1 }], additionalItems: false }, '3.0.4').check([
        1, 2,
      ]),
      false
    );
    assert.equal(
      schema({ type: 'array', contains: { const: 1 }, minContains: 1, maxContains: 1 }).check([1]),
      true
    );
    assert.equal(schema({ type: 'object', unevaluatedProperties: false }).check({ x: 1 }), false);
    assert.equal(schema({ type: 'array', unevaluatedItems: false }).check([1]), false);
    assert.equal(schema(false).check(1), false);
    assert.equal(schema(true).check(null), true);
  });
  it('resolves local and external pointers, recursive schemas, and version-specific ref siblings', () => {
    const source = document();
    source.components = {
      schemas: {
        Name: { type: 'string', minLength: 2 },
        Alias: { $ref: '#/components/schemas/Name', maxLength: 3 },
        Node: {
          type: 'object',
          properties: { children: { type: 'array', items: { $ref: '#/components/schemas/Node' } } },
          additionalProperties: false,
        },
        External: { $ref: 'other.json#/Item' },
      },
    };
    const api = openApi(source, {
      documentUri: 'https://example.com/api.json',
      documents: { 'https://example.com/other.json': { Item: { type: 'integer', minimum: 3 } } },
    });
    assert.equal(api.schema('#/components/schemas/Alias').check('long'), false);
    assert.equal(api.schema('#/components/schemas/External').check(4), true);
    assert.equal(api.schema('#/components/schemas/Node').check({ children: [{}] }), true);
    source.openapi = '3.0.4';
    assert.equal(
      openApi(source, {
        documents: { 'https://test-builders.invalid/other.json': { Item: { type: 'integer' } } },
      })
        .schema('#/components/schemas/Alias')
        .check('long'),
      true
    );
    const special = document();
    special.components = { schemas: { 'a/b~c': { const: 1 } } };
    assert.equal(openApi(special).schema('#/components/schemas/a~1b~0c').check(1), true);
  });
  it('rejects inaccessible/cyclic document references and unsupported schema semantics', () => {
    const refs = [
      'other.json#/Item',
      '#anchor',
      '#/missing',
      '#/%ZZ',
      '#/bad~9',
      'http://[invalid',
    ];
    for (const $ref of refs) fail(() => schema({ $ref }));
    const source = document();
    source.paths['/users'] = { $ref: '#/paths/~1users' };
    fail(() => openApi(source));
    for (const value of [
      { $id: 'urn:x' },
      { $anchor: 'x' },
      { $dynamicRef: '#x' },
      { $ref: 1 },
      { allOf: {} },
      { exclusiveMinimum: 1 },
      { exclusiveMinimum: true },
      { $schema: 'https://wrong.test/schema' },
    ])
      fail(() => schema(value, value.exclusiveMinimum === undefined ? '3.1.0' : '3.0.4'));
    assert.equal(
      schema({ $schema: 'https://json-schema.org/draft/2020-12/schema', type: 'string' }).check(
        'x'
      ),
      true
    );
    assert.equal(
      schema({ $schema: 'http://json-schema.org/draft-07/schema#', type: 'number' }, '3.0.4').check(
        1
      ),
      true
    );
    for (const options of [
      { documentUri: 'not a url' },
      { documentUri: 'https://example.com/#x' },
      { documents: { 'https://test-builders.invalid/document': {} } },
      { documents: { 'https://other.test/#x': {} } },
      { maxSchemaDepth: 129 },
      { maxSchemaNodes: -1 },
      { maxSchemaNodes: 0 },
      { maxSchemaCharacters: 1 },
    ])
      fail(() => openApi(document(), options));
  });
  it('rejects active/non-JSON inputs before invoking accessors and honors budgets', () => {
    for (const bad of [
      new Date(),
      [undefined],
      NaN,
      Infinity,
      () => 1,
      Symbol('s'),
      { [Symbol('key')]: 1 },
      Object.defineProperty({}, 'hidden', { value: 1 }),
      Object.defineProperty({}, 'field', {
        enumerable: true,
        get() {
          throw new Error('getter executed');
        },
      }),
      Array(2),
      Object.assign([1], { extra: 1 }),
    ])
      fail(() => openApi({ openapi: '3.1.0', extra: bad }));
    const cycle = {};
    cycle.self = cycle;
    fail(() => openApi(cycle));
    fail(() => openApi({ openapi: '3.1.0', nested: { a: { b: {} } } }, { maxSchemaDepth: 2 }));
    const nullPrototype = Object.assign(Object.create(null), document());
    assert.equal(openApi(nullPrototype).operations().length, 1);
    const poisoned = JSON.parse('{"openapi":"3.1.0","__proto__":{"polluted":true},"paths":{}}');
    openApi(poisoned);
    assert.equal({}.polluted, undefined);
  });
});

/** The shape a NestJS Swagger module builds in memory: undefined fields included. */
function nestDocument() {
  return {
    openapi: '3.0.0',
    info: { title: 'Deals', version: '1.0', description: undefined, contact: {} },
    servers: [{ url: 'http://localhost:3000', description: undefined }],
    paths: {
      '/deals': {
        post: {
          operationId: 'DealsController_create',
          summary: undefined,
          parameters: [
            { name: 'dryRun', required: false, in: 'query', schema: { type: 'boolean' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/CreateDealCommand' } },
            },
          },
          responses: { 201: content({ $ref: '#/components/schemas/DealDto' }) },
        },
      },
    },
    components: {
      securitySchemes: undefined,
      schemas: {
        FacadeDto: {
          type: 'object',
          properties: { street: { type: 'string', example: 'Main street 1' } },
          required: ['street'],
        },
        CreateDealCommand: {
          type: 'object',
          properties: {
            title: { type: 'string', description: undefined },
            amount: { type: 'number', minimum: 0 },
            note: { type: 'string', nullable: true },
            facade: { nullable: true, allOf: [{ $ref: '#/components/schemas/FacadeDto' }] },
          },
          required: ['title', 'amount', 'facade'],
        },
        DealDto: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid', readOnly: true },
            title: { type: 'string' },
            password: { type: 'string', writeOnly: true },
          },
          required: ['id', 'title', 'password'],
        },
      },
    },
  };
}

describe('framework-built documents and component schemas', () => {
  it('treats undefined document properties as absent and names other non-JSON values', () => {
    const live = openApi(nestDocument());
    const serialized = openApi(JSON.parse(JSON.stringify(nestDocument())));
    assert.deepEqual(live.operations(), serialized.operations());
    const select = { operationId: 'DealsController_create' };
    assert.deepEqual(live.request(select).identity, serialized.request(select).identity);
    assert.deepEqual(
      live.request(select).builder().buildList(3),
      serialized.request(select).builder().buildList(3)
    );
    const request = live.request(select);
    assert.equal(request.check({ body: { title: 'Deal', amount: 1, facade: null } }), true);
    assert.equal(request.check({ body: { title: 'Deal', amount: 1, facade: undefined } }), false);
    class Contact {}
    const cycle = {};
    cycle.again = { cycle };
    for (const [value, message] of [
      [[1, undefined], 'Expected JSON data, found undefined at /x/1'],
      [() => 1, 'Expected JSON data, found a function at /x'],
      [Infinity, 'Expected JSON data, found Infinity at /x'],
      [new Date(0), 'Expected a plain JSON object, found an instance of Date at /x'],
      [new Contact(), 'Expected a plain JSON object, found an instance of Contact at /x'],
      [Object.create(Object.create(null)), 'found an object that is not a plain record at /x'],
      [cycle, 'found a reference back to an enclosing value at /x/again/cycle'],
    ])
      assert.throws(
        () => openApi({ ...nestDocument(), x: value }),
        (error) => error instanceof ApiContractError && error.message.endsWith(message)
      );
  });
  it('projects components with direction, nullable references and component definition names', () => {
    const components = openApiComponents(nestDocument());
    assert.equal(components.dialect, 'draft-07');
    assert.deepEqual(components.names(), ['FacadeDto', 'CreateDealCommand', 'DealDto']);
    const command = components.schema('CreateDealCommand', 'request').schema;
    assert.deepEqual(command.properties.facade, {
      anyOf: [{ allOf: [{ $ref: '#/definitions/FacadeDto' }] }, { type: 'null' }],
    });
    assert.deepEqual(Object.keys(command.definitions), ['FacadeDto']);
    assert.deepEqual(components.schema('DealDto').schema.required, ['id', 'title']);
    assert.deepEqual(components.schema('DealDto', 'request').schema.required, [
      'title',
      'password',
    ]);
    fail(() => components.schema('Missing'), /Unknown component schema/);
    fail(() => components.schema('DealDto', 'both'), /direction/);
    // Each projection checks data with the same validator as operation fixtures.
    const create = components.schema('CreateDealCommand', 'request');
    assert.equal(create.check({ title: 'Deal', amount: 1, facade: null }), true);
    assert.deepEqual(create.issues({ title: 'Deal', amount: 1, facade: null }), []);
    assert.deepEqual(
      create.issues({ title: 'Deal', amount: -1, facade: null }).map((issue) => issue.keyword),
      ['minimum']
    );
    assert.equal(
      components.schema('DealDto').check({ id: 'x', title: 'Deal', password: 'secret' }),
      false
    );
    assert.deepEqual(openApiComponents({ openapi: '3.2.0' }).names(), []);
    assert.equal(openApiComponents({ openapi: '3.1.0', components: {} }).dialect, 'draft-2020-12');
    fail(() => openApiComponents({ openapi: '2.0' }));
  });
  it('fills optional parameters and fields with small readable values in the realistic profile', () => {
    const request = openApi(nestDocument(), { profile: 'realistic' }).request({
      operationId: 'DealsController_create',
    });
    for (const fixture of request.builder().buildValidatedList(4)) {
      assert.equal(typeof fixture.query.dryRun, 'boolean');
      assert.deepEqual(Object.keys(fixture.body).sort(), ['amount', 'facade', 'note', 'title']);
      assert.deepEqual(fixture.body.facade, { street: 'Main street 1' });
      assert.ok(fixture.body.amount >= 0 && fixture.body.amount <= 100);
      assert.match(fixture.body.title, /^[A-Z][a-z]+( [a-z]+)*$/);
    }
  });
});
