import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { AppNav, LogoMark, type NavGroup } from "@/components/app-nav";
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
  applicationName: "DNY Sales Agent",
  // Opens full screen from the home screen on an iPhone, with this name under the icon.
  appleWebApp: { capable: true, title: "DNY Sales", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#222220" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: browser extensions (e.g. QuillBot) add attributes to <html> before
    // React loads. This only ignores attribute differences on this one tag, not its children.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md print:static">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-x-5 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2 font-semibold tracking-tight">
              <LogoMark />
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

/** Navigation for the signed-in person, most-used pages first; empty on the login page. */
async function SignedInNav() {
  const me = await getCurrentPerson();
  if (!me) return null;
  const [day, sample] = await Promise.all([getReportDay(), isSampleData()]);
  const coaching: NavGroup = {
    title: "Coaching",
    items: [
      { href: "/examples", label: "Examples", icon: "examples", hint: "The best calls to learn from" },
      { href: "/scorecards", label: "Scorecards", icon: "scorecards", hint: "What every call is scored on" },
    ],
  };
  const groups: NavGroup[] = me.canSeeAll
    ? [
        {
          title: "Daily",
          items: [
            { href: "/", label: "Team", icon: "team", hint: "Everyone's scores for the day", also: ["/people"] },
            { href: "/follow-ups", label: "Follow-ups", icon: "followups", hint: "Missed calls and meetings to book" },
            { href: "/calls", label: "Calls", icon: "calls", hint: "Every call, with its score" },
            { href: "/leads", label: "Leads", icon: "leads", hint: "Clients and where each one is" },
            { href: "/rollups", label: "Roll-ups", icon: "rollups", hint: "Weekly and monthly trends" },
          ],
        },
        coaching,
        {
          title: "Setup",
          items: [
            { href: "/team-members", label: "Team members", icon: "members", hint: "Who is scored and who gets reports" },
            { href: "/sheets", label: "Call sheets", icon: "sheets", hint: "Questions each call should cover" },
          ],
        },
      ]
    : [
        {
          title: "Daily",
          items: [
            { href: `/people/${me.id}`, label: "My report", icon: "report", hint: "Your scores and what to work on" },
            { href: "/follow-ups", label: "My follow-ups", icon: "followups", hint: "Missed calls and meetings to book" },
            { href: "/calls", label: "My calls", icon: "calls", hint: "Every call, with its score" },
            { href: "/leads", label: "My leads", icon: "leads", hint: "Your clients and where each one is" },
            { href: "/rollups", label: "My week", icon: "rollups", hint: "Your weekly and monthly trends" },
          ],
        },
        coaching,
      ];

  return <AppNav groups={groups} user={{ name: me.name, title: me.title, email: me.email }} latest={day ? formatDay(day) : null} sample={sample} />;
}
