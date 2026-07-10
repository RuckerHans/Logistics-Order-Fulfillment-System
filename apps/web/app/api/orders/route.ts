import { NextRequest, NextResponse } from "next/server";
import { ORDER_API_URL } from "@/lib/env";

// Thin proxy so the client-side order form can submit without needing CORS
// on the order-api: the browser calls this same-origin route, and this
// Route Handler makes the real request server-side.
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const res = await fetch(`${ORDER_API_URL}/orders`, {
      method: "POST",
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
