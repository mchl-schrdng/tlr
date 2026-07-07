<div align="center">

<img src="assets/logo.svg" alt="TLR" width="104" height="104" />

# TLR

**Training intelligence, tailored from your own Strava data.**

A local, single-user dashboard that turns your run history into workload, fatigue,<br/>
VO₂ trend, durability, critical speed and one concrete training decision — no generic coaching filler.

<br/>

[![CI](https://github.com/mchl-schrdng/tlr/actions/workflows/ci.yml/badge.svg)](https://github.com/mchl-schrdng/tlr/actions/workflows/ci.yml)
![Tests](https://img.shields.io/badge/tests-141%20passing-54d273?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-16-050706?style=flat-square&logo=nextdotjs&logoColor=white)
![React](https://img.shields.io/badge/React-19-58c4dc?style=flat-square&logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![Node](https://img.shields.io/badge/Node-22%2B-5fa04e?style=flat-square&logo=nodedotjs&logoColor=white)
![License](https://img.shields.io/badge/license-Apache--2.0-3178c6?style=flat-square)

<br/>

<img src="assets/demo.gif" alt="TLR dashboard" width="820" />

</div>

---

## What it is

TLR imports your Strava runs and turns them into a dashboard shaped by **your own history**, not
population averages: acute/chronic workload, fitness–fatigue–form, VO₂ trend, cardiac drift,
durability, intensity balance, critical speed and run-level analysis.

Every derived metric explains its source data and formula. There are no claims the data can't
support (no HRV, sleep, weather or temperature). Your Strava tokens and activity cache stay on
your machine in `./data/strava.db`.

## Setup

1. Create a Strava API app at <https://www.strava.com/settings/api>.
2. Set the Authorization Callback Domain to `localhost`.
3. Copy the local env example and fill in your credentials:

```bash
cp .env.local.example .env.local
```

```bash
STRAVA_CLIENT_ID=...
STRAVA_CLIENT_SECRET=...
```

## Run locally

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, connect Strava, then sync your runs.

## Product surface

- **Dashboard** — tailored workload, form, VO₂, signal quality, intensity, durability and the
  day's training decision.
- **Runs** — the complete local activity ledger.
- **Run detail** — splits, heart-rate zones, cardiac drift, grade-adjusted pace, estimated power
  and stride signals.

## AI analyst (optional)

The dashboard can turn its deterministic snapshot into a single plain-language decision.

- **Server-side only.** The deterministic snapshot is the source of truth — Strava tokens, raw
  streams and raw provider JSON are **never** sent to the model.
- **Graceful by default.** With no `GEMINI_API_KEY`, or if the provider call fails, TLR falls
  back to a local rule-based analyst so the UI never breaks.
- Enable it by setting `GEMINI_API_KEY` in `.env.local` (see `.env.local.example`).

## Commands

```bash
npm run dev        # start the dev server
npm test           # run the metric/unit test suite
npm run typecheck  # type-check
npm run check      # full CI gate: tests · typecheck · dead-code · audit · build
```

Pure metric logic lives in `lib/metrics/*` and ships with tests; performance metrics use
clean/eligible runs rather than every raw activity.

## License

[Apache License 2.0](LICENSE)
