import { z } from 'zod';

// Validates the wire format directly (snake_case), since that's what actually
// crosses the boundary — not the camelCase in-app TypeScript interface.
// project-plan.md Section 19.3

export const OrderStatusEnum = z.enum([
  'PLACED', 'PAYMENT_CONFIRMED', 'PICKING', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED',
]);

export const OrderItemSchema = z.object({
  sku: z.string(),
  qty: z.number().int().positive(),
  unit_price: z.number().nonnegative(),
});

export const OrderMetadataSchema = z.object({
  branch_id: z.string(),
});

export const OrderStatusChangedEventSchema = z.object({
  schema_version: z.number().int(),
  trace_id: z.string(),
  order_id: z.string(),
  customer_id: z.string(),
  previous_status: OrderStatusEnum.nullable(),
  new_status: OrderStatusEnum,
  timestamp: z.string(),
  delivery_address: z.string(),
  order_value: z.number().nonnegative(),
  items: z.array(OrderItemSchema),
  metadata: OrderMetadataSchema,
});
