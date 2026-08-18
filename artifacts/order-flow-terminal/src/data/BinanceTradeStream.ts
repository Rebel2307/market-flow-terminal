import type {
  Candle,
  KlineInterval,
  StreamStatus,
  Trade,
} from "./types";

type TradeListener = (trade: Trade) => void;
type CandleListener = (candle: Candle) => void;
type StatusListener = (status: StreamStatus) => void;

interface BinancePayload {
  e?: unknown;
  E?: unknown;
  s?: unknown;
  t?: unknown;
  p?: unknown;
  q?: unknown;
  T?: unknown;
  m?: unknown;
  k?: {
    t?: unknown;
    T?: unknown;
    o?: unknown;
    c?: unknown;
    h?: unknown;
    l?: unknown;
    v?: unknown;
    x?: unknown;
  };
}

interface CombinedPayload {
  stream?: unknown;
  data?: BinancePayload;
}

export interface BinanceTradeStreamOptions {
  symbol?: string;
  interval?: KlineInterval;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  staleAfterMs?: number;
  onTrade?: TradeListener;
  onCandle?: CandleListener;
  onStatus?: StatusListener;
}

const VALID_INTERVALS: readonly KlineInterval[] = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "4h",
  "1d",
];

/**
 * Owns one combined Binance public WebSocket connection for trades and klines.
 * Processing and UI code never open their own market-data connections.
 */
export class BinanceTradeStream {
  private readonly symbol: string;
  private interval: KlineInterval;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly staleAfterMs: number;
  private readonly onTrade?: TradeListener;
  private readonly onCandle?: CandleListener;
  private readonly onStatus?: StatusListener;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private staleTimer: number | null = null;
  private reconnectAttempt = 0;
  private reconnectCount = 0;
  private stopped = true;
  private connectionTime: number | null = null;
  private lastReceivedEventTime: number | null = null;
  private lastMessageTimestamp: number | null = null;
  private estimatedReceiveLatencyMs: number | null = null;

  constructor(options: BinanceTradeStreamOptions = {}) {
    this.symbol = (options.symbol ?? "btcusdt").toLowerCase();
    this.interval = options.interval ?? "5m";
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
    this.staleAfterMs = options.staleAfterMs ?? 15_000;
    this.onTrade = options.onTrade;
    this.onCandle = options.onCandle;
    this.onStatus = options.onStatus;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearStaleTimer();
    this.socket?.close();
    this.socket = null;
  }

  reconnect(): void {
    this.stop();
    this.start();
  }

  setInterval(interval: KlineInterval): void {
    if (!VALID_INTERVALS.includes(interval) || interval === this.interval) {
      return;
    }
    this.interval = interval;
    if (!this.stopped) this.reconnect();
  }

  get currentInterval(): KlineInterval {
    return this.interval;
  }

  get reconnects(): number {
    return this.reconnectCount;
  }

