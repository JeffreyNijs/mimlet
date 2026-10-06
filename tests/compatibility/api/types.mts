import {
  fromOpenApiRequest,
  fromOpenApiResponse,
  openApi,
  serializeParameter,
  type HttpRequestFixture,
} from '@mimlet/api';
import type { SchemaBuilder, GenerationSession } from '@mimlet/core';
declare const document: unknown;
declare function expectType<T>(value: T): void;
const request = fromOpenApiRequest(document, { operationId: 'users' });
expectType<SchemaBuilder<HttpRequestFixture, HttpRequestFixture, [session?: GenerationSession]>>(
  request
);
expectType<HttpRequestFixture>(request.with({ query: { id: 1 } }).buildValidated());
// @ts-expect-error Runtime-loaded schemas cannot invent a User application type.
const user: { id: string } = request.build().body;
// @ts-expect-error The HTTP envelope has known groups.
request.with({ madeUp: true });
// @ts-expect-error Select a concrete response status.
fromOpenApiResponse(document, { operationId: 'users' });
// @ts-expect-error Async fluent transitions cannot advertise synchronous validation.
request.transformAsync(async (value) => value).buildValidated();
expectType<string>(openApi(document).request({}).serialize({}).url);
// @ts-expect-error Parameter locations are a closed protocol-specific set.
serializeParameter({ name: 'id', in: 'body' }, 1);
void user;

import { asyncApi, fromAsyncApiMessage, type MessageFixture } from '@mimlet/api';
const messages = fromAsyncApiMessage(document, { action: 'receive' });
expectType<MessageFixture>(messages.buildValidated());
expectType<string>(asyncApi(document).message().serialize({}).address);
// @ts-expect-error Runtime message definitions cannot infer application data.
const payload: { id: string } = messages.build().payload;
// @ts-expect-error Message envelopes are not HTTP request envelopes.
messages.with({ query: {} });
// @ts-expect-error Actions use the application perspective.
asyncApi(document).message({ action: 'publish' });
void payload;
// Names, callbacks that always receive a session, and tuple lists.
const [firstRequest, secondRequest] = fromOpenApiRequest(
  document,
  { operationId: 'users' },
  { name: 'users' }
)
  .withFactory((run) => ({ query: { page: run.integer(1, 9) } }))
  .buildList(2);
expectType<HttpRequestFixture>(firstRequest);
expectType<HttpRequestFixture>(secondRequest);
fromAsyncApiMessage(document, { action: 'receive' }, { name: 'events' }).transform((value, run) =>
  run.boolean() ? value : value
);
