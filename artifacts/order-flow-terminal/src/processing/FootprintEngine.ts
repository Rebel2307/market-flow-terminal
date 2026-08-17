import type { FootprintRow, Trade } from "../data/types";

/**
 * Aggregates executed trades into price levels. In a footprint, aggressive
 * sells are represented as bid volume and aggressive buys as ask volume.
 */
export class FootprintEngine {
  private readonly levels = new Map<number, FootprintRow>();
  private readonly precision: number;

  constructor(precision = 2) {
    this.precision = precision;
  }

  addTrade(trade: Trade): FootprintRow {
    const price = this.roundPrice(trade.price);
    const current = this.levels.get(price) ?? {
      price,
      bidVolume: 0,
      askVolume: 0,
      delta: 0,
      totalVolume: 0,
    };

    if (trade.side === "BUY") {
      current.askVolume += trade.quantity;
    } else if (trade.side === "SELL") {
      current.bidVolume += trade.quantity;
    }
    current.delta = current.askVolume - current.bidVolume;
    current.totalVolume = current.askVolume + current.bidVolume;
    this.levels.set(price, current);
    return { ...current };
  }

  rows(limit = 18): FootprintRow[] {
    return [...this.levels.values()]
      .sort((a, b) => b.price - a.price)
      .slice(0, limit)
      .map((row) => ({ ...row }));
  }

  clear(): void {
    this.levels.clear();
  }

  private roundPrice(price: number): number {
    const factor = 10 ** this.precision;
    return Math.round(price * factor) / factor;
  }
}