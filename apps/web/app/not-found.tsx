import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Not found</h1>
      <p className="mt-2 text-gray-500">The page or resource you&apos;re looking for doesn&apos;t exist.</p>
      <Link href="/orders" className="mt-4 inline-block text-sm font-medium text-gray-700 hover:underline">
        Back to orders
      </Link>
    </div>
  );
}
