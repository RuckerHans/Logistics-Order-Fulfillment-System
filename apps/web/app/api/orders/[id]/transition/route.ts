import { NextRequest, NextResponse } from "next/server";
import { ORDER_API_URL } from "@/lib/env";

// Thin proxy so the client-side transition buttons can call same-origin,
// avoiding a browser -> order-api direct call (which would need CORS).
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const res = await fetch(`${ORDER_API_URL}/orders/${encodeURIComponent(id)}/transition`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json().catch(() => null);
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json({ message: "Could not reach the order service." }, { status: 502 });
  }
}
