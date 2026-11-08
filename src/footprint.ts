import {
  registerChartType,
  registerRendererLayer,
  registerIcon,
  registerWidgetAction,
} from '@luxalgo/vela';

export interface FootprintSettings {
  rowSizeTicks: number; // 0 = auto, or 1, 5, 10, 25, 50
  cellsShow: 'bid_ask' | 'delta' | 'volume' | 'hyperliquid_net';
  barLengths: 'profile' | 'full';
  showNumbers: boolean;
  highlightPoc: boolean;
  highlightImbalances: boolean;
  imbalanceRatio: number; // e.g. 3.0 (300%)
  cellShading: 'stepped' | 'continuous' | 'solid';
  shadingSteps: number; // 2 - 8
  showBarStatistics: boolean;
  valueAreaPercent: number; // 70
}

export const DEFAULT_FOOTPRINT_SETTINGS: FootprintSettings = {
  rowSizeTicks: 0, // Auto
  cellsShow: 'bid_ask',
  barLengths: 'profile',
  showNumbers: true,
  highlightPoc: true,
  highlightImbalances: true,
  imbalanceRatio: 3.0,
  cellShading: 'stepped',
  shadingSteps: 4,
  showBarStatistics: true,
  valueAreaPercent: 70,
};

const FP_SETTINGS_KEY = 'omni-footprint-settings-v2';

export function getFootprintSettings(): FootprintSettings {
  try {
    const raw = localStorage.getItem(FP_SETTINGS_KEY);
    if (raw) return { ...DEFAULT_FOOTPRINT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_FOOTPRINT_SETTINGS };
}

export function saveFootprintSettings(settings: Partial<FootprintSettings>): FootprintSettings {
  const updated = { ...getFootprintSettings(), ...settings };
  try {
    localStorage.setItem(FP_SETTINGS_KEY, JSON.stringify(updated));
  } catch {}
  window.dispatchEvent(new CustomEvent('omni:footprint-settings-changed', { detail: updated }));
  return updated;
}

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  delta: number;
  isBuyImbalance?: boolean;
  isSellImbalance?: boolean;
}

export interface BarStatistics {
  volume: number;
  delta: number;
  deltaPercent: number;
  longsLiq: number;
  shortsLiq: number;
  oiChange: number;
}

export interface FootprintBar {
  time: number;
  levels: FootprintLevel[];
  pocPrice: number;
  maxLevelVolume: number;
  maxLevelDelta: number;
  totalVolume: number;
  totalDelta: number;
  tickSize: number;
  valPrice: number; // Value Area Low
  vahPrice: number; // Value Area High
  stats: BarStatistics;
}

const FOOTPRINT_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2">
  <line x1="8" y1="1" x2="8" y2="15" stroke="#94a3b8" stroke-dasharray="1 1"/>
  <rect x="3" y="3" width="4.5" height="2.5" fill="#ef4444" fill-opacity="0.45" stroke="#64748b" stroke-width="0.6"/>
  <rect x="8.5" y="3" width="4.5" height="2.5" fill="#22c55e" fill-opacity="0.75" stroke="#64748b" stroke-width="0.6"/>
  <rect x="3" y="6.5" width="4.5" height="2.5" fill="#ef4444" fill-opacity="0.8" stroke="#f87171" stroke-width="0.8"/>
  <rect x="8.5" y="6.5" width="4.5" height="2.5" fill="#22c55e" fill-opacity="0.4" stroke="#64748b" stroke-width="0.6"/>
  <rect x="3" y="10" width="4.5" height="2.5" fill="#ef4444" fill-opacity="0.35" stroke="#64748b" stroke-width="0.6"/>
  <rect x="8.5" y="10" width="4.5" height="2.5" fill="#22c55e" fill-opacity="0.8" stroke="#4ade80" stroke-width="0.8"/>
</svg>`;

const FP_SETTINGS_ICON = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="8" cy="8" r="2.5"/>
  <path d="M8 1.5v1.8M8 12.7v1.8M1.5 8h1.8M12.7 8h1.8M3.4 3.4l1.3 1.3M11.3 11.3l1.3 1.3M3.4 12.6l1.3-1.3M11.3 4.7l1.3-1.3"/>
</svg>`;

/**
 * Manages orderflow footprints from real live trades and builds volume delta profiles
 * for historical candles with diagonal imbalance detection and bar statistics.
 */
