# CTA Dashboard

A personal departure board for Chicago trains and buses. One card per route, stop
and direction, refreshing every 30 seconds, with optional Discord digests so your
phone tells you when to leave.

- Train, Metra and bus cards, colour-coded by line
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

Three separate keys, each with its own quota:

| Variable | Where to get it |
| --- | --- |
| `CTA_TRAIN_API_KEY` | <https://www.transitchicago.com/developers/traintrackerapply/> |
| `CTA_BUS_API_KEY` | <https://www.transitchicago.com/developers/bustracker/> |
| `METRA_API_KEY` | <https://metra.com/metra-gtfs-api> |

Approval takes a day or two. A missing key is not fatal: the dashboard still
runs and the affected cards report the problem.

Metra cards start from the GTFS static schedule (refreshed once a day — see
`npm run fetch:metra` to force a refresh) and overlay live delays from Metra's
GTFS-realtime trip updates feed where available: a departure reads `sched`
until realtime picks up its trip, then switches to a live time and turns red
once it's a minute or more late. A trip realtime hasn't picked up yet (usually
anything more than an hour or so out) just shows its scheduled time.

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

## Deploying with Docker

The repo builds to a single self-contained image: one process serving the API,
the built client and the digest scheduler. There is nothing else to run
alongside it — no database, no worker, no cache.

### What the container needs

| | |
| --- | --- |
| Build | The `Dockerfile` at the repo root. No build args |
| Listens on | `3000` (override with `PORT`) |
| Health check | `GET /api/health` — already declared in the image |
| Persistent storage | Mounted at **`/data`** |
| Runs as | uid **1000**, non-root |
| Outbound access | `lapi.transitchicago.com`, `ctabustracker.com`, `data.cityofchicago.org`, `schedules.metrarail.com`, `gtfspublic.metrarr.com`, and `discord.com` if you use digests |

