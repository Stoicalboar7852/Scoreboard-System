# Deployment

How to run the Scoreboard System for a real venue: a cloud Docker host with a domain and
automatic HTTPS (the recommended setup), plus an on-premises fallback on a venue PC. Kiosk
and tablet setup is in `KIOSK-SETUP.md`.

## 1. Topology

```
Internet / venue LAN
        │  https://scores.example.com  (80 → 443 redirect, HTTP/3)
        ▼
   ┌──────────┐   reverse proxy, TLS (Let's Encrypt or internal CA), gzip/zstd
   │  caddy   │
   └────┬─────┘
        │  http://app:3000  (WebSocket upgrades pass through)
        ▼
   ┌──────────┐   Fastify REST + Socket.IO + static SPA, migrations on boot, /healthz
   │   app    │
   └────┬─────┘
        │  postgresql://db:5432
        ▼
   ┌──────────┐   PostgreSQL 16, named volume `db-data`
   │    db    │
   └──────────┘
```

One `app` container serves everything: the API, the real-time gateway and the built web app
(`/controller`, `/scoreboard`, `/admin`, `/ladders`, `/tonight`). Live clocks are held in the app
process and persisted on every change, so a restart replays what it missed (`ARCHITECTURE.md`).

## 2. Prerequisites

- A Linux VM with 2 vCPU / 2 GB RAM / 20 GB disk (any provider). The load test in
  `PROGRESS.md` (150 clients on 30 courts) ran with headroom on far less.
- Docker Engine 24+ with the Compose plugin (`docker compose version`).
- A DNS `A`/`AAAA` record for your hostname (for example `scores.example.com`) pointing at the VM,
  and inbound ports 80 and 443 (TCP and UDP) open in the provider firewall.
- The host clock synchronised by NTP (`timedatectl` shows `System clock synchronized: yes`).
  Every countdown in the venue is derived from this clock.

## 3. First deployment (about ten minutes)

```bash
git clone <your repository> scoreboard && cd scoreboard
cp .env.example .env
```

Edit `.env`. The variables that matter for production:

| Variable | Set to |
|----------|--------|
| `NODE_ENV` | `production` |
| `APP_ORIGIN` | `https://scores.example.com` (exactly the public origin; CORS and secure cookies use it) |
| `SITE_ADDRESS` | `scores.example.com` (Caddy obtains and renews the certificate for it) |
| `TRUST_PROXY` | `true` (Compose sets it; Caddy is in front) |
| `POSTGRES_PASSWORD` | a long random string (`openssl rand -hex 24`) |
| `SESSION_SECRET` | a different 32+ character random string (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | the office login; the account is created on first boot if it does not exist |
| `CONTROLLER_PIN` | the initial referee PIN (rotate later in Admin → Settings) |
| `VENUE_NAME` / `VENUE_TIMEZONE` | shown on every page; the timezone drives session dates and slot times |
| `APP_VERSION` | any label, e.g. `2026.09.1`; changing it makes kiosks reload the new build |
| `SEED_ON_BOOT` | `false` (only `true` for a throw-away demo) |

Then:

```bash
docker compose up -d --build
docker compose logs -f app        # wait for "admin account ensured" and "Server listening"
```

On boot the app container applies Prisma migrations, ensures the settings row and the admin
account from `.env`, then starts. Check `https://scores.example.com/healthz` reports
`"database":"ok"` and open `https://scores.example.com/admin`.

First-session checklist in the admin panel:

1. Settings → venue name, colours, next-game window, horn, controller PIN.
2. Courts → one per physical court, with the formats each court supports.
3. Formats → e.g. Fours 2×18 min, Pairs 2×12 min, with time-out and between-games values.
4. Seasons → competitions → teams (or import a draw from Excel; template under Sessions → Import).
5. Sessions → tonight → validate → publish.
6. Point each kiosk at `/scoreboard` and each referee tablet at `/controller`
   (`KIOSK-SETUP.md`).

## 4. Environment reference

Everything in `.env.example` is documented inline. Secrets never appear in logs or API responses:
the server returns typed error bodies and the security review tests assert that no hash or token
field is serialised. Keep `.env` readable only by the deploying user (`chmod 600 .env`).

## 5. Backups

The only state is the PostgreSQL volume. Take a logical backup nightly and before every upgrade:

```bash
docker compose exec -T db pg_dump -U "${POSTGRES_USER:-scoreboard}" -Fc "${POSTGRES_DB:-scoreboard}" \
  > "backups/scoreboard-$(date +%F).dump"
```

Cron example (02:30 daily, keep 30 days):

```
30 2 * * * cd /opt/scoreboard && mkdir -p backups && docker compose exec -T db pg_dump -U scoreboard -Fc scoreboard > backups/scoreboard-$(date +\%F).dump && find backups -name '*.dump' -mtime +30 -delete
```

Copy the `backups/` folder off the machine (object storage, rsync to the office PC). Restore:

```bash
docker compose stop app
docker compose exec -T db pg_restore -U scoreboard -d scoreboard --clean --if-exists < backups/scoreboard-2026-09-08.dump
docker compose start app
```

`docker compose down -v` deletes the database volume; never run it on a production host.

## 6. Upgrades

Deploy outside session hours; the app container restarts in a few seconds and kiosks reconnect and
reload on their own, but a live night would lose its in-memory scheduler for that window (state is
replayed from the database, so clocks catch up exactly).

```bash
cd /opt/scoreboard
git fetch && git checkout <tag or main>
# bump APP_VERSION in .env so clients pick up the new build
docker compose build app
docker compose up -d app          # migrations run on boot; caddy and db keep running
docker compose logs -f app
```

Rollback: check out the previous tag, rebuild and `up -d app`. Migrations are forward-only, so if a
release added a migration, restore the pre-upgrade backup first (§5).

Renewing certificates, Docker host updates and reboots need nothing from the app: Caddy renews
automatically and all three services have `restart: unless-stopped`.

## 7. On-premises fallback

If the venue's internet is unreliable, run the identical stack on a small PC on the venue LAN
(an Intel NUC-class machine with Ubuntu Server and Docker is enough) and point kiosks and tablets
at it. Two differences:

1. **Name resolution.** Give the PC a fixed IP and a LAN hostname (`scores.lan`) in the router's
   DNS, or add a hosts entry on every kiosk and tablet.
2. **TLS.** Browsers only allow service workers, wake lock and PWA install on HTTPS or `localhost`.
   Public certificates are impossible without public DNS, so let Caddy be the CA:

```dotenv
APP_ORIGIN=https://scores.lan
SITE_ADDRESS=scores.lan
CADDY_TLS="tls internal"
```

After the first start export Caddy's root certificate and install it in the trusted root store of
every kiosk (Windows: `certutil -addstore Root caddy-root.crt`) and tablet:

```bash
docker compose exec caddy cat /data/caddy/pki/authorities/local/root.crt > caddy-root.crt
```

Everything else (backups, upgrades, seeding) is identical. A venue can also run both: the cloud
host as the primary and the on-premises PC restored from the latest backup as a cold standby, with
kiosk shortcuts re-pointed if the internet drops (`KIOSK-SETUP.md` §5).

## 8. Optional: Facebook page posting

Pinned Facebook posts cannot embed live content, so the supported workflow is to pin the public
`/ladders` URL and post the ladder PNG snapshot from Admin → Ladders. A feature-flagged shortcut
uploads that snapshot to a Facebook Page directly from the server:

1. Create a Meta developer app and add the Facebook Login product.
2. Generate a **Page access token** for the venue page with the permissions
   `pages_manage_posts` and `pages_read_engagement`, and exchange it for a long-lived token.
3. Set in `.env`:

```dotenv
FACEBOOK_ENABLED=true
FACEBOOK_PAGE_ID=<numeric page id>
FACEBOOK_PAGE_ACCESS_TOKEN=<long-lived page token>
```

4. `docker compose up -d app`. Admin → Ladders now shows **Post to Facebook**; every post is
   written to the audit log (`GET /api/audit?action=facebook.post`) with the post id, never the token.

If the flag is on but the id or token is missing, `GET /api/integrations` reports
`misconfigured: true` and the button stays hidden. Tokens expire or get revoked when the page's
admin changes their password; the error surfaces in the admin toast as "Facebook rejected the
post" and nothing else is affected.

## 9. Operations

| Need | Command / place |
|------|-----------------|
| Health | `curl -s https://scores.example.com/healthz` (also the Docker healthcheck) |
| Logs | `docker compose logs -f app` (JSON; `LOG_LEVEL=debug` for socket-level detail) |
| Status | `docker compose ps` |
| Who did what | `GET /api/audit?limit=200` with an admin session (append-only log of every change) |
| Rotate the referee PIN | Admin → Settings (existing tablets keep their device token) |
| Reset a forgotten admin password | Set `ADMIN_PASSWORD` and `ADMIN_PASSWORD_RESET=true` in `.env`, restart the app container once, then set the flag back to `false` |
| Revoke a lost tablet | Admin → Settings → Registered controller devices → Revoke (the tablet must re-enter the PIN) |
| Load headroom | `pnpm --filter @scoreboard/server load:test` against a staging copy (`LOAD_URL`) |

Common issues:

- **429 on public pages** – the per-IP public rate limit (120/min) is being hit, usually by many
  kiosks behind one NAT. Raise `PUBLIC_RATE_LIMIT` in `apps/server/src/plugins/security.ts` or
  give the venue a second egress IP.
- **Countdowns disagree between devices** – the server host clock is not NTP-synchronised;
  clients trust the server, so fix the host, not the tablets.
- **Kiosk shows the old version** – `APP_VERSION` was not changed; the SPA polls it and reloads
  when it differs.
- **`prisma migrate deploy` fails on boot** – the database is not reachable or the password in
  `.env` changed after the volume was created; the container exits and Compose restarts it,
  so read `docker compose logs app`.

## 10. Security checklist

- Unique `SESSION_SECRET`, `POSTGRES_PASSWORD`, `ADMIN_PASSWORD`; `.env` mode 600.
- Only ports 80/443 open; the database and app ports are not published by Compose.
- Automatic OS security updates on the host; rebuild the image monthly for Node/Alpine patches.
- Admins change their own password in Admin → Settings, which signs out their other sessions.
  A restart never overwrites that. If the password is forgotten, set `ADMIN_PASSWORD` to a new
  value with `ADMIN_PASSWORD_RESET=true`, restart once, then set the flag back to `false`.
  Sessions expire after `SESSION_TTL_HOURS`.
- Referee tablets hold a device token, not the PIN; rotating the PIN does not log them out,
  revoking the device in Admin → Settings does.