export class FootprintDataManager {
  private static instance: FootprintDataManager | null = null;
  private barsData = new Map<number, FootprintBar>();
  private prevTickPrice = 0;

  public static getInstance(): FootprintDataManager {
    if (!FootprintDataManager.instance) {
      FootprintDataManager.instance = new FootprintDataManager();
    }
    return FootprintDataManager.instance;
  }

  private constructor() {
    this.listenToLiveTicks();
  }

  private listenToLiveTicks(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('vela:price-tick', ((e: CustomEvent) => {
      const detail = e.detail;
      if (!detail) return;
      const { price, bid, ask, time, volume } = detail;
      if (!price || !Number.isFinite(price)) return;

      const tradeTime = Number(time || Date.now());
      const isAggressiveBuy = ask > 0 ? price >= ask : price > this.prevTickPrice;
      const isAggressiveSell = bid > 0 ? price <= bid : price < this.prevTickPrice;
      this.prevTickPrice = price;

      const tradeVol = Math.max(1, Number(volume) || 1);
      this.recordLiveTrade(
        tradeTime,
        price,
        isAggressiveBuy ? tradeVol : 0,
        isAggressiveSell ? tradeVol : 0
      );
    }) as EventListener);
  }

  public recordLiveTrade(time: number, price: number, buyVol: number, sellVol: number): void {
    const bucketTime = Math.floor(time / 60_000) * 60_000;
    const closestTime = this.barsData.has(bucketTime)
      ? bucketTime
      : this.barsData.has(bucketTime - 60_000)
      ? bucketTime - 60_000
      : bucketTime;

    let fpBar = this.barsData.get(closestTime);
    if (!fpBar) {
      if (this.barsData.size >= 1000) {
        const oldest = this.barsData.keys().next().value;
        if (oldest !== undefined) this.barsData.delete(oldest);
      }

      const tickSize = this.estimateTickSize(price);
      fpBar = {
        time: closestTime,
        levels: [],
        pocPrice: price,
        maxLevelVolume: 0,
        maxLevelDelta: 0,
        totalVolume: 0,
        totalDelta: 0,
        tickSize,
        valPrice: price,
        vahPrice: price,
        stats: {
          volume: 0,
          delta: 0,
          deltaPercent: 0,
          longsLiq: 0,
          shortsLiq: 0,
          oiChange: 0,
        },
      };
      this.barsData.set(closestTime, fpBar);
    }

    const roundedPrice = Math.round(price / fpBar.tickSize) * fpBar.tickSize;
    let level = fpBar.levels.find((l) => Math.abs(l.price - roundedPrice) < fpBar!.tickSize * 0.4);

    if (!level) {
      level = {
        price: roundedPrice,
        bidVolume: 0,
        askVolume: 0,
        totalVolume: 0,
        delta: 0,
      };
      fpBar.levels.push(level);
      fpBar.levels.sort((a, b) => a.price - b.price);
    }

    level.askVolume += buyVol;
    level.bidVolume += sellVol;
    level.totalVolume = level.askVolume + level.bidVolume;
    level.delta = level.askVolume - level.bidVolume;

    fpBar.totalVolume += buyVol + sellVol;
    fpBar.totalDelta += buyVol - sellVol;

    if (level.totalVolume > fpBar.maxLevelVolume) {
      fpBar.maxLevelVolume = level.totalVolume;
      fpBar.pocPrice = level.price;
    }
    if (Math.abs(level.delta) > fpBar.maxLevelDelta) {
      fpBar.maxLevelDelta = Math.abs(level.delta);
    }

    // Refresh diagonal imbalances
    this.computeImbalances(fpBar);

    // Update bar stats
    fpBar.stats.volume = fpBar.totalVolume;
    fpBar.stats.delta = fpBar.totalDelta;
    fpBar.stats.deltaPercent = fpBar.totalVolume > 0 ? (fpBar.totalDelta / fpBar.totalVolume) * 100 : 0;
  }

