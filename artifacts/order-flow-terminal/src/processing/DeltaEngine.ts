import type { DeltaBar, Trade } from "../data/types";

/**
 * Keeps the running delta and time-bucketed delta bars. A trade's contribution
 * is positive for an aggressive buy and negative for an aggressive sell.
 */
export class DeltaEngine {
  private cumulativeDelta = 0;
  private currentBar: DeltaBar | null = null;
  private readonly barSizeMs: number;
  private readonly completedBars: DeltaBar[] = [];

  constructor(barSizeMs = 60_000) {
    this.barSizeMs = barSizeMs;
  }

  addTrade(trade: Trade): DeltaBar | null {
    if (trade.side === "UNKNOWN") return null;
    const start = Math.floor(trade.timestamp / this.barSizeMs) * this.barSizeMs;
    if (!this.currentBar || this.currentBar.start !== start) {
      if (this.currentBar) this.completedBars.push({ ...this.currentBar });
      this.currentBar = {
        start,
        end: start + this.barSizeMs,
        delta: 0,
        buyVolume: 0,
        sellVolume: 0,
      };
    }

    if (trade.side === "BUY") {
      this.currentBar.buyVolume += trade.quantity;
      this.currentBar.delta += trade.quantity;
      this.cumulativeDelta += trade.quantity;
    } else {
      this.currentBar.sellVolume += trade.quantity;
      this.currentBar.delta -= trade.quantity;
      this.cumulativeDelta -= trade.quantity;
    }
    return { ...this.currentBar };
  }

  get cumulative(): number {
    return this.cumulativeDelta;
  }

  get current(): DeltaBar | null {
    return this.currentBar ? { ...this.currentBar } : null;
  }

  bars(limit = 12): DeltaBar[] {
    return [...this.completedBars, ...(this.currentBar ? [this.currentBar] : [])]
      .slice(-limit)
      .map((bar) => ({ ...bar }));
  }

  reset(): void {
    this.cumulativeDelta = 0;
    this.currentBar = null;
    this.completedBars.length = 0;
  }
}