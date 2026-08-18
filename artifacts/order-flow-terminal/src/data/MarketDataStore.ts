import { TradeProcessor } from "../processing/TradeProcessor";
import type {
  Candle,
  ConnectionState,
  DataQuality,
  KlineInterval,
  MarketDataState,
  StreamStatus,
  Trade,
} from "./types";

type StoreListener = (state: MarketDataState) => void;

function emptyQuality(): DataQuality {
  return {
    connection: "CONNECTING",
    wsStatus: "CONNECTING",
    connectionTime: null,
    lastReceivedEventTime: null,
    lastMessageTimestamp: null,
    estimatedReceiveLatencyMs: null,
    eventCount: 0,
    droppedEvents: 0,
    reconnectCount: 0,
    trades: "NOT_CONNECTED",
    candles: "NOT_CONNECTED",
    footprint: "NOT_CONNECTED",
    deltaCvd: "NOT_CONNECTED",
  };
}

function emptyState(timeframe: KlineInterval): MarketDataState {
  const processor = new TradeProcessor().snapshot();
  return {
    timeframe,
    lastPrice: null,
    trades: [],
    candles: [],
    footprint: [],
    processor,
    dataQuality: emptyQuality(),
  };
}

/**
 * The single source of truth for all market-data panels. Stream callbacks
 * mutate this store synchronously; listeners are notified at most once per
 * animation frame so high-frequency trades do not rerender the whole shell.
 */
export class MarketDataStore {
  readonly processor: TradeProcessor;
  private state: MarketDataState;
  private readonly listeners = new Set<StoreListener>();
  private readonly maxCandles = 120;
  private notifyHandle: number | null = null;
  private notifyPending = false;

  constructor(timeframe: KlineInterval = "5m") {
    this.processor = new TradeProcessor();
    this.state = emptyState(timeframe);
    this.state.processor = this.processor.snapshot();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  handleStatus(status: StreamStatus): void {
    this.state.dataQuality = {
      ...this.state.dataQuality,
      connection: status.connection,
      wsStatus: status.wsStatus,
      connectionTime: status.connectionTime,
      lastReceivedEventTime: status.lastReceivedEventTime,
      lastMessageTimestamp: status.lastMessageTimestamp,
      estimatedReceiveLatencyMs: status.estimatedReceiveLatencyMs,
      reconnectCount: status.reconnectCount,
      reason: status.reason,
    };
    this.refreshModuleQuality();
    this.scheduleNotify();
  }

  handleTrade(trade: Trade): void {
    const processor = this.processor.process(trade);
    this.state.processor = processor;
    this.state.lastPrice = trade.price;
    this.state.trades = this.processor.trades();
    this.state.footprint = this.processor.footprint.rows();
    this.state.dataQuality = {
      ...this.state.dataQuality,
      eventCount: processor.tradeCount,
    };
    this.refreshModuleQuality();
    this.scheduleNotify();
  }

  handleCandle(candle: Candle): void {
    const index = this.state.candles.findIndex(
      (item) => item.startTime === candle.startTime,
    );
    if (index === -1) {
      this.state.candles = [...this.state.candles, candle].slice(
        -this.maxCandles,
      );
    } else {
      const next = [...this.state.candles];
      next[index] = candle;
      this.state.candles = next;
    }
    this.refreshModuleQuality();
    this.scheduleNotify();
  }

  resetCandles(): void {
    this.state.candles = [];
    this.refreshModuleQuality();
    this.scheduleNotify();
  }

  setTimeframe(timeframe: KlineInterval): void {
    this.state.timeframe = timeframe;
    this.resetCandles();
  }

  clearSession(): void {
    this.processor.reset();
    this.state.lastPrice = null;
    this.state.trades = [];
    this.state.footprint = [];
    this.state.processor = this.processor.snapshot();
    this.state.dataQuality = {
      ...this.state.dataQuality,
      eventCount: 0,
      droppedEvents: 0,
    };
    this.refreshModuleQuality();
    this.scheduleNotify();
  }

  markDroppedEvent(): void {
    this.state.dataQuality = {
      ...this.state.dataQuality,
      droppedEvents: this.state.dataQuality.droppedEvents + 1,
    };
    this.scheduleNotify();
  }

  snapshot(): MarketDataState {
    return {
      ...this.state,
      trades: this.state.trades.map((trade) => ({ ...trade })),
      candles: this.state.candles.map((candle) => ({ ...candle })),
      footprint: this.state.footprint.map((row) => ({ ...row })),
      processor: {
        ...this.state.processor,
        lastTrade: this.state.processor.lastTrade
          ? { ...this.state.processor.lastTrade }
          : null,
        currentDeltaBar: this.state.processor.currentDeltaBar
          ? { ...this.state.processor.currentDeltaBar }
          : null,
        deltaBars: this.state.processor.deltaBars.map((bar) => ({ ...bar })),
      },
      dataQuality: { ...this.state.dataQuality },
    };
  }

  private refreshModuleQuality(): void {
    const connection = this.state.dataQuality.connection;
    const stateFor = (hasData: boolean) => {
      if (!hasData) return "NOT_CONNECTED" as const;
      return connection === "LIVE" ? "LIVE" : "STALE";
    };
    this.state.dataQuality = {
      ...this.state.dataQuality,
      trades: stateFor(this.state.processor.tradeCount > 0),
      candles: stateFor(this.state.candles.length > 0),
      footprint: stateFor(this.state.footprint.length > 0),
      deltaCvd: stateFor(this.state.processor.deltaBars.length > 0),
    };
  }

  private scheduleNotify(): void {
    this.notifyPending = true;
    if (this.notifyHandle !== null) return;

    const flush = () => {
      this.notifyHandle = null;
      if (!this.notifyPending) return;
      this.notifyPending = false;
      const next = this.snapshot();
      for (const listener of this.listeners) listener(next);
    };

    this.notifyHandle =
      typeof window !== "undefined" && "requestAnimationFrame" in window
        ? window.requestAnimationFrame(flush)
        : (globalThis as unknown as Window).setTimeout(flush, 16);
  }
}