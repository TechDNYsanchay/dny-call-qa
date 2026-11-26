# DNY Sales Agent

Sales Call QA Agent for DNY Hospitality. It scores every first call (Callyzer) and vision call (tl;dv) against DNY's call sheets and sends each person a QA report at 8 am.

- Tech plan: https://claude.ai/code/artifact/a95fd8dc-b9b9-45b6-a3d9-25fcdcfd720d
- Stack: Next.js + Tailwind CSS on Vercel; Supabase (Postgres, Storage, Auth, Queues); nightly scoring through a Claude Code routine on Claude Max.

## Run locally

Needs Node.js 20.9 or later and a filled-in `.env.local`. The screens read from schema `qa` of the shared Supabase project `dny-agents` (Mumbai; see [Database](#database)).

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

Founders, managers and admins see every call and report. Executives and consultants see only their own; the database enforces this with row-level security, not just the screens. The sign-in email template is `supabase/templates/magic_link.html`, shared with Call to Action (see [Database](#database)).

### Sign in with Google

Google sign-in runs through the shared project's Google provider, which uses Call to Action's OAuth client (an Internal client in DNY's Google Workspace, redirect URI `https://iaxjxefipmdumfukttvv.supabase.co/auth/v1/callback`). `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` hold that client's values; they are only read by `npx supabase config push`, never by the app.

Google only proves who someone is; they still need to be an active person on the team list (`npm run people -- add`) with the same email.

`GOOGLE_SIGN_IN=on` in `.env.local` and in Vercel shows the button.

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

## Database

Sales QA shares one Supabase project with Call to Action (repo `TechDNYsanchay/DNY-call-to-action`): **`dny-agents`**, ref `iaxjxefipmdumfukttvv`, Mumbai, in tech@dnyhospitality.com's organisation. Each app has its own schema, so neither can see or change the other's tables:

| Schema | Owner |
| --- | --- |
| `qa` | Sales QA (this repo). The Supabase clients set `db: { schema: "qa" }`; `npm run db:types` generates types for `qa` only. |
| `public` | Call to Action. Never touch it from here. |

Shared between the two apps (one per project):

- **Logins** (`auth.users`). A person on both team lists has one login. Each app decides access from its own `people` table, so a login only gets in where that app lists the person as active. One exception: Call to Action's "remove person" also bans the login, which stops that person signing in here too until they are re-added there.
- **Auth settings and the magic-link email.** `supabase/config.toml` and `supabase/templates/magic_link.html` hold the same settings in both repos (only `project_id` differs); change both together. The template picks Sales QA's email when the link returns to `dny-call-qa.vercel.app` or `localhost:3100`, Call to Action's otherwise.
- **Migration history.** Both repos push to the same `supabase_migrations` table. `supabase/migrations/*_cta_*.sql` are empty placeholders for Call to Action's migrations, so `npx supabase db push` here sees the full history. When Call to Action adds a migration, add an empty `<version>_cta_<name>.sql` here before the next push (and Call to Action adds a `*_qa_*` placeholder for each new migration here). Every migration here starts with `set search_path = qa, extensions;`.
- **Storage.** Sales QA's buckets are `recordings` and `references`; Call to Action's is `call-recordings`.

Link this checkout once with `npx supabase link --project-ref iaxjxefipmdumfukttvv`.

Until 26 Nov 2026 Sales QA had its own project, `dny-call-qa` (ref `jlqppprkvlwhtbvhgiik`). Its data was copied here and that project was renamed `trs` (kept for TRS; its old copy of Sales QA's data stays until it is cleared).

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
