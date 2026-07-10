import "server-only";
import { ORDER_API_URL, ANALYTICS_API_URL, FRAUD_API_URL } from "./env";
import type {
  Order,
  PaginatedOrders,
  AnalyticsSummary,
  OrdersPerHourPoint,
  TimeInStatusPoint,
  FraudFlag,
  OrderStatus,
  ApiErrorBody,
} from "./types";

// Thin server-side fetch helpers against the backend services. These run
// only in Server Components / Route Handlers (never in the browser), which
// is why plain container-hostname URLs and no CORS handling are fine here.

export class ApiError extends Error {
  status: number;
  body?: ApiErrorBody;
  constructor(message: string, status: number, body?: ApiErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = await res.json();
    } catch {
      // response wasn't JSON — leave body undefined
    }
    const message =
      body && Array.isArray(body.message)
        ? body.message.join(", ")
        : body && typeof body.message === "string"
          ? body.message
          : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, body);
  }
  return res.json() as Promise<T>;
}

// --- Order API ---

export async function fetchOrders(page = 1, limit = 20): Promise<PaginatedOrders> {
  const res = await fetch(`${ORDER_API_URL}/orders?page=${page}&limit=${limit}`, {
    cache: "no-store",
  });
  return jsonOrThrow<PaginatedOrders>(res);
}

export async function fetchOrder(id: string): Promise<Order | null> {
  const res = await fetch(`${ORDER_API_URL}/orders/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  return jsonOrThrow<Order>(res);
}

export async function transitionOrder(id: string, newStatus: OrderStatus): Promise<Order> {
  const res = await fetch(`${ORDER_API_URL}/orders/${encodeURIComponent(id)}/transition`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ newStatus }),
    cache: "no-store",
  });
  return jsonOrThrow<Order>(res);
}

// --- Analytics Service ---

export async function fetchSummary(): Promise<AnalyticsSummary> {
  const res = await fetch(`${ANALYTICS_API_URL}/analytics/summary`, { cache: "no-store" });
  return jsonOrThrow<AnalyticsSummary>(res);
}

export async function fetchOrdersPerHour(hours = 24): Promise<OrdersPerHourPoint[]> {
  const res = await fetch(`${ANALYTICS_API_URL}/analytics/orders-per-hour?hours=${hours}`, {
    cache: "no-store",
  });
  return jsonOrThrow<OrdersPerHourPoint[]>(res);
}

export async function fetchTimeInStatus(): Promise<TimeInStatusPoint[]> {
  const res = await fetch(`${ANALYTICS_API_URL}/analytics/time-in-status`, {
    cache: "no-store",
  });
  return jsonOrThrow<TimeInStatusPoint[]>(res);
}

// --- Fraud Service ---

export async function fetchFlags(): Promise<FraudFlag[]> {
  const res = await fetch(`${FRAUD_API_URL}/flags`, { cache: "no-store" });
  return jsonOrThrow<FraudFlag[]>(res);
}

export async function fetchFlagsByOrder(orderId: string): Promise<FraudFlag[]> {
  const res = await fetch(`${FRAUD_API_URL}/flags/${encodeURIComponent(orderId)}`, {
    cache: "no-store",
  });
  if (res.status === 404) return [];
  return jsonOrThrow<FraudFlag[]>(res);
}
