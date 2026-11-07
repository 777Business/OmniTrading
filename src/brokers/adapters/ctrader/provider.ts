import type {
  BarRange,
  DataProvider,
  OHLCV,
  ProviderInfo,
  SymbolDescriptor,
  SymbolInfo,
  Unsubscribe,
} from '@luxalgo/vela';

import type { CtClient, CtLightSymbol, CtTrendbar } from './client';

/** 1/100000 price units used by the cTrader Open API. */
const PRICE_SCALE = 100_000;

/** Conservative page size for historical trendbars (cTrader caps responses). */
const CHUNK_SIZE = 1000;

interface PeriodSpec {
  period: number;
  minutes: number;
}

/** Periods cTrader serves natively (ProtoOATrendbarPeriod). */
const DIRECT: Record<string, PeriodSpec> = {
  '1': { period: 1, minutes: 1 },
  '2': { period: 2, minutes: 2 },
  '3': { period: 3, minutes: 3 },
  '4': { period: 4, minutes: 4 },
  '5': { period: 5, minutes: 5 },
  '10': { period: 6, minutes: 10 },
  '15': { period: 7, minutes: 15 },
  '30': { period: 8, minutes: 30 },
  '60': { period: 9, minutes: 60 },
  '240': { period: 10, minutes: 240 },
  '720': { period: 11, minutes: 720 },
  '1440': { period: 12, minutes: 1440 }, // D1
  '10080': { period: 13, minutes: 10080 }, // W1
  '43200': { period: 14, minutes: 43200 }, // MN1
};

const DIRECT_SORTED = Object.values(DIRECT).sort((a, b) => b.minutes - a.minutes);

const TF_ALIASES: Record<string, string> = {
  '1m': '1',
  '2m': '2',
  '3m': '3',
  '4m': '4',
  '5m': '5',
  '10m': '10',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '2h': '120',
  '3h': '180',
  '4h': '240',
  '6h': '360',
  '8h': '480',
  '12h': '720',
  '1d': '1440',
  '1w': '10080',
  '1mo': '43200',
  '1D': '1440',
  '1W': '10080',
  '1M': '43200',
  D: '1440',
  W: '10080',
  M: '43200',
};

interface ResolvedTimeframe {
  /** The native period to request from cTrader. */
  base: PeriodSpec;
  /** Target bucket size in minutes (equals base.minutes when direct). */
  targetMinutes: number;
  /** How many base bars make one target bar. */
  factor: number;
}

interface LiveSubscription {
  symbolId: number;
  basePeriod: number;
  targetMs: number;
  callbacks: Set<(bar: OHLCV) => void>;
  current: OHLCV | null;
  lastBucket: number | null;
  spotsHeld: boolean;
}

export interface CtProviderOptions {
  displayName?: string;
}

export class CtProvider implements DataProvider {
  private symbolsByName = new Map<string, CtLightSymbol>();
  private symbolsById = new Map<number, CtLightSymbol>();
  private symbolsPromise: Promise<void> | null = null;

  private infoCache = new Map<number, Record<string, unknown>>();
  private infoPromises = new Map<number, Promise<Record<string, unknown>>>();

  private live = new Map<string, LiveSubscription>();
  private spotRefs = new Map<number, number>();
  private offEvent: (() => void) | null = null;

