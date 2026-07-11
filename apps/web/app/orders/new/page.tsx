import { OrderForm } from "@/components/OrderForm";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";

export default function NewOrderPage() {
  return (
    <div className="max-w-2xl">
      <PageHeader title="Place a New Order" subtitle="Requires an existing customer ID from elsewhere in the system." />
      <Card className="mt-6 p-5 shadow-sm">
        <OrderForm />
      </Card>
    </div>
  );
}
