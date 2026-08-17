export type TradeSide = "BUY" | "SELL" | "UNKNOWN";

export interface Trade {
  id: number;
  timestamp: number;
  price: number;
  quantity: number;
  side: TradeSide;
}

export type ConnectionState = "LIVE" | "CONNECTING" | "DISCONNECTED";
export type WebSocketState = "CONNECTED" | "CONNECTING" | "DISCONNECTED";

export interface StreamStatus {
  connection: ConnectionState;
  wsStatus: WebSocketState;
  reconnectCount: number;
  reason?: string;
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
}

export interface ProcessorSnapshot {
  lastTrade: Trade | null;
  tradeCount: number;
  runningBuyVolume: number;
  runningSellVolume: number;
  runningDelta: number;
  messagesPerSecond: number;
  processingLatencyMs: number;
}