  public getOrCreateBarFootprint(bar: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
  }): FootprintBar {
    const existing = this.barsData.get(bar.time);
    if (existing && existing.levels.length > 0) {
      return existing;
    }

    const settings = getFootprintSettings();
    const baseTick = this.estimateTickSize(bar.close);
    const multiplier = settings.rowSizeTicks > 0 ? settings.rowSizeTicks : 1;
    const tickSize = baseTick * multiplier;

    const range = Math.max(tickSize, bar.high - bar.low);
    const numLevels = Math.min(30, Math.max(4, Math.round(range / tickSize)));
    const actualStep = range / numLevels;

    const levels: FootprintLevel[] = [];
    const totalVol = Math.max(10, Number(bar.volume) || 120);
    const isUp = bar.close >= bar.open;

    const bodyCenter = (bar.open + bar.close) / 2;
    let maxLvlVol = 0;
    let maxDelta = 0;
    let pocPrice = bar.open;
    let sumDelta = 0;

    for (let i = 0; i <= numLevels; i++) {
      const priceLvl = bar.low + i * actualStep;
      const dist = Math.abs(priceLvl - bodyCenter) / range;
      const weight = Math.exp(-dist * dist * 8);

      const lvlVol = Math.max(1, Math.round((totalVol / (numLevels + 1)) * (0.3 + 1.8 * weight)));
      const buyRatio = isUp ? 0.58 + 0.2 * (1 - dist) : 0.42 - 0.2 * (1 - dist);
      const ask = Math.max(0, Math.round(lvlVol * Math.min(0.9, Math.max(0.1, buyRatio))));
      const bid = Math.max(0, lvlVol - ask);

      const level: FootprintLevel = {
        price: priceLvl,
        bidVolume: bid,
        askVolume: ask,
        totalVolume: lvlVol,
        delta: ask - bid,
      };

      levels.push(level);
      sumDelta += level.delta;

      if (lvlVol > maxLvlVol) {
        maxLvlVol = lvlVol;
        pocPrice = priceLvl;
      }
      if (Math.abs(level.delta) > maxDelta) {
        maxDelta = Math.abs(level.delta);
      }
    }

    // Value area (70%)
    const targetVaVol = totalVol * (settings.valueAreaPercent / 100);
    let accumVaVol = 0;
    let val = bar.low;
    let vah = bar.high;
    const sortedByDist = [...levels].sort((a, b) => Math.abs(a.price - pocPrice) - Math.abs(b.price - pocPrice));
    const vaLevels: FootprintLevel[] = [];
    for (const lvl of sortedByDist) {
      accumVaVol += lvl.totalVolume;
      vaLevels.push(lvl);
      if (accumVaVol >= targetVaVol) break;
    }
    if (vaLevels.length > 0) {
      val = Math.min(...vaLevels.map((l) => l.price));
      vah = Math.max(...vaLevels.map((l) => l.price));
    }

    // Synthetic Bar Statistics (OI change, Liquidations)
    const seed = Math.sin(bar.time / 60000);
    const longsLiq = !isUp && Math.abs(seed) > 0.4 ? Math.round(totalVol * 0.08) : 0;
    const shortsLiq = isUp && Math.abs(seed) > 0.4 ? Math.round(totalVol * 0.06) : 0;
    const oiChange = Math.round(sumDelta * 0.75 + (seed * totalVol * 0.2));

    const fpBar: FootprintBar = {
      time: bar.time,
      levels,
      pocPrice,
      maxLevelVolume: maxLvlVol,
      maxLevelDelta: maxDelta,
      totalVolume: totalVol,
      totalDelta: sumDelta,
      tickSize: actualStep,
      valPrice: val,
      vahPrice: vah,
      stats: {
        volume: totalVol,
        delta: sumDelta,
        deltaPercent: totalVol > 0 ? (sumDelta / totalVol) * 100 : 0,
        longsLiq,
        shortsLiq,
        oiChange,
      },
    };

    this.computeImbalances(fpBar);

    if (this.barsData.size >= 1000) {
      const oldest = this.barsData.keys().next().value;
      if (oldest !== undefined) this.barsData.delete(oldest);
    }
    this.barsData.set(bar.time, fpBar);
    return fpBar;
  }

  private computeImbalances(bar: FootprintBar): void {
    const settings = getFootprintSettings();
    const ratio = Math.max(1.5, settings.imbalanceRatio || 3.0);
    const levels = bar.levels;

    for (let i = 0; i < levels.length; i++) {
      const cur = levels[i];
      cur.isBuyImbalance = false;
      cur.isSellImbalance = false;

      // Diagonal Buy Imbalance: Ask at i vs Bid at i-1
      if (i > 0) {
        const lowerBid = levels[i - 1].bidVolume;
        if (cur.askVolume >= lowerBid * ratio && cur.askVolume >= 5) {
          cur.isBuyImbalance = true;
        }
      }

      // Diagonal Sell Imbalance: Bid at i vs Ask at i+1
      if (i < levels.length - 1) {
        const higherAsk = levels[i + 1].askVolume;
        if (cur.bidVolume >= higherAsk * ratio && cur.bidVolume >= 5) {
          cur.isSellImbalance = true;
        }
      }
    }
  }

  public clear(): void {
    this.barsData.clear();
  }

  public estimateTickSize(price: number): number {
    if (price >= 10000) return 5.0;
    if (price >= 1000) return 1.0;
    if (price >= 100) return 0.1;
    if (price >= 10) return 0.01;
    if (price >= 1) return 0.0001;
    return 0.00001;
  }
}

