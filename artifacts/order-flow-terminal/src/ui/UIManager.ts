import type { ProcessorSnapshot, StreamStatus } from "../data/types";

export interface UIManagerState {
  stream: StreamStatus;
  processor: ProcessorSnapshot;
  lastUpdate: number | null;
  droppedEvents: number;
  bookSync: "NOT_STARTED" | "NOT_IMPLEMENTED";
  renderingFps: number;
}

type StateListener = (state: UIManagerState) => void;

/**
 * Small framework-agnostic state bridge for the presentation layer. The UI
 * subscribes to this manager instead of subscribing directly to Binance.
 */
export class UIManager {
  private state: UIManagerState;
  private readonly listeners = new Set<StateListener>();
  private frames = 0;
  private frameWindowStartedAt = performance.now();

  constructor() {
    this.state = {
      stream: {
        connection: "CONNECTING",
        wsStatus: "CONNECTING",
        reconnectCount: 0,
        connectionTime: null,
        lastReceivedEventTime: null,
        lastMessageTimestamp: null,
        estimatedReceiveLatencyMs: null,
      },
      processor: {
        lastTrade: null,
        tradeCount: 0,
        runningBuyVolume: 0,
        runningSellVolume: 0,
        runningDelta: 0,
        messagesPerSecond: 0,
        processingLatencyMs: 0,
        currentDeltaBar: null,
        deltaBars: [],
      },
      lastUpdate: null,
      droppedEvents: 0,
      bookSync: "NOT_IMPLEMENTED",
      renderingFps: 0,
    };
  }

  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  setStreamStatus(stream: StreamStatus): void {
    this.state.stream = { ...stream };
    this.emit();
  }

  setProcessorSnapshot(processor: ProcessorSnapshot): void {
    this.state.processor = { ...processor };
    this.state.lastUpdate = Date.now();
    this.frames += 1;
    const elapsed = performance.now() - this.frameWindowStartedAt;
    if (elapsed >= 1_000) {
      this.state.renderingFps = Math.round((this.frames * 1_000) / elapsed);
      this.frames = 0;
      this.frameWindowStartedAt = performance.now();
    }
    this.emit();
  }

  markDroppedEvent(): void {
    this.state.droppedEvents += 1;
    this.emit();
  }

  resetSession(): void {
    this.state.processor = {
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
    this.state.lastUpdate = null;
    this.state.droppedEvents = 0;
    this.frames = 0;
    this.frameWindowStartedAt = performance.now();
    this.emit();
  }

  snapshot(): UIManagerState {
    return {
      ...this.state,
      stream: { ...this.state.stream },
      processor: { ...this.state.processor },
    };
  }

  private emit(): void {
    const next = this.snapshot();
    for (const listener of this.listeners) listener(next);
  }
}