  constructor(
    private readonly client: CtClient,
    private readonly accountId: number,
    private readonly options: CtProviderOptions = {},
  ) {
    this.offEvent = client.onEvent((message) => {
      if (message.payloadType === 2131) this.onSpotEvent(message.payload ?? {});
    });
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = await this.resolveSymbol(ticker);
    const resolved = resolveTimeframe(timeframe);
    const to = range.to ?? Date.now();
    // Cap initial limit to 1500 bars to prevent cTrader Open API rate limiting
    const limit = clamp(Number(range.limit) || 1000, 1, 1500);
    const count = Math.min(Math.ceil(limit * resolved.factor) + resolved.factor, 1500);

    // cTrader caps a historical response at a chunk (1000 bars per request), so page
    // backwards from `to` until the requested depth is covered or history runs out.
    const chunks: OHLCV[] = [];
    let cursor = to;
    let retries = 0;

    while (chunks.length < count) {
      const want = Math.min(CHUNK_SIZE, count - chunks.length);
      try {
        const response = await this.client.trendbars(this.accountId, {
          symbolId: symbol.symbolId,
          period: resolved.base.period,
          from: range.from,
          to: cursor,
          count: want,
        });

        const page = normalize(response.trendbar.map(trendbarToOHLCV));
        if (page.length === 0) break;
        chunks.push(...page);

        const oldest = page[0].time;
        if (range.from != null && oldest <= range.from) break;
        if (!response.hasMore && page.length < want) break;
        // Step just before the oldest bar we have so the next page never repeats it.
        if (oldest >= cursor) break;
        cursor = oldest - 1;
        retries = 0;

        // If another page is needed, pause briefly to be respectful of rate limit
        if (chunks.length < count) {
          await new Promise((r) => setTimeout(r, 150));
        }
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (
          (msg.includes('rate limited') || msg.includes('BLOCKED_PAYLOAD_TYPE')) &&
          retries < 3
        ) {
          retries++;
          console.warn(`[ctrader] rate limited on trendbars, retry ${retries} in ${retries * 500}ms`);
          await new Promise((r) => setTimeout(r, retries * 500));
          continue;
        }
        if (chunks.length > 0) {
          console.warn(`[ctrader] paging stopped early: ${msg}`);
          break;
        }
        throw err;
      }
    }

    const baseBars = normalize(chunks);
    if (resolved.factor === 1) return baseBars;
    return aggregate(baseBars, resolved.targetMinutes * 60_000);
  }

  async listSymbols(): Promise<SymbolDescriptor[]> {
    await this.ensureSymbols();
    const symbols = [...this.symbolsById.values()].filter((s) => s.symbolName);
    symbols.sort(
      (a, b) =>
        Number(a.sortingNumber ?? 0) - Number(b.sortingNumber ?? 0) ||
        String(a.symbolName).localeCompare(String(b.symbolName)),
    );
    return symbols.map((symbol) => ({
      ticker: symbol.symbolName as string,
      description: symbol.description || symbol.symbolName,
      type: 'cfd',
    }));
  }

  async getSymbolInfo(ticker: string): Promise<SymbolInfo | undefined> {
    const symbol = await this.resolveSymbol(ticker);
    const info = await this.symbolDetails(symbol.symbolId);
    return {
      ticker: symbol.symbolName ?? ticker,
      description: symbol.description,
      type: 'cfd',
      digits: info.digits,
      pipPosition: info.pipPosition,
      lotSize: info.lotSize,
      minVolume: info.minVolume,
      stepVolume: info.stepVolume,
      maxVolume: info.maxVolume,
      market: 'cfd',
    };
  }

