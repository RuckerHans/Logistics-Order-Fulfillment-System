import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "./providers";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Logistics Ops Dashboard",
  description: "Order fulfillment operations dashboard",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={cn("h-full", "font-sans", geist.variable)}>
      <body className="flex min-h-full font-sans text-gray-900 antialiased">
        <Providers>
          <div className="flex min-h-full w-full">
            <Sidebar />
            <div className="flex min-h-full flex-1 flex-col bg-gray-50">
              <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10 md:px-10">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
