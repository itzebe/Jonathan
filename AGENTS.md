# Base44 Dev Environment

## What this app is
EquiPulse — a Next.js 16 (App Router, Turbopack) DeFi UI for tokenized stock baskets on BSC.
Single-process app: no database, no backend workers. All data is in-browser + Next.js API routes.

## Running it
```
docker compose -f docker-compose.base44.yml up -d
```
- Base image: `node:22-slim`; pnpm 12.3.4 activated via corepack at container start.
- Dev command: `next dev -H 0.0.0.0 -p 3000` (live reload via Turbopack; source is bind-mounted at `/app`).
- Preview entry: http://localhost:3000

## Environment / secrets
No external credentials are required to boot. All env vars are optional with safe defaults:
- `NEXT_PUBLIC_CHAIN_ID` (default 56), `NEXT_PUBLIC_BSC_RPC_URL` (default BSC public RPC), `AGENT_STUDIO_ID` (default set)
- `AGENT_PRIVATE_KEY`, `BINANCE_WEB3_API_KEY`, `OPENAI_API_KEY` — all optional; absent = capability disabled
The app runs in **verified-simulation mode** by default (`TOKENS_VERIFIED = false` in `lib/agent-config.ts`), so no live on-chain execution happens without explicit config + credentials.

## Next.js preview origin
`next.config.mjs` sets `allowedDevOrigins` from `BASE44_PUBLIC_HOST_SUFFIX` so the Base44 preview origin can load dev assets/HMR. The var is passed into the compose service environment.

## Verify it works
- `curl -s http://localhost:3000/ | grep EquiPulse` → page title present
- `POST /api/agent` with `{action:"quote",...}` → returns JSON (simulation-mode response)
