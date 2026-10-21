import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { IS_SAMPLE_DATA, REPORT_DATE } from "@/lib/data";
import { formatDay } from "@/lib/format";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DNY Sales Agent",
  description: "Daily QA scores and coaching for DNY Hospitality's sales calls",
};

const NAV = [
  { href: "/", label: "Team" },
  { href: "/calls", label: "Calls" },
  { href: "/scorecards", label: "Scorecards" },
] as const;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">DNY</span>
              Sales Agent
            </Link>
            <nav className="flex gap-4 text-sm">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
                  {item.label}
                </Link>
              ))}
            </nav>
            {IS_SAMPLE_DATA && (
              <span className="ml-auto rounded-full bg-warning/15 px-2.5 py-0.5 text-xs font-medium">
                Sample data · {formatDay(REPORT_DATE)}
              </span>
            )}
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}
