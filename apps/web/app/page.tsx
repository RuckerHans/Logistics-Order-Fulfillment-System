import Link from "next/link";

const SECTIONS = [
  { href: "/orders", title: "Orders", desc: "Browse orders and track their status through the fulfillment pipeline." },
  { href: "/orders/new", title: "Place an Order", desc: "Create a new order for a customer." },
  { href: "/analytics", title: "Analytics", desc: "Throughput, status breakdown, and time spent in each status." },
  { href: "/fraud", title: "Fraud Flags", desc: "Review orders flagged by the fraud detection service." },
];

export default function HomePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Logistics Ops Dashboard</h1>
      <p className="mt-2 max-w-2xl text-gray-600">
        Place orders, track them through the fulfillment pipeline, and monitor throughput and
        fraud signals — all in one place.
      </p>
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="rounded-lg border border-gray-200 bg-white p-5 transition hover:border-gray-300 hover:shadow-sm"
          >
            <h2 className="font-medium text-gray-900">{s.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{s.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
