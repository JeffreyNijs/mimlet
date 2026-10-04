// Compiled with the DOM library: serialized bytes are valid Fetch bodies (BodyInit).
import { asyncApi, encodeContent, openApi } from '@mimlet/api';
declare const document: unknown;
declare function expectType<T>(value: T): void;
const api = openApi(document);
const request = api.request({ operationId: 'users' }).serialize({});
const response = api.response({ operationId: 'users', status: 200 }).serialize({});
expectType<string | Uint8Array<ArrayBuffer> | undefined>(request.body);
new Request(request.url, {
  method: request.method,
  headers: request.headers,
  body: request.body ?? null,
});
new Response(response.body ?? null, { status: response.status, headers: response.headers });
new Response(asyncApi(document).message().serialize({}).payload ?? null);
new Blob([encodeContent('application/octet-stream', {}, {})]);
