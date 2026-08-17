# Our Order Flow Terminal

A read-only BTCUSDT order-flow terminal that visualizes real-time Binance public trades with Time & Sales, footprint aggregation, delta tracking, and explicit data-quality state.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/order-flow-terminal/src/data/` — Binance public trade WebSocket and shared market-data types.
- `artifacts/order-flow-terminal/src/processing/` — framework-agnostic trade, footprint, and delta engines.
- `artifacts/order-flow-terminal/src/ui/UIManager.ts` — presentation state bridge and observability counters.
- `artifacts/order-flow-terminal/src/App.tsx` — terminal surface and route shell.
- `artifacts/order-flow-terminal/src/index.css` — dark terminal theme and responsive layout.

## Architecture decisions

- V0.1 consumes Binance's public `btcusdt@trade` WebSocket only; it does not request credentials or expose trading controls.
- Aggressor side is derived from Binance's `m` flag: `m=true` is an aggressive sell, `m=false` an aggressive buy.
- The order book is intentionally not inferred from trades; DOM, spread, depth imbalance, heatmap, and liquidity detectors remain visibly unavailable until V0.2.
- Reconnects use bounded exponential backoff and stale-safe connection states.

## Product

V0.1 provides live trade prints, buy/sell volume classification, price-level footprint aggregation, running and cumulative delta, and connection/data-quality observability for BTCUSDT.

## User preferences

- Keep the terminal read-only and use public market data only.
- Prefer correctness and observability over simulated or inferred market data.

## Gotchas

- No fake market data fallback is enabled. An empty panel means the real stream has not supplied data.
- Binance trade timestamps are exchange milliseconds; the quality panel uses the local receipt time for last-update freshness.
- Run the terminal workflow before using the proxied preview; the Vite artifact requires workflow-provided `PORT` and `BASE_PATH`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
