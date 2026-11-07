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
      // Retry when topbar mounts
      setTimeout(() => this.mountToTopbar(), 150);
    }
  }

  private bindEvents(): void {
    // Listen for price ticks
    const onTick = (e: any) => {
      const detail: PriceTickDetail = e.detail;
      if (!detail) return;
      const ws = this.getWorkspace();
      const cell = ws?.active;
      if (!cell?.symbol) return;

      const cellSym = String(cell.symbol).toUpperCase().replace(/[\/\s_-]/g, '');
      const tickSym = String(detail.symbol).toUpperCase().replace(/[\/\s_-]/g, '');

      if (cellSym === tickSym || cellSym.includes(tickSym) || tickSym.includes(cellSym)) {
        this.lastTick = detail;
        this.updateChip();
        if (this.enabled) {
          this.render();
        }
      }
    };
    window.addEventListener('vela:price-tick', onTick);
    this.unsubs.push(() => window.removeEventListener('vela:price-tick', onTick));

    // Listen for toggle event from side menu toolbar button
    const onToggle = () => this.toggle();
    window.addEventListener('vela:toggle-spread', onToggle);
    this.unsubs.push(() => window.removeEventListener('vela:toggle-spread', onToggle));

    // Listen for window resize
    const onResize = () => {
      if (this.enabled) this.render();
    };
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
  }

  public attachToCell(cell: any): void {
    if (!cell || this.activeCell === cell) return;
    this.teardownOverlay();
    this.activeCell = cell;

    // Listen for cell viewport change to keep spread lines aligned with price axis
    try {
      cell.chart?.on?.('viewport:changed', () => {
        if (this.enabled) this.render();
      });
      cell.chart?.on?.('render', () => {
        if (this.enabled) this.render();
      });
    } catch {
      /* ignore */
    }

    this.ensureOverlay();
    if (this.enabled) {
      this.render();
    }
  }

  public toggle(): void {
    this.enabled = !this.enabled;
    try {
      localStorage.setItem(PREF_KEY, String(this.enabled));
    } catch {
      /* ignore */
    }

    // Sync side menu button appearance
    const sideBtn = document.querySelector('.vela-dtb-spread-btn') as HTMLElement | null;
    if (sideBtn) {
      sideBtn.style.color = this.enabled ? '#38bdf8' : '';
      sideBtn.style.background = this.enabled ? 'rgba(56, 189, 248, 0.12)' : '';
      sideBtn.dataset.selected = this.enabled ? '1' : '0';
    }

    this.updateChip();

    if (this.enabled) {
      this.ensureOverlay();
      this.render();
    } else {
      this.hideLines();
    }
  }

  private updateChip(): void {
    if (!this.pill) return;

    if (!this.lastTick || !this.lastTick.bid || !this.lastTick.ask) {
      this.pill.innerHTML = `
        <span class="vela-spread-dot omni-spread-dot" style="background:${this.enabled ? '#38bdf8' : '#64748b'};"></span>
        <span>Spread: --</span>
      `;
      return;
    }

    const bid = Number(this.lastTick.bid);
    const ask = Number(this.lastTick.ask);
    const spreadVal = Math.max(0, ask - bid);
    // Approximate pip size
    const pipSize = spreadVal > 1 ? 1 : (bid > 50 ? 0.01 : 0.0001);
    const spreadPips = (spreadVal / pipSize).toFixed(1);
    const digits = pipSize === 0.0001 ? 5 : (pipSize === 0.01 ? 3 : 2);

    this.pill.dataset.enabled = this.enabled ? '1' : '0';
    this.pill.innerHTML = `
      <span class="vela-spread-dot omni-spread-dot" style="background:${this.enabled ? '#38bdf8' : '#64748b'};box-shadow:${this.enabled ? '0 0 6px #38bdf8' : 'none'};"></span>
      <span style="color:${this.enabled ? '#f8fafc' : '#94a3b8'};">Spread: <strong style="color:#38bdf8;">${spreadPips} pips</strong></span>
      <span style="color:#475569;">|</span>
      <span style="color:#38bdf8;">Bid: ${bid.toFixed(digits)}</span>
      <span style="color:#f87171;">Ask: ${ask.toFixed(digits)}</span>
      <span class="vela-spread-status-tag omni-spread-status-tag" style="background:${this.enabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.08)'};color:${this.enabled ? '#38bdf8' : '#94a3b8'};">${this.enabled ? 'ON' : 'OFF'}</span>
    `;
  }

  private ensureOverlay(): void {
    if (!this.activeCell) return;
    const host = this.activeCell.host as HTMLElement;
    if (!host) return;

    if (!this.overlaySvg || !host.contains(this.overlaySvg)) {
      this.teardownOverlay();

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'omni-spread-overlay-svg');
      svg.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 4;
        overflow: visible;
      `;

      // Zone between Bid and Ask
      const zone = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      zone.setAttribute('fill', 'rgba(56, 189, 248, 0.06)');
      svg.appendChild(zone);
      this.spreadZone = zone;

      // Ask line (Red / Bearish / Top line)
      const askLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      askLine.setAttribute('stroke', '#ef4444');
      askLine.setAttribute('stroke-width', '1');
      askLine.setAttribute('stroke-dasharray', '4,3');
      askLine.setAttribute('opacity', '0.9');
      svg.appendChild(askLine);
      this.askLine = askLine;

      // Bid line (Blue / Bullish / Bottom line)
      const bidLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      bidLine.setAttribute('stroke', '#3b82f6');
      bidLine.setAttribute('stroke-width', '1');
      bidLine.setAttribute('stroke-dasharray', '4,3');
      bidLine.setAttribute('opacity', '0.9');
      svg.appendChild(bidLine);
      this.bidLine = bidLine;

      // Labels container on price scale gutter
      const askLabel = document.createElement('div');
      askLabel.className = 'omni-spread-ask-badge';
      askLabel.style.cssText = `
        position: absolute;
        right: 2px;
        transform: translateY(-50%);
        background: #ef4444;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 6;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        display: none;
      `;

      const bidLabel = document.createElement('div');
      bidLabel.className = 'omni-spread-bid-badge';
      bidLabel.style.cssText = `
        position: absolute;
        right: 2px;
        transform: translateY(-50%);
        background: #2563eb;
        color: #ffffff;
        font-size: 10px;
        font-weight: 700;
        padding: 1px 5px;
        border-radius: 3px;
        pointer-events: none;
        z-index: 6;
        box-shadow: 0 1px 4px rgba(0,0,0,0.4);
        display: none;
      `;

      const spreadLabel = document.createElement('div');
      spreadLabel.className = 'omni-spread-diff-badge';
      spreadLabel.style.cssText = `
        position: absolute;
        right: 76px;
        transform: translateY(-50%);
        background: rgba(15, 23, 42, 0.85);
        border: 1px solid rgba(56, 189, 248, 0.4);
        color: #38bdf8;
        font-size: 9.5px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 10px;
        pointer-events: none;
        z-index: 6;
        display: none;
        letter-spacing: 0.3px;
      `;

      host.appendChild(svg);
      host.appendChild(askLabel);
      host.appendChild(bidLabel);
      host.appendChild(spreadLabel);

      this.overlaySvg = svg;
      this.askLabel = askLabel;
      this.bidLabel = bidLabel;
      this.spreadLabel = spreadLabel;
    }
  }

  private render(): void {
    if (!this.enabled || !this.activeCell?.chart || !this.lastTick) {
      this.hideLines();
      return;
    }

    const chart = this.activeCell.chart;
    const coords = chart.coords;
    const pane = chart.scene?.panes?.get('price') ?? chart.paneNodeAtY?.(10);
    if (!coords || !pane || !pane.scale || !pane.bounds) {
      this.hideLines();
      return;
    }

    const bid = Number(this.lastTick.bid);
    const ask = Number(this.lastTick.ask);
    if (isNaN(bid) || isNaN(ask) || bid <= 0 || ask <= 0) {
      this.hideLines();
      return;
    }

    const yBid = coords.priceToY(bid, pane.scale, pane.bounds);
    const yAsk = coords.priceToY(ask, pane.scale, pane.bounds);

    if (isNaN(yBid) || isNaN(yAsk) || yBid < 0 || yAsk < 0 || yBid > coords.height + 100 || yAsk > coords.height + 100) {
      this.hideLines();
      return;
    }

    const w = coords.width || this.activeCell.host.clientWidth;
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

    if (this.askLabel && this.bidLabel && this.spreadLabel) {
      this.askLabel.textContent = `Ask ${ask.toFixed(digits)}`;
      this.askLabel.style.top = `${yAsk}px`;
      this.askLabel.style.display = 'block';

      this.bidLabel.textContent = `Bid ${bid.toFixed(digits)}`;
      this.bidLabel.style.top = `${yBid}px`;
      this.bidLabel.style.display = 'block';

      const midY = (yAsk + yBid) / 2;
      this.spreadLabel.textContent = `Spread ${spreadPips} pips`;
      this.spreadLabel.style.top = `${midY}px`;
      this.spreadLabel.style.display = 'block';
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
