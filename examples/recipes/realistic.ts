import { z } from 'zod';
import { fromZod } from '@mimlet/zod';

const Order = z.object({
  reference: z.string(),
  total: z.number().nonnegative(),
  coupon: z.string().nullable().optional(),
  lines: z.array(
    z.object({
      sku: z.string().max(12),
      quantity: z.number().int().positive(),
      note: z.string().optional(),
    })
  ),
});

// The default profile leaves optional fields out and samples the whole safe-integer range.
export const minimal = fromZod(Order).build();
// realistic fills optional and nullable fields with readable words and small numbers.
export const realistic = fromZod(Order, { profile: 'realistic' }).build();
