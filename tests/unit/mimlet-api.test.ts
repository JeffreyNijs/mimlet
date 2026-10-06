import { expect, it } from 'vitest';
import { openApi, openApiComponents } from '../../packages/api/src/index.js';
it('retains HTTP operation direction and response selection', () => {
  const api = openApi({
    openapi: '3.1.0',
    paths: {
      '/users': {
        post: {
          operationId: 'createUser',
          responses: {
            '201': {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { id: { type: 'integer' } },
                    required: ['id'],
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  const response = api.response({ operationId: 'createUser', status: 201 });
  expect(response.builder().buildValidated()).toHaveProperty('body.id');
  expect(() => api.response({ operationId: 'createUser', status: 404 })).toThrow();
});

it('shares one default session across a session-less envelope list', () => {
  const api = openApi(
    {
      openapi: '3.1.0',
      paths: {
        '/users': {
          get: {
            operationId: 'getUser',
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: { id: { type: 'integer', minimum: 1, maximum: 1_000_000 } },
                      required: ['id'],
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    { profile: 'random' }
  );
  const response = api.response({ operationId: 'getUser', status: 200 });
  const builder = response.builder();
  const list = builder.buildList(4);
  expect(new Set(list.map((value) => JSON.stringify(value))).size).toBe(4);
  expect(list).toEqual(builder.buildList(4, response.session()));
  expect(builder.build()).toEqual(list[0]);
});

it('honours readOnly and writeOnly beside $ref in OpenAPI 3.1 only', () => {
  const document = (openapi: string) => ({
    openapi,
    info: { title: 'Things', version: '1' },
    paths: {
      '/things': {
        post: {
          operationId: 'create',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['id', 'name', 'secret'],
                  additionalProperties: false,
                  properties: {
                    id: { $ref: '#/components/schemas/Id', readOnly: true },
                    name: { type: 'string' },
                    secret: { $ref: '#/components/schemas/Id', writeOnly: true },
                  },
                },
              },
            },
          },
          responses: { '204': { description: 'Created' } },
        },
      },
    },
    components: { schemas: { Id: { type: 'string', pattern: '^T-[0-9]{3}$' } } },
  });
  const request = openApi(document('3.1.0')).request({ operationId: 'create' });
  expect(request.check({ body: { name: 'Crate', secret: 'T-001' } })).toBe(true);
  const generated = request.create(request.session(1)).body as Record<string, unknown>;
  expect('id' in generated).toBe(false);
  expect('secret' in generated).toBe(true);
  // OpenAPI 3.0 ignores $ref siblings, so the referenced schema alone decides.
  const legacy = openApi(document('3.0.3')).request({ operationId: 'create' });
  expect(legacy.check({ body: { name: 'Crate', secret: 'T-001' } })).toBe(false);
});

/** The shape a NestJS Swagger module builds in memory: undefined fields included. */
function nestDocument() {
  return {
    openapi: '3.0.0',
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
          responses: {
            '201': {
              description: '',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/DealDto' } },
              },
            },
          },
          tags: ['deals'],
        },
      },
    },
    info: { title: 'Deals', description: '', version: '1.0', contact: {} },
    tags: [],
    servers: [{ url: 'http://localhost:3000', description: undefined, variables: undefined }],
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
            facade: { $ref: '#/components/schemas/FacadeDto' },
          },
          required: ['id', 'title', 'password'],
        },
      },
    },
  };
}

it('reads an in-memory document with undefined properties like its JSON form', () => {
  const document = nestDocument();
  const live = openApi(document);
  const serialized = openApi(JSON.parse(JSON.stringify(document)));
  expect(live.operations()).toEqual(serialized.operations());
  for (const api of [live, serialized]) {
    const request = api.request({ operationId: 'DealsController_create' });
    const body = request.builder().buildValidated().body as Record<string, unknown>;
    expect(request.check({ body: { ...body, facade: null } })).toBe(true);
  }
  const selector = { operationId: 'DealsController_create' };
  expect(live.request(selector).identity).toEqual(serialized.request(selector).identity);
  expect(live.request(selector).builder().buildList(3)).toEqual(
    serialized.request(selector).builder().buildList(3)
  );
  // Fixture values keep rejecting undefined instead of dropping it silently.
  expect(live.request(selector).check({ body: { title: 'x', amount: 1, facade: undefined } })).toBe(
    false
  );
});

