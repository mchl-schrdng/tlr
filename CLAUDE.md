# Strava Tailor Agent Notes

This repo is a local, single-user training dashboard tailored from Strava activity data.

## Product Principle

Keep the app focused on one promise: personalized training intelligence from the user's own Strava history.

Do not add generic coaching filler or KPIs that require data we do not have. With the current cache, avoid claims based on HRV, sleep, weather, real running power, temperature or shoe rotation. Derived metrics must explain their source data and formula.

## Local Data

- SQLite cache: `data/strava.db`
- Local secrets: `.env.local`
- Both are ignored and must stay out of Git.

## Commands

```bash
npm run dev
npm test
npm run typecheck
npm run build
npm run check
```

`npm run check` is the CI gate: tests, typecheck and production build.

## Implementation Notes

- Keep dashboard copy in English.
- Keep navigation lean: Dashboard and Runs.
- Use `lib/metrics/*` for pure metric logic and add tests for new calculations.
- Performance metrics should use clean/eligible runs, not every raw activity.
- Keep UI density high but readable; avoid redundant cards.
- AI analysis is optional and server-side only. The source of truth is still the deterministic snapshot from `lib/ai/snapshot.ts`; never send Strava tokens, raw streams or raw provider JSON to an LLM.
- If `GEMINI_API_KEY` is missing or the provider fails, `/api/ai/analysis` must return a useful local-rule fallback instead of a broken UI.

<!-- PACKMIND:START -->
## PackMind

This project uses **PackMind** - a second brain for Claude Code. Read
`.packmind/PACKMIND.md` and follow it: consult `.packmind/map.md` before reading
files, heed guardrail warnings before writing, and use the **packmind** MCP tools
(`recall`, `remember`, `record_solution`, `project_map`, `usage_report`,
`handoff`) to read and update project memory.
<!-- PACKMIND:END -->
