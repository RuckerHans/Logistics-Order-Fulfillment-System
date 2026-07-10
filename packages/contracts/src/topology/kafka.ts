// Kafka topology registry — project-plan.md Section 5.1, 5.2.
// Consumer group IDs must match Section 5.2's registry EXACTLY. If two
// services accidentally share a group ID, Kafka treats them as one logical
// consumer splitting partitions between them — each silently sees only a
// subset of events. Every consumer's setup code must reference these
// constants, never a restated string.

export const ORDER_STATUS_CHANGED_TOPIC = 'order.status_changed';

export const CONSUMER_GROUPS = {
  analyticsService: 'analytics-service',
  fraudService: 'fraud-service', // mirrored in fraud-service's Python config
  auditService: 'audit-service',
  inventoryService: 'inventory-service',
} as const;
