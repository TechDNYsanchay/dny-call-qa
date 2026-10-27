import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { Suspense } from "react";
import { AppNav, type NavGroup } from "@/components/app-nav";
import { Logo } from "@/components/logo";
import { getCurrentPerson, getReportDay, isSampleData, type Me } from "@/lib/data";
import { formatDay } from "@/lib/format";
import { fontClasses } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "DNY Sales Agent",
  description: "Daily QA scores and coaching for DNY Hospitality's sales calls",
  applicationName: "DNY Sales Agent",
  // Opens full screen from the home screen on an iPhone, with this name under the icon.
  appleWebApp: { capable: true, title: "DNY Sales", statusBarStyle: "default" },
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
    <html lang="en" className={`${fontClasses} h-full antialiased`} suppressHydrationWarning>
      <body className="flex min-h-full flex-col">
        <header className="sticky top-0 z-40 border-b border-border bg-surface/90 backdrop-blur-md print:static">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-x-5 px-4">
            <Link href="/" className="flex shrink-0 items-center">
              <Logo small className="h-9 w-auto lg:h-10" />
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
  let me: Me | null;
  try {
    me = await getCurrentPerson();
  } catch (error) {
    unstable_rethrow(error);
    // The database didn't answer: the header keeps just the logo, and the page shows the error.
    return null;
  }
  if (!me) return null;
  // The latest-day note is a nicety; the menu still shows without it.
  const [day, sample] = await Promise.all([getReportDay(), isSampleData()]).catch((error: unknown) => {
    unstable_rethrow(error);
    return [null, false] as const;
  });
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
