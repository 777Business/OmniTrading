/**
 * OmniTrading - Interactive Chart Positions & Order Overlay
 *
 * Renders real-time TradingView-style position lines, entry markers,
 * Stop Loss (SL) lines, Take Profit (TP) lines, and 1-click close buttons
 * directly on the active Vela chart canvas.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { BrokerRegistry } from '../brokers/registry';
import type { Position } from '../brokers/types';
import type { VelaWorkspace } from '@luxalgo/vela/workspace';

function cleanSymbol(sym: string): string {
  let s = String(sym || '').toUpperCase().trim();
  if (s.includes(':')) s = s.split(':').pop() || s;
  return s.replace(/[\/\s_.-]/g, '');
}

export class ChartPositionsOverlay {
  private activeCell: any = null;
  private overlayContainer: HTMLElement | null = null;
  private overlaySvg: SVGSVGElement | null = null;
  private badgesContainer: HTMLElement | null = null;
  private positions: Position[] = [];
  private unsubs: Array<() => void> = [];
  private rafId: number | null = null;
  private attachedHost: HTMLElement | null = null;

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly toast: (msg: string) => void,
  ) {
    this.bindGlobalEvents();
  }

  private renderThrottled = () => {
    if (this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      this.render();
    });
  };

  private bindGlobalEvents(): void {
    const registry = BrokerRegistry.getInstance();

    // 1. Listen for position changes from broker adapters
    const onPosChange = (e: any) => {
      if (e.detail?.positions) {
        this.positions = e.detail.positions;
        this.render();
      } else {
        this.refreshPositions();
      }
    };
    window.addEventListener('omni:position-change', onPosChange);
    this.unsubs.push(() => window.removeEventListener('omni:position-change', onPosChange));

    // 2. Listen for order placed
    const onOrderPlaced = () => {
      this.refreshPositions();
    };
    window.addEventListener('omni:order-placed', onOrderPlaced);
    this.unsubs.push(() => window.removeEventListener('omni:order-placed', onOrderPlaced));

    // 3. Listen for price ticks to update live PnL and badge values
    const onTick = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      const cellSym = (this.activeCell?.symbol || '').toUpperCase().replace(/[\/\s_-]/g, '');
      const tickSym = (detail.symbol || '').toUpperCase().replace(/[\/\s_-]/g, '');

      if (cellSym && tickSym && (cellSym === tickSym || cellSym.includes(tickSym) || tickSym.includes(cellSym))) {
        this.render();
      }
    };
    window.addEventListener('omni:price-tick', onTick);
    window.addEventListener('vela:price-tick', onTick);
    this.unsubs.push(() => window.removeEventListener('omni:price-tick', onTick));
    this.unsubs.push(() => window.removeEventListener('vela:price-tick', onTick));

    // 4. Registry listener
    const unsubReg = registry.subscribe(() => {
      this.refreshPositions();
    });
    this.unsubs.push(unsubReg);

    // 5. Window resize
    const onResize = () => this.render();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));

    this.refreshPositions();
  }

  public async refreshPositions(): Promise<void> {
    const registry = BrokerRegistry.getInstance();
    try {
      this.positions = await registry.getPositions();
      this.render();
    } catch {
      /* ignore */
    }
  }

  public attachToCell(cell: any): void {
    if (!cell || this.activeCell === cell) return;
    this.teardown();
    this.activeCell = cell;

    const host = (cell.host || cell.element) as HTMLElement;
    if (host) {
      this.attachedHost = host;
      host.addEventListener('wheel', this.renderThrottled, { passive: true });
      host.addEventListener('pointermove', this.onPointerMove, { passive: true });
    }

    // Listen to chart viewport and render events
    try {
      cell.chart?.on?.('viewport:changed', () => this.renderThrottled());
      cell.chart?.on?.('render', () => this.renderThrottled());
      cell.chart?.on?.('market:changed', () => {
        this.refreshPositions();
      });
    } catch {
      /* ignore */
    }

    this.ensureOverlay();
    this.refreshPositions();
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (e.buttons > 0) {
      this.renderThrottled();
    }
  };

  private ensureOverlay(): void {
    if (!this.activeCell) return;
    const host = (this.activeCell.host || this.activeCell.element) as HTMLElement;
    if (!host) return;

    if (!this.overlayContainer || !host.contains(this.overlayContainer)) {
      this.teardown();

      const container = document.createElement('div');
      container.className = 'omni-chart-positions-overlay';
      container.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
        overflow: hidden;
      `;

      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'omni-positions-lines-svg');
      svg.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        overflow: visible;
      `;

      const badges = document.createElement('div');
      badges.className = 'omni-positions-badges-layer';
      badges.style.cssText = `
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      `;

      container.appendChild(svg);
      container.appendChild(badges);
      host.appendChild(container);

      this.overlayContainer = container;
      this.overlaySvg = svg;
      this.badgesContainer = badges;
    }
  }

  private teardown(): void {
    if (this.attachedHost) {
      this.attachedHost.removeEventListener('wheel', this.renderThrottled);
      this.attachedHost.removeEventListener('pointermove', this.onPointerMove);
      this.attachedHost = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
      this.overlaySvg = null;
      this.badgesContainer = null;
    }
  }

  public render(): void {
    if (!this.activeCell?.chart || !this.activeCell.symbol) return;
    this.ensureOverlay();
    if (!this.overlaySvg || !this.badgesContainer) return;

    // Clear previous elements
    this.overlaySvg.innerHTML = '';
    this.badgesContainer.innerHTML = '';

    const chart = this.activeCell.chart;
    const coords = chart.coords;
    const pane = chart.scene?.panes?.get('price') ?? chart.paneNodeAtY?.(10);
    if (!coords || !pane || !pane.scale || !pane.bounds) return;

    const cClean = cleanSymbol(this.activeCell.symbol);

    // Filter positions for active chart symbol
    const activePositions = this.positions.filter((p) => {
      const pClean = cleanSymbol(p.symbol);
      if (pClean === cClean) return true;
      if (pClean.includes(cClean) || cClean.includes(pClean)) return true;
      const cBase = cClean.replace(/USDT$/, 'USD');
      const pBase = pClean.replace(/USDT$/, 'USD');
      return cBase === pBase || cBase.includes(pBase) || pBase.includes(cBase);
    });

    if (activePositions.length === 0) return;

    const chartWidth = coords.width || this.activeCell.host?.clientWidth || 800;
    const rightGutter = 85; // Leave room for price scale gutter

    for (const pos of activePositions) {
      const isBuy = pos.side === 'buy';
      const color = isBuy ? '#22c55e' : '#ef4444';
      const sideText = isBuy ? 'BUY' : 'SELL';

      // 1. Position Entry Line
      const yEntry = coords.priceToY(pos.entryPrice, pane.scale, pane.bounds);
      if (!isNaN(yEntry) && yEntry >= 0 && yEntry <= coords.height) {
        // SVG horizontal line
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', '0');
        line.setAttribute('y1', String(yEntry));
        line.setAttribute('x2', String(chartWidth - rightGutter));
        line.setAttribute('y2', String(yEntry));
        line.setAttribute('stroke', color);
        line.setAttribute('stroke-width', '1.5');
        line.setAttribute('stroke-dasharray', '6,4');
        line.setAttribute('opacity', '0.9');
        this.overlaySvg.appendChild(line);

        // Position Badge floating on the line
        const pnl = pos.unrealizedPnL || 0;
        const pnlFormatted = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        const pnlColor = pnl >= 0 ? '#4ade80' : '#f87171';

        const badge = document.createElement('div');
        badge.className = 'omni-chart-position-badge';
        badge.style.cssText = `
          position: absolute;
          left: 14px;
          top: ${yEntry}px;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: #0f172a;
          border: 1px solid ${color};
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 11px;
          color: #f8fafc;
          pointer-events: auto;
          box-shadow: 0 4px 12px rgba(0,0,0,0.6);
          user-select: none;
          z-index: 10;
        `;

        badge.innerHTML = `
          <span style="background:${color}; color:#fff; font-weight:800; font-size:10px; padding:1px 5px; border-radius:3px;">
            ${sideText} ${pos.volume.toFixed(2)}
          </span>
          <span style="color:#cbd5e1; font-weight:600;">@ ${pos.entryPrice}</span>
          <span style="color:${pnlColor}; font-weight:700;">${pnlFormatted}</span>
          <button type="button" class="btn-close-pos" title="Close Position at Market" style="
            background: rgba(239, 68, 68, 0.2);
            border: 1px solid rgba(239, 68, 68, 0.4);
            color: #f87171;
            font-size: 11px;
            font-weight: 700;
            padding: 1px 5px;
            border-radius: 3px;
            cursor: pointer;
            margin-left: 2px;
            line-height: 1.2;
          ">✕</button>
        `;

        // Wire 1-click close from chart line
        badge.querySelector('.btn-close-pos')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          try {
            const registry = BrokerRegistry.getInstance();
            await registry.closePosition(pos.id);
            this.toast(`✅ Closed ${sideText} position ${pos.id} at market.`);
            this.refreshPositions();
          } catch (err: any) {
            this.toast(`❌ Close failed: ${err.message}`);
          }
        });

        this.badgesContainer.appendChild(badge);
      }

      // 2. Stop Loss (SL) Line
      if (pos.stopLoss && pos.stopLoss > 0) {
        const ySl = coords.priceToY(pos.stopLoss, pane.scale, pane.bounds);
        if (!isNaN(ySl) && ySl >= 0 && ySl <= coords.height) {
          const slLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          slLine.setAttribute('x1', '0');
          slLine.setAttribute('y1', String(ySl));
          slLine.setAttribute('x2', String(chartWidth - rightGutter));
          slLine.setAttribute('y2', String(ySl));
          slLine.setAttribute('stroke', '#ef4444');
          slLine.setAttribute('stroke-width', '1.2');
          slLine.setAttribute('stroke-dasharray', '3,3');
          slLine.setAttribute('opacity', '0.85');
          this.overlaySvg.appendChild(slLine);

          const slBadge = document.createElement('div');
          slBadge.style.cssText = `
            position: absolute;
            left: 280px;
            top: ${ySl}px;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(239, 68, 68, 0.15);
            border: 1px solid #ef4444;
            border-radius: 4px;
            padding: 1px 6px;
            font-size: 10px;
            color: #fca5a5;
            font-weight: 700;
            pointer-events: auto;
            z-index: 10;
          `;
          slBadge.innerHTML = `
            <span>SL: ${pos.stopLoss}</span>
            <button type="button" class="btn-remove-sl" title="Remove Stop Loss" style="background:none; border:none; color:#fca5a5; cursor:pointer; font-size:10px; padding:0 2px;">✕</button>
          `;

          slBadge.querySelector('.btn-remove-sl')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const registry = BrokerRegistry.getInstance();
            await registry.modifyPosition({ positionId: pos.id, stopLoss: undefined });
            this.toast('Stop Loss removed.');
            this.refreshPositions();
          });

          this.badgesContainer.appendChild(slBadge);
        }
      }

      // 3. Take Profit (TP) Line
      if (pos.takeProfit && pos.takeProfit > 0) {
        const yTp = coords.priceToY(pos.takeProfit, pane.scale, pane.bounds);
        if (!isNaN(yTp) && yTp >= 0 && yTp <= coords.height) {
          const tpLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          tpLine.setAttribute('x1', '0');
          tpLine.setAttribute('y1', String(yTp));
          tpLine.setAttribute('x2', String(chartWidth - rightGutter));
          tpLine.setAttribute('y2', String(yTp));
          tpLine.setAttribute('stroke', '#22c55e');
          tpLine.setAttribute('stroke-width', '1.2');
          tpLine.setAttribute('stroke-dasharray', '3,3');
          tpLine.setAttribute('opacity', '0.85');
          this.overlaySvg.appendChild(tpLine);

          const tpBadge = document.createElement('div');
          tpBadge.style.cssText = `
            position: absolute;
            left: 280px;
            top: ${yTp}px;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            gap: 4px;
            background: rgba(34, 197, 94, 0.15);
            border: 1px solid #22c55e;
            border-radius: 4px;
            padding: 1px 6px;
            font-size: 10px;
            color: #86efac;
            font-weight: 700;
            pointer-events: auto;
            z-index: 10;
          `;
          tpBadge.innerHTML = `
            <span>TP: ${pos.takeProfit}</span>
            <button type="button" class="btn-remove-tp" title="Remove Take Profit" style="background:none; border:none; color:#86efac; cursor:pointer; font-size:10px; padding:0 2px;">✕</button>
          `;

          tpBadge.querySelector('.btn-remove-tp')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const registry = BrokerRegistry.getInstance();
            await registry.modifyPosition({ positionId: pos.id, takeProfit: undefined });
            this.toast('Take Profit removed.');
            this.refreshPositions();
          });

          this.badgesContainer.appendChild(tpBadge);
        }
      }
    }
  }

  public destroy(): void {
    this.teardown();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
