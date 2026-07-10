"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface ItemRow {
  sku: string;
  qty: string;
  unitPrice: string;
}

function emptyRow(): ItemRow {
  return { sku: "", qty: "1", unitPrice: "" };
}

export function OrderForm() {
  const router = useRouter();
  const [customerId, setCustomerId] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [branchId, setBranchId] = useState("");
  const [items, setItems] = useState<ItemRow[]>([emptyRow()]);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function updateItem(index: number, field: keyof ItemRow, value: string) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  }

  function addItem() {
    setItems((prev) => [...prev, emptyRow()]);
  }

  function removeItem(index: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrors([]);
    setSubmitting(true);
    try {
      const payload = {
        customerId: customerId.trim(),
        deliveryAddress: deliveryAddress.trim(),
        branchId: branchId.trim(),
        items: items.map((row) => ({
          sku: row.sku.trim(),
          qty: Number(row.qty),
          unitPrice: Number(row.unitPrice),
        })),
      };

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        const message: string[] = Array.isArray(data?.message)
          ? data.message
          : [data?.message ?? `Request failed with status ${res.status}`];
        setErrors(message);
        setSubmitting(false);
        return;
      }

      router.push(`/orders/${data.id}`);
    } catch {
      setErrors(["Could not reach the order service. Please try again."]);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ul className="list-inside list-disc space-y-0.5">
            {errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700">Customer ID</label>
        <input
          required
          value={customerId}
          onChange={(e) => setCustomerId(e.target.value)}
          placeholder="uuid"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-gray-500 focus:outline-none"
        />
        <p className="mt-1 text-xs text-gray-400">Must be an existing customer UUID from elsewhere in the system.</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Delivery Address</label>
        <input
          required
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Branch ID</label>
        <input
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          placeholder="branch_01"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Items</label>
          <button type="button" onClick={addItem} className="text-sm font-medium text-gray-700 hover:text-gray-900">
            + Add item
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {items.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input
                required
                value={row.sku}
                onChange={(e) => updateItem(i, "sku", e.target.value)}
                placeholder="SKU"
                className="w-1/3 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <input
                required
                type="number"
                min="1"
                step="1"
                value={row.qty}
                onChange={(e) => updateItem(i, "qty", e.target.value)}
                placeholder="Qty"
                className="w-24 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={row.unitPrice}
                onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                placeholder="Unit price"
                className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => removeItem(i)}
                disabled={items.length === 1}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {submitting ? "Placing order…" : "Place Order"}
      </button>
    </form>
  );
}
