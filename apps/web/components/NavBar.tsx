"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/orders", label: "Orders", match: (p) => p.startsWith("/orders") && !p.startsWith("/orders/new") },
  { href: "/orders/new", label: "New Order", match: (p) => p.startsWith("/orders/new") },
  { href: "/analytics", label: "Analytics", match: (p) => p.startsWith("/analytics") },
  { href: "/fraud", label: "Fraud Flags", match: (p) => p.startsWith("/fraud") },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center gap-8 px-6 py-4">
        <Link href="/" className="text-lg font-semibold text-gray-900">
          Logistics Ops
        </Link>
        <nav className="flex gap-6 text-sm font-medium">
          {LINKS.map((link) => {
            const active = link.match(pathname ?? "");
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "border-b-2 border-gray-900 pb-1 text-gray-900"
                    : "border-b-2 border-transparent pb-1 text-gray-500 hover:text-gray-900"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
