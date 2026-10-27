import { Suspense } from "react";
import { LevelPoints, LevelStatus, ScoreFigure } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in · DNY Sales Agent" };

const NOTICES: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Send yourself a new one.",
  "no-access": "Your account isn't on the DNY team list, or was removed from it. Ask an admin to add you.",
  google: "Google sign-in didn't work. Try again with your @dnyhospitality.com account, or use the email link.",
};

/** Shown once the Google client is set up in Google Cloud and Supabase (see README). */
const GOOGLE_ENABLED = process.env.GOOGLE_SIGN_IN === "on";

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <div className="mx-auto grid max-w-5xl items-center gap-8 py-4 sm:py-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] lg:gap-14">
      {/* Sign-in first on a phone, beside the introduction on a laptop. */}
      <div className="order-1 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-7 lg:order-2">
        <span className="grid size-10 place-items-center rounded-lg bg-brand text-sm font-bold text-white">DNY</span>
        <h1 className="mt-5 text-xl font-semibold tracking-tight sm:text-2xl">Sign in</h1>
        <p className="mb-6 mt-1 text-sm text-muted">
          {GOOGLE_ENABLED ? "Use your DNY Google account, or get a one-time email link." : "We'll email you a one-time link. No password needed."}
        </p>
        <Suspense fallback={<LoginForm next="/" googleEnabled={GOOGLE_ENABLED} />}>
          <LoginFields searchParams={searchParams} />
        </Suspense>
        <p className="mt-6 text-xs text-muted">For DNY Hospitality&apos;s sales team. Ask an admin to add you to the team list.</p>
      </div>

      <div className="order-2 lg:order-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand">DNY Sales Agent</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">Every sales call, scored and coached by 8 am.</h2>
        <ul className="mt-6 space-y-3 text-sm">
          {[
            ["Scored overnight", "against the call sheet and the scorecard, with the exact lines as evidence"],
            ["Coaching you can use", "what went well, what to fix, and a better line to say tomorrow"],
            ["No lead goes cold", "missed calls, call-backs and meetings on one follow-up list"],
          ].map(([title, text]) => (
            <li key={title} className="flex gap-3">
              <span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full bg-foreground text-[0.6rem] text-background" aria-hidden="true">
                ✓
              </span>
              <span>
                <span className="font-medium">{title}:</span> <span className="text-muted">{text}</span>
              </span>
            </li>
          ))}
        </ul>

        {/* What a scored call looks like inside, in the app's own marks. */}
        <div className="mt-8 hidden rounded-xl border border-border bg-surface p-4 sm:block" aria-hidden="true">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <div className="text-xs text-muted">How a scored call looks</div>
              <div className="text-sm font-medium">First call · 11:51</div>
            </div>
            <ScoreFigure score={72.5} band="amber" size="md" />
          </div>
          <ul className="divide-y divide-border text-sm">
            {[
              ["Focus and environment", 10, 15],
              ["CTA", 10, 20],
              ["Coverage of the mandatory questions", 5, 20],
            ].map(([area, level, weight]) => (
              <li key={area} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block">{area}</span>
                  <span className="text-xs">
                    <LevelStatus level={level as number} />
                  </span>
                </span>
                <LevelPoints level={level as number} weight={weight as number} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

async function LoginFields({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const notice = typeof params.error === "string" ? NOTICES[params.error] : undefined;
  return <LoginForm next={next} notice={notice} googleEnabled={GOOGLE_ENABLED} />;
}