it('names the location and kind of a value that is not JSON', () => {
  const withValue = (value: unknown) => {
    const document = nestDocument() as Record<string, unknown>;
    (document.info as Record<string, unknown>)['x-value'] = value;
    return document;
  };
  class Contact {
    name = 'Ada';
  }
  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const accessor = Object.defineProperty({}, 'name', { get: () => 'Ada', enumerable: true });
  const cases: Array<readonly [unknown, string]> = [
    [() => 1, 'Expected JSON data, found a function at /info/x-value'],
    [Symbol('x'), 'Expected JSON data, found a symbol at /info/x-value'],
    [1n, 'Expected JSON data, found a bigint at /info/x-value'],
    [Number.NaN, 'Expected JSON data, found NaN at /info/x-value'],
    [-Infinity, 'Expected JSON data, found -Infinity at /info/x-value'],
    [[1, undefined], 'Expected JSON data, found undefined at /info/x-value/1'],
    [new Date(0), 'Expected a plain JSON object, found an instance of Date at /info/x-value'],
    [new Map(), 'Expected a plain JSON object, found an instance of Map at /info/x-value'],
    [new Contact(), 'Expected a plain JSON object, found an instance of Contact at /info/x-value'],
    [
      cyclic,
      'Expected acyclic JSON data, found a reference back to an enclosing value at /info/x-value/self',
    ],
    [
      accessor,
      'JSON data must not contain accessors or non-enumerable properties at /info/x-value/name',
    ],
    [{ [Symbol('key')]: 1 }, 'JSON data must not contain symbol keys at /info/x-value'],
  ];
  for (const [value, message] of cases) {
    expect(() => openApi(withValue(value))).toThrow(message);
  }
  expect(() => openApi(withValue({ a: Object.assign(new Array(3), { 0: 1, 2: 3 }) }))).toThrow(
    'Sparse arrays are not JSON data at /info/x-value/a'
  );
});

it('projects named component schemas for each direction', () => {
  const components = openApiComponents(nestDocument());
  expect(components.openapi).toBe('3.0.0');
  expect(components.dialect).toBe('draft-07');
  expect(components.names()).toEqual(['FacadeDto', 'CreateDealCommand', 'DealDto']);
  const command = components.schema('CreateDealCommand', 'request');
  expect(command.dialect).toBe('draft-07');
  expect(command.schema).toEqual({
    type: 'object',
    properties: {
      title: { type: 'string' },
      amount: { type: 'number', minimum: 0 },
      note: { type: ['string', 'null'] },
      facade: { anyOf: [{ allOf: [{ $ref: '#/definitions/FacadeDto' }] }, { type: 'null' }] },
    },
    required: ['title', 'amount', 'facade'],
    definitions: {
      FacadeDto: {
        type: 'object',
        properties: { street: { type: 'string', examples: ['Main street 1'] } },
        required: ['street'],
      },
    },
  });
  const response = components.schema('DealDto') as { schema: Record<string, unknown> };
  expect(response.schema.required).toEqual(['id', 'title']);
  expect((response.schema.properties as Record<string, unknown>).password).toBe(false);
  const request = components.schema('DealDto', 'request') as { schema: Record<string, unknown> };
  expect(request.schema.required).toEqual(['title', 'password']);
  expect((request.schema.properties as Record<string, unknown>).id).toBe(false);
  expect(() => components.schema('Missing')).toThrow('Unknown component schema');
  expect(() => components.schema('DealDto', 'message' as never)).toThrow('direction');
  expect(openApiComponents({ openapi: '3.1.0' }).names()).toEqual([]);
  expect(openApiComponents({ openapi: '3.1.0', components: {} }).names()).toEqual([]);
  expect(() => openApiComponents({ swagger: '2.0' })).toThrow('Expected OpenAPI 3.0, 3.1 or 3.2');
});

