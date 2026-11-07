import {
  registerChartType,
  registerRendererLayer,
  registerIcon,
} from '@luxalgo/vela';

export interface FootprintLevel {
  price: number;
  bidVolume: number;
  askVolume: number;
  totalVolume: number;
  delta: number;
}

export interface FootprintBar {
  time: number;
  levels: FootprintLevel[];
  pocPrice: number;
  maxLevelVolume: number;
  totalVolume: number;
  totalDelta: number;
  tickSize: number;
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

/**
 * Manages orderflow footprints from real live trades and builds volume delta profiles
 * for historical candles.
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
      const { price, bid, ask, time } = detail;
      if (!price || !Number.isFinite(price)) return;

      const tradeTime = Number(time || Date.now());
      const isAggressiveBuy = ask > 0 ? price >= ask : price > this.prevTickPrice;
      const isAggressiveSell = bid > 0 ? price <= bid : price < this.prevTickPrice;
      this.prevTickPrice = price;

      // Ingest live real trade
      this.recordLiveTrade(tradeTime, price, isAggressiveBuy ? 1 : 0, isAggressiveSell ? 1 : 0);
    }) as EventListener);
  }

  public recordLiveTrade(time: number, price: number, buyVol: number, sellVol: number): void {
    // Fast O(1) mathematical bucket lookup (1-minute bucketing)
    const bucketTime = Math.floor(time / 60_000) * 60_000;
    const closestTime = this.barsData.has(bucketTime)
      ? bucketTime
      : this.barsData.has(bucketTime - 60_000)
      ? bucketTime - 60_000
      : bucketTime;

    let fpBar = this.barsData.get(closestTime);
    if (!fpBar) {
      // Evict oldest bar if cache exceeds 1,000 bars
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
        totalVolume: 0,
        totalDelta: 0,
        tickSize,
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

    // Update max level volume and POC
    if (level.totalVolume > fpBar.maxLevelVolume) {
      fpBar.maxLevelVolume = level.totalVolume;
      fpBar.pocPrice = level.price;
    }
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

    // Synthesize volume delta profile for historical bar
    const tickSize = this.estimateTickSize(bar.close);
    const range = Math.max(tickSize, bar.high - bar.low);
    const numLevels = Math.min(20, Math.max(4, Math.round(range / tickSize)));
    const actualStep = range / numLevels;

    const levels: FootprintLevel[] = [];
    const totalVol = Math.max(10, Number(bar.volume) || 120);
    const isUp = bar.close >= bar.open;

    // POC sits near the center of the body
    const bodyCenter = (bar.open + bar.close) / 2;
    let maxLvlVol = 0;
    let pocPrice = bar.open;
    let sumDelta = 0;

    for (let i = 0; i <= numLevels; i++) {
      const priceLvl = bar.low + i * actualStep;
      // Gaussian weight around body center
      const dist = Math.abs(priceLvl - bodyCenter) / range;
      const weight = Math.exp(-dist * dist * 8);

      const lvlVol = Math.max(1, Math.round((totalVol / (numLevels + 1)) * (0.3 + 1.8 * weight)));
      // Skew buy vs sell based on bar direction and location
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
    }

    const fpBar: FootprintBar = {
      time: bar.time,
      levels,
      pocPrice,
      maxLevelVolume: maxLvlVol,
      totalVolume: totalVol,
      totalDelta: sumDelta,
      tickSize: actualStep,
    };

    if (this.barsData.size >= 1000) {
      const oldest = this.barsData.keys().next().value;
      if (oldest !== undefined) this.barsData.delete(oldest);
    }
    this.barsData.set(bar.time, fpBar);
    return fpBar;
  }

  private estimateTickSize(price: number): number {
    if (price >= 10000) return 10.0;
    if (price >= 1000) return 1.0;
    if (price >= 100) return 0.1;
    if (price >= 10) return 0.01;
    if (price >= 1) return 0.0001;
    return 0.00001;
  }
}

/**
 * Renderer layer that paints the bid/ask footprint orderflow representation.
 */
class FootprintRendererLayer {
  private canvas: HTMLCanvasElement | null = null;
  private dataManager = FootprintDataManager.getInstance();
  private wasActive = false;

  public mount(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
  }

  public render(args: any): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    // Only paint when Footprint chart style is active
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

    const range = args.coords.visibleLogicalRange?.() ?? {
      from: 0,
      to: args.bars.length - 1,
    };
    const startIdx = Math.max(0, Math.floor(range.from) - 1);
    const endIdx = Math.min(args.bars.length - 1, Math.ceil(range.to) + 1);
    const pxPerBar = args.coords.pxPerBar();
    const barW = Math.max(14, pxPerBar * 0.88);
    const halfW = barW / 2;