  private connect(): void {
    if (this.stopped) return;
    if (!/^[a-z0-9]{5,20}$/.test(this.symbol)) {
      this.emitStatus("DISCONNECTED", "DISCONNECTED", "INVALID_SYMBOL");
      return;
    }

    this.emitStatus("CONNECTING", "CONNECTING");
    const stream = `${this.symbol}@trade/${this.symbol}@kline_${this.interval}`;
    const url = `wss://stream.binance.com:443/stream?streams=${stream}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.connectionTime = Date.now();
      this.armStaleTimer(socket);
      this.emitStatus("LIVE", "CONNECTED");
    };

    socket.onmessage = (event) => {
      const payload = this.unwrapPayload(event.data);
      if (!payload) return;

      const eventTimestamp = this.toFiniteNumber(payload.E);
      const trade = payload.e === "trade" ? this.parseTrade(payload) : null;
      const candle = payload.e === "kline" ? this.parseCandle(payload) : null;
      if (!trade && !candle) return;

      this.recordMessage(eventTimestamp);
      this.armStaleTimer(socket);
      if (trade) this.onTrade?.(trade);
      if (candle) this.onCandle?.(candle);
    };

    socket.onerror = () => {
      this.emitStatus("DISCONNECTED", "DISCONNECTED", "SOCKET_ERROR");
    };

    socket.onclose = (event) => {
      // Ignore a close callback from a socket replaced by manual reconnect.
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearStaleTimer();
      if (this.stopped) return;
      this.reconnectCount += 1;
      this.emitStatus("RECONNECTING", "DISCONNECTED", `CLOSE_${event.code}`);
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer !== null) return;
    const delay = Math.min(
      this.reconnectBaseDelayMs * 2 ** this.reconnectAttempt,
      this.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private armStaleTimer(socket: WebSocket): void {
    this.clearStaleTimer();
    this.staleTimer = window.setTimeout(() => {
      if (this.stopped || this.socket !== socket) return;
      this.emitStatus("STALE", "CONNECTED", "NO_MARKET_DATA");
      socket.close();
    }, this.staleAfterMs);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== null) {
      window.clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private recordMessage(eventTimestamp: number | null): void {
    const receivedAt = Date.now();
    this.lastReceivedEventTime = receivedAt;
    this.lastMessageTimestamp = eventTimestamp;
    this.estimatedReceiveLatencyMs =
      eventTimestamp === null
        ? null
        : Math.max(0, receivedAt - eventTimestamp);
    this.emitStatus("LIVE", "CONNECTED");
  }

  private emitStatus(
    connection: StreamStatus["connection"],
    wsStatus: StreamStatus["wsStatus"],
    reason?: string,
  ): void {
    this.onStatus?.({
      connection,
      wsStatus,
      reconnectCount: this.reconnectCount,
      connectionTime: this.connectionTime,
      lastReceivedEventTime: this.lastReceivedEventTime,
      lastMessageTimestamp: this.lastMessageTimestamp,
      estimatedReceiveLatencyMs: this.estimatedReceiveLatencyMs,
      reason,
    });
  }

  private unwrapPayload(raw: unknown): BinancePayload | null {
    let parsed: BinancePayload | CombinedPayload;
    try {
      parsed =
        typeof raw === "string"
          ? (JSON.parse(raw) as BinancePayload | CombinedPayload)
          : (raw as BinancePayload | CombinedPayload);
    } catch {
      return null;
    }

    if (
      parsed &&
      typeof parsed === "object" &&
      "data" in parsed &&
      parsed.data &&
      typeof parsed.data === "object"
    ) {
      return parsed.data;
    }
    return parsed as BinancePayload;
  }

  private parseTrade(payload: BinancePayload): Trade | null {
    const id = this.toFiniteNumber(payload.t);
    const timestamp = this.toFiniteNumber(payload.T);
    const eventTimestamp = this.toFiniteNumber(payload.E);
    const price = this.toFiniteNumber(payload.p);
    const quantity = this.toFiniteNumber(payload.q);
    if (
      id === null ||
      timestamp === null ||
      eventTimestamp === null ||
      price === null ||
      quantity === null ||
      quantity <= 0 ||
      (payload.m !== true && payload.m !== false)
    ) {
      return null;
    }

    // Binance's `m` means "buyer is market maker". When true, the taker
    // aggressor is selling; otherwise the aggressor is buying.
    return {
      id,
      timestamp,
      eventTimestamp,
      price,
      quantity,
      side: payload.m ? "SELL" : "BUY",
    };
  }

  private parseCandle(payload: BinancePayload): Candle | null {
    const kline = payload.k;
    if (!kline) return null;
    const startTime = this.toFiniteNumber(kline.t);
    const endTime = this.toFiniteNumber(kline.T);
    const open = this.toFiniteNumber(kline.o);
    const high = this.toFiniteNumber(kline.h);
    const low = this.toFiniteNumber(kline.l);
    const close = this.toFiniteNumber(kline.c);
    const volume = this.toFiniteNumber(kline.v);
    if (
      startTime === null ||
      endTime === null ||
      open === null ||
      high === null ||
      low === null ||
      close === null ||
      volume === null
    ) {
      return null;
    }
    return {
      startTime,
      endTime,
      open,
      high,
      low,
      close,
      volume,
      closed: kline.x === true,
    };
  }

  private toFiniteNumber(value: unknown): number | null {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? number : null;
  }
}