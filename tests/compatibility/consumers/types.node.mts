// Compiled with lib ES2022 and @types/node only: no DOM declarations are available.
import { jsonResponseResolver, type JsonResponseOptions } from '@mimlet/consumers';
declare function expectType<T>(value: T): void;
const response = jsonResponseResolver((request) => ({ method: request.method }), {
  headers: { 'x-fixture': 'true' },
});
expectType<Promise<Response>>(response(new Request('https://example.invalid')));
const fromPairs: JsonResponseOptions = { headers: [['x-fixture', 'true']] };
const fromHeaders: JsonResponseOptions = { headers: new Headers({ 'x-fixture': 'true' }) };
// @ts-expect-error Header values are strings, not numbers.
const wrongValue: JsonResponseOptions = { headers: { 'x-fixture': 1 } };
// @ts-expect-error An omitted header option is not an explicit undefined.
const explicitUndefined: JsonResponseOptions = { headers: undefined };
void [fromPairs, fromHeaders, wrongValue, explicitUndefined];
