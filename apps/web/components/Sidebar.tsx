"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardList, PackagePlus, BarChart3, Shield, type LucideIcon } from "lucide-react";

const LINKS: { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean }[] = [
  {
    href: "/orders",
    label: "Orders",
    icon: ClipboardList,
    match: (p) => p.startsWith("/orders") && !p.startsWith("/orders/new"),
  },
  { href: "/orders/new", label: "New Order", icon: PackagePlus, match: (p) => p.startsWith("/orders/new") },
  { href: "/analytics", label: "Analytics", icon: BarChart3, match: (p) => p.startsWith("/analytics") },
  { href: "/fraud", label: "Fraud Flags", icon: Shield, match: (p) => p.startsWith("/fraud") },
];

// Dark, quiet sidebar — restraint reads as premium: a solid near-black
// surface, muted label color at rest, and a subtle left-accent + soft tint
// for the active item rather than a loud full-color fill.
// Icon-only rail below `md` (narrow viewports keep working nav — see
// Prompt 3), full labeled sidebar from `md` up.
export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-16 shrink-0 flex-col bg-slate-950 md:w-64">
      <div className="flex items-center gap-2.5 px-3 py-6 md:px-6">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
          L
        </div>
        <span className="hidden text-[15px] font-semibold tracking-tight text-white md:inline">Logistics Ops</span>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 md:px-4">
        {LINKS.map((link) => {
          const active = link.match(pathname ?? "");
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              title={link.label}
              className={
                active
                  ? "flex items-center justify-center gap-3 rounded-md border-l-2 border-indigo-400 bg-white/[0.06] px-3 py-2 text-sm font-medium text-white md:justify-start md:pl-[10px]"
                  : "flex items-center justify-center gap-3 rounded-md border-l-2 border-transparent px-3 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.04] hover:text-slate-100 md:justify-start md:pl-[10px]"
              }
            >
              <Icon className={active ? "size-[18px] shrink-0 text-indigo-400" : "size-[18px] shrink-0"} />
              <span className="hidden md:inline">{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="hidden px-6 py-5 text-xs text-slate-600 md:block">Logistics Order Fulfillment</div>
    </aside>
  );
}
