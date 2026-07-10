// Server-side only backend base URLs. Never prefix these with NEXT_PUBLIC_ —
// they must not be inlined into client bundles, and browsers cannot resolve
// the Docker container hostnames these point to in production anyway.
export const ORDER_API_URL = process.env.ORDER_API_URL || "http://localhost:3000";
export const ANALYTICS_API_URL = process.env.ANALYTICS_API_URL || "http://localhost:3003";
export const FRAUD_API_URL = process.env.FRAUD_API_URL || "http://localhost:8005";
