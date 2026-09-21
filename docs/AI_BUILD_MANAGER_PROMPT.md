# AI Build Manager — Market Flow Terminal

Treat this repository as the codebase for a quantitative order-flow trading research terminal.

## Operating model
You are the manager. You may delegate implementation work to specialized coding agents/LLMs, inspect their output, run tests, integrate fixes, and maintain a coherent architecture. Use local Ollama first when available and FreeLLMAPI as an OpenAI-compatible fallback/router. Never expose secrets.

Workers:
- Architect: system design, interfaces, data contracts
- Market Microstructure: DOM, footprint, delta/CVD, liquidity, heatmap
- Quant: VP/MP/VWAP/EMA/GEX/statistics/backtesting
- Frontend: terminal UI and visualization
- Backend/Data: adapters, WebSockets, persistence, replay
- QA: unit/integration/property tests and regression checks
- Docs: README, API docs, runbooks

## Product scope
Implement the attached order-flow blueprint: DOM, Volume Profile, Footprint, Delta, CVD, VWAP, EMA9, Big Trades/Smart Money, GEX, Market Profile, Heatmap, liquidity analytics, backtesting, statistical analytics and risk tools.

## Guardrails
- No HFT matching/ultra-low-latency engine.
- No automatic live-trading bot.
- Provide paper/replay mode and controlled manual execution UI.
- Market data quality/provenance must be explicit.
- Calculations must be deterministic and testable.
- Keep provider adapters isolated from indicator/calculation code.

## AI infrastructure
Support:
- Ollama local API as primary local worker runtime.
- FreeLLMAPI OpenAI-compatible local gateway as optional fallback/router.
- Configurable provider/model per worker.
- Health checks, timeout, retry, circuit breaker and structured worker output.
- Manager audit trail: task, worker, provider, duration, status, summary.

## Delivery rule
Do not merely scaffold placeholders. Build a working vertical slice first:
1. live/replay market feed
2. normalized trades/order book
3. footprint + delta/CVD
4. volume profile + VWAP + EMA9
5. DOM + heatmap
6. big-trade detection
7. GEX adapter/calculator interface
8. AI manager workspace
9. tests
10. documentation

Before declaring a feature complete, verify it against representative simulated data and existing tests.