# DNY Sales Agent

Sales Call QA Agent for DNY Hospitality. It scores every first call (Callyzer) and vision call (tl;dv) against DNY's call sheets and sends each person a QA report at 8 am.

- Tech plan: https://claude.ai/code/artifact/a95fd8dc-b9b9-45b6-a3d9-25fcdcfd720d
- Stack: Next.js + Tailwind CSS on Vercel; Supabase (Postgres, Storage, Auth, Queues); nightly scoring through a Claude Code routine on Claude Max.

## Run locally

Needs Node.js 20.9 or later and a filled-in `.env.local`. The screens read from the Supabase project `dny-call-qa` (Mumbai).

```bash
npm install
npm run dev -- -p 3100           # port 3000 is taken by another app on this machine
npm test                         # scoring maths, schema, reports, dates, webhook secrets
npm run typecheck
npm run lint
npm run db:sample                # load the sample calls into Supabase (safe to re-run)
npm run db:sample -- --remove    # remove every sample row
npm run db:types                 # regenerate src/lib/supabase/database.types.ts after a migration
```

Sample rows are easy to tell apart: people have `@sample.invalid` emails and clients have `+91 90000…` numbers.

## Sign-in and access

Everyone signs in with a one-time email link; there are no passwords and no open sign-ups. Only people on the team list can get a link:

```bash
npm run people -- list
npm run people -- add --email name@dnyhospitality.com --name "Full Name" --role founder
npm run people -- deactivate --email name@dnyhospitality.com
npm run people -- test-link --email founder@sample.invalid   # sign in as a sample account (no email sent)
```

Founders, managers and admins see every call and report. Executives and consultants see only their own; the database enforces this with row-level security, not just the screens. The sign-in email template is `supabase/templates/magic_link.html` (pushed with `npx supabase config push`).

### Sign in with Google (one-time setup)

1. In Google Cloud, create an OAuth client (type **Web application**) in a project owned by the DNY Google Workspace, with the consent screen audience set to **Internal** (only dnyhospitality.com accounts).
   - Authorized JavaScript origins: `https://dny-call-qa.vercel.app`, `http://localhost:3100`
   - Authorized redirect URI: `https://jlqppprkvlwhtbvhgiik.supabase.co/auth/v1/callback`
2. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`, then push them to Supabase without committing them:
   `set -a; . ./.env.local; set +a; npx supabase config push`
3. Set `GOOGLE_SIGN_IN=on` in `.env.local` and in Vercel, then redeploy to show the button.

Google only proves who someone is; they still need to be an active person on the team list (`npm run people -- add`) with the same email.

## What's where

| Path | What it holds |
| --- | --- |
| `src/lib/scoring/` | The brief in code: call-sheet questions, scorecards and weights, hard fails, score maths and bands, measured rules, and the JSON schema the scoring routine must return |
| `src/lib/reports.ts` | The daily QA report per person and the founders' team summary (brief section 6) |
| `src/lib/data/` | Data access for the screens (Supabase, server-only) and the sample data used by tests and `npm run db:sample` |
| `src/app/` | Screens (team summary, calls, call page, daily report, scorecards) and API routes (Callyzer and tl;dv webhooks, scheduled jobs) |
| `supabase/migrations/` | Database schema with row-level security and the restricted `scoring_agent` role |
| `vercel.json` | Mumbai region and the scheduled jobs (UTC times) |

This is Next.js 16 with Cache Components: read `AGENTS.md` before changing pages or routes.

## Repositories

Every change is pushed separately to two private repositories:

| Remote | Repository | Signs in with |
| --- | --- | --- |
| `dny` | TechDNYsanchay/dny-call-qa (main copy; Vercel and the scoring routine use it) | `~/.ssh/id_ed25519_dny` via host `github-dny` |
| `personal` | tariquescript/dny-call-qa | `~/.ssh/id_ed25519` |

```bash
git push dny main
git push personal main
```

## Secrets

Copy `.env.example` to `.env.local` and fill in the values. `.env.local` is never committed.
