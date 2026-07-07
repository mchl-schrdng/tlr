# Contributing to TLR

Thanks for your interest in TLR. It is a local, single-user training dashboard
built from your own Strava data. Contributions that keep it focused, private and
honest about its data are very welcome.

## Product principle

TLR promises one thing: **personalized training intelligence from the user's own
Strava history**. Please keep that in mind:

- No generic coaching filler, and no KPIs that need data we do not have. With the
  current cache, avoid claims based on HRV, sleep, weather, real running power,
  temperature or shoe rotation.
- Every derived metric must explain its source data and formula.
- The deterministic snapshot is the source of truth. The optional AI layer is
  server-side only and must never receive Strava tokens, raw streams or raw
  provider JSON.

## Getting started

```bash
git clone https://github.com/mchl-schrdng/tlr.git
cd tlr
npm install
cp .env.local.example .env.local   # then fill in your Strava credentials
npm run dev
```

Your Strava tokens and activity cache stay on your machine in `./data/strava.db`
and are never committed.

## Development workflow

1. Create a branch off `main`.
2. Make your change. Keep dashboard copy in English; the app is fully bilingual
   FR/EN, so add both dictionary entries when you touch user-facing strings.
3. Put pure metric logic in `lib/metrics/*` and add tests for new calculations.
   Performance metrics should use clean/eligible runs, not every raw activity.
4. Run the full gate before opening a PR:

   ```bash
   npm run check
   ```

   `npm run check` is the CI gate: tests, typecheck, unused-symbol check,
   dead-code check, security audit and a production build. CI runs the same
   command, so a green local run means a green PR.

## Pull requests

- Keep PRs focused and describe the user-visible effect.
- Make sure `npm run check` passes.
- Reference any issue the PR addresses.

## Reporting issues

Open a GitHub issue with steps to reproduce, what you expected, and what
happened. For anything security- or privacy-sensitive, open a private
[GitHub Security Advisory](https://github.com/mchl-schrdng/tlr/security/advisories/new)
instead of filing a public issue.

By contributing, you agree that your contributions are licensed under the
project's [Apache License 2.0](LICENSE).
