"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { useCreateOrderMutation, rtkErrorMessages } from "@/store/api";
import {
  customerIdSet,
  deliveryAddressSet,
  branchIdSet,
  itemAdded,
  itemRemoved,
  itemUpdated,
  validationErrorsSet,
  orderFormReset,
  type OrderFormItem,
} from "@/store/slices/orderFormSlice";
import { toastAdded } from "@/store/slices/uiSlice";

export function OrderForm() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { customerId, deliveryAddress, branchId, items, validationErrors } = useAppSelector(
    (state) => state.orderForm,
  );
  const [createOrder, { isLoading }] = useCreateOrderMutation();

  function updateItem(index: number, field: keyof OrderFormItem, value: string) {
    dispatch(itemUpdated({ index, field, value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    dispatch(validationErrorsSet([]));

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

    try {
      const order = await createOrder(payload).unwrap();
      dispatch(toastAdded({ type: "success", message: "Order placed successfully." }));
      dispatch(orderFormReset());
      router.push(`/orders/${order.id}`);
    } catch (err) {
      dispatch(validationErrorsSet(rtkErrorMessages(err)));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {validationErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <ul className="list-inside list-disc space-y-0.5">
            {validationErrors.map((err, i) => (
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
          onChange={(e) => dispatch(customerIdSet(e.target.value))}
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
          onChange={(e) => dispatch(deliveryAddressSet(e.target.value))}
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700">Branch ID</label>
        <input
          required
          value={branchId}
          onChange={(e) => dispatch(branchIdSet(e.target.value))}
          placeholder="branch_01"
          className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">Items</label>
          <button
            type="button"
            onClick={() => dispatch(itemAdded())}
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            + Add item
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {items.map((row, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                required
                value={row.sku}
                onChange={(e) => updateItem(i, "sku", e.target.value)}
                placeholder="SKU"
                className="min-w-[120px] flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none"
              />
              <input
                required
                type="number"
                min="1"
                step="1"
                value={row.qty}
                onChange={(e) => updateItem(i, "qty", e.target.value)}
                placeholder="Qty"
                className="w-20 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none sm:w-24"
              />
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={row.unitPrice}
                onChange={(e) => updateItem(i, "unitPrice", e.target.value)}
                placeholder="Unit price"
                className="w-24 shrink-0 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none sm:w-32"
              />
              <button
                type="button"
                onClick={() => dispatch(itemRemoved(i))}
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
        disabled={isLoading}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
      >
        {isLoading ? "Placing order…" : "Place Order"}
      </button>
    </form>
  );
}
