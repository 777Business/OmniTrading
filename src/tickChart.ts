/**
 * OmniTrading - Tick Chart Engine & Real-Time Trade Aggregator
 *
 * Implements non-time-based trade count aggregation (e.g., 100T, 250T, 500T, 1000T, 2000T).
 * Unlike standard time-based charts that print bars on fixed clock intervals (1m, 5m),
 * a Tick Bar closes when exactly N trades have occurred.
 *
 * Eliminates time distortion, highlights market speed and volume velocity,
 * and enables ultra-precise micro-structure execution timing (Sierra Chart & NinjaTrader style).
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

export interface TickBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  tickCount: number;
}

export const TICK_INTERVALS = [
  { canonical: '100T', label: '100 Ticks', count: 100 },
  { canonical: '250T', label: '250 Ticks', count: 250 },
  { canonical: '500T', label: '500 Ticks', count: 500 },
  { canonical: '1000T', label: '1,000 Ticks', count: 1000 },
  { canonical: '2000T', label: '2,000 Ticks', count: 2000 },
];

export function isTickInterval(timeframe: string): boolean {
  if (!timeframe) return false;
  return String(timeframe).toUpperCase().endsWith('T');
}

export function parseTickCount(timeframe: string): number {
  if (!isTickInterval(timeframe)) return 0;
  const match = String(timeframe).match(/^(\d+)T$/i);
  return match ? parseInt(match[1], 10) : 0;
}

export function formatTickInterval(timeframe: string): string {
  const count = parseTickCount(timeframe);
  if (count <= 0) return timeframe;
  return `${count.toLocaleString()} Ticks`;
}

/**
 * In-memory trade aggregator that builds OHLCV bars based on trade count.
 */
export class TickAggregator {
  private static instance: TickAggregator | null = null;
  private currentBars = new Map<string, TickBar>(); // key: `${symbol}:${count}`
  private completedBars = new Map<string, TickBar[]>();
  private listeners = new Map<string, Set<(bar: TickBar, isComplete: boolean) => void>>();

  public static getInstance(): TickAggregator {
    if (!TickAggregator.instance) {
      TickAggregator.instance = new TickAggregator();
    }
    return TickAggregator.instance;
  }

  private constructor() {
    this.listenToPriceTicks();
  }

  private listenToPriceTicks(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('vela:price-tick', ((e: CustomEvent) => {
      const detail = e.detail;
      if (!detail) return;
      const { symbol, price, volume, time } = detail;
      if (!price || !Number.isFinite(price)) return;

      const sym = String(symbol || 'DEFAULT').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const tradeTime = Number(time || Date.now());
      const tradeVol = Math.max(1, Number(volume) || 1);

      this.processTrade(sym, price, tradeVol, tradeTime);
    }) as EventListener);
  }

  public processTrade(symbol: string, price: number, volume: number, time: number): void {
    const supportedCounts = [100, 250, 500, 1000, 2000];

    for (const targetCount of supportedCounts) {
      const key = `${symbol}:${targetCount}`;
      let cur = this.currentBars.get(key);

      if (!cur) {
        cur = {
          time,
          open: price,
          high: price,
          low: price,
          close: price,
          volume,
          tickCount: 1,
        };
        this.currentBars.set(key, cur);
        this.notify(key, cur, false);
      } else {
        cur.high = Math.max(cur.high, price);
        cur.low = Math.min(cur.low, price);
        cur.close = price;
        cur.volume += volume;
        cur.tickCount += 1;

        if (cur.tickCount >= targetCount) {
          // Bar completed
          let history = this.completedBars.get(key);
          if (!history) {
            history = [];
            this.completedBars.set(key, history);
          }
          history.push({ ...cur });
          if (history.length > 1000) history.shift();

          this.notify(key, cur, true);

          // Start fresh bar
          this.currentBars.delete(key);
        } else {
          // Live tick update within current bar
          this.notify(key, cur, false);
        }
      }
    }
  }

  public subscribe(
    symbol: string,
    targetCount: number,
    callback: (bar: TickBar, isComplete: boolean) => void
  ): () => void {
    const key = `${symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')}:${targetCount}`;
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(callback);

    // Provide initial current bar if any
    const cur = this.currentBars.get(key);
    if (cur) callback(cur, false);

    return () => {
      set?.delete(callback);
    };
  }

  private notify(key: string, bar: TickBar, isComplete: boolean): void {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(bar, isComplete);
      } catch (err) {
        console.error('[TickAggregator] listener error', err);
      }
    }
  }

  public getHistory(symbol: string, targetCount: number): TickBar[] {
    const key = `${symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')}:${targetCount}`;
    return this.completedBars.get(key) || [];
  }
}
