import { http } from 'msw';
import { jsonResponseResolver } from '@mimlet/consumers';
import { orders } from './msw-orders.js';

export const api = 'https://shop.example.test/api';

// Every request builds a new order and gets its own JSON response.
// Pass a builder variant to change what the endpoint returns.
export function orderHandler(variant = orders) {
  return http.get<{ id: string }>(`${api}/orders/:id`, ({ request, params }) =>
    jsonResponseResolver(() => variant.buildValidated(params.id))(request)
  );
}

export const handlers = [orderHandler()];
