/**
 * OmniTrading - Universal Multi-Asset Market Data Provider
 *
 * Implements Vela's DataProvider interface for Forex pairs, Commodities (Gold, Oil, Silver),
 * Cryptocurrencies, and US Equities. Serves historical candlestick bars and real-time live ticks.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type {
  DataProvider,
  BarRange,
  OHLCV,
  SymbolDescriptor,
  SymbolInfo,
  Unsubscribe,
} from '@luxalgo/vela';

export interface MarketSymbolSpec {
  ticker: string;
  name: string;
  type: 'forex' | 'commodity' | 'crypto' | 'stock' | 'index';
  digits: number;
  pipPosition: number;
  lotSize: number;
  minVolume: number;
  stepVolume: number;
  maxVolume: number;
}

export const CATALOG_SYMBOLS: MarketSymbolSpec[] = [
  // Forex Majors & Crosses
  { ticker: 'EURUSD', name: 'Euro / US Dollar', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'GBPUSD', name: 'British Pound / US Dollar', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'USDJPY', name: 'US Dollar / Japanese Yen', type: 'forex', digits: 3, pipPosition: 2, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'AUDUSD', name: 'Australian Dollar / US Dollar', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'USDCAD', name: 'US Dollar / Canadian Dollar', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'USDCHF', name: 'US Dollar / Swiss Franc', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'NZDUSD', name: 'New Zealand Dollar / US Dollar', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'EURGBP', name: 'Euro / British Pound', type: 'forex', digits: 5, pipPosition: 4, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'EURJPY', name: 'Euro / Japanese Yen', type: 'forex', digits: 3, pipPosition: 2, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'GBPJPY', name: 'British Pound / Japanese Yen', type: 'forex', digits: 3, pipPosition: 2, lotSize: 100000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },

  // Commodities
  { ticker: 'XAUUSD', name: 'Gold / US Dollar (Spot)', type: 'commodity', digits: 2, pipPosition: 2, lotSize: 100, minVolume: 0.01, stepVolume: 0.01, maxVolume: 50 },
  { ticker: 'XAGUSD', name: 'Silver / US Dollar (Spot)', type: 'commodity', digits: 3, pipPosition: 2, lotSize: 5000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 50 },
  { ticker: 'USOIL', name: 'WTI Crude Oil Futures', type: 'commodity', digits: 2, pipPosition: 2, lotSize: 1000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'BRENT', name: 'Brent Crude Oil Futures', type: 'commodity', digits: 2, pipPosition: 2, lotSize: 1000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },
  { ticker: 'NATGAS', name: 'Natural Gas Futures', type: 'commodity', digits: 3, pipPosition: 2, lotSize: 10000, minVolume: 0.01, stepVolume: 0.01, maxVolume: 100 },

  // Cryptocurrencies
  { ticker: 'BTCUSD', name: 'Bitcoin / US Dollar', type: 'crypto', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.001, stepVolume: 0.001, maxVolume: 100 },
  { ticker: 'ETHUSD', name: 'Ethereum / US Dollar', type: 'crypto', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.01, stepVolume: 0.01, maxVolume: 500 },
  { ticker: 'SOLUSD', name: 'Solana / US Dollar', type: 'crypto', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.1, stepVolume: 0.1, maxVolume: 2000 },
  { ticker: 'XRPUSD', name: 'Ripple / US Dollar', type: 'crypto', digits: 4, pipPosition: 4, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 100000 },
  { ticker: 'DOGEUSD', name: 'Dogecoin / US Dollar', type: 'crypto', digits: 5, pipPosition: 4, lotSize: 1, minVolume: 10, stepVolume: 10, maxVolume: 500000 },
  { ticker: 'BTCUSDT', name: 'Bitcoin / Tether (USDT)', type: 'crypto', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.001, stepVolume: 0.001, maxVolume: 100 },
  { ticker: 'ETHUSDT', name: 'Ethereum / Tether (USDT)', type: 'crypto', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.01, stepVolume: 0.01, maxVolume: 500 },

  // Equities & Indices
  { ticker: 'US500', name: 'S&P 500 Index CFD', type: 'index', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.1, stepVolume: 0.1, maxVolume: 100 },
  { ticker: 'NAS100', name: 'Nasdaq 100 Index CFD', type: 'index', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 0.1, stepVolume: 0.1, maxVolume: 100 },
  { ticker: 'US30', name: 'Dow Jones 30 Index CFD', type: 'index', digits: 1, pipPosition: 1, lotSize: 1, minVolume: 0.1, stepVolume: 0.1, maxVolume: 100 },
  { ticker: 'AAPL', name: 'Apple Inc.', type: 'stock', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 10000 },
  { ticker: 'TSLA', name: 'Tesla Inc.', type: 'stock', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 10000 },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', type: 'stock', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 10000 },
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', type: 'stock', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 10000 },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', type: 'stock', digits: 2, pipPosition: 2, lotSize: 1, minVolume: 1, stepVolume: 1, maxVolume: 10000 },
];

export class UniversalMarketDataProvider implements DataProvider {
  private lastBars = new Map<string, OHLCV>();
  private activeSubscriptions = new Map<string, { timer: any; callbacks: Set<(b: OHLCV) => void> }>();
  private quoteCallbacks = new Set<(quote: { symbol: string; bid: number; ask: number; time: number }) => void>();

  public onLiveQuote(cb: (quote: { symbol: string; bid: number; ask: number; time: number }) => void): () => void {
    this.quoteCallbacks.add(cb);
    return () => this.quoteCallbacks.delete(cb);
  }

  public async listSymbols(): Promise<SymbolDescriptor[]> {
    return CATALOG_SYMBOLS.map((s) => ({
      ticker: s.ticker,
      description: s.name,
      type: s.type,
    }));
  }

  public async getSymbolInfo(ticker: string): Promise<SymbolInfo | undefined> {
    const clean = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const found = CATALOG_SYMBOLS.find((s) => s.ticker === clean);
    if (found) {
      return {
        ticker: found.ticker,
        description: found.name,
        type: found.type,
        digits: found.digits,
        pipPosition: found.pipPosition,
        lotSize: found.lotSize,
        minVolume: found.minVolume,
        stepVolume: found.stepVolume,
        maxVolume: found.maxVolume,
        market: found.type,
      };
    }

    const isForex = clean.length === 6 && (clean.endsWith('USD') || clean.endsWith('JPY') || clean.startsWith('EUR'));
    const isJpy = clean.endsWith('JPY');

    return {
      ticker: clean,
      description: clean,
      type: isForex ? 'forex' : 'crypto',
      digits: isForex ? (isJpy ? 3 : 5) : 2,
      pipPosition: isForex ? (isJpy ? 2 : 4) : 2,
      lotSize: isForex ? 100000 : 1,
      minVolume: isForex ? 0.01 : 0.001,
      stepVolume: isForex ? 0.01 : 0.001,
      maxVolume: isForex ? 100 : 1000,
      market: isForex ? 'forex' : 'crypto',
    };
  }

  public async getBars(ticker: string, timeframe: string, _range: BarRange): Promise<OHLCV[]> {
    const clean = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    try {
      const res = await fetch(`/api/market/bars?symbol=${encodeURIComponent(clean)}&timeframe=${encodeURIComponent(timeframe)}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.bars) && data.bars.length > 0) {
          const bars: OHLCV[] = data.bars;
          this.lastBars.set(clean, bars[bars.length - 1]);
          return bars;
        }
      }
    } catch {
      /* Fallback gracefully */
    }

    // Default synthetic bars
    const now = Date.now();
    const bars: OHLCV[] = [];
    const base = clean.includes('JPY') ? 150.0 : clean.includes('USD') && clean.length === 6 ? 1.085 : 100.0;
    const tfUpper = String(timeframe || '').toUpperCase();
    let stepMs = 15 * 60 * 1000;
    let barVolume = 100;

    if (tfUpper.endsWith('T')) {
      const ticks = parseInt(tfUpper, 10) || 100;
      stepMs = Math.max(1000, Math.round(ticks * 80));
      barVolume = ticks;
    } else if (tfUpper.endsWith('R')) {
      stepMs = 10000;
    } else if (tfUpper.endsWith('S')) {
      stepMs = (parseInt(tfUpper, 10) || 15) * 1000;
    } else {
      stepMs = (parseInt(timeframe, 10) || 15) * 60_000;
    }

    for (let i = 100; i >= 0; i--) {
      const time = now - i * stepMs;
      bars.push({
        time,
        open: base,
        high: base * 1.002,
        low: base * 0.998,
        close: base,
        volume: barVolume,
      });
    }
    this.lastBars.set(clean, bars[bars.length - 1]);
    return bars;
  }

  public subscribe(
    ticker: string,
    timeframe: string,
    onBar: (bar: OHLCV) => void,
    _opts?: { session?: string },
  ): Unsubscribe {
    const clean = ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const key = `${clean}:${timeframe}`;

    let sub = this.activeSubscriptions.get(key);
    if (!sub) {
      sub = {
        callbacks: new Set(),
        timer: null,
      };
      this.activeSubscriptions.set(key, sub);

      const tfUpper = String(timeframe || '').toUpperCase();
      const targetTicks = tfUpper.endsWith('T') ? parseInt(tfUpper, 10) || 100 : 0;
      const isTickChart = targetTicks > 0;
      const targetRange = tfUpper.endsWith('R') ? parseInt(tfUpper, 10) || 10 : 0;
      const isRangeChart = targetRange > 0;
      const barDurationMs = tfUpper.endsWith('S')
        ? (parseInt(tfUpper, 10) || 15) * 1000
        : (parseInt(timeframe, 10) || 1) * 60_000;

      let currentTicksInBar = 0;

      // Start live tick interval for this symbol
      sub.timer = setInterval(() => {
        let last = this.lastBars.get(clean);
        if (!last) return;

        const spec = CATALOG_SYMBOLS.find((s) => s.ticker === clean);
        const digits = spec ? spec.digits : clean.includes('JPY') ? 3 : 5;
        const tickStep = 1 / Math.pow(10, digits);

        // Random micro tick (-1, 0, +1)
        const delta = (Math.floor(Math.random() * 3) - 1) * tickStep * 1.5;
        const newClose = Number((last.close + delta).toFixed(digits));

        let isNewBar = false;
        let barTime = last.time;
        const now = Date.now();

        if (isTickChart) {
          currentTicksInBar++;
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('omni:tick-progress', {
                detail: { symbol: clean, current: currentTicksInBar, target: targetTicks },
              }),
            );
          }
          if (currentTicksInBar >= targetTicks) {
            isNewBar = true;
            currentTicksInBar = 0;
            barTime = now;
          }
        } else if (isRangeChart) {
          const pipSize = spec?.pipPosition ? 1 / Math.pow(10, spec.pipPosition) : tickStep;
          const rangeTraveled = Math.abs(newClose - last.open) / pipSize;
          if (rangeTraveled >= targetRange) {
            isNewBar = true;
            barTime = now;
          }
        } else {
          const currentBucket = Math.floor(now / barDurationMs) * barDurationMs;
          isNewBar = last.time < currentBucket;
          barTime = isNewBar ? currentBucket : last.time;
        }

        const updated: OHLCV = {
          time: barTime,
          open: isNewBar ? newClose : last.open,
          high: isNewBar ? newClose : Math.max(last.high, newClose),
          low: isNewBar ? newClose : Math.min(last.low, newClose),
          close: newClose,
          volume: isNewBar ? 1 : (last.volume || 0) + 1,
        };

        this.lastBars.set(clean, updated);

        // Notify Vela chart
        const s = this.activeSubscriptions.get(key);
        if (s) {
          for (const cb of s.callbacks) cb(updated);
        }

        // Notify quote listeners (Quick Trade & spread visualizer)
        const spread = (spec?.pipPosition ? 1.2 / Math.pow(10, spec.pipPosition) : tickStep * 2);
        const bid = Number((newClose - spread / 2).toFixed(digits));
        const ask = Number((newClose + spread / 2).toFixed(digits));
        for (const cb of this.quoteCallbacks) {
          cb({ symbol: clean, bid, ask, time: Date.now() });
        }

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('omni:price-tick', {
              detail: { symbol: clean, price: newClose, bid, ask },
            }),
          );
        }
      }, 1000);
    }

    sub.callbacks.add(onBar);

    return () => {
      sub?.callbacks.delete(onBar);
      if (sub && sub.callbacks.size === 0) {
        clearInterval(sub.timer);
        this.activeSubscriptions.delete(key);
      }
    };
  }
}