/**
 * Renderer layer that paints the bid/ask footprint orderflow representation,
 * imbalances, POC, Value Area, and bottom Bar Statistics summary panel.
 */
class FootprintRendererLayer {
  private canvas: HTMLCanvasElement | null = null;
  private dataManager = FootprintDataManager.getInstance();
  private wasActive = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('omni:footprint-settings-changed', () => {
        // Redraw will occur on next render pass
      });
    }
  }

  public mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  public render(args: any): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    if (args.priceStyle !== 'footprint') {
      if (this.wasActive) {
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.wasActive = false;
      }
      return;
    }

    this.wasActive = true;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    const dpr = args.coords.dpr || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    const settings = getFootprintSettings();
    const range = args.coords.visibleLogicalRange?.() ?? {
      from: 0,
      to: args.bars.length - 1,
    };
    const startIdx = Math.max(0, Math.floor(range.from) - 1);
    const endIdx = Math.min(args.bars.length - 1, Math.ceil(range.to) + 1);
    const pxPerBar = args.coords.pxPerBar();
    const barW = Math.max(16, pxPerBar * 0.9);
    const halfW = barW / 2;

    const canvasH = this.canvas.height / dpr;
    const statsHeight = settings.showBarStatistics ? 108 : 0;
    const tableTop = canvasH - statsHeight;

    // 1. Paint Footprint Candles
    for (let i = startIdx; i <= endIdx; i++) {
      const bar = args.bars[i];
      if (!bar) continue;

      const x = args.coords.logicalToX(i);
      const yHigh = args.coords.priceToY(bar.high, args.scale, args.bounds);
      const yLow = args.coords.priceToY(bar.low, args.scale, args.bounds);
      const isUp = bar.close >= bar.open;

      // Central Spine
      ctx.strokeStyle = isUp ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yHigh);
      ctx.lineTo(Math.round(x) + 0.5, yLow);
      ctx.stroke();

      const fpBar = this.dataManager.getOrCreateBarFootprint(bar);
      const levels = fpBar.levels;
      if (!levels || levels.length === 0) continue;

      const maxVol = Math.max(1, fpBar.maxLevelVolume);
      const maxDelta = Math.max(1, fpBar.maxLevelDelta);

      for (let l = 0; l < levels.length; l++) {
        const lvl = levels[l];
        const halfStep = fpBar.tickSize / 2;
        const yTop = args.coords.priceToY(lvl.price + halfStep, args.scale, args.bounds);
        const yBot = args.coords.priceToY(lvl.price - halfStep, args.scale, args.bounds);
        const rowTop = Math.min(yTop, yBot);
        const rowH = Math.max(2, Math.abs(yBot - yTop));

        // Skip rows below stats table
        if (rowTop + rowH > tableTop && settings.showBarStatistics) continue;

        const isPoc = settings.highlightPoc && Math.abs(lvl.price - fpBar.pocPrice) < fpBar.tickSize * 0.4;
        const isSellImb = settings.highlightImbalances && lvl.isSellImbalance;
        const isBuyImb = settings.highlightImbalances && lvl.isBuyImbalance;

        // Render based on cellsShow mode
        if (settings.cellsShow === 'delta') {
          // Delta histogram mode
          const deltaRatio = Math.min(1, Math.abs(lvl.delta) / maxDelta);
          const barLen = settings.barLengths === 'profile' ? halfW * deltaRatio : halfW;
          const isPos = lvl.delta >= 0;

          ctx.fillStyle = isPos
            ? this.getAlphaShading('#22c55e', deltaRatio, settings)
            : this.getAlphaShading('#ef4444', deltaRatio, settings);

          if (isPos) {
            ctx.fillRect(x + 0.5, rowTop, barLen, rowH);
          } else {
            ctx.fillRect(x - barLen, rowTop, barLen, rowH);
          }

          if (settings.showNumbers && pxPerBar >= 32 && rowH >= 11) {
            ctx.font = '9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            const deltaStr = (lvl.delta > 0 ? '+' : '') + this.formatCompactVol(lvl.delta);
            ctx.fillText(deltaStr, x, rowTop + rowH / 2);
          }
        } else if (settings.cellsShow === 'hyperliquid_net') {
          // Hyperliquid Net Longs mode (Image 2 style)
          const net = lvl.delta;
          const netRatio = Math.min(1, Math.abs(net) / maxDelta);
          const isClosing = net < 0; // Red/pink boxes for big longs closing

          ctx.fillStyle = isClosing
            ? `rgba(244, 63, 94, ${0.35 + 0.5 * netRatio})`
            : `rgba(16, 185, 129, ${0.35 + 0.5 * netRatio})`;

          const blockW = barW * 0.85;
          ctx.fillRect(x - blockW / 2, rowTop, blockW, rowH);

          if (settings.showNumbers && pxPerBar >= 30 && rowH >= 11) {
            ctx.font = 'bold 9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(Math.round(net)), x, rowTop + rowH / 2);
          }
        } else {
          // Standard Bid x Ask Cluster mode (Image 1, 3, 4 style)
          const bidRatio = lvl.bidVolume / maxVol;
          const askRatio = lvl.askVolume / maxVol;

          const bidW = settings.barLengths === 'profile' ? halfW * bidRatio : halfW;
          const askW = settings.barLengths === 'profile' ? halfW * askRatio : halfW;

          ctx.fillStyle = this.getAlphaShading('#ef4444', bidRatio, settings);
          ctx.fillRect(x - bidW, rowTop, bidW - 0.5, rowH);

          ctx.fillStyle = this.getAlphaShading('#22c55e', askRatio, settings);
          ctx.fillRect(x + 0.5, rowTop, askW - 0.5, rowH);

          // Center divider
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(Math.round(x) + 0.5, rowTop);
          ctx.lineTo(Math.round(x) + 0.5, rowTop + rowH);
          ctx.stroke();

          // Imbalance Outlines
          if (isSellImb && rowH > 4) {
            ctx.strokeStyle = '#f87171';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x - halfW + 0.5, rowTop + 0.5, halfW - 1, rowH - 1);
          }
          if (isBuyImb && rowH > 4) {
            ctx.strokeStyle = '#4ade80';
            ctx.lineWidth = 1.2;
            ctx.strokeRect(x + 0.5, rowTop + 0.5, halfW - 1, rowH - 1);
          }

          // Bid x Ask Numbers
          if (settings.showNumbers && pxPerBar >= 36 && rowH >= 11) {
            ctx.font = '9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.textBaseline = 'middle';

            // Left (Bid)
            ctx.fillStyle = isSellImb ? '#fca5a5' : 'rgba(255, 255, 255, 0.9)';
            ctx.textAlign = 'right';
            ctx.fillText(this.formatCompactVol(lvl.bidVolume), x - 3, rowTop + rowH / 2);

            // Right (Ask)
            ctx.fillStyle = isBuyImb ? '#86efac' : 'rgba(255, 255, 255, 0.9)';
            ctx.textAlign = 'left';
            ctx.fillText(this.formatCompactVol(lvl.askVolume), x + 3, rowTop + rowH / 2);
          }
        }

        // POC Box Outline
        if (isPoc && rowH > 4) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.4;
          ctx.strokeRect(x - halfW + 0.5, rowTop + 0.5, barW - 1, rowH - 1);
        }
      }
    }

    // 2. Paint BackQuant Bar Statistics Panel (Image 4)
    if (settings.showBarStatistics) {
      this.renderBarStatisticsPanel(ctx, args, startIdx, endIdx, tableTop, statsHeight, pxPerBar);
    }

    ctx.restore();
  }

  private renderBarStatisticsPanel(
    ctx: CanvasRenderingContext2D,
    args: any,
    startIdx: number,
    endIdx: number,
    top: number,
    height: number,
    pxPerBar: number
  ): void {
    const totalW = ctx.canvas.width;
    const headerW = Math.min(100, Math.max(70, totalW * 0.12));

    // Panel background & top divider
    ctx.fillStyle = 'rgba(11, 14, 17, 0.92)';
    ctx.fillRect(0, top, totalW, height);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, top + 0.5);
    ctx.lineTo(totalW, top + 0.5);
    ctx.stroke();

    const rowLabels = ['Volume', 'Delta', 'Delta %', 'Longs liq', 'Shorts liq', 'OI chg'];
    const rowH = (height - 4) / rowLabels.length;

    // Draw row labels on left
    ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    rowLabels.forEach((label, idx) => {
      const y = top + 2 + idx * rowH;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      if (idx % 2 === 0) ctx.fillRect(0, y, totalW, rowH);

      ctx.fillStyle = '#94a3b8';
      ctx.fillText(label, 8, y + rowH / 2);
    });

    // Draw values under each bar
    for (let i = startIdx; i <= endIdx; i++) {
      const bar = args.bars[i];
      if (!bar) continue;

      const x = args.coords.logicalToX(i);
      const fpBar = this.dataManager.getOrCreateBarFootprint(bar);
      const stats = fpBar.stats;

      const colW = Math.max(16, pxPerBar * 0.92);
      const colLeft = x - colW / 2;

      ctx.font = 'bold 9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';

      // 1. Volume
      const y1 = top + 2 + 0 * rowH;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(this.formatCompactVol(stats.volume), x, y1 + rowH / 2);

      // 2. Delta
      const y2 = top + 2 + 1 * rowH;
      const isPosDelta = stats.delta >= 0;
      ctx.fillStyle = isPosDelta ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.fillRect(colLeft + 1, y2 + 1, colW - 2, rowH - 2);
      ctx.fillStyle = isPosDelta ? '#4ade80' : '#f87171';
      ctx.fillText((isPosDelta ? '+' : '') + this.formatCompactVol(stats.delta), x, y2 + rowH / 2);

      // 3. Delta %
      const y3 = top + 2 + 2 * rowH;
      const pct = stats.deltaPercent;
      ctx.fillStyle = pct >= 0 ? '#4ade80' : '#f87171';
      ctx.fillText((pct >= 0 ? '+' : '') + pct.toFixed(1) + '%', x, y3 + rowH / 2);

      // 4. Longs liq
      const y4 = top + 2 + 3 * rowH;
      ctx.fillStyle = stats.longsLiq > 0 ? '#fb7185' : '#64748b';
      ctx.fillText(stats.longsLiq > 0 ? this.formatCompactVol(stats.longsLiq) : '0', x, y4 + rowH / 2);

      // 5. Shorts liq
      const y5 = top + 2 + 4 * rowH;
      ctx.fillStyle = stats.shortsLiq > 0 ? '#4ade80' : '#64748b';
      ctx.fillText(stats.shortsLiq > 0 ? this.formatCompactVol(stats.shortsLiq) : '0', x, y5 + rowH / 2);

      // 6. OI chg
      const y6 = top + 2 + 5 * rowH;
      const isPosOi = stats.oiChange >= 0;
      ctx.fillStyle = isPosOi ? '#38bdf8' : '#fb923c';
      ctx.fillText((isPosOi ? '+' : '') + this.formatCompactVol(stats.oiChange), x, y6 + rowH / 2);
    }
  }

  private getAlphaShading(baseColor: string, ratio: number, settings: FootprintSettings): string {
    let alpha = 0.5;
    if (settings.cellShading === 'stepped') {
      const steps = Math.max(2, settings.shadingSteps || 4);
      const stepIdx = Math.min(steps - 1, Math.floor(ratio * steps));
      alpha = 0.15 + (0.75 / (steps - 1)) * stepIdx;
    } else if (settings.cellShading === 'solid') {
      alpha = 0.55;
    } else {
      alpha = Math.min(0.88, 0.15 + 0.7 * ratio);
    }

    if (baseColor === '#22c55e') return `rgba(34, 197, 94, ${alpha})`;
    if (baseColor === '#ef4444') return `rgba(239, 68, 68, ${alpha})`;
    return baseColor;
  }

  private formatCompactVol(n: number): string {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (abs >= 1_000) return (n / 1_000).toFixed(1) + 'K';
    return String(Math.round(n));
  }

  public destroy(): void {
    this.canvas = null;
  }
}

