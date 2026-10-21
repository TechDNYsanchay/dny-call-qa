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

Sample rows are easy to tell apart: people have `@sample.invalid` emails and clients have `+91 90000…` numbers. Until login is added, the screens read with the server-side secret key, so the app must not be deployed publicly before then.

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
