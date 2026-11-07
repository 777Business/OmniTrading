/**
 * OmniTrading - Interactive Chart Positions & TradingView-Style Order Overlay
 *
 * Renders real-time position lines, entry badges, Stop Loss (SL) lines,
 * Take Profit (TP) lines, and interactive drag-to-adjust handles directly
 * on the active Vela chart canvas.
 *
 * Features:
 * - Direct coordinate resolution via Vela NativeRenderer & drawingProjector
 * - Horizontal dashed entry line with real-time PnL badge & 1-click close
 * - Draggable Take Profit (TP) line with real-time price & projected PnL preview
 * - Draggable Stop Loss (SL) line with real-time price & projected risk preview
 * - 1-Click '+ TP' / '+ SL' quick bracket buttons on entry badge
 * - Native Vela theme colors (emerald #089981 / red #f23645 / accent #22d3a5)
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

interface DraggingState {
  type: 'tp' | 'sl';
  pos: Position;
  startY: number;
  currentY: number;
  currentPrice: number;
  lineEl: SVGLineElement;
  badgeEl: HTMLElement;
  tooltipEl: HTMLElement;
  decimals: number;
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
  private resizeObserver: ResizeObserver | null = null;
  private draggingState: DraggingState | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly toast: (msg: string) => void,
  ) {
    this.bindGlobalEvents();
  }

  private renderThrottled = () => {
    if (this.draggingState) return; // Do not overwrite DOM while actively dragging handle
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

    // 3. Listen for price ticks to update live PnL
    const onTick = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      const cellSym = cleanSymbol(this.activeCell?.symbol || '');
      const tickSym = cleanSymbol(detail.symbol || '');

      if (cellSym && tickSym && (cellSym === tickSym || cellSym.includes(tickSym) || tickSym.includes(cellSym))) {
        this.renderThrottled();
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
    if (!cell) return;
    if (this.activeCell === cell && this.overlayContainer && this.overlayContainer.isConnected) {
      this.refreshPositions();
      return;
    }

    this.teardown();
    this.activeCell = cell;

    const host = (cell.host || cell.element) as HTMLElement;
    if (host) {
      this.attachedHost = host;
      host.addEventListener('wheel', this.renderThrottled, { passive: true });
      host.addEventListener('pointermove', this.onHostPointerMove, { passive: true });

      try {
        this.resizeObserver = new ResizeObserver(() => this.renderThrottled());
        this.resizeObserver.observe(host);
      } catch {}
    }

    // Listen to chart viewport and render events
    try {
      cell.chart?.on?.('viewport:changed', this.renderThrottled);
      cell.chart?.on?.('render', this.renderThrottled);
      cell.chart?.on?.('market:changed', () => this.refreshPositions());
    } catch {}

    this.ensureOverlay();
    this.refreshPositions();
  }

  private onHostPointerMove = (e: PointerEvent): void => {
    if (e.buttons > 0 && !this.draggingState) {
      this.renderThrottled();
    }
  };

  private ensureOverlay(): void {
    if (!this.activeCell) {
      const ws = this.getWorkspace?.();
      if (ws?.active) {
        this.activeCell = ws.active;
      }
    }
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
        z-index: 6;
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
      this.attachedHost.removeEventListener('pointermove', this.onHostPointerMove);
      this.attachedHost = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.overlayContainer) {
      this.overlayContainer.remove();
      this.overlayContainer = null;
      this.overlaySvg = null;
      this.badgesContainer = null;
    }
  }

  /**
   * Resolves the native Vela renderer, coordinates system, and drawing projector.
   */
  private resolveRenderer(): {
    renderer: any;
    coords: any;
    pane: any;
    projector: any;
    chartWidth: number;
    chartHeight: number;
  } | null {
    if (!this.activeCell) {
      const ws = this.getWorkspace?.();
      if (ws?.active) {
        this.activeCell = ws.active;
      }
    }
    if (!this.activeCell?.chart) return null;

    const chart = this.activeCell.chart;
    // On Vela charts: rendererPort is NativeRenderer, or orchestrator.renderer
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

  private yToPrice(y: number, res: { coords: any; pane: any; projector: any }): number | null {
    if (res.projector && typeof res.projector.pxToPoint === 'function') {
      const pt = res.projector.pxToPoint(0, y, 'price');
      if (pt && typeof pt.price === 'number' && !isNaN(pt.price) && pt.price > 0) return pt.price;
    }

    if (res.coords && res.pane?.scale && res.pane?.bounds && typeof res.coords.yToPrice === 'function') {
      const pr = res.coords.yToPrice(y, res.pane.scale, res.pane.bounds);
      if (typeof pr === 'number' && !isNaN(pr) && pr > 0) return pr;
    }

    return null;
  }

  public render(): void {
    if (this.draggingState) return;

    this.ensureOverlay();
    if (!this.overlaySvg || !this.badgesContainer || !this.activeCell) return;

    const res = this.resolveRenderer();
    if (!res) {
      // Schedule quick retry in case renderer was mounting
      if (this.retryTimer === null) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.render();
        }, 80);
      }
      return;
    }

    const { chartWidth, chartHeight } = res;
    if (chartWidth <= 0 || chartHeight <= 0) {
      if (this.retryTimer === null) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.render();
        }, 80);
      }
      return;
    }

    const cellSymbol = cleanSymbol(this.activeCell.symbol || '');

    // Filter positions belonging to the active symbol
    const activePositions = this.positions.filter((p) => {
      const posSymbol = cleanSymbol(p.symbol);
      if (!posSymbol || !cellSymbol) return false;
      if (posSymbol === cellSymbol) return true;
      if (posSymbol.includes(cellSymbol) || cellSymbol.includes(posSymbol)) return true;
      const cBase = cellSymbol.replace(/USDT$/, 'USD');
      const pBase = posSymbol.replace(/USDT$/, 'USD');
      return cBase === pBase || cBase.includes(pBase) || pBase.includes(cBase);
    });

    if (activePositions.length === 0) {
      if (this.overlaySvg.hasChildNodes()) this.overlaySvg.innerHTML = '';
      if (this.badgesContainer.hasChildNodes()) this.badgesContainer.innerHTML = '';
      return;
    }

    // Clear previous DOM
    this.overlaySvg.innerHTML = '';
    this.badgesContainer.innerHTML = '';

    const rightGutter = 85; // Leave room for price axis
    const maxLineX = Math.max(100, chartWidth - rightGutter);

    for (const pos of activePositions) {
      const isBuy = pos.side === 'buy';
      const sideText = isBuy ? 'BUY' : 'SELL';
      const entryColor = isBuy ? '#089981' : '#f23645'; // Native Vela Up/Down palette

      // Determine price decimal places
      const priceDecimals = String(pos.entryPrice).includes('.')
        ? String(pos.entryPrice).split('.')[1].length
        : 2;

      // -------------------------------------------------------------
      // 1. POSITION ENTRY LINE & BADGE
      // -------------------------------------------------------------
      const yEntry = this.priceToY(pos.entryPrice, res);
      if (yEntry !== null && yEntry >= 0 && yEntry <= chartHeight) {
        // SVG dashed entry line
        const entryLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        entryLine.setAttribute('x1', '0');
        entryLine.setAttribute('y1', String(yEntry));
        entryLine.setAttribute('x2', String(maxLineX));
        entryLine.setAttribute('y2', String(yEntry));
        entryLine.setAttribute('stroke', entryColor);
        entryLine.setAttribute('stroke-width', '1.5');
        entryLine.setAttribute('stroke-dasharray', '6,4');
        entryLine.setAttribute('opacity', '0.92');
        this.overlaySvg.appendChild(entryLine);

        // Entry Badge floating on line
        const pnl = pos.unrealizedPnL || 0;
        const pnlFormatted = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
        const pnlColor = pnl >= 0 ? '#22d3a5' : '#f87171';

        const entryBadge = document.createElement('div');
        entryBadge.className = 'omni-chart-position-badge';
        entryBadge.style.cssText = `
          position: absolute;
          left: 12px;
          top: ${yEntry}px;
          transform: translateY(-50%);
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background: var(--vela-surface-sunken, #0b0e11);
          border: 1px solid ${entryColor};
          border-radius: 6px;
          padding: 2px 8px;
          font-size: 11px;
          color: var(--vela-fg-bright, #f8fafc);
          pointer-events: auto;
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7);
          user-select: none;
          z-index: 10;
        `;

        const hasTp = typeof pos.takeProfit === 'number' && pos.takeProfit > 0;
        const hasSl = typeof pos.stopLoss === 'number' && pos.stopLoss > 0;

        entryBadge.innerHTML = `
          <span style="background:${entryColor}; color:#ffffff; font-weight:800; font-size:10px; padding:1px 6px; border-radius:3px; letter-spacing:0.3px;">
            ${sideText} ${pos.volume.toFixed(2)}
          </span>
          <span style="color:var(--vela-fg-muted, #8b98a5); font-weight:600; font-family:monospace;">@ ${pos.entryPrice.toFixed(priceDecimals)}</span>
          <span style="color:${pnlColor}; font-weight:700; font-family:monospace;">${pnlFormatted}</span>
          ${!hasTp ? `<button type="button" class="btn-add-tp" title="Add Take Profit (TradingView bracket)" style="background:rgba(8,153,129,0.18); border:1px solid #089981; color:#22d3a5; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; cursor:pointer;">+ TP</button>` : ''}
          ${!hasSl ? `<button type="button" class="btn-add-sl" title="Add Stop Loss (TradingView bracket)" style="background:rgba(242,54,69,0.18); border:1px solid #f23645; color:#fca5a5; font-size:10px; font-weight:700; padding:1px 5px; border-radius:3px; cursor:pointer;">+ SL</button>` : ''}
          <button type="button" class="btn-close-pos" title="Close Position at Market" style="
            background: rgba(242, 54, 69, 0.2);
            border: 1px solid rgba(242, 54, 69, 0.4);
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

        // Wire 1-click close from chart badge
        entryBadge.querySelector('.btn-close-pos')?.addEventListener('click', async (e) => {
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

        // Wire '+ TP' bracket creation button
        entryBadge.querySelector('.btn-add-tp')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const offsetPercent = isBuy ? 0.015 : -0.015;
          const defaultTp = Number((pos.entryPrice * (1 + offsetPercent)).toFixed(priceDecimals));
          try {
            const registry = BrokerRegistry.getInstance();
            await registry.modifyPosition({ positionId: pos.id, takeProfit: defaultTp });
            this.toast(`🎯 Set Take Profit at ${defaultTp}. Drag handle on chart to adjust.`);
            this.refreshPositions();
          } catch (err: any) {
            this.toast(`❌ Could not set TP: ${err.message}`);
          }
        });

        // Wire '+ SL' bracket creation button
        entryBadge.querySelector('.btn-add-sl')?.addEventListener('click', async (e) => {
          e.stopPropagation();
          const offsetPercent = isBuy ? -0.01 : 0.01;
          const defaultSl = Number((pos.entryPrice * (1 + offsetPercent)).toFixed(priceDecimals));
          try {
            const registry = BrokerRegistry.getInstance();
            await registry.modifyPosition({ positionId: pos.id, stopLoss: defaultSl });
            this.toast(`🛡️ Set Stop Loss at ${defaultSl}. Drag handle on chart to adjust.`);
            this.refreshPositions();
          } catch (err: any) {
            this.toast(`❌ Could not set SL: ${err.message}`);
          }
        });

        this.badgesContainer.appendChild(entryBadge);
      }

      // -------------------------------------------------------------
      // 2. TAKE PROFIT (TP) LINE & INTERACTIVE DRAGGABLE HANDLE
      // -------------------------------------------------------------
      if (typeof pos.takeProfit === 'number' && pos.takeProfit > 0) {
        const yTp = this.priceToY(pos.takeProfit, res);
        if (yTp !== null && yTp >= 0 && yTp <= chartHeight) {
          const tpLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          tpLine.setAttribute('x1', '0');
          tpLine.setAttribute('y1', String(yTp));
          tpLine.setAttribute('x2', String(maxLineX));
          tpLine.setAttribute('y2', String(yTp));
          tpLine.setAttribute('stroke', '#089981');
          tpLine.setAttribute('stroke-width', '1.4');
          tpLine.setAttribute('stroke-dasharray', '4,3');
          tpLine.setAttribute('opacity', '0.9');
          this.overlaySvg.appendChild(tpLine);

          const tpDiff = Math.abs(pos.takeProfit - pos.entryPrice);
          const tpPnlEst = tpDiff * pos.volume * (isBuy ? 1 : 1);
          const tpSign = (isBuy && pos.takeProfit > pos.entryPrice) || (!isBuy && pos.takeProfit < pos.entryPrice) ? '+' : '-';

          const tpBadge = document.createElement('div');
          tpBadge.className = 'omni-chart-tp-badge';
          tpBadge.style.cssText = `
            position: absolute;
            left: 230px;
            top: ${yTp}px;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: var(--vela-surface-sunken, #0b0e11);
            border: 1px solid #089981;
            border-radius: 5px;
            padding: 2px 7px;
            font-size: 11px;
            color: #22d3a5;
            font-weight: 700;
            pointer-events: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.6);
            z-index: 10;
            user-select: none;
          `;

          tpBadge.innerHTML = `
            <span class="omni-drag-handle" title="Drag to adjust Take Profit" style="cursor: ns-resize; padding: 1px 4px; background: rgba(34, 211, 165, 0.15); border-radius: 3px; font-size: 10px; color: #22d3a5;">⇕ Drag</span>
            <span class="tp-label-text">TP: ${pos.takeProfit.toFixed(priceDecimals)} (${tpSign}$${tpPnlEst.toFixed(2)})</span>
            <button type="button" class="btn-remove-tp" title="Remove Take Profit" style="background:none; border:none; color:var(--vela-fg-muted, #8b98a5); cursor:pointer; font-size:11px; padding:0 2px;">✕</button>
          `;

          // Wire remove TP
          tpBadge.querySelector('.btn-remove-tp')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              const registry = BrokerRegistry.getInstance();
              await registry.modifyPosition({ positionId: pos.id, takeProfit: undefined });
              this.toast('Take Profit removed.');
              this.refreshPositions();
            } catch (err: any) {
              this.toast(`❌ Failed: ${err.message}`);
            }
          });

          // Wire drag handle for TP
          const dragHandle = tpBadge.querySelector('.omni-drag-handle') as HTMLElement;
          if (dragHandle) {
            this.setupBracketDrag(dragHandle, 'tp', pos, tpLine, tpBadge, priceDecimals);
          }

          this.badgesContainer.appendChild(tpBadge);
        }
      }

      // -------------------------------------------------------------
      // 3. STOP LOSS (SL) LINE & INTERACTIVE DRAGGABLE HANDLE
      // -------------------------------------------------------------
      if (typeof pos.stopLoss === 'number' && pos.stopLoss > 0) {
        const ySl = this.priceToY(pos.stopLoss, res);
        if (ySl !== null && ySl >= 0 && ySl <= chartHeight) {
          const slLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
          slLine.setAttribute('x1', '0');
          slLine.setAttribute('y1', String(ySl));
          slLine.setAttribute('x2', String(maxLineX));
          slLine.setAttribute('y2', String(ySl));
          slLine.setAttribute('stroke', '#f23645');
          slLine.setAttribute('stroke-width', '1.4');
          slLine.setAttribute('stroke-dasharray', '4,3');
          slLine.setAttribute('opacity', '0.9');
          this.overlaySvg.appendChild(slLine);

          const slDiff = Math.abs(pos.stopLoss - pos.entryPrice);
          const slPnlEst = slDiff * pos.volume;

          const slBadge = document.createElement('div');
          slBadge.className = 'omni-chart-sl-badge';
          slBadge.style.cssText = `
            position: absolute;
            left: 230px;
            top: ${ySl}px;
            transform: translateY(-50%);
            display: inline-flex;
            align-items: center;
            gap: 5px;
            background: var(--vela-surface-sunken, #0b0e11);
            border: 1px solid #f23645;
            border-radius: 5px;
            padding: 2px 7px;
            font-size: 11px;
            color: #fca5a5;
            font-weight: 700;
            pointer-events: auto;
            box-shadow: 0 4px 12px rgba(0,0,0,0.6);
            z-index: 10;
            user-select: none;
          `;

          slBadge.innerHTML = `
            <span class="omni-drag-handle" title="Drag to adjust Stop Loss" style="cursor: ns-resize; padding: 1px 4px; background: rgba(242, 54, 69, 0.15); border-radius: 3px; font-size: 10px; color: #fca5a5;">⇕ Drag</span>
            <span class="sl-label-text">SL: ${pos.stopLoss.toFixed(priceDecimals)} (-$${slPnlEst.toFixed(2)})</span>
            <button type="button" class="btn-remove-sl" title="Remove Stop Loss" style="background:none; border:none; color:var(--vela-fg-muted, #8b98a5); cursor:pointer; font-size:11px; padding:0 2px;">✕</button>
          `;

          // Wire remove SL
          slBadge.querySelector('.btn-remove-sl')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
              const registry = BrokerRegistry.getInstance();
              await registry.modifyPosition({ positionId: pos.id, stopLoss: undefined });
              this.toast('Stop Loss removed.');
              this.refreshPositions();
            } catch (err: any) {
              this.toast(`❌ Failed: ${err.message}`);
            }
          });

          // Wire drag handle for SL
          const dragHandle = slBadge.querySelector('.omni-drag-handle') as HTMLElement;
          if (dragHandle) {
            this.setupBracketDrag(dragHandle, 'sl', pos, slLine, slBadge, priceDecimals);
          }

          this.badgesContainer.appendChild(slBadge);
        }
      }
    }
  }

  /**
   * Interactive drag handler for TP and SL bracket lines.
   * Tracks pointermove, converts pixel Y to price in real time,
   * updates line and floating tooltip, and commits to broker on pointerup.
   */
  private setupBracketDrag(
    handle: HTMLElement,
    type: 'tp' | 'sl',
    pos: Position,
    lineEl: SVGLineElement,
    badgeEl: HTMLElement,
    decimals: number,
  ): void {
    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();

      const host = (this.activeCell?.host || this.activeCell?.element) as HTMLElement;
      if (!host) return;

      const hostRect = host.getBoundingClientRect();
      const startY = e.clientY - hostRect.top;
      const initialPrice = type === 'tp' ? (pos.takeProfit || pos.entryPrice) : (pos.stopLoss || pos.entryPrice);

      // Create floating drag preview tooltip
      const tooltip = document.createElement('div');
      tooltip.className = 'omni-bracket-drag-tooltip';
      tooltip.style.cssText = `
        position: absolute;
        left: 360px;
        top: ${startY}px;
        transform: translateY(-50%);
        background: var(--vela-surface-elev, #1a1d24);
        border: 1px solid ${type === 'tp' ? '#089981' : '#f23645'};
        color: var(--vela-fg-bright, #f8fafc);
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        box-shadow: 0 6px 20px rgba(0,0,0,0.8);
        pointer-events: none;
        z-index: 100;
        display: flex;
        align-items: center;
        gap: 6px;
      `;
      host.appendChild(tooltip);

      this.draggingState = {
        type,
        pos,
        startY,
        currentY: startY,
        currentPrice: initialPrice,
        lineEl,
        badgeEl,
        tooltipEl: tooltip,
        decimals,
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      const onPointerMove = (moveEv: PointerEvent) => {
        if (!this.draggingState) return;
        const currentY = Math.max(10, Math.min(hostRect.height - 20, moveEv.clientY - hostRect.top));
        this.draggingState.currentY = currentY;

        const res = this.resolveRenderer();
        if (!res) return;

        const price = this.yToPrice(currentY, res);
        if (price === null) return;

        const roundedPrice = Number(price.toFixed(decimals));
        this.draggingState.currentPrice = roundedPrice;

        // Move SVG line
        lineEl.setAttribute('y1', String(currentY));
        lineEl.setAttribute('y2', String(currentY));

        // Move badge
        badgeEl.style.top = `${currentY}px`;

        // Update badge text preview
        const diff = Math.abs(roundedPrice - pos.entryPrice);
        const estPnl = diff * pos.volume;
        const isBuy = pos.side === 'buy';
        const isFavorable = type === 'tp'
          ? (isBuy ? roundedPrice > pos.entryPrice : roundedPrice < pos.entryPrice)
          : (isBuy ? roundedPrice < pos.entryPrice : roundedPrice > pos.entryPrice);
        const sign = isFavorable ? (type === 'tp' ? '+' : '-') : (type === 'tp' ? '-' : '+');

        const labelText = badgeEl.querySelector(`.${type}-label-text`);
        if (labelText) {
          labelText.textContent = `${type.toUpperCase()}: ${roundedPrice.toFixed(decimals)} (${sign}$${estPnl.toFixed(2)})`;
        }

        // Update tooltip
        tooltip.style.top = `${currentY}px`;
        tooltip.innerHTML = `
          <span>${type === 'tp' ? '🎯 Adjust TP' : '🛡️ Adjust SL'}: <strong>${roundedPrice.toFixed(decimals)}</strong></span>
          <span style="color: ${type === 'tp' ? '#22d3a5' : '#f87171'};">(${sign}$${estPnl.toFixed(2)})</span>
        `;
      };

      const onPointerUp = async () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);

        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        if (!this.draggingState) return;
        const { currentPrice } = this.draggingState;
        tooltip.remove();
        this.draggingState = null;

        try {
          const registry = BrokerRegistry.getInstance();
          if (type === 'tp') {
            await registry.modifyPosition({ positionId: pos.id, takeProfit: currentPrice });
            this.toast(`🎯 Take Profit updated to ${currentPrice.toFixed(decimals)}`);
          } else {
            await registry.modifyPosition({ positionId: pos.id, stopLoss: currentPrice });
            this.toast(`🛡️ Stop Loss updated to ${currentPrice.toFixed(decimals)}`);
          }
        } catch (err: any) {
          this.toast(`❌ Failed to update ${type.toUpperCase()}: ${err.message}`);
        }

        this.refreshPositions();
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  public destroy(): void {
    this.teardown();
    for (const unsub of this.unsubs) unsub();
    this.unsubs = [];
  }
}
