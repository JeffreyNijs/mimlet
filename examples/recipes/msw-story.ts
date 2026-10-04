import { fixtureLoader } from '@mimlet/consumers';
import { handlers } from './msw-handlers.js';
import { orders } from './msw-orders.js';

// A Storybook CSF file, without the component import and render functions.
// msw-storybook-addon serves parameters.msw.handlers to components that fetch.
export default {
  title: 'Orders/OrderPage',
  parameters: { msw: { handlers } },
};

// A component that fetches order-1 gets it from the handlers above.
export const Fetched = { args: { orderId: 'order-1' } };

// A component that takes the order as a prop gets a fresh copy from a loader.
export const Loaded = {
  loaders: [fixtureLoader('order', () => orders.buildValidated('order-1'))],
};
