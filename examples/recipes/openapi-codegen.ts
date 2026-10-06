import { emitOpenApiBuilders } from '@mimlet/codegen';

// An OpenAPI 3.0 document as a NestJS Swagger module returns it, undefined fields included.
// From a file, use the "openapi" entry of a `mimlet generate` configuration instead.
const document = {
  openapi: '3.0.0',
  info: { title: 'Deals', version: '1.0', description: undefined },
  paths: {},
  components: {
    schemas: {
      CreateDealCommand: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', readOnly: true },
          title: { type: 'string', example: 'Office renewal' },
          amount: { type: 'number', minimum: 0 },
          facade: { nullable: true, allOf: [{ $ref: '#/components/schemas/Facade' }] },
        },
        required: ['id', 'title', 'amount', 'facade'],
      },
      Facade: { type: 'object', properties: { street: { type: 'string' } } },
    },
  },
};

export const files = await emitOpenApiBuilders(document, {
  schemas: ['CreateDealCommand'],
  direction: 'request', // a request leaves the read-only id out
  options: { profile: 'realistic' },
  closedObjects: true, // NestJS never writes additionalProperties: type objects without an index signature
});
// files[0] is CreateDealCommandBuilder.ts with withTitle(), withAmount() and withFacade().