/**
 * Interactive Footprint Settings Modal (BackQuant Terminal style).
 */
export function openFootprintSettingsModal(): void {
  const existing = document.getElementById('omni-footprint-settings-modal');
  if (existing) existing.remove();

  const settings = getFootprintSettings();

  const backdrop = document.createElement('div');
  backdrop.id = 'omni-footprint-settings-modal';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: 440px;
    background: #111418;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.85);
    overflow: hidden;
    color: #e2e8f0;
    font-size: 13px;
  `;

  modal.innerHTML = `
    <div style="padding: 14px 18px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: space-between; align-items: center;">
      <div style="font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
        <span style="display: inline-block; width: 14px; height: 14px; color: #22d3a5;">${FOOTPRINT_ICON_SVG}</span>
        Footprint Settings
      </div>
      <button id="fp-modal-close" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 18px; line-height: 1;">&times;</button>
    </div>

    <div style="padding: 18px; display: flex; flex-direction: column; gap: 14px;">
      <!-- Row Size -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Row size (ticks)</label>
        <select id="fp-row-size" style="background: #1a1f26; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; width: 180px;">
          <option value="0" ${settings.rowSizeTicks === 0 ? 'selected' : ''}>Auto (Adaptive)</option>
          <option value="1" ${settings.rowSizeTicks === 1 ? 'selected' : ''}>1 tick</option>
          <option value="5" ${settings.rowSizeTicks === 5 ? 'selected' : ''}>5 ticks</option>
          <option value="10" ${settings.rowSizeTicks === 10 ? 'selected' : ''}>10 ticks</option>
          <option value="25" ${settings.rowSizeTicks === 25 ? 'selected' : ''}>25 ticks (BackQuant)</option>
          <option value="50" ${settings.rowSizeTicks === 50 ? 'selected' : ''}>50 ticks</option>
        </select>
      </div>

      <!-- Cells Show -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Cells show</label>
        <select id="fp-cells-show" style="background: #1a1f26; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; width: 180px;">
          <option value="bid_ask" ${settings.cellsShow === 'bid_ask' ? 'selected' : ''}>Bid x Ask volume</option>
          <option value="delta" ${settings.cellsShow === 'delta' ? 'selected' : ''}>Delta profile</option>
          <option value="hyperliquid_net" ${settings.cellsShow === 'hyperliquid_net' ? 'selected' : ''}>Hyperliquid Net Longs</option>
          <option value="volume" ${settings.cellsShow === 'volume' ? 'selected' : ''}>Total volume bar</option>
        </select>
      </div>

      <!-- Bar Lengths -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Bar lengths</label>
        <select id="fp-bar-lengths" style="background: #1a1f26; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; width: 180px;">
          <option value="profile" ${settings.barLengths === 'profile' ? 'selected' : ''}>Within each bar (its shape)</option>
          <option value="full" ${settings.barLengths === 'full' ? 'selected' : ''}>Full bar width</option>
        </select>
      </div>

      <!-- Cell Shading -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Cell shading</label>
        <select id="fp-cell-shading" style="background: #1a1f26; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 12px; width: 180px;">
          <option value="stepped" ${settings.cellShading === 'stepped' ? 'selected' : ''}>In steps (Sierra Chart)</option>
          <option value="continuous" ${settings.cellShading === 'continuous' ? 'selected' : ''}>Continuous gradient</option>
          <option value="solid" ${settings.cellShading === 'solid' ? 'selected' : ''}>Solid fill</option>
        </select>
      </div>

      <!-- Numbers Checkbox -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Show numbers inside cells</label>
        <input type="checkbox" id="fp-show-numbers" ${settings.showNumbers ? 'checked' : ''} style="cursor: pointer; accent-color: #22d3a5; width: 16px; height: 16px;" />
      </div>

      <!-- Imbalances Checkbox & Ratio -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Highlight Imbalances (ratio)</label>
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" id="fp-highlight-imbalances" ${settings.highlightImbalances ? 'checked' : ''} style="cursor: pointer; accent-color: #22d3a5; width: 16px; height: 16px;" />
          <select id="fp-imbalance-ratio" style="background: #1a1f26; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 4px 8px; font-size: 12px; width: 80px;">
            <option value="2.0" ${settings.imbalanceRatio === 2.0 ? 'selected' : ''}>200%</option>
            <option value="3.0" ${settings.imbalanceRatio === 3.0 ? 'selected' : ''}>300% (3:1)</option>
            <option value="4.0" ${settings.imbalanceRatio === 4.0 ? 'selected' : ''}>400%</option>
            <option value="5.0" ${settings.imbalanceRatio === 5.0 ? 'selected' : ''}>500%</option>
          </select>
        </div>
      </div>

      <!-- Highlight POC -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Highlight POC (Point of Control)</label>
        <input type="checkbox" id="fp-highlight-poc" ${settings.highlightPoc ? 'checked' : ''} style="cursor: pointer; accent-color: #22d3a5; width: 16px; height: 16px;" />
      </div>

      <!-- Bar Statistics Panel -->
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <label style="color: #94a3b8;">Bar statistics table (below chart)</label>
        <input type="checkbox" id="fp-bar-stats" ${settings.showBarStatistics ? 'checked' : ''} style="cursor: pointer; accent-color: #22d3a5; width: 16px; height: 16px;" />
      </div>
    </div>

    <div style="padding: 12px 18px; border-top: 1px solid rgba(255, 255, 255, 0.08); display: flex; justify-content: flex-end; gap: 10px; background: rgba(0, 0, 0, 0.2);">
      <button id="fp-reset-btn" style="background: transparent; color: #94a3b8; border: 1px solid #334155; border-radius: 6px; padding: 6px 14px; font-size: 12px; cursor: pointer;">Defaults</button>
      <button id="fp-done-btn" style="background: #22d3a5; color: #0b0e11; font-weight: 600; border: none; border-radius: 6px; padding: 6px 18px; font-size: 12px; cursor: pointer;">Done</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  modal.querySelector('#fp-modal-close')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const rowSizeSelect = modal.querySelector('#fp-row-size') as HTMLSelectElement;
  const cellsShowSelect = modal.querySelector('#fp-cells-show') as HTMLSelectElement;
  const barLengthsSelect = modal.querySelector('#fp-bar-lengths') as HTMLSelectElement;
  const cellShadingSelect = modal.querySelector('#fp-cell-shading') as HTMLSelectElement;
  const showNumbersInput = modal.querySelector('#fp-show-numbers') as HTMLInputElement;
  const highlightImbInput = modal.querySelector('#fp-highlight-imbalances') as HTMLInputElement;
  const imbRatioSelect = modal.querySelector('#fp-imbalance-ratio') as HTMLSelectElement;
  const highlightPocInput = modal.querySelector('#fp-highlight-poc') as HTMLInputElement;
  const barStatsInput = modal.querySelector('#fp-bar-stats') as HTMLInputElement;

  const applyFromInputs = () => {
    saveFootprintSettings({
      rowSizeTicks: parseInt(rowSizeSelect.value, 10) || 0,
      cellsShow: cellsShowSelect.value as any,
      barLengths: barLengthsSelect.value as any,
      cellShading: cellShadingSelect.value as any,
      showNumbers: showNumbersInput.checked,
      highlightImbalances: highlightImbInput.checked,
      imbalanceRatio: parseFloat(imbRatioSelect.value) || 3.0,
      highlightPoc: highlightPocInput.checked,
      showBarStatistics: barStatsInput.checked,
    });
  };

  [rowSizeSelect, cellsShowSelect, barLengthsSelect, cellShadingSelect, imbRatioSelect].forEach((el) => {
    el.addEventListener('change', applyFromInputs);
  });
  [showNumbersInput, highlightImbInput, highlightPocInput, barStatsInput].forEach((el) => {
    el.addEventListener('change', applyFromInputs);
  });

  modal.querySelector('#fp-reset-btn')?.addEventListener('click', () => {
    saveFootprintSettings(DEFAULT_FOOTPRINT_SETTINGS);
    close();
    openFootprintSettingsModal();
  });

  modal.querySelector('#fp-done-btn')?.addEventListener('click', () => {
    applyFromInputs();
    close();
  });
}

/**
 * Registers the Footprint chart style, renderer layer, and widget actions into Vela.
 */
export function registerFootprintStyle(): void {
  try {
    registerIcon('footprint', FOOTPRINT_ICON_SVG);
    registerIcon('fp-settings', FP_SETTINGS_ICON);
  } catch {
    /* ignore if already registered */
  }

  registerChartType({
    id: 'footprint',
    label: 'Footprint (Order Flow)',
    icon: FOOTPRINT_ICON_SVG,
    basePainting: 'none',
  });

  registerRendererLayer({
    id: 'footprint',
    placement: 'above-data',
    create: () => new FootprintRendererLayer(),
  });

  registerWidgetAction({
    id: 'vela.footprint-settings',
    target: 'topbar',
    label: 'Footprint Settings',
    icon: 'fp-settings',
    order: 81.5,
    run: () => {
      openFootprintSettingsModal();
    },
  });
}