    for (let i = startIdx; i <= endIdx; i++) {
      const bar = args.bars[i];
      if (!bar) continue;

      const x = args.coords.logicalToX(i);
      const yHigh = args.coords.priceToY(bar.high, args.scale, args.bounds);
      const yLow = args.coords.priceToY(bar.low, args.scale, args.bounds);
      const isUp = bar.close >= bar.open;

      // 1. Central Wick (Spine)
      ctx.strokeStyle = isUp ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, yHigh);
      ctx.lineTo(Math.round(x) + 0.5, yLow);
      ctx.stroke();

      // 2. Footprint Data
      const fpBar = this.dataManager.getOrCreateBarFootprint(bar);
      const levels = fpBar.levels;
      if (!levels || levels.length === 0) continue;

      const maxVol = Math.max(1, fpBar.maxLevelVolume);

      for (let l = 0; l < levels.length; l++) {
        const lvl = levels[l];
        const halfStep = fpBar.tickSize / 2;
        const yTop = args.coords.priceToY(lvl.price + halfStep, args.scale, args.bounds);
        const yBot = args.coords.priceToY(lvl.price - halfStep, args.scale, args.bounds);
        const rowTop = Math.min(yTop, yBot);
        const rowH = Math.max(2, Math.abs(yBot - yTop));

        const isPoc = Math.abs(lvl.price - fpBar.pocPrice) < fpBar.tickSize * 0.4;
        const isSellImbalance = lvl.bidVolume >= lvl.askVolume * 3 && lvl.bidVolume > 0;
        const isBuyImbalance = lvl.askVolume >= lvl.bidVolume * 3 && lvl.askVolume > 0;

        // Bid Side (Left - Red / Sell volume)
        const bidRatio = lvl.bidVolume / maxVol;
        const bidAlpha = Math.min(0.85, 0.12 + 0.65 * bidRatio);
        ctx.fillStyle = `rgba(239, 68, 68, ${bidAlpha})`;
        ctx.fillRect(x - halfW, rowTop, halfW - 0.5, rowH);

        // Ask Side (Right - Green / Buy volume)
        const askRatio = lvl.askVolume / maxVol;
        const askAlpha = Math.min(0.85, 0.12 + 0.65 * askRatio);
        ctx.fillStyle = `rgba(34, 197, 94, ${askAlpha})`;
        ctx.fillRect(x + 0.5, rowTop, halfW - 0.5, rowH);

        // Center split line
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, rowTop);
        ctx.lineTo(Math.round(x) + 0.5, rowTop + rowH);
        ctx.stroke();

        // Imbalance highlighting borders
        if (isSellImbalance && rowH > 4) {
          ctx.strokeStyle = '#fca5a5';
          ctx.lineWidth = 1;
          ctx.strokeRect(x - halfW + 0.5, rowTop + 0.5, halfW - 1, rowH - 1);
        }
        if (isBuyImbalance && rowH > 4) {
          ctx.strokeStyle = '#86efac';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, rowTop + 0.5, halfW - 1, rowH - 1);
        }

        // POC Box Outline
        if (isPoc && rowH > 4) {
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 1.2;
          ctx.strokeRect(x - halfW + 0.5, rowTop + 0.5, barW - 1, rowH - 1);
        }

        // Text Readouts inside boxes when zoomed in
        if (pxPerBar >= 36 && rowH >= 11) {
          ctx.font = '9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textBaseline = 'middle';

          // Left text: Bid
          ctx.fillStyle = isSellImbalance ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'right';
          ctx.fillText(this.formatCompactVol(lvl.bidVolume), x - 3, rowTop + rowH / 2);

          // Right text: Ask
          ctx.fillStyle = isBuyImbalance ? '#ffffff' : 'rgba(255, 255, 255, 0.9)';
          ctx.textAlign = 'left';
          ctx.fillText(this.formatCompactVol(lvl.askVolume), x + 3, rowTop + rowH / 2);
        }
      }

      // 3. Bottom Bar Badge: Delta & Total Volume
      if (pxPerBar >= 20) {
        const delta = fpBar.totalDelta;
        const deltaStr = (delta >= 0 ? '+' : '') + this.formatCompactVol(delta);
        const badgeY = Math.max(yHigh, yLow) + 8;

        ctx.font = 'bold 9px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        // Delta
        ctx.fillStyle = delta >= 0 ? '#10b981' : '#f43f5e';
        ctx.fillText(deltaStr, x, badgeY);

        // Volume
        if (pxPerBar >= 36) {
          ctx.font = '8px tabular-nums -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.fillStyle = '#94a3b8';
          ctx.fillText(this.formatCompactVol(fpBar.totalVolume), x, badgeY + 11);
        }
      }
    }

    ctx.restore();
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
 * Registers the Footprint chart style and renderer layer into Vela.
 */
export function registerFootprintStyle(): void {
  try {
    registerIcon('footprint', FOOTPRINT_ICON_SVG);
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
}
