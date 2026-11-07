/**
 * OmniTrading - Real-Time Bid/Ask Spread Visualizer
 *
 * Renders real-time spread lines, bid/ask price badges, and spread zone
 * directly on the active chart canvas with sub-pixel coordinate projection.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type { VelaWorkspace } from '@luxalgo/vela/workspace';

interface PriceTickDetail {
  symbolId?: number;
  symbol: string;
  price: number;
  bid: number;
  ask: number;
  time?: number;
}

const PREF_KEY = 'omni-spread-visible';

export class SpreadVisualizer {
  private enabled: boolean = true;
  private lastTick: PriceTickDetail | null = null;
  private pill: HTMLElement | null = null;
  private activeCell: any = null;
  private overlaySvg: SVGSVGElement | null = null;
  private bidLine: SVGLineElement | null = null;
  private askLine: SVGLineElement | null = null;
  private spreadZone: SVGRectElement | null = null;
  private bidLabel: HTMLElement | null = null;
  private askLabel: HTMLElement | null = null;
  private spreadLabel: HTMLElement | null = null;
  private unsubs: Array<() => void> = [];
  private rafId: number | null = null;
  private isFetchingQuote: boolean = false;

  private renderThrottled = () => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (this.enabled) this.render();
    });
  };

  constructor(private readonly getWorkspace: () => VelaWorkspace | null) {
    try {
      const saved = localStorage.getItem(PREF_KEY);
      if (saved !== null) {
        this.enabled = saved === 'true';
      }
    } catch {
      /* ignore */
    }

    this.initChip();
    this.bindEvents();
  }

  private initChip(): void {
    const pill = document.createElement('div');
    pill.className = 'vela-topbar-spread-chip';
    pill.title = 'Click to toggle Bid/Ask Spread Lines on chart';

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });

    this.pill = pill;
    this.updateChip();
    this.mountToTopbar();
  }

  public mountToTopbar(): void {
    if (!this.pill) return;
    const topbarRight = document.querySelector('.vela-topbar-right');
    if (topbarRight) {
      if (this.pill.parentElement !== topbarRight) {
        const ctChip = topbarRight.querySelector('.ct-chip');
        if (ctChip) {
          topbarRight.insertBefore(this.pill, ctChip);
        } else {
          topbarRight.appendChild(this.pill);
        }
      }
    } else {
      setTimeout(() => this.mountToTopbar(), 150);
    }
  }

  private bindEvents(): void {
    // Listen for price ticks
    const onTick = (e: any) => {
      const detail: PriceTickDetail = e.detail;
      if (!detail) return;
      const ws = this.getWorkspace();
      const cell = ws?.active || this.activeCell;
      if (!cell?.symbol) return;

      const cellSym = String(cell.symbol).toUpperCase().replace(/[\/\s_-]/g, '');
      const tickSym = String(detail.symbol).toUpperCase().replace(/[\/\s_-]/g, '');

      if (cellSym === tickSym || cellSym.includes(tickSym) || tickSym.includes(cellSym)) {
        this.lastTick = detail;
        this.updateChip();
        if (this.enabled) {
          this.renderThrottled();
        }
      }
    };
    window.addEventListener('vela:price-tick', onTick);
    window.addEventListener('omni:price-tick', onTick);
    this.unsubs.push(() => window.removeEventListener('vela:price-tick', onTick));
    this.unsubs.push(() => window.removeEventListener('omni:price-tick', onTick));

    // Listen for toggle event from side menu toolbar button
    const onToggle = () => this.toggle();
    window.addEventListener('vela:toggle-spread', onToggle);
    this.unsubs.push(() => window.removeEventListener('vela:toggle-spread', onToggle));

    // Listen for visibility updates from Chart Settings
    const onVisUpdate = (e: any) => {
      const vis = e.detail?.visible;
      if (typeof vis === 'boolean') {
        this.setVisible(vis);
      }
    };
    window.addEventListener('vela:spread-visibility-updated', onVisUpdate);
    this.unsubs.push(() => window.removeEventListener('vela:spread-visibility-updated', onVisUpdate));

    // Listen for window resize
    const onResize = () => {
      if (this.enabled) this.renderThrottled();
    };
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
  }

  public attachToCell(cell: any): void {
    if (!cell) return;
    if (this.activeCell === cell && this.overlaySvg && this.overlaySvg.isConnected) {
      if (!this.lastTick && cell.symbol) {
        this.fetchInitialQuote(cell.symbol);
      }
      return;
    }

    this.teardownOverlay();
    this.activeCell = cell;

    // Listen for cell viewport change to keep spread lines aligned with price axis
    try {
      cell.chart?.on?.('viewport:changed', () => {
        if (this.enabled) this.renderThrottled();
      });
      cell.chart?.on?.('render', () => {
        if (this.enabled) this.renderThrottled();
      });
      cell.chart?.on?.('market:changed', () => {
        if (cell.symbol) this.fetchInitialQuote(cell.symbol);
      });
    } catch {
      /* ignore */
    }

    this.ensureOverlay();
    if (cell.symbol) {
      this.fetchInitialQuote(cell.symbol);
    }
    if (this.enabled) {
      this.render();
    }
  }

  private async fetchInitialQuote(symbol: string): Promise<void> {
    if (this.isFetchingQuote) return;
    this.isFetchingQuote = true;

    try {
      const res = await fetch(`/api/market/quote?symbol=${encodeURIComponent(symbol)}`);
      if (res.ok) {
        const q = await res.json();
        const bid = Number(q.bid);
        const ask = Number(q.ask);
        const price = Number(q.price);
        if (bid > 0 && ask > 0) {
          this.lastTick = { symbol, bid, ask, price: price || (bid + ask) / 2 };
          this.updateChip();
          if (this.enabled) this.render();
          this.isFetchingQuote = false;
          return;
        }
      }
    } catch {
      /* ignore */
    }

    // Fallback: estimate bid/ask from latest candle close if available
    const readout = this.activeCell?.chart?.dataWindowReadout?.();
    const close = Number(readout?.ohlc?.close ?? (this.activeCell as any)?._lastCrossPrice ?? 0);
    if (close > 0) {
      const pip = close > 1000 ? 1 : close > 50 ? 0.01 : 0.0001;
      const spread = pip * 1.5;
      this.lastTick = {
        symbol,
        bid: Number((close - spread / 2).toFixed(5)),
        ask: Number((close + spread / 2).toFixed(5)),
        price: close,
      };
      this.updateChip();
      if (this.enabled) this.render();
    }
    this.isFetchingQuote = false;
  }

  public isVisible(): boolean {
    return this.enabled;
  }

  public setVisible(val: boolean): void {
    if (this.enabled !== val) {
      this.enabled = val;
      try {
        localStorage.setItem(PREF_KEY, String(this.enabled));
      } catch {
        /* ignore */
      }

      const sideBtn = document.querySelector('.vela-dtb-spread-btn') as HTMLElement | null;
      if (sideBtn) {
        sideBtn.style.color = this.enabled ? 'var(--vela-accent, #22d3a5)' : '';
        sideBtn.style.background = this.enabled ? 'rgba(34, 211, 165, 0.12)' : '';
        sideBtn.dataset.selected = this.enabled ? '1' : '0';
      }

      this.updateChip();

      if (this.enabled) {
        this.ensureOverlay();
        if (!this.lastTick && this.activeCell?.symbol) {
          this.fetchInitialQuote(this.activeCell.symbol);
        }
        this.render();
      } else {
        this.hideLines();
      }
    }
  }

  public toggle(): void {
    this.setVisible(!this.enabled);
  }

  private updateChip(): void {
    if (!this.pill) return;
    if (!this.enabled) {
      this.pill.innerHTML = `
        <span class="vela-spread-dot" style="background:#64748b;"></span>
        <span style="color:var(--vela-fg-muted, #8b98a5); font-size:11px;">Spread: Off</span>
      `;
      this.pill.style.borderColor = 'var(--vela-border, #263039)';
      return;
    }

    if (!this.lastTick) {
      this.pill.innerHTML = `
        <span class="vela-spread-dot" style="background:var(--vela-accent, #22d3a5);"></span>
        <span style="color:var(--vela-fg-bright, #f8fafc); font-size:11px;">Spread: Waiting…</span>
      `;
      this.pill.style.borderColor = 'var(--vela-accent, #22d3a5)';
      return;
    }

    const bid = this.lastTick.bid;
    const ask = this.lastTick.ask;
    const spreadVal = Math.max(0, ask - bid);
    const pipSize = spreadVal > 1 ? 1 : (bid > 50 ? 0.01 : 0.0001);
    const spreadPips = (spreadVal / pipSize).toFixed(1);

    this.pill.innerHTML = `
      <span class="vela-spread-dot" style="background:#089981;"></span>
      <span style="color:var(--vela-fg-bright, #f8fafc); font-size:11px; font-weight:600;">
        Spread: <strong style="color:var(--vela-accent, #22d3a5);">${spreadPips}</strong> pips
      </span>
      <span class="vela-spread-status-tag" style="background:rgba(8,153,129,0.18); color:#22d3a5; font-size:9px; font-weight:700; padding:1px 4px; border-radius:3px; margin-left:2px;">LIVE</span>
    `;
    this.pill.style.borderColor = 'var(--vela-accent, #22d3a5)';
  }

  private ensureOverlay(): void {
    if (!this.activeCell) {
      const ws = this.getWorkspace();
      if (ws?.active) {
        this.activeCell = ws.active;
      }
    }
    if (!this.activeCell) return;

    const host = (this.activeCell.host || this.activeCell.element) as HTMLElement;
    if (!host) return;

    if (!this.overlaySvg || !host.contains(this.overlaySvg)) {
      this.teardownOverlay();

      host.style.position = 'relative';

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'omni-spread-overlay-svg');
      svg.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
        overflow: visible;
      `;

      // Semi-transparent shaded spread zone
      const zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      zone.setAttribute('fill', 'rgba(34, 211, 165, 0.06)');
      svg.appendChild(zone);
      this.spreadZone = zone;

      // Ask line (Red / Bearish / Offer)
      const askLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      askLine.setAttribute('stroke', '#f23645');
      askLine.setAttribute('stroke-width', '1.2');
      askLine.setAttribute('stroke-dasharray', '4,3');
      askLine.setAttribute('opacity', '0.9');
      svg.appendChild(askLine);
      this.askLine = askLine;

      // Bid line (Emerald / Bullish / Buyer)
      const bidLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      bidLine.setAttribute('stroke', '#089981');
      bidLine.setAttribute('stroke-width', '1.2');
      bidLine.setAttribute('stroke-dasharray', '4,3');
      bidLine.setAttribute('opacity', '0.9');
      svg.appendChild(bidLine);
      this.bidLine = bidLine;

      // Ask label on price axis
      const askLabel = document.createElement('div');
      askLabel.className = 'omni-spread-ask-badge';
      askLabel.style.cssText = `
        position: absolute;
        right: 2px;
        transform: translateY(-50%);
        background: #f23645;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 6;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        display: none;
        font-family: monospace;
      `;

      // Bid label on price axis
      const bidLabel = document.createElement('div');
      bidLabel.className = 'omni-spread-bid-badge';
      bidLabel.style.cssText = `
        position: absolute;
        right: 2px;
        transform: translateY(-50%);
        background: #089981;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 6;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        display: none;
        font-family: monospace;
      `;

      host.appendChild(svg);
      host.appendChild(askLabel);
      host.appendChild(bidLabel);

      this.overlaySvg = svg;
      this.askLabel = askLabel;
      this.bidLabel = bidLabel;
      this.spreadLabel = null;
    }
  }

  private resolveRenderer(): {
    renderer: any;
    coords: any;
    pane: any;
    projector: any;
    chartWidth: number;
    chartHeight: number;
  } | null {
    if (!this.activeCell) {
      const ws = this.getWorkspace();
      if (ws?.active) {
        this.activeCell = ws.active;
      }
    }
    if (!this.activeCell?.chart) return null;

    const chart = this.activeCell.chart;
    const renderer = (chart as any).rendererPort ?? (chart as any).orchestrator?.renderer ?? (chart as any).renderer;
    const coords = renderer?.coords ?? (chart as any).coords;
    const scene = renderer?.scene ?? (chart as any).scene;
    const pane =
      scene?.panes?.get?.('price') ??
      renderer?.paneNodeAtY?.(20) ??
      scene?.orderedPanes?.()?.find?.((p: any) => p.kind === 'price');
    const projector = typeof renderer?.drawingProjector === 'function' ? renderer.drawingProjector() : null;

    const host = (this.activeCell.host || this.activeCell.element) as HTMLElement;
    const chartWidth = coords?.width || host?.clientWidth || 800;
    const chartHeight = coords?.height || host?.clientHeight || 600;

    if (!coords && !projector) return null;
    return { renderer, coords, pane, projector, chartWidth, chartHeight };
  }

  private priceToY(price: number, res: { coords: any; pane: any; projector: any }): number | null {
    if (typeof price !== 'number' || isNaN(price) || price <= 0) return null;

    if (res.projector && typeof res.projector.yOf === 'function') {
      const y = res.projector.yOf(price, 'price');
      if (typeof y === 'number' && !isNaN(y)) return y;
    }

    if (res.coords && res.pane?.scale && res.pane?.bounds && typeof res.coords.priceToY === 'function') {
      const y = res.coords.priceToY(price, res.pane.scale, res.pane.bounds);
      if (typeof y === 'number' && !isNaN(y)) return y;
    }

    return null;
  }

  private render(): void {
    if (!this.enabled || !this.activeCell?.chart) {
      this.hideLines();
      return;
    }

    if (!this.lastTick) {
      if (this.activeCell.symbol) {
        this.fetchInitialQuote(this.activeCell.symbol);
      }
      this.hideLines();
      return;
    }

    const res = this.resolveRenderer();
    if (!res) {
      this.hideLines();
      return;
    }

    const bid = Number(this.lastTick.bid);
    const ask = Number(this.lastTick.ask);
    if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) {
      this.hideLines();
      return;
    }

    const yBid = this.priceToY(bid, res);
    const yAsk = this.priceToY(ask, res);

    if (yBid === null || yAsk === null || yBid < 0 || yAsk < 0 || yBid > res.chartHeight + 100 || yAsk > res.chartHeight + 100) {
      this.hideLines();
      return;
    }

    const w = res.chartWidth;
    const spreadVal = Math.max(0, ask - bid);
    const pipSize = spreadVal > 1 ? 1 : (bid > 50 ? 0.01 : 0.0001);
    const spreadPips = (spreadVal / pipSize).toFixed(1);
    const digits = pipSize === 0.0001 ? 5 : (pipSize === 0.01 ? 3 : 2);

    this.ensureOverlay();

    if (this.askLine && this.bidLine && this.spreadZone) {
      const topY = Math.min(yAsk, yBid);
      const botY = Math.max(yAsk, yBid);
      const zoneH = Math.max(1, botY - topY);

      this.spreadZone.setAttribute('x', '0');
      this.spreadZone.setAttribute('y', String(topY));
      this.spreadZone.setAttribute('width', String(w));
      this.spreadZone.setAttribute('height', String(zoneH));
      this.spreadZone.style.display = 'block';

      this.askLine.setAttribute('x1', '0');
      this.askLine.setAttribute('y1', String(yAsk));
      this.askLine.setAttribute('x2', String(w));
      this.askLine.setAttribute('y2', String(yAsk));
      this.askLine.style.display = 'block';

      this.bidLine.setAttribute('x1', '0');
      this.bidLine.setAttribute('y1', String(yBid));
      this.bidLine.setAttribute('x2', String(w));
      this.bidLine.setAttribute('y2', String(yBid));
      this.bidLine.style.display = 'block';
    }

    if (this.askLabel && this.bidLabel) {
      this.askLabel.textContent = `Ask ${ask.toFixed(digits)}`;
      this.askLabel.style.top = `${yAsk}px`;
      this.askLabel.style.display = 'block';

      this.bidLabel.textContent = `Bid ${bid.toFixed(digits)}`;
      this.bidLabel.style.top = `${yBid}px`;
      this.bidLabel.style.display = 'block';
    }
  }

  private hideLines(): void {
    if (this.spreadZone) this.spreadZone.style.display = 'none';
    if (this.askLine) this.askLine.style.display = 'none';
    if (this.bidLine) this.bidLine.style.display = 'none';
    if (this.askLabel) this.askLabel.style.display = 'none';
    if (this.bidLabel) this.bidLabel.style.display = 'none';
    if (this.spreadLabel) this.spreadLabel.style.display = 'none';
  }

  private teardownOverlay(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.overlaySvg?.remove();
    this.overlaySvg = null;
    this.bidLine = null;
    this.askLine = null;
    this.spreadZone = null;
    this.askLabel?.remove();
    this.askLabel = null;
    this.bidLabel?.remove();
    this.bidLabel = null;
    this.spreadLabel?.remove();
    this.spreadLabel = null;
  }

  public destroy(): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.pill?.remove();
    this.pill = null;
    this.teardownOverlay();
  }
}