it('names OpenAPI 3.1 definitions after their components and keeps reference siblings', () => {
  const components = openApiComponents({
    openapi: '3.1.0',
    components: {
      schemas: {
        Node: {
          type: 'object',
          properties: {
            other: { $ref: '#/components/schemas/Odd%20Name' },
            tag: { $ref: '#/components/schemas/reference0' },
            id: { $ref: '#/components/schemas/Id', readOnly: true },
            parent: { anyOf: [{ $ref: '#/components/schemas/Node' }, { type: 'null' }] },
          },
        },
        Id: { type: 'string' },
        reference0: { type: 'integer' },
        'Odd Name': { type: 'boolean' },
      },
    },
  });
  expect(components.dialect).toBe('draft-2020-12');
  const { schema } = components.schema('Node') as { schema: Record<string, unknown> };
  // A component name that is not a plain key falls back to a numbered name; clashes get a suffix.
  expect(schema.properties).toEqual({
    other: { $ref: '#/$defs/reference0' },
    tag: { $ref: '#/$defs/reference0_2' },
    id: { $ref: '#/$defs/Id', readOnly: true },
    parent: { anyOf: [{ $ref: '#/$defs/Node' }, { type: 'null' }] },
  });
  expect(Object.keys(schema.$defs as object)).toEqual(['reference0', 'reference0_2', 'Id', 'Node']);
  const request = components.schema('Node', 'request') as { schema: Record<string, unknown> };
  expect((request.schema.properties as Record<string, unknown>).id).toBe(false);
});

it('fills optional parameters and body fields in the realistic profile', () => {
  const api = openApi(nestDocument(), { profile: 'realistic' });
  const request = api.request({ operationId: 'DealsController_create' });
  const fixture = request.builder().buildValidated() as {
    query: { dryRun: boolean };
    body: Record<string, unknown>;
  };
  expect(typeof fixture.query.dryRun).toBe('boolean');
  expect(Object.keys(fixture.body).sort()).toEqual(['amount', 'facade', 'note', 'title']);
  expect(fixture.body.facade).toEqual({ street: 'Main street 1' });
  expect(fixture.body.amount).toBeLessThanOrEqual(100);
  expect(
    openApi(nestDocument()).request({ operationId: 'DealsController_create' }).create()
  ).not.toHaveProperty('query');
});

it('serializes bodies that native Fetch accepts, copying shared memory', async () => {
  const shared = new Uint8Array(new SharedArrayBuffer(2));
  shared.set([1, 2]);
  const codecs = { 'application/octet-stream': { encode: () => shared } };
  const api = openApi({
    openapi: '3.1.0',
    paths: {
      '/files': {
        put: {
          operationId: 'upload',
          requestBody: { required: true, content: { 'application/octet-stream': {} } },
          responses: { '200': { content: { 'application/octet-stream': {} } } },
        },
      },
    },
  });
  const request = api
    .request({ operationId: 'upload' })
    .serialize({ body: 'x' }, { baseUrl: 'https://example.com', codecs });
  const response = api
    .response({ operationId: 'upload', status: 200 })
    .serialize({ body: 'x' }, { codecs });
  shared.set([3, 4]);
  // Type-checked with lib.dom: serialized bodies are BodyInit values.
  const fetched = new Request(request.url, { method: request.method, body: request.body ?? null });
  const native = new Response(response.body ?? null, { status: response.status });
  expect([...new Uint8Array(await fetched.arrayBuffer())]).toEqual([1, 2]);
  expect([...new Uint8Array(await native.arrayBuffer())]).toEqual([1, 2]);
});
