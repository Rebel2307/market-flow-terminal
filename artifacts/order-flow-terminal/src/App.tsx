import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Database,
  Gauge,
  Layers3,
  Pause,
  Play,
  Radio,
  RefreshCw,
  ScanSearch,
  Settings2,
  Signal,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { BinanceTradeStream } from './data/BinanceTradeStream';
import { MarketDataStore } from './data/MarketDataStore';
import type { Candle, DeltaBar, KlineInterval, MarketDataState, Trade as StreamTrade } from './data/types';

const queryClient = new QueryClient();

export type Trade = {
  id: string | number;
  timestamp: number | string;
  price: number;
  quantity: number;
  side: 'BUY' | 'SELL' | 'UNKNOWN';
};

export type FootprintRow = {
  price: number;
  bidVolume: number;
  askVolume: number;
  delta: number;
  totalVolume: number;
};

export type Status = {
  connection: 'LIVE' | 'CONNECTING' | 'STALE' | 'DISCONNECTED' | 'RECONNECTING';
  wsStatus: string;
  eventCount: number;
  droppedEvents: number;
  reconnectCount: number;
  bookSync: string;
  lastUpdate: number | string | null;
  messagesPerSecond: number;
  processingLatency: number;
  renderingFps: number;
  connectionTime: number | null;
  lastReceivedEventTime: number | null;
  lastMessageTimestamp: number | null;
  estimatedReceiveLatencyMs: number | null;
  tradesQuality: 'LIVE' | 'STALE' | 'NOT_CONNECTED';
  candlesQuality: 'LIVE' | 'STALE' | 'NOT_CONNECTED';
  footprintQuality: 'LIVE' | 'STALE' | 'NOT_CONNECTED';
  deltaCvdQuality: 'LIVE' | 'STALE' | 'NOT_CONNECTED';
  streamReason?: string;
};

export type DeltaSummary = {
  runningBuyVolume: number;
  runningSellVolume: number;
  runningDelta: number;
  cumulativeDelta: number;
  currentBar: DeltaBar | null;
  bars: DeltaBar[];
};

export type OrderFlowTerminalProps = {
  trades?: Trade[];
  footprint?: FootprintRow[];
  status?: Partial<Status> & Pick<Status, 'connection'>;
  delta?: Partial<DeltaSummary>;
  candles?: Candle[];
  timeframe?: KlineInterval;
  lastPrice?: number | null;
  onReconnect?: () => void;
  onClearSession?: () => void;
  onTimeframeChange?: (value: KlineInterval) => void;
};

const emptyStatus: Status = {
  connection: 'DISCONNECTED',
  wsStatus: 'No socket',
  eventCount: 0,
  droppedEvents: 0,
  reconnectCount: 0,
  bookSync: 'Not available',
  lastUpdate: null,
  messagesPerSecond: 0,
  processingLatency: 0,
  renderingFps: 0,
  connectionTime: null,
  lastReceivedEventTime: null,
  lastMessageTimestamp: null,
  estimatedReceiveLatencyMs: null,
  tradesQuality: 'NOT_CONNECTED',
  candlesQuality: 'NOT_CONNECTED',
  footprintQuality: 'NOT_CONNECTED',
  deltaCvdQuality: 'NOT_CONNECTED',
  streamReason: undefined,
};

const emptyDelta: DeltaSummary = {
  runningBuyVolume: 0,
  runningSellVolume: 0,
  runningDelta: 0,
  cumulativeDelta: 0,
  currentBar: null,
  bars: [],
};

