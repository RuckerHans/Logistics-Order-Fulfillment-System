import { createApi, fetchBaseQuery, type FetchBaseQueryError } from "@reduxjs/toolkit/query/react";
import type { Order, OrderStatus, ApiErrorBody } from "@/lib/types";

interface CreateOrderPayload {
  customerId: string;
  deliveryAddress: string;
  branchId: string;
  items: { sku: string; qty: number; unitPrice: number }[];
}

interface TransitionOrderPayload {
  id: string;
  newStatus: OrderStatus;
}

// Talks only to this app's own same-origin Route Handler proxies
// (/api/orders, /api/orders/:id/transition) — the browser cannot resolve
// backend container hostnames, so ORDER_API_URL is never used client-side.
export const api = createApi({
  reducerPath: "api",
  baseQuery: fetchBaseQuery({ baseUrl: "/api" }),
  endpoints: (builder) => ({
    createOrder: builder.mutation<Order, CreateOrderPayload>({
      query: (body) => ({ url: "/orders", method: "POST", body }),
    }),
    transitionOrder: builder.mutation<Order, TransitionOrderPayload>({
      query: ({ id, newStatus }) => ({
        url: `/orders/${encodeURIComponent(id)}/transition`,
        method: "PATCH",
        body: { newStatus },
      }),
    }),
  }),
});

export const { useCreateOrderMutation, useTransitionOrderMutation } = api;

// The Route Handler proxies always respond with JSON matching ApiErrorBody
// (they catch their own upstream fetch failures and return a 502 body), so
// RTK Query's parsed `data` is the right place to look first.
export function rtkErrorMessages(error: unknown): string[] {
  const fbqError = error as FetchBaseQueryError | undefined;
  const data = fbqError?.data as ApiErrorBody | undefined;
  if (data?.message) {
    return Array.isArray(data.message) ? data.message : [data.message];
  }
  if (typeof fbqError?.status === "number") {
    return [`Request failed with status ${fbqError.status}.`];
  }
  return ["Could not reach the order service. Please try again."];
}
