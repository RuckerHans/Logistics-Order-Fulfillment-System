import { OrderForm } from "@/components/OrderForm";

export default function NewOrderPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-gray-900">Place a New Order</h1>
      <p className="mt-1 text-sm text-gray-500">Requires an existing customer ID from elsewhere in the system.</p>
      <div className="mt-6">
        <OrderForm />
      </div>
    </div>
  );
}