Set the environment variables from the [Environment](#environment) table below.
`DATA_DIR` is already `/data` in the image — leave it alone unless you mount
somewhere else.

### On a platform that builds from your repository

Point it at this repo and let it build the `Dockerfile`. Then:

1. **Set the environment variables** in the platform's UI — at minimum
   `CTA_TRAIN_API_KEY` and `CTA_BUS_API_KEY`, plus `METRA_API_KEY` for Metra
   cards and `DISCORD_WEBHOOK_URL` if you want digests. Don't commit a `.env`;
   it's gitignored for a reason.
2. **Add persistent storage mounted at `/data`.** Without it your cards, display
   options and digest rules are wiped on every redeploy, and the station list is
   re-fetched from scratch each time.
3. **Set the port to 3000** so the platform's proxy routes to it. The container
   only ever listens on `PORT`; it does not publish anything itself.
4. **Put the platform's own auth in front of it** if it's on a public domain —
   see the warning below.

Most platforms that build straight from a git push (Render, Railway, Vercel,
Heroku) set their own commit-SHA env var automatically, which `/api/health`
picks up as `buildVersion` with no configuration needed — see the
[Environment](#environment) table.

Redeploying is safe: `/data` is untouched by a rebuild, so your configuration
survives.

### With Compose on a plain VPS

```bash
cp .env.example .env        # fill in your keys
GIT_SHA=$(git rev-parse --short HEAD) docker compose up -d --build
```

`GIT_SHA` is optional but worth setting: it's stamped into `/api/health` as
`buildVersion`, so after a redeploy you can confirm the running container
actually picked up your latest commit with `curl localhost:3000/api/health`
instead of guessing from restart timestamps.

This binds to `127.0.0.1:3000`, reachable only from the host, because the app
has no authentication. Two ways to change that:

```bash
# Publish it directly (only behind a firewall or an authenticating proxy)
PUBLISH_ADDR=0.0.0.0:3000 docker compose up -d

# Or delete the `ports:` block and attach your reverse proxy to the same
# Docker network, reaching the container as cta-dashboard:3000
```

### Plain docker run

```bash
docker build --build-arg GIT_SHA=$(git rev-parse --short HEAD) -t cta-dashboard .
docker volume create cta-data
docker run -d --name cta-dashboard --restart unless-stopped \
  -p 127.0.0.1:3000:3000 \
  -v cta-data:/data \
  -e CTA_TRAIN_API_KEY=... \
  -e CTA_BUS_API_KEY=... \
  -e METRA_API_KEY=... \
  -e DISCORD_WEBHOOK_URL=... \
  cta-dashboard
```

### Persistent data, and the one gotcha

`/data` holds `config.json` (cards, display options, digest rules),
`stations.json` (the cached 'L' station list), and `metra-schedule.json` (the
cached Metra GTFS schedule).

A **named volume** inherits the image's ownership and just works. A **host
directory** (`-v /srv/cta:/data`) is created root-owned, and the container runs
as uid 1000, so it cannot write there. Fix it once on the host:

```bash
sudo chown -R 1000:1000 /srv/cta
```

The container checks this at startup and **exits immediately** with that
instruction if `/data` is not writable — deliberately, because the alternative
is a dashboard that accepts your settings and silently loses them on restart.
If the container won't start, read the first lines of its log.

### No authentication

**The app has no login.** Anyone who can reach it can see your cards and change
your settings and digests. Your API keys are never exposed to the browser, but
everything else is. Before putting it on a public domain, front it with your
platform's built-in auth, Cloudflare Access, Tailscale, or reverse-proxy basic
auth.

### First boot

Expect this in the log:

```
[stations] refreshed <N> stations from the data portal
```

That is the full station list landing in `/data` — around 145 of them. If you instead see
`falling back to the bundled seed`, outbound HTTPS to `data.cityofchicago.org`
is blocked — the dashboard still runs, but the picker only offers a handful of
stations until it succeeds. The Options page shows which source is in use.

### Confirming a deploy picked up new code

`GET /api/health` is the fastest way to check what a running container is
actually doing, without shell access to it:

```json
{
  "buildVersion": "2adc186",
  "mock": false,
  "stations": { "source": "portal", "fetchedAt": "...", "count": 145 },
  "metraStations": { "source": "gtfs", "fetchedAt": "...", "count": 240, "tripCount": 1830 },
  "metraRealtime": {
    "keyFingerprint": "ab…yz (18 chars)", "keyHadQuotes": false,
    "fetchedAt": "...", "error": null, "tripCount": 1204
  }
}
```

- **`buildVersion`** is the short git commit the running image was built from
  (see `GIT_SHA` in [Environment](#environment)) — `"unknown"` means neither a
  build arg nor a platform-provided commit env var was available. After a
  redeploy that doesn't seem to have changed anything, check this first: if it
  still shows the old commit, the deploy didn't actually rebuild the image.
- **`metraRealtime`** reports the last attempt to fetch Metra's GTFS-realtime
  trip updates feed. `keyFingerprint: null` means `METRA_API_KEY` isn't set at
  all — otherwise it's the key's first two and last two characters plus its
  length, enough to confirm the server is using the key you think it is
  without ever exposing the whole thing. `keyHadQuotes: true` means the raw
  value looked wrapped in quotes and they were stripped automatically — this
  self-corrects, but is worth knowing about since a wrapped key is a common
  gotcha with Docker Compose's `env_file:` (it doesn't strip quotes the way a
  shell or dotenv library would, so `METRA_API_KEY="abc"` in `.env` becomes
  the literal 5-character value `"abc"`, not `abc`). A non-null `error` means
  the fetch itself failed (check the message); `tripCount: 0` with no error
  usually means the feed returned data but nothing in it matched anything
  useful. Compare it against `metraStations.tripCount` (the static schedule's
  own trip count) to gauge how much of the schedule realtime is covering.

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
| `npm run fetch:metra` | Refreshes the Metra schedule |

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `3000` | `3001` in dev |
| `CTA_TRAIN_API_KEY` | — | Train Tracker |
| `CTA_BUS_API_KEY` | — | Bus Tracker |
| `METRA_API_KEY` | — | Metra GTFS API |
| `DISCORD_WEBHOOK_URL` | — | Blank disables digests |
| `DATA_DIR` | `./data` | `/data` in the container; leave as-is there |
| `CTA_MOCK` | `0` | `1` serves fixtures, no keys needed |
| `PUBLISH_ADDR` | `127.0.0.1:3000` | Compose only — where to publish the port |
| `GIT_SHA` | `unknown` | Build arg, not runtime — see [buildVersion](#confirming-a-deploy-picked-up-new-code) |
