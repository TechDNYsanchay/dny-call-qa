import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { getCurrentPerson, getReportDay, isSampleData } from "@/lib/data";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. QuillBot) add attributes to <html> before
    // React loads. This only ignores attribute differences on this one tag, not its children.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <span className="grid size-7 place-items-center rounded-md bg-brand text-xs font-bold text-white">DNY</span>
              Sales Agent
            </Link>
            <Suspense fallback={null}>
              <SignedInNav />
            </Suspense>
          </div>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">{children}</main>
      </body>
    </html>
  );
}

/** Navigation for the signed-in person; empty on the login page. */
async function SignedInNav() {
  const me = await getCurrentPerson();
  if (!me) return null;
  const [day, sample] = await Promise.all([getReportDay(), isSampleData()]);
  const links = me.canSeeAll
    ? [
        { href: "/", label: "Team" },
        { href: "/calls", label: "Calls" },
        { href: "/leads", label: "Leads" },
        { href: "/rollups", label: "Roll-ups" },
        { href: "/scorecards", label: "Scorecards" },
      ]
    : [
        { href: `/people/${me.id}`, label: "My report" },
        { href: "/calls", label: "My calls" },
        { href: "/leads", label: "My leads" },
        { href: "/rollups", label: "My week" },
        { href: "/scorecards", label: "Scorecards" },
      ];

  return (
    <>
      <nav className="flex gap-4 text-sm">
        {links.map((item) => (
          <Link key={item.href} href={item.href} className="text-muted hover:text-foreground">
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-3 text-xs">
        {day && (
          <span className={`rounded-full px-2.5 py-0.5 font-medium ${sample ? "bg-warning/15" : "bg-background"}`}>
            {sample ? "Sample data · " : "Latest calls: "}
            {formatDay(day)}
          </span>
        )}
        <span className="text-muted" title={me.email ?? undefined}>
          {me.name}
        </span>
        <form action="/auth/signout" method="post">
          <button type="submit" className="text-muted underline-offset-2 hover:text-foreground hover:underline">
            Sign out
          </button>
        </form>
      </div>
    </>
  );
}
