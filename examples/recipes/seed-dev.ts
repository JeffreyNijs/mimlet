// A local development seed: pass the database file as the first argument.
// Running it again with the same seed leaves the same rows.
import { shopSession } from './seed-shop.js';
import { openShopDatabase, seedShop } from './seed-sqlite.js';

const db = openShopDatabase(process.argv[2] ?? 'dev.sqlite');
const shops = await seedShop(db, shopSession('local-dev'), 20);
db.close();
console.log(`Seeded ${shops.length} customers with orders`);