  subscribe(
    ticker: string,
    timeframe: string,
    onBar: (bar: OHLCV) => void,
    _opts?: { session?: string },
  ): Unsubscribe {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;

    void (async () => {
      const symbol = await this.resolveSymbol(ticker);
      if (cancelled) return;

      const resolved = resolveTimeframe(timeframe);
      const key = `${symbol.symbolId}:${resolved.base.period}:${resolved.targetMinutes}`;
      let sub = this.live.get(key);

      if (!sub) {
        sub = {
          symbolId: symbol.symbolId,
          basePeriod: resolved.base.period,
          targetMs: resolved.targetMinutes * 60_000,
          callbacks: new Set(),
          current: null,
          lastBucket: null,
          spotsHeld: false,
        };
        this.live.set(key, sub);

        await this.holdSpots(symbol.symbolId);
        if (cancelled) {
          this.live.delete(key);
          this.releaseSpots(symbol.symbolId);
          return;
        }
        await this.client.subscribeTrendbar(
          this.accountId,
          symbol.symbolId,
          resolved.base.period,
        );
      }

      sub.callbacks.add(onBar);

      unsubscribe = () => {
        cancelled = true;
        const live = this.live.get(key);
        if (!live) return;
        live.callbacks.delete(onBar);
        if (live.callbacks.size > 0) return;

        this.live.delete(key);
        void this.client
          .unsubscribeTrendbar(this.accountId, live.symbolId, live.basePeriod)
          .catch(() => undefined);
        this.releaseSpots(live.symbolId);
      };
    })().catch((err) => {
      console.error('[ctrader] live subscription failed', err);
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }

  info(): ProviderInfo {
    return {
      name: 'ctrader',
      displayName: this.options.displayName ?? 'cTrader',
      supportedTimeframes: [
        '1',
        '2',
        '3',
        '4',
        '5',
        '10',
        '15',
        '30',
        '45',
        '60',
        '90',
        '120',
        '180',
        '240',
        '360',
        '480',
        '720',
        'D',
        'W',
        'M',
      ],
      capabilities: {
        enumerate: true,
        stream: true,
        symbolInfo: true,
      },
    };
  }

  destroy(): void {
    this.offEvent?.();
    this.offEvent = null;
    for (const live of this.live.values()) {
      void this.client
        .unsubscribeTrendbar(this.accountId, live.symbolId, live.basePeriod)
        .catch(() => undefined);
      this.releaseSpots(live.symbolId);
    }
    this.live.clear();
  }

  // ---- internals --------------------------------------------------------

  private async ensureSymbols(): Promise<void> {
    if (this.symbolsById.size > 0) return;
    if (!this.symbolsPromise) {
      this.symbolsPromise = (async () => {
        const symbols = await this.client.symbols(this.accountId);
        this.symbolsById.clear();
        this.symbolsByName.clear();
        for (const symbol of symbols) {
          this.symbolsById.set(Number(symbol.symbolId), symbol);
          const name = symbol.symbolName;
          if (!name) continue;
          this.symbolsByName.set(name.toUpperCase(), symbol);
          // Broker feeds are inconsistent about separators: EURUSD vs EUR/USD.
          const compact = name.replace(/[\/\s_-]/g, '').toUpperCase();
          if (compact && !this.symbolsByName.has(compact)) {
            this.symbolsByName.set(compact, symbol);
          }
        }
      })().finally(() => {
        this.symbolsPromise = null;
      });
    }
    return this.symbolsPromise;
  }

  private async resolveSymbol(ticker: string): Promise<CtLightSymbol> {
    await this.ensureSymbols();
    const raw = ticker.includes(':') ? ticker.split(':')[1] : ticker;
    const key = raw.trim().toUpperCase();
    const symbol = this.symbolsByName.get(key) ?? this.symbolsByName.get(key.replace(/[\/\s_-]/g, ''));
    if (!symbol) {
      throw new Error(`cTrader symbol not found: ${ticker}`);
    }
    return symbol;
  }

  private async symbolDetails(symbolId: number): Promise<Record<string, unknown>> {
    const cached = this.infoCache.get(symbolId);
    if (cached) return cached;

    let pending = this.infoPromises.get(symbolId);
    if (!pending) {
      pending = (async () => {
        const [symbol] = await this.client.symbolsById(this.accountId, [symbolId]);
        const info = (symbol ?? {}) as unknown as Record<string, unknown>;
        this.infoCache.set(symbolId, info);
        return info;
      })().finally(() => this.infoPromises.delete(symbolId));
      this.infoPromises.set(symbolId, pending);
    }
    return pending;
  }

  private async holdSpots(symbolId: number): Promise<void> {
    const refs = this.spotRefs.get(symbolId) ?? 0;
    this.spotRefs.set(symbolId, refs + 1);
    if (refs === 0) {
      await this.client.subscribeSpots(this.accountId, symbolId);
    }
  }

  private releaseSpots(symbolId: number): void {
    const refs = this.spotRefs.get(symbolId) ?? 0;
    if (refs <= 1) {
      this.spotRefs.delete(symbolId);
      void this.client.unsubscribeSpots(this.accountId, symbolId).catch(() => undefined);
    } else {
      this.spotRefs.set(symbolId, refs - 1);
    }
  }

  private onSpotEvent(payload: Record<string, unknown>): void {
    const symbolId = Number(payload.symbolId);
    if (!Number.isFinite(symbolId)) return;

    const symName = this.symbolsById.get(symbolId)?.symbolName;
    const bid = Number(payload.bid) / PRICE_SCALE;
    const ask = Number(payload.ask) / PRICE_SCALE;
    const tickPrice = bid > 0 && ask > 0 ? (bid + ask) / 2 : bid > 0 ? bid : ask;

    const trendbars = (payload.trendbar as CtTrendbar[] | undefined) ?? [];

    if (trendbars.length > 0) {
      for (const trendbar of trendbars) {
        // cTrader omits `period` when it is M1 (the proto default).
        const period = Number(trendbar.period ?? 1);
        for (const sub of this.live.values()) {
          if (sub.symbolId !== symbolId || sub.basePeriod !== period) continue;

          const bar = trendbarToOHLCV(trendbar);
          if (!bar.time) {
            const stamp = Number(payload.timestamp ?? Date.now());
            bar.time = Math.floor(stamp / sub.targetMs) * sub.targetMs;
          }
          const bucket = Math.floor(bar.time / sub.targetMs) * sub.targetMs;

          if (sub.lastBucket !== bucket || !sub.current) {
            sub.current = { ...bar, time: bucket };
            sub.lastBucket = bucket;
          } else {
            sub.current = {
              time: bucket,
              open: sub.current.open,
              high: Math.max(sub.current.high, bar.high),
              low: Math.min(sub.current.low, bar.low),
              close: bar.close,
              volume: (sub.current.volume ?? 0) + (bar.volume ?? 0),
            };
          }

          for (const callback of sub.callbacks) callback(sub.current);
        }
      }
    } else if (tickPrice > 0) {
      // Spot tick without trendbar: update forming candle for each matching active subscription
      const now = Number(payload.timestamp ?? Date.now());
      for (const sub of this.live.values()) {
        if (sub.symbolId !== symbolId) continue;
        const bucket = Math.floor(now / sub.targetMs) * sub.targetMs;

        if (sub.lastBucket !== bucket || !sub.current) {
          sub.current = {
            time: bucket,
            open: tickPrice,
            high: tickPrice,
            low: tickPrice,
            close: tickPrice,
            volume: 1,
          };
          sub.lastBucket = bucket;
        } else {
          sub.current = {
            time: bucket,
            open: sub.current.open,
            high: Math.max(sub.current.high, tickPrice),
            low: Math.min(sub.current.low, tickPrice),
            close: tickPrice,
            volume: (sub.current.volume ?? 0) + 1,
          };
        }

        for (const callback of sub.callbacks) callback(sub.current);
      }
    }

    if (typeof window !== 'undefined' && tickPrice > 0) {
      window.dispatchEvent(
        new CustomEvent('vela:price-tick', {
          detail: {
            symbolId,
            symbol: symName,
            price: tickPrice,
            bid: bid > 0 ? bid : tickPrice,
            ask: ask > 0 ? ask : tickPrice,
            time: Number(payload.timestamp ?? Date.now()),
          },
        }),
      );
    }
  }
}

// ---- helpers ------------------------------------------------------------

export function resolveTimeframe(timeframe: string): ResolvedTimeframe {
  const raw = String(timeframe ?? '60').trim();
  const normalized = TF_ALIASES[raw] ?? TF_ALIASES[raw.toLowerCase()] ?? raw;

  const direct = DIRECT[normalized];
  if (direct) {
    return { base: direct, targetMinutes: direct.minutes, factor: 1 };
  }

  const minutes =
    Number(normalized) > 0 ? Number(normalized) : normalized === 'D' ? 1440 : NaN;
  if (!Number.isFinite(minutes)) {
    throw new Error(`Unsupported timeframe: ${timeframe}`);
  }

  const base = DIRECT_SORTED.find((spec) => minutes > spec.minutes && minutes % spec.minutes === 0);
  if (!base) {
    throw new Error(`cTrader cannot build the ${timeframe} timeframe`);
  }

  return {
    base,
    targetMinutes: minutes,
    factor: minutes / base.minutes,
  };
}

function trendbarToOHLCV(bar: CtTrendbar): OHLCV {
  const low = Number(bar.low ?? 0) / PRICE_SCALE;
  return {
    time: Number(bar.utcTimestampInMinutes ?? 0) * 60_000,
    open: low + Number(bar.deltaOpen ?? 0) / PRICE_SCALE,
    high: low + Number(bar.deltaHigh ?? 0) / PRICE_SCALE,
    low,
    close: low + Number(bar.deltaClose ?? 0) / PRICE_SCALE,
    volume: Number(bar.volume ?? 0),
  };
}

function normalize(bars: OHLCV[]): OHLCV[] {
  const byTime = new Map<number, OHLCV>();
  for (const bar of bars) {
    if (!Number.isFinite(bar.time) || bar.time <= 0) continue;
    byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

function aggregate(bars: OHLCV[], bucketMs: number): OHLCV[] {
  const buckets = new Map<number, OHLCV>();
  for (const bar of bars) {
    const key = Math.floor(bar.time / bucketMs) * bucketMs;
    const current = buckets.get(key);
    if (!current) {
      buckets.set(key, {
        time: key,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume ?? 0,
      });
    } else {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume = (current.volume ?? 0) + (bar.volume ?? 0);
    }
  }
  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
