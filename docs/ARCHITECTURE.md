# Architecture

(Populated progressively; final version includes the clock sequence diagram.)

## Overview

One cloud-hosted Node.js server (Fastify 5 REST + Socket.IO 4 real-time + Prisma 6 on
PostgreSQL 16) serves a single React SPA. The SPA exposes four surfaces by route:

| Route | Surface | Auth |
|-------|---------|------|
| `/controller/:courtId` | Referee controller (PWA) | Device token (exchanged for the venue PIN) |
| `/scoreboard/:courtId` | Kiosk display | None (read-only) |
| `/admin/*` | Office staff | Cookie session |
| `/ladders`, `/draw/:id`, `/tonight` | Public | None |

All business rules live in `packages/shared` as pure functions.
