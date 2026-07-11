import type { Metadata } from "next";
import "./globals.css";
import { NavBar } from "@/components/NavBar";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: "Logistics Ops Dashboard",
  description: "Order fulfillment operations dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="flex min-h-full flex-col bg-[#f9f9f7] font-sans text-gray-900 antialiased">
        <Providers>
          <NavBar />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
