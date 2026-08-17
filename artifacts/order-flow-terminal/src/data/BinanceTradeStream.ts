import type { StreamStatus, Trade } from "./types";

type TradeListener = (trade: Trade) => void;
type StatusListener = (status: StreamStatus) => void;

interface BinanceTradePayload {
  e?: unknown;
  E?: unknown;
  s?: unknown;
  t?: unknown;
  p?: unknown;
  q?: unknown;
  T?: unknown;
  m?: unknown;
}

export interface BinanceTradeStreamOptions {
  symbol?: string;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  onTrade?: TradeListener;
  onStatus?: StatusListener;
}

/**
 * Owns the public Binance trade WebSocket and nothing else.
 * It never manufactures market data: malformed frames are ignored and
 * connection state is always reported explicitly to prevent stale "LIVE" UI.
 */
export class BinanceTradeStream {
  private readonly symbol: string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly onTrade?: TradeListener;
  private readonly onStatus?: StatusListener;
  private socket: WebSocket | null = null;
  private reconnectTimer: number | null = null;
  private staleTimer: number | null = null;
  private reconnectAttempt = 0;
  private reconnectCount = 0;
  private stopped = true;

  constructor(options: BinanceTradeStreamOptions = {}) {
    this.symbol = (options.symbol ?? "btcusdt").toLowerCase();
    this.reconnectBaseDelayMs = options.reconnectBaseDelayMs ?? 1_000;
    this.reconnectMaxDelayMs = options.reconnectMaxDelayMs ?? 30_000;
    this.onTrade = options.onTrade;
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

  get reconnects(): number {
    return this.reconnectCount;
  }

  private connect(): void {
    if (this.stopped) return;
    this.emitStatus("CONNECTING", "CONNECTING");

    // Port 443 is the most compatible public endpoint for browser previews
    // and still uses Binance's public trade stream with no credentials.
    const url = `wss://stream.binance.com:443/ws/${this.symbol}@trade`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.reconnectAttempt = 0;
      this.armStaleTimer(socket);
      this.emitStatus("LIVE", "CONNECTED");
    };

    socket.onmessage = (event) => {
      const trade = this.parseTrade(event.data);
      if (trade) {
        this.armStaleTimer(socket);
        this.onTrade?.(trade);
      }
    };

    socket.onerror = () => {
      // onclose is the source of truth for the next reconnect.
      this.emitStatus("DISCONNECTED", "DISCONNECTED", "SOCKET_ERROR");
    };

    socket.onclose = (event) => {
      // A manual reconnect closes the old socket before opening a new one.
      // Ignore that old close event so it cannot schedule a second reconnect.
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearStaleTimer();
      if (this.stopped) return;
      this.reconnectCount += 1;
      this.emitStatus("DISCONNECTED", "DISCONNECTED", `CLOSE_${event.code}`);
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
      this.emitStatus("DISCONNECTED", "DISCONNECTED", "NO_TRADE_DATA");
      socket.close();
    }, 10_000);
  }

  private clearStaleTimer(): void {
    if (this.staleTimer !== null) {
      window.clearTimeout(this.staleTimer);
      this.staleTimer = null;
    }
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
      reason,
    });
  }

  private parseTrade(raw: unknown): Trade | null {
    let payload: BinanceTradePayload;
    try {
      payload =
        typeof raw === "string"
          ? (JSON.parse(raw) as BinanceTradePayload)
          : (raw as BinanceTradePayload);
    } catch {
      return null;
    }

    const id = typeof payload.t === "number" ? payload.t : Number(payload.t);
    const timestamp =
      typeof payload.T === "number" ? payload.T : Number(payload.T);
    const price = typeof payload.p === "number" ? payload.p : Number(payload.p);
    const quantity =
      typeof payload.q === "number" ? payload.q : Number(payload.q);
    if (
      !Number.isFinite(id) ||
      !Number.isFinite(timestamp) ||
      !Number.isFinite(price) ||
      !Number.isFinite(quantity) ||
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
      price,
      quantity,
      side: payload.m ? "SELL" : "BUY",
    };
  }
}