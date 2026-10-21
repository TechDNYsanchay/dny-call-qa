# DNY Sales Agent

Sales Call QA Agent for DNY Hospitality. It scores every first call (Callyzer) and vision call (tl;dv) against DNY's call sheets and sends each person a QA report at 8 am.

- Tech plan: https://claude.ai/code/artifact/a95fd8dc-b9b9-45b6-a3d9-25fcdcfd720d
- Stack: Next.js + Tailwind CSS on Vercel; Supabase (Postgres, Storage, Auth, Queues); nightly scoring through a Claude Code routine on Claude Max.

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