function formatPrice(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatVolume(value?: number | null) {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

function formatMetric(value?: number | null, suffix = '') {
  if (value === undefined || value === null || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}${suffix}`;
}

function formatTime(value?: number | string | null) {
  if (value === undefined || value === null) return '—';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour12: false });
}

function connectionMeta(connection: Status['connection']) {
  if (connection === 'LIVE') {
    return { label: 'LIVE', className: 'live', icon: Signal, detail: 'Receiving public trades' };
  }
  if (connection === 'CONNECTING') {
    return { label: 'CONNECTING', className: 'connecting', icon: RefreshCw, detail: 'Negotiating stream' };
  }
  if (connection === 'RECONNECTING') {
    return { label: 'RECONNECTING', className: 'connecting', icon: RefreshCw, detail: 'Restoring market data' };
  }
  if (connection === 'STALE') {
    return { label: 'STALE', className: 'connecting', icon: WifiOff, detail: 'No recent market data' };
  }
  return { label: 'DISCONNECTED', className: 'disconnected', icon: WifiOff, detail: 'No market data' };
}

function SectionTitle({
  icon: Icon,
  label,
  detail,
  action,
}: {
  icon: typeof Activity;
  label: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="panel-header flex items-center justify-between gap-3 px-3">
      <div className="flex min-w-0 items-center gap-2">
        <Icon size={14} strokeWidth={1.7} className="text-[hsl(var(--primary))]" />
        <span className="panel-kicker truncate text-[hsl(var(--foreground))]">{label}</span>
        {detail ? <span className="hidden text-[10px] text-[hsl(var(--muted-foreground))] sm:inline">{detail}</span> : null}
      </div>
      {action}
    </div>
  );
}

function EmptyPanel({
  title,
  detail,
  icon: Icon = Database,
  className = '',
}: {
  title: string;
  detail: string;
  icon?: typeof Database;
  className?: string;
}) {
  return (
    <div className={`placeholder-grid flex min-h-[150px] flex-col items-center justify-center px-6 text-center ${className}`}>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background)/.6)] text-[hsl(var(--muted-foreground))]">
        <Icon size={16} strokeWidth={1.5} />
      </div>
      <p className="text-xs font-semibold tracking-wide text-[hsl(var(--foreground)/.78)]">{title}</p>
      <p className="mt-1 max-w-[260px] text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">{detail}</p>
    </div>
  );
}

function Header({
  status,
  lastPrice,
  streamPaused,
  onToggleStream,
  onReconnect,
}: {
  status: Status;
  lastPrice?: number | null;
  streamPaused: boolean;
  onToggleStream: () => void;
  onReconnect?: () => void;
}) {
  const meta = connectionMeta(status.connection);
  const StatusIcon = meta.icon;
  const isLive = status.connection === 'LIVE' && !streamPaused;
  const visualClass = streamPaused && status.connection === 'LIVE' ? 'connecting' : meta.className;

  return (
    <header className="sticky top-0 z-30 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/.94)] backdrop-blur-xl">
      <div className="mx-auto flex min-h-[66px] max-w-[1800px] items-center gap-3 px-3 py-2 sm:gap-5 sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center border border-[hsl(var(--primary)/.45)] bg-[hsl(var(--primary)/.08)] text-[hsl(var(--primary))]">
            <Activity size={18} strokeWidth={1.8} />
            <span className="absolute -bottom-px -right-px h-1.5 w-1.5 bg-[hsl(var(--accent))]" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[13px] font-extrabold tracking-[.03em] text-[hsl(var(--foreground))]">OUR ORDER FLOW</h1>
              <span className="hidden border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[9px] text-[hsl(var(--muted-foreground))] sm:inline">TERMINAL / 01</span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">Public market observability</p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 sm:gap-4">
          <div className="hidden text-right sm:block">
            <p className="panel-kicker">BTC / USDT</p>
            <p data-testid="text-last-price" className="mono text-[15px] font-medium text-[hsl(var(--foreground))]">
              {formatPrice(lastPrice)}
            </p>
          </div>
          <div className="hidden items-center gap-4 border-l border-[hsl(var(--border))] pl-4 lg:flex">
            <HeaderMetric label="Binance" value="PUBLIC" />
            <HeaderMetric label="Latency" value={formatMetric(status.processingLatency, ' ms')} />
            <HeaderMetric label="Book sync" value={status.bookSync} />
            <HeaderMetric label="Events" value={formatMetric(status.eventCount)} />
          </div>
          <div data-testid="status-connection" className={`flex items-center gap-2 border px-2.5 py-2 transition-colors duration-300 ${visualClass === 'live' ? 'border-[hsl(var(--primary)/.35)] bg-[hsl(var(--primary)/.07)]' : visualClass === 'connecting' ? 'border-[hsl(var(--accent)/.35)] bg-[hsl(var(--accent)/.07)]' : 'border-[hsl(var(--destructive)/.35)] bg-[hsl(var(--destructive)/.07)]'}`}>
            <span className={`status-dot ${visualClass}`} />
            <span className={`hidden font-mono text-[10px] font-medium tracking-[.1em] sm:inline ${visualClass === 'live' ? 'text-[hsl(var(--primary))]' : visualClass === 'connecting' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--destructive))]'}`}>{streamPaused && status.connection === 'LIVE' ? 'PAUSED' : meta.label}</span>
            <StatusIcon size={13} className={`sm:hidden ${visualClass === 'live' ? 'text-[hsl(var(--primary))]' : visualClass === 'connecting' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--destructive))]'}`} />
          </div>
          <button
            type="button"
            data-testid="button-toggle-stream"
            onClick={onToggleStream}
            title={streamPaused ? 'Resume stream view' : 'Pause stream view'}
            className="flex h-9 w-9 items-center justify-center border border-[hsl(var(--border))] bg-[hsl(var(--card)/.6)] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--primary)/.5)] hover:text-[hsl(var(--primary))]"
          >
            {streamPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          {status.connection !== 'LIVE' ? (
            <button type="button" data-testid="button-reconnect" onClick={onReconnect} className="hidden items-center gap-1.5 border border-[hsl(var(--border))] px-2.5 py-2 font-mono text-[10px] uppercase tracking-[.08em] text-[hsl(var(--foreground)/.75)] transition-colors hover:border-[hsl(var(--primary)/.5)] hover:text-[hsl(var(--primary))] sm:flex">
              <RefreshCw size={12} /> Reconnect
            </button>
          ) : null}
        </div>
      </div>
      <div className={`h-px w-full transition-all duration-500 ${isLive ? 'bg-[hsl(var(--primary)/.5)]' : meta.className === 'connecting' ? 'bg-[hsl(var(--accent)/.5)]' : 'bg-[hsl(var(--destructive)/.45)]'}`} />
    </header>
  );
}

function HeaderMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <p className="panel-kicker text-[9px]">{label}</p>
      <p className="mono mt-1 text-[10px] text-[hsl(var(--foreground)/.75)]">{value}</p>
    </div>
  );
}

function InstrumentBar({
  windowSize,
  onWindowChange,
}: {
  windowSize: string;
  onWindowChange: (value: string) => void;
}) {
  const windows: KlineInterval[] = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'];
  return (
    <div className="flex min-h-10 flex-wrap items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-3 py-2 sm:px-4">
      <div className="flex items-center gap-2">
        <span className="panel-kicker">Workspace</span>
        <ChevronDown size={12} className="text-[hsl(var(--muted-foreground))]" />
         <span className="font-mono text-[11px] text-[hsl(var(--foreground)/.75)]">BTCUSDT · trade + kline</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="mr-2 hidden font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))] sm:inline">Aggregation</span>
        {windows.map((item) => (
          <button type="button" data-testid={`button-window-${item}`} key={item} onClick={() => onWindowChange(item)} className={`px-2 py-1 font-mono text-[10px] transition-colors ${windowSize === item ? 'bg-[hsl(var(--primary)/.14)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--elevate-1))] hover:text-[hsl(var(--foreground))]'}`}>
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function PriceWorkspace({ lastPrice, candles, windowSize, onWindowChange }: { lastPrice?: number | null; candles: Candle[]; windowSize: KlineInterval; onWindowChange: (value: KlineInterval) => void }) {
  return (
    <section className="panel overflow-hidden">
      <InstrumentBar windowSize={windowSize} onWindowChange={onWindowChange} />
      <div className="grid gap-px bg-[hsl(var(--border))] lg:grid-cols-[minmax(0,1fr)_210px]">
        <div className="min-h-[310px] bg-[hsl(var(--card))]">
          <div className="flex items-center justify-between px-3 py-2 sm:px-4">
            <div>
              <p className="panel-kicker">Price / structure</p>
              <p className="mt-1 mono text-xl font-medium tracking-[-.04em] text-[hsl(var(--foreground))]">{formatPrice(lastPrice)} <span className="font-sans text-[10px] font-normal tracking-normal text-[hsl(var(--muted-foreground))]">USDT</span></p>
            </div>
            <div className="text-right">
              <p className="panel-kicker">Last print</p>
              <p data-testid="text-price-state" className="mt-1 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{lastPrice === undefined || lastPrice === null ? 'Awaiting trade event' : 'Current'}</p>
            </div>
          </div>
           <div className="relative mx-3 mb-3 sm:mx-4">
             {candles.length === 0 ? (
               <EmptyPanel title="Candlestick series not connected" detail="OHLC bars will render here when the public kline stream supplies candles." icon={BarChart3} className="min-h-[226px]" />
             ) : (
               <CandleChart candles={candles} />
             )}
             <span className="absolute right-2 top-2 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">PRICE SCALE</span>
             <span className="absolute bottom-2 left-2 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">TIME SCALE · UTC</span>
             {candles.length === 0 ? (
               <>
                 <span className="pointer-events-none absolute left-[18%] right-[15%] top-[46%] border-t border-dashed border-[hsl(var(--accent)/.45)]" />
                 <span className="absolute left-[18%] top-[46%] -translate-y-3 bg-[hsl(var(--card))] px-1 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--accent)/.8)]">VWAP · pending</span>
               </>
             ) : null}
           </div>
        </div>
        <div className="grid grid-cols-2 gap-px bg-[hsl(var(--border))] lg:grid-cols-1">
          <MiniPlaceholder label="VWAP" detail="Awaiting candles" />
          <MiniPlaceholder label="Volume profile" detail="Awaiting trades" />
          <MiniPlaceholder label="Liquidity heatmap" detail="Book feed pending" className="col-span-2 lg:col-span-1" />
        </div>
      </div>
    </section>
  );
}

function CandleChart({ candles }: { candles: Candle[] }) {
  const visible = candles.slice(-42);
  const low = Math.min(...visible.map((candle) => candle.low));
  const high = Math.max(...visible.map((candle) => candle.high));
  const range = Math.max(high - low, 0.01);
  const latest = visible[visible.length - 1];

  return (
    <div className="placeholder-grid relative min-h-[226px] overflow-hidden px-2 pb-5 pt-4">
      <div className="absolute left-3 top-2 z-10 flex gap-3 font-mono text-[8px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">
        <span>O {formatPrice(latest.open)}</span>
        <span>H {formatPrice(latest.high)}</span>
        <span>L {formatPrice(latest.low)}</span>
        <span>C {formatPrice(latest.close)}</span>
        <span>V {formatVolume(latest.volume)}</span>
      </div>
      <div className="flex h-[190px] items-stretch gap-1">
        {visible.map((candle) => {
          const wickTop = ((high - candle.high) / range) * 100;
          const wickHeight = Math.max(((candle.high - candle.low) / range) * 100, 1);
          const bodyTop = ((high - Math.max(candle.open, candle.close)) / range) * 100;
          const bodyHeight = Math.max((Math.abs(candle.close - candle.open) / range) * 100, 1.5);
          const positive = candle.close >= candle.open;
          const volumeHeight = Math.min(30, (candle.volume / Math.max(...visible.map((item) => item.volume), 1)) * 30);
          return (
            <div key={candle.startTime} className="relative min-w-0 flex-1">
              <span className={`absolute left-1/2 w-px -translate-x-1/2 ${positive ? 'bg-[hsl(var(--primary)/.8)]' : 'bg-[hsl(var(--destructive)/.8)]'}`} style={{ top: `${wickTop}%`, height: `${wickHeight}%` }} />
              <span className={`absolute left-[18%] right-[18%] ${positive ? 'bg-[hsl(var(--primary)/.9)]' : 'bg-[hsl(var(--destructive)/.9)]'}`} style={{ top: `${bodyTop}%`, height: `${bodyHeight}%` }} />
              <span className={`absolute bottom-0 left-[15%] right-[15%] ${positive ? 'bg-[hsl(var(--primary)/.18)]' : 'bg-[hsl(var(--destructive)/.18)]'}`} style={{ height: `${volumeHeight}px` }} />
            </div>
          );
        })}
      </div>
      <span className="absolute right-2 top-2 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">PRICE SCALE</span>
      <span className="absolute bottom-2 left-2 font-mono text-[8px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">TIME SCALE · UTC</span>
    </div>
  );
}

function MiniPlaceholder({ label, detail, className = '' }: { label: string; detail: string; className?: string }) {
  return (
    <div className={`heatmap-placeholder flex min-h-[98px] flex-col justify-end p-3 ${className}`}>
      <div className="mb-auto flex items-start justify-between">
        <span className="panel-kicker">{label}</span>
        <span className="h-1.5 w-1.5 bg-[hsl(var(--border))]" />
      </div>
      <p className="font-mono text-[10px] text-[hsl(var(--muted-foreground))]">{detail}</p>
      <div className="mt-2 h-px w-2/3 bg-[hsl(var(--border))]" />
    </div>
  );
}

function DomPanel() {
  return (
    <section className="panel overflow-hidden">
      <SectionTitle icon={BookOpen} label="DOM / order book" detail="L2 depth" action={<span className="border border-[hsl(var(--accent)/.3)] bg-[hsl(var(--accent)/.06)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--accent))]">Not live</span>} />
      <div className="grid grid-cols-2 gap-px bg-[hsl(var(--border))]">
        <div className="bg-[hsl(var(--card))] p-3">
          <p className="panel-kicker text-[hsl(var(--destructive)/.85)]">Bid price</p>
          <p className="mono mt-2 text-sm text-[hsl(var(--muted-foreground))]">—</p>
          <p className="mt-2 panel-kicker text-[hsl(var(--destructive)/.85)]">Bid size</p>
          <p className="mono mt-2 text-sm text-[hsl(var(--muted-foreground))]">—</p>
        </div>
        <div className="bg-[hsl(var(--card))] p-3 text-right">
          <p className="panel-kicker text-[hsl(var(--primary)/.85)]">Ask price</p>
          <p className="mono mt-2 text-sm text-[hsl(var(--muted-foreground))]">—</p>
          <p className="mt-2 panel-kicker text-[hsl(var(--primary)/.85)]">Ask size</p>
          <p className="mono mt-2 text-sm text-[hsl(var(--muted-foreground))]">—</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-px border-t border-[hsl(var(--border))] bg-[hsl(var(--border))]">
        <div className="bg-[hsl(var(--card))] p-3">
          <p className="panel-kicker">Spread</p>
          <p className="mono mt-1 text-sm text-[hsl(var(--muted-foreground))]">—</p>
        </div>
        <div className="bg-[hsl(var(--card))] p-3">
          <p className="panel-kicker">Depth imbalance</p>
          <p className="mono mt-1 text-sm text-[hsl(var(--muted-foreground))]">—</p>
        </div>
      </div>
      <EmptyPanel title="Order book adapter pending" detail="Bid / ask levels will appear once book synchronization is available. No depth is inferred from trades." icon={Layers3} className="min-h-[118px]" />
    </section>
  );
}

function TradesPanel({ trades, connection }: { trades: Trade[]; connection: Status['connection'] }) {
  const latestTrades = useMemo(() => [...trades].sort((a, b) => Number(b.timestamp) - Number(a.timestamp)).slice(0, 40), [trades]);
  const streamLabel = connection === 'LIVE' ? 'stream' : connection === 'CONNECTING' ? 'waiting' : 'disconnected';
  return (
    <section className="panel min-h-[390px] overflow-hidden">
      <SectionTitle icon={Zap} label="Time & sales" detail={`${trades.length} events in buffer`} action={<span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]"><span className={`status-dot ${connectionMeta(connection).className}`} /> {streamLabel}</span>} />
      {latestTrades.length === 0 ? (
        <EmptyPanel title="Listening for public trades" detail="Every received aggTrade will be timestamped and classified here. Unknown side remains explicitly unknown." icon={Radio} className="min-h-[338px]" />
      ) : (
        <div className="overflow-x-auto">
          <div className="grid min-w-[360px] grid-cols-[72px_1fr_1fr_72px] border-b border-[hsl(var(--border))] px-3 py-2 font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
            <span>Time</span><span className="text-right">Price</span><span className="text-right">Qty</span><span className="text-right">Side</span>
          </div>
          <div className="min-w-[360px]">
            {latestTrades.map((trade, index) => (
              <div data-testid={`row-trade-${trade.id}`} key={trade.id} className="trade-row grid grid-cols-[72px_1fr_1fr_72px] border-b border-[hsl(var(--border)/.65)] px-3 py-2 font-mono text-[11px] last:border-0" style={{ animationDelay: `${Math.min(index, 10) * 18}ms` }}>
                <span className="text-[hsl(var(--muted-foreground))]">{formatTime(trade.timestamp)}</span>
                <span className={`text-right ${trade.side === 'BUY' ? 'text-[hsl(var(--primary))]' : trade.side === 'SELL' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{formatPrice(trade.price)}</span>
                <span className="text-right text-[hsl(var(--foreground)/.78)]">{formatVolume(trade.quantity)}</span>
                <span className={`text-right text-[10px] font-medium ${trade.side === 'BUY' ? 'text-[hsl(var(--primary))]' : trade.side === 'SELL' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>{trade.side}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function FootprintPanel({ footprint }: { footprint: FootprintRow[] }) {
  const maxVolume = Math.max(...footprint.map((row) => Math.abs(row.delta)), 1);
  return (
    <section className="panel overflow-hidden">
      <SectionTitle icon={ScanSearch} label="Footprint" detail="price × executed volume" action={<span className="font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Bid × ask</span>} />
      {footprint.length === 0 ? (
        <EmptyPanel title="No footprint rows yet" detail="Price-level aggregation will populate from the incoming trade stream. This panel does not synthesize levels." icon={ScanSearch} className="min-h-[338px]" />
      ) : (
        <div className="overflow-x-auto p-3">
          <div className="min-w-[420px]">
            <div className="grid grid-cols-[1fr_82px_82px_74px] gap-2 border-b border-[hsl(var(--border))] px-2 pb-2 font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
              <span>Price</span><span className="text-right">Bid</span><span className="text-right">Ask</span><span className="text-right">Delta</span>
            </div>
            {footprint.map((row) => (
              <div data-testid={`row-footprint-${row.price}`} key={row.price} className="grid grid-cols-[1fr_82px_82px_74px] gap-2 border-b border-[hsl(var(--border)/.55)] px-2 py-2 font-mono text-[11px] last:border-0">
                <div className="flex items-center gap-2">
                  <span className="text-[hsl(var(--foreground)/.85)]">{formatPrice(row.price)}</span>
                  <span className="h-1 flex-1 bg-[hsl(var(--border))]"><span className="block h-full bg-[hsl(var(--primary)/.42)]" style={{ width: `${Math.min(100, (row.totalVolume / Math.max(row.totalVolume, 1)) * 100)}%` }} /></span>
                </div>
                <span className="text-right text-[hsl(var(--destructive)/.9)]">{formatVolume(row.bidVolume)}</span>
                <span className="text-right text-[hsl(var(--primary)/.9)]">{formatVolume(row.askVolume)}</span>
                <span className={`text-right ${row.delta >= 0 ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>
                  {row.delta > 0 ? '+' : ''}{formatVolume(row.delta)}
                  <span className="mt-1 ml-auto block h-0.5 w-12 bg-[hsl(var(--border))]"><span className={`delta-bar block h-full ${row.delta >= 0 ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`} style={{ width: `${Math.min(100, Math.abs(row.delta) / maxVolume * 100)}%` }} /></span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DeltaPanel({ delta }: { delta: DeltaSummary }) {
  const max = Math.max(delta.runningBuyVolume, delta.runningSellVolume, 1);
  const metrics = [
    { label: 'Running buy', value: delta.runningBuyVolume, color: 'primary' },
    { label: 'Running sell', value: delta.runningSellVolume, color: 'destructive' },
  ];
  return (
    <section className="panel overflow-hidden">
      <SectionTitle icon={Activity} label="Delta / cumulative" detail="session scope" action={<span className="font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Reset on session</span>} />
      <div className="p-3 sm:p-4">
        <div className="mb-4 grid grid-cols-2 gap-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="border border-[hsl(var(--border))] bg-[hsl(var(--background)/.35)] p-2.5">
              <p className="panel-kicker">{metric.label}</p>
              <p data-testid={`text-${metric.label.replace(' ', '-')}`} className={`mono mt-2 text-base ${metric.color === 'primary' ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>{formatVolume(metric.value)}</p>
              <div className="mt-2 h-1 bg-[hsl(var(--border))]"><span className={`delta-bar block h-full ${metric.color === 'primary' ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--destructive))]'}`} style={{ width: `${metric.value / max * 100}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-[hsl(var(--border))] pt-3">
          <Metric label="Running delta" value={delta.runningDelta} signed />
          <Metric label="Cumulative delta" value={delta.cumulativeDelta} signed />
        </div>
         <div className="mt-4 border-t border-[hsl(var(--border))] pt-3">
           <div className="flex items-center justify-between">
             <p className="panel-kicker">Current 5m bar delta</p>
             <span className={`mono text-[11px] ${delta.currentBar && delta.currentBar.delta >= 0 ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>
               {delta.currentBar ? `${delta.currentBar.delta >= 0 ? '+' : ''}${formatVolume(delta.currentBar.delta)} (${delta.currentBar.deltaPercent.toFixed(1)}%)` : 'NOT CONNECTED'}
             </span>
           </div>
           {delta.bars.length > 0 ? (
             <div className="mt-3 flex h-12 items-end gap-1">
               {delta.bars.map((bar) => {
                 const height = Math.max(4, Math.min(100, Math.abs(bar.delta) / Math.max(...delta.bars.map((item) => Math.abs(item.delta)), 1) * 100));
                 return <span key={bar.start} className={`flex-1 ${bar.delta >= 0 ? 'bg-[hsl(var(--primary)/.75)]' : 'bg-[hsl(var(--destructive)/.75)]'}`} style={{ height: `${height}%` }} title={`Delta ${bar.delta.toFixed(4)}`} />;
               })}
             </div>
           ) : (
             <p className="mt-3 font-mono text-[10px] text-[hsl(var(--muted-foreground))]">Delta bars will appear from the real trade stream.</p>
           )}
         </div>
      </div>
    </section>
  );
}

function Metric({ label, value, signed = false }: { label: string; value: number; signed?: boolean }) {
  const positive = value >= 0;
  return (
    <div>
      <p className="panel-kicker">{label}</p>
      <p data-testid={`text-${label.replaceAll(' ', '-')}`} className={`mono mt-1 text-[13px] ${positive ? 'text-[hsl(var(--primary))]' : 'text-[hsl(var(--destructive))]'}`}>
        {signed && positive ? '+' : ''}{formatVolume(value)}
      </p>
    </div>
  );
}

function EventTypesPanel() {
  const types = [
    { label: 'Liquidity Added', state: 'future' },
    { label: 'Liquidity Pulled', state: 'future' },
    { label: 'Liquidity Consumed', state: 'future' },
    { label: 'Liquidity Migrated', state: 'future' },
    { label: 'Liquidity Sweep', state: 'future' },
  ];
  return (
    <section className="panel overflow-hidden">
      <SectionTitle icon={Zap} label="Liquidity events" detail="detectors" action={<span className="border border-[hsl(var(--border))] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">Future</span>} />
      <div className="divide-y divide-[hsl(var(--border)/.7)]">
        {types.map((type) => (
          <div data-testid={`event-type-${type.label.toLowerCase().replace(' ', '-')}`} key={type.label} className="flex items-center justify-between px-3 py-2.5">
            <span className="text-[11px] text-[hsl(var(--foreground)/.7)]">{type.label}</span>
            <span className="font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">{type.state}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function QualityPanel({ status, onClearSession }: { status: Status; onClearSession?: () => void }) {
  const quality = [
    { label: 'Socket', value: status.wsStatus, tone: status.connection === 'LIVE' ? 'good' : status.connection === 'CONNECTING' ? 'warn' : 'bad' },
    { label: 'Trades', value: status.tradesQuality, tone: status.tradesQuality === 'LIVE' ? 'good' : status.tradesQuality === 'STALE' ? 'warn' : 'muted' },
    { label: 'Candles', value: status.candlesQuality, tone: status.candlesQuality === 'LIVE' ? 'good' : status.candlesQuality === 'STALE' ? 'warn' : 'muted' },
    { label: 'Footprint', value: status.footprintQuality, tone: status.footprintQuality === 'LIVE' ? 'good' : status.footprintQuality === 'STALE' ? 'warn' : 'muted' },
    { label: 'Delta / CVD', value: status.deltaCvdQuality, tone: status.deltaCvdQuality === 'LIVE' ? 'good' : status.deltaCvdQuality === 'STALE' ? 'warn' : 'muted' },
    { label: 'Book sync', value: status.bookSync, tone: 'muted' },
    { label: 'Last update', value: formatTime(status.lastUpdate), tone: status.lastUpdate ? 'good' : 'muted' },
    { label: 'Receive latency', value: formatMetric(status.estimatedReceiveLatencyMs, ' ms'), tone: status.estimatedReceiveLatencyMs === null ? 'muted' : 'good' },
  ];
  const qualityLabel = status.connection === 'LIVE' ? 'Healthy' : status.connection === 'STALE' || status.connection === 'RECONNECTING' ? 'Stale' : status.connection === 'CONNECTING' ? 'Pending' : 'Offline';
  return (
    <section className="panel overflow-hidden">
      <SectionTitle icon={Gauge} label="Data quality" detail="pipeline observability" action={<span data-testid="status-quality" className={`flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] ${status.connection === 'LIVE' ? 'text-[hsl(var(--primary))]' : status.connection === 'CONNECTING' || status.connection === 'STALE' || status.connection === 'RECONNECTING' ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--destructive))]'}`}><span className={`status-dot ${connectionMeta(status.connection).className}`} /> {qualityLabel}</span>} />
      <div className="p-3">
         <div className="space-y-2.5">
          {quality.map((item) => (
            <div data-testid={`quality-${item.label.toLowerCase().replace(' ', '-')}`} key={item.label} className="flex items-center justify-between gap-3 font-mono text-[10px]">
              <span className="text-[hsl(var(--muted-foreground))]">{item.label}</span>
              <span className={`flex items-center gap-1.5 ${item.tone === 'good' ? 'text-[hsl(var(--primary))]' : item.tone === 'warn' ? 'text-[hsl(var(--accent))]' : item.tone === 'bad' ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--muted-foreground))]'}`}>
                {item.tone === 'good' ? <Check size={11} /> : item.tone === 'bad' ? <X size={11} /> : <span className="h-1 w-1 rounded-full bg-current" />}
                {item.value}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-[hsl(var(--border))] pt-3">
          <SmallMetric label="Events" value={formatMetric(status.eventCount)} />
          <SmallMetric label="Dropped" value={formatMetric(status.droppedEvents)} danger={status.droppedEvents > 0} />
          <SmallMetric label="Reconnects" value={formatMetric(status.reconnectCount)} />
        </div>
        <button type="button" data-testid="button-clear-session" onClick={onClearSession} className="mt-4 flex w-full items-center justify-center gap-1.5 border border-[hsl(var(--border))] py-2 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))] transition-colors hover:border-[hsl(var(--destructive)/.5)] hover:text-[hsl(var(--destructive))]">
          <RefreshCw size={11} /> Clear session counters
        </button>
      </div>
    </section>
  );
}

function SmallMetric({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <p className="panel-kicker">{label}</p>
      <p className={`mono mt-1 text-[11px] ${danger ? 'text-[hsl(var(--destructive))]' : 'text-[hsl(var(--foreground)/.8)]'}`}>{value}</p>
    </div>
  );
}

function Footer({ status }: { status: Status }) {
  return (
    <footer className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[hsl(var(--border))] px-3 py-3 sm:px-5">
      <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[.1em] text-[hsl(var(--muted-foreground))]">
        <span className={`status-dot ${connectionMeta(status.connection).className}`} /> <span data-testid="text-footer-state">{connectionMeta(status.connection).detail}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] text-[hsl(var(--muted-foreground))]">
        <span data-testid="metric-mps">MSG/S <strong className="font-medium text-[hsl(var(--foreground)/.75)]">{formatMetric(status.messagesPerSecond)}</strong></span>
        <span data-testid="metric-latency">PROC <strong className="font-medium text-[hsl(var(--foreground)/.75)]">{formatMetric(status.processingLatency, ' ms')}</strong></span>
        <span data-testid="metric-fps">RENDER <strong className="font-medium text-[hsl(var(--foreground)/.75)]">{formatMetric(status.renderingFps, ' fps')}</strong></span>
      </div>
      <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[.08em] text-[hsl(var(--muted-foreground))]">
        <CircleHelp size={11} /> No trading controls
      </div>
    </footer>
  );
}

function OrderFlowTerminal({
  trades = [],
  footprint = [],
  candles = [],
  timeframe = '5m',
  status: statusProp,
  delta: deltaProp,
  lastPrice,
  onReconnect,
  onClearSession,
  onTimeframeChange,
}: OrderFlowTerminalProps) {
  const status = { ...emptyStatus, ...statusProp };
  const delta = { ...emptyDelta, ...deltaProp };
  const [windowSize, setWindowSize] = useState('5m');
  const [streamPaused, setStreamPaused] = useState(false);

  return (
    <div className="terminal-shell min-h-[100dvh] text-[hsl(var(--foreground))]">
      <Header status={status} lastPrice={lastPrice} streamPaused={streamPaused} onToggleStream={() => setStreamPaused((current) => !current)} onReconnect={onReconnect} />
      <main className="mx-auto max-w-[1800px] px-3 py-3 sm:px-5 sm:py-5">
        <div className="mb-3 flex items-end justify-between gap-3 sm:mb-4">
          <div>
            <p className="panel-kicker">Market observability / 01</p>
            <h2 className="mt-1 text-lg font-semibold tracking-[-.03em] text-[hsl(var(--foreground))] sm:text-xl">BTCUSDT order flow</h2>
          </div>
          <div className="hidden items-center gap-2 font-mono text-[10px] text-[hsl(var(--muted-foreground))] md:flex">
            <Settings2 size={13} /> <span>Read-only surface</span>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.8fr)]">
          <div className="min-w-0 space-y-3">
             <PriceWorkspace lastPrice={lastPrice} candles={candles} windowSize={timeframe} onWindowChange={(value) => { setWindowSize(value); onTimeframeChange?.(value); }} />
            <div className="grid gap-3 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.05fr)]">
               <TradesPanel trades={trades} connection={status.connection} />
              <FootprintPanel footprint={footprint} />
            </div>
            <DeltaPanel delta={delta} />
          </div>
          <aside className="min-w-0 space-y-3">
            <DomPanel />
            <QualityPanel status={status} onClearSession={onClearSession} />
            <EventTypesPanel />
            <div className="panel hidden overflow-hidden md:block">
              <SectionTitle icon={Database} label="Runtime notes" />
              <div className="space-y-2 p-3 text-[11px] leading-relaxed text-[hsl(var(--muted-foreground))]">
                <p>Only received events are rendered. Missing feeds stay visibly unpopulated.</p>
                <p className="font-mono text-[10px] text-[hsl(var(--foreground)/.55)]">schema: aggTrade · transport: websocket</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer status={status} />
    </div>
  );
}

function Home() {
  const [market, setMarket] = useState<MarketDataState>(() => new MarketDataStore('5m').snapshot());
  const [renderingFps, setRenderingFps] = useState(0);
  const storeRef = useRef<MarketDataStore | null>(null);
  const streamRef = useRef<BinanceTradeStream | null>(null);

  useEffect(() => {
    const store = new MarketDataStore('5m');
    const stream = new BinanceTradeStream({
      symbol: 'btcusdt',
      interval: '5m',
      onStatus: (nextStatus) => store.handleStatus(nextStatus),
      onTrade: (trade: StreamTrade) => store.handleTrade(trade),
      onCandle: (candle) => store.handleCandle(candle),
    });

    let frameCount = 0;
    let frameWindowStartedAt = performance.now();
    const unsubscribe = store.subscribe((nextState) => {
      frameCount += 1;
      const elapsed = performance.now() - frameWindowStartedAt;
      if (elapsed >= 1_000) {
        setRenderingFps(Math.round((frameCount * 1_000) / elapsed));
        frameCount = 0;
        frameWindowStartedAt = performance.now();
      }
      setMarket(nextState);
    });

    storeRef.current = store;
    streamRef.current = stream;
    stream.start();

    return () => {
      unsubscribe();
      stream.stop();
      storeRef.current = null;
      streamRef.current = null;
    };
  }, []);

  const clearSession = () => {
    storeRef.current?.clearSession();
  };

  const quality = market.dataQuality;
  const status: Status = {
    ...emptyStatus,
    connection: quality.connection,
    wsStatus: quality.wsStatus,
    eventCount: quality.eventCount,
    droppedEvents: quality.droppedEvents,
    reconnectCount: quality.reconnectCount,
    lastUpdate: quality.lastReceivedEventTime,
    messagesPerSecond: market.processor.messagesPerSecond,
    processingLatency: market.processor.processingLatencyMs,
    renderingFps,
    connectionTime: quality.connectionTime,
    lastReceivedEventTime: quality.lastReceivedEventTime,
    lastMessageTimestamp: quality.lastMessageTimestamp,
    estimatedReceiveLatencyMs: quality.estimatedReceiveLatencyMs,
    tradesQuality: quality.trades,
    candlesQuality: quality.candles,
    footprintQuality: quality.footprint,
    deltaCvdQuality: quality.deltaCvd,
    streamReason: quality.reason,
  };
  const delta: DeltaSummary = {
    runningBuyVolume: market.processor.runningBuyVolume,
    runningSellVolume: market.processor.runningSellVolume,
    runningDelta: market.processor.runningDelta,
    cumulativeDelta: market.processor.deltaBars.reduce((total, bar) => total + bar.delta, 0),
    currentBar: market.processor.currentDeltaBar,
    bars: market.processor.deltaBars,
  };

  return (
    <OrderFlowTerminal
      trades={market.trades}
      footprint={market.footprint}
      status={status}
      delta={delta}
      candles={market.candles}
      timeframe={market.timeframe}
      lastPrice={market.lastPrice}
      onReconnect={() => streamRef.current?.reconnect()}
      onClearSession={clearSession}
      onTimeframeChange={(value) => {
        storeRef.current?.setTimeframe(value);
        streamRef.current?.setInterval(value);
      }}
    />
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;