export type TradeSide = "BUY" | "SELL" | "UNKNOWN";

export interface Trade {
  id: number;
  timestamp: number;
  eventTimestamp: number;
  price: number;
  quantity: number;
  side: TradeSide;
}

export type ConnectionState =
  | "LIVE"
  | "CONNECTING"
  | "STALE"
  | "DISCONNECTED"
  | "RECONNECTING";
export type WebSocketState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";
export type KlineInterval =
  | "1m"
  | "3m"
  | "5m"
  | "15m"
  | "30m"
  | "1h"
  | "4h"
  | "1d";

export interface StreamStatus {
  connection: ConnectionState;
  wsStatus: WebSocketState;
  reconnectCount: number;
  connectionTime: number | null;
  lastReceivedEventTime: number | null;
  lastMessageTimestamp: number | null;
  estimatedReceiveLatencyMs: number | null;
  reason?: string;
}

export interface Candle {
  startTime: number;
  endTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closed: boolean;
}

export interface FootprintRow {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  totalVolume: number;
}

export interface DeltaBar {
  start: number;
  end: number;
  delta: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  deltaPercent: number;
}

export interface ProcessorSnapshot {
  lastTrade: Trade | null;
  tradeCount: number;
  runningBuyVolume: number;
  runningSellVolume: number;
  runningDelta: number;
  messagesPerSecond: number;
  processingLatencyMs: number;
  currentDeltaBar: DeltaBar | null;
  deltaBars: DeltaBar[];
}

export type ModuleQuality = "LIVE" | "STALE" | "NOT_CONNECTED";

export interface DataQuality {
  connection: ConnectionState;
  wsStatus: WebSocketState;
  connectionTime: number | null;
  lastReceivedEventTime: number | null;
  lastMessageTimestamp: number | null;
  estimatedReceiveLatencyMs: number | null;
  eventCount: number;
  droppedEvents: number;
  reconnectCount: number;
  trades: ModuleQuality;
  candles: ModuleQuality;
  footprint: ModuleQuality;
  deltaCvd: ModuleQuality;
  reason?: string;
}

export interface MarketDataState {
  timeframe: KlineInterval;
  lastPrice: number | null;
  trades: Trade[];
  candles: Candle[];
  footprint: FootprintRow[];
  processor: ProcessorSnapshot;
  dataQuality: DataQuality;
}