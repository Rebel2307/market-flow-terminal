import type { ProcessorSnapshot, Trade } from "../data/types";
import { DeltaEngine } from "./DeltaEngine";
import { FootprintEngine } from "./FootprintEngine";

export interface TradeProcessorOptions {
  footprint?: FootprintEngine;
  delta?: DeltaEngine;
  maxTrades?: number;
}

/**
 * Coordinates pure processing engines. It does not know about WebSocket APIs
 * or DOM/React rendering, which keeps live data and presentation testable.
 */
export class TradeProcessor {
  readonly footprint: FootprintEngine;
  readonly delta: DeltaEngine;
  private readonly maxTrades: number;
  private readonly recentTrades: Trade[] = [];
  private latest: ProcessorSnapshot = {
    lastTrade: null,
    tradeCount: 0,
    runningBuyVolume: 0,
    runningSellVolume: 0,
    runningDelta: 0,
    messagesPerSecond: 0,
    processingLatencyMs: 0,
    currentDeltaBar: null,
    deltaBars: [],
  };
  private windowStartedAt = performance.now();
  private windowTradeCount = 0;

  constructor(options: TradeProcessorOptions = {}) {
    this.footprint = options.footprint ?? new FootprintEngine();
    this.delta = options.delta ?? new DeltaEngine();
    this.maxTrades = options.maxTrades ?? 200;
  }

  process(trade: Trade): ProcessorSnapshot {
    const startedAt = performance.now();
    this.footprint.addTrade(trade);
    this.delta.addTrade(trade);

    if (trade.side === "BUY") {
      this.latest.runningBuyVolume += trade.quantity;
      this.latest.runningDelta += trade.quantity;
    } else if (trade.side === "SELL") {
      this.latest.runningSellVolume += trade.quantity;
      this.latest.runningDelta -= trade.quantity;
    }
    this.latest.lastTrade = trade;
    this.latest.tradeCount += 1;
    this.recentTrades.unshift(trade);
    if (this.recentTrades.length > this.maxTrades) this.recentTrades.pop();

    this.windowTradeCount += 1;
    const elapsed = performance.now() - this.windowStartedAt;
    if (elapsed >= 1_000) {
      this.latest.messagesPerSecond = Math.round(
        (this.windowTradeCount * 1_000) / elapsed,
      );
      this.windowStartedAt = performance.now();
      this.windowTradeCount = 0;
    }
    this.latest.processingLatencyMs = Number(
      (performance.now() - startedAt).toFixed(2),
    );
    this.latest.currentDeltaBar = this.delta.current;
    this.latest.deltaBars = this.delta.bars();
    return this.snapshot();
  }

  trades(): Trade[] {
    return this.recentTrades.map((trade) => ({ ...trade }));
  }

  snapshot(): ProcessorSnapshot {
    return {
      ...this.latest,
      lastTrade: this.latest.lastTrade ? { ...this.latest.lastTrade } : null,
    };
  }

  reset(): void {
    this.recentTrades.length = 0;
    this.latest = {
      lastTrade: null,
      tradeCount: 0,
      runningBuyVolume: 0,
      runningSellVolume: 0,
      runningDelta: 0,
      messagesPerSecond: 0,
      processingLatencyMs: 0,
      currentDeltaBar: null,
      deltaBars: [],
    };
    this.footprint.clear();
    this.delta.reset();
    this.windowStartedAt = performance.now();
    this.windowTradeCount = 0;
  }
}