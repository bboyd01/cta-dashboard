# CTA Dashboard

A personal departure board for Chicago trains and buses. One card per route, stop
and direction, refreshing every 30 seconds, with optional Discord digests so your
phone tells you when to leave.

- Train and bus cards, colour-coded by CTA line
- Direction per card: either terminal, or both at once
- Countdown (`7 min`) or literal arrival time (`6:42 PM`)
- Layouts from one column on a phone to four on a desktop
- Scheduled Discord messages on the days and times you choose
- Runs as a single Docker container, with no database

## Quick start

```bash
cp .env.example .env
npm install
CTA_MOCK=1 npm run dev          # http://localhost:5173, no API keys needed
```

`CTA_MOCK=1` serves fixture data through the same code path as the real APIs, so
you can lay the dashboard out before you have keys.

For live data, put your keys in `.env` and drop the flag:

```bash
npm run dev
```

## API keys

Two separate keys, with separate daily quotas:

| Variable | Where to get it |
| --- | --- |
| `CTA_TRAIN_API_KEY` | <https://www.transitchicago.com/developers/traintrackerapply/> |
| `CTA_BUS_API_KEY` | <https://www.transitchicago.com/developers/bustracker/> |

Approval takes a day or two. A missing key is not fatal: the dashboard still
runs and the affected cards report the problem.

## Discord digests

1. In Discord: **Server Settings → Integrations → Webhooks → New Webhook**, pick
   a channel, and copy the URL.
2. Put it in `.env` as `DISCORD_WEBHOOK_URL`.
3. On the **Options** page, add a digest: pick cards, days, a send time, and how
   far ahead to look.

A digest sends on the days you choose, at the time you choose, listing the
departures in the next N minutes from that moment.

Two things worth knowing:

- **Times are Chicago time**, whatever the server's own clock is set to.
- **The look-ahead window is relative to send time**, because the CTA only
  predicts 30–60 minutes out. A 6:00 am digest with a 30-minute window tells you
  about departures from 6:00 to 6:30. Asking about 8:00 am at 6:00 am is not
  something the CTA can answer.

If the webhook is not set, digest rules can still be edited — nothing sends.

## Deploying

```bash
cp .env.example .env        # fill in your keys
docker compose up -d --build
```

The compose file binds to `127.0.0.1:3000`. **The app has no authentication**,
so put Tailscale, Cloudflare Access or reverse-proxy auth in front of it before
exposing it to the internet.

`config.json` and `stations.json` live on the `cta-data` volume and survive
redeploys.

## How it works

```
shared/     types, time-zone handling, departure formatting (used by server AND client)
server/     Express API, CTA providers, digest scheduler, static file serving
src/        React dashboard
```

One process serves the API, the built client and the digest scheduler, which is
what keeps this to a single container.

**No database.** All state is one JSON file on the volume. It is a few KB for a
single user, so a file plus an in-memory copy beats an engine here. Writes are
atomic (temp file plus rename) and reads are sanitized field by field, so a
hand-edit or a crash mid-write degrades to defaults rather than failing to boot.

**The server proxies the CTA, the browser never calls it.** API keys stay
server-side, the CTA sends no CORS headers anyway, and one shared cache collapses
every open tab into a single upstream request.

**Rate limits shaped the fetching.** The bus key allows roughly 10,000 requests a
day, and a 30-second refresh is 2,880 a day per distinct call, so naive per-card
polling would exhaust it. Instead:

- A 30-second cache is keyed per upstream call and filled lazily, so an idle
  dashboard makes no requests at all.
- Bus stops batch ten to a request; train cards at the same station share one.
- The browser stops polling when the tab is hidden.

**Station data.** The Train Tracker API cannot list stations, so the picker uses
the city's [List of 'L' Stops](https://data.cityofchicago.org/Transportation/CTA-System-Information-List-of-L-Stops/8pix-ypme)
dataset. The server fetches it on boot when the cached copy is missing or more
than 30 days old, and falls back to a small built-in seed if the portal is
unreachable — so the build never needs network and an outage degrades the picker
instead of breaking the container. `npm run fetch:stations` refreshes it by hand.

If the Options page says the station list came from the seed, the portal fetch
has not succeeded yet.

## Adding a transport for digests

`server/digest/discord.ts` builds a message and posts it. Another destination is
a second module with the same two functions and one line in
`server/digest/scheduler.ts` — nothing about scheduling, formatting or fetching
needs to change.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite on 5173 proxying `/api` to Express on 3001 |
| `npm run build` | Builds the client and compiles the server to `dist/` |
| `npm start` | Runs the built server |
| `npm test` | Unit tests |
| `npm run typecheck` | Type-checks client and server |
| `npm run fetch:stations` | Refreshes the 'L' station list |

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | `3001` in dev |
| `CTA_TRAIN_API_KEY` | — | Train Tracker |
| `CTA_BUS_API_KEY` | — | Bus Tracker |
| `DISCORD_WEBHOOK_URL` | — | Blank disables digests |
| `DATA_DIR` | `./data` | `/data` in the container |
| `CTA_MOCK` | `0` | `1` serves fixtures, no keys needed |
