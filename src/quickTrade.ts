/**
 * OmniTrading - Floating Quick Trade Widget
 *
 * Provides a floating, draggable Buy/Sell widget on charts.
 * Operates through the universal BrokerAdapter interface, working seamlessly
 * with Paper Trading and universal broker adapters.
 *
 * Features:
 * - Draggable top-left bar on active chart cell
 * - Interactive SELL / lot size stepper / BUY controls
 * - Expandable panel for Stop Loss, Take Profit, and One-Click Trading
 * - Confirmation dialog with safety guardrails
 * - Sound effects on execution
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type { VelaWorkspace } from '@luxalgo/vela/workspace';
import { BrokerRegistry } from './brokers/registry';
import type { OrderSide, SymbolSpec } from './brokers/types';
import { playExecutionSound } from './alerts';

interface QuickTradePrefs {
  lots: number;
  tpEnabled: boolean;
  tpPips: number;
  slEnabled: boolean;
  slPips: number;
  instantExecution: boolean;
  minimized: boolean;
  visible?: boolean;
  posX?: number;
  posY?: number;
}

const QT_PREFS_KEY = 'omni-quick-trade-prefs';

function loadPrefs(): QuickTradePrefs {
  try {
    const raw = localStorage.getItem(QT_PREFS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return {
    lots: 0.01,
    tpEnabled: false,
    tpPips: 20,
    slEnabled: false,
    slPips: 15,
    instantExecution: false,
    minimized: true,
    visible: true,
  };
}

function savePrefs(p: QuickTradePrefs): void {
  try {
    localStorage.setItem(QT_PREFS_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export class QuickTradeWidget {
  private el: HTMLElement | null = null;
  private currentCell: any = null;
  private prefs: QuickTradePrefs = loadPrefs();
  private lastBid: number | null = null;
  private lastAsk: number | null = null;
  private symbolSpec: SymbolSpec = {
    symbol: 'BTCUSDT',
    minVolume: 0.01,
    maxVolume: 100,
    stepVolume: 0.01,
    lotSize: 100000,
    digits: 2,
    pipPosition: 2,
    tickSize: 0.01,
  };

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly toast: (msg: string) => void,
  ) {
    (window as any).__omniQuickTrade = this;

    // Listen for price ticks from live data or simulated feeds
    const handleTick = (e: any) => {
      const detail = e.detail;
      if (!detail) return;
      const activeCell = this.getWorkspace()?.active || this.currentCell;
      const cellSym = (activeCell?.symbol || '').toUpperCase().replace(/[\/\s_-]/g, '');
      const tickSym = (detail.symbol || '').toUpperCase().replace(/[\/\s_-]/g, '');

      if (cellSym && tickSym && (cellSym === tickSym || cellSym.includes(tickSym) || tickSym.includes(cellSym))) {
        const price = Number(detail.price);
        if (price > 0) {
          if (typeof detail.bid === 'number' && typeof detail.ask === 'number' && detail.bid > 0 && detail.ask > 0) {
            this.updatePrices(detail.bid, detail.ask);
          } else {
            const pipVal = Math.pow(10, -this.symbolSpec.pipPosition);
            const spread = pipVal * 1.5;
            this.updatePrices(price - spread / 2, price + spread / 2);
          }
        }
      }
    };

    window.addEventListener('vela:price-tick', handleTick);
    window.addEventListener('omni:price-tick', handleTick);
  }

  public show(): void {
    this.prefs.visible = true;
    savePrefs(this.prefs);
    if (this.el) {
      this.el.style.display = 'block';
    }
  }

  public hide(): void {
    this.prefs.visible = false;
    savePrefs(this.prefs);
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  public toggleVisibility(): void {
    this.prefs.visible = this.prefs.visible === false ? true : false;
    savePrefs(this.prefs);
    if (this.el) {
      this.el.style.display = this.prefs.visible ? 'block' : 'none';
    }
    this.toast(this.prefs.visible ? '👁️ Quick Trade Widget shown' : '👁️ Quick Trade Widget hidden');
  }

  public attachToCell(cell: any): void {
    if (!cell) return;
    const hostEl = (cell.host || cell.element || cell) as HTMLElement;
    if (!hostEl || !(hostEl instanceof HTMLElement)) return;

    this.currentCell = cell;
    this.mount(hostEl);
    this.refreshSymbolInfo();
  }

  private async refreshSymbolInfo(): Promise<void> {
    const cell = this.currentCell;
    if (!cell?.symbol) return;
    const cleanSym = String(cell.symbol).toUpperCase().replace(/[\/\s_-]/g, '');

    const registry = BrokerRegistry.getInstance();
    const adapter = registry.getActiveAdapter();
    try {
      this.symbolSpec = await adapter.getSymbolSpec(cell.symbol);
    } catch {
      const isForex = /^(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY){2}$/.test(cleanSym);
      const isJpy = cleanSym.includes('JPY');
      this.symbolSpec = {
        symbol: cell.symbol,
        minVolume: isForex ? 0.01 : 0.001,
        maxVolume: 100,
        stepVolume: isForex ? 0.01 : 0.001,
        lotSize: isForex ? 100000 : 1,
        digits: isJpy ? 3 : isForex ? 5 : 2,
        pipPosition: isJpy ? 2 : isForex ? 4 : 2,
        tickSize: isJpy ? 0.001 : isForex ? 0.00001 : 0.01,
      };
    }
    this.render();
  }

  public updatePrices(bid: number, ask: number): void {
    this.lastBid = bid;
    this.lastAsk = ask;

    if (!this.el) return;
    const bidEl = this.el.querySelector('.qt-bid-price');
    const askEl = this.el.querySelector('.qt-ask-price');
    const digits = this.symbolSpec.digits;

    if (bidEl && bid > 0) bidEl.textContent = bid.toFixed(digits);
    if (askEl && ask > 0) askEl.textContent = ask.toFixed(digits);
  }

  private mount(parent: HTMLElement): void {
    if (this.el && this.el.parentElement === parent) {
      return;
    }
    this.el?.remove();

    this.el = document.createElement('div');
    this.el.className = 'omni-quick-trade-widget';
    this.el.style.display = this.prefs.visible === false ? 'none' : 'block';

    if (this.prefs.posX != null && this.prefs.posY != null) {
      this.el.style.left = `${this.prefs.posX}px`;
      this.el.style.top = `${this.prefs.posY}px`;
    } else {
      this.el.style.left = '94px';
      this.el.style.top = '6px';
    }

    parent.style.position = 'relative';
    parent.appendChild(this.el);
    this.render();
  }

  private render(): void {
    if (!this.el) return;

    const digits = this.symbolSpec.digits;
    const bidStr = this.lastBid ? this.lastBid.toFixed(digits) : '---';
    const askStr = this.lastAsk ? this.lastAsk.toFixed(digits) : '---';

    this.el.innerHTML = `
      <div class="omni-qt-bar">
        <div class="omni-qt-drag-handle" title="Drag widget">⋮⋮</div>
        <button type="button" class="omni-qt-btn omni-qt-sell btn-sell">
          <span class="omni-qt-lbl">SELL</span>
          <span class="omni-qt-price qt-bid-price">${bidStr}</span>
        </button>
        <div class="omni-qt-qty-wrap">
          <button type="button" class="omni-qt-stepper btn-lot-down">−</button>
          <input type="number" class="omni-qt-qty-input input-lots" value="${this.prefs.lots}" step="${this.symbolSpec.stepVolume || 0.01}" min="${this.symbolSpec.minVolume || 0.01}" />
          <button type="button" class="omni-qt-stepper btn-lot-up">+</button>
        </div>
        <button type="button" class="omni-qt-btn omni-qt-buy btn-buy">
          <span class="omni-qt-lbl">BUY</span>
          <span class="omni-qt-price qt-ask-price">${askStr}</span>
        </button>
        <button type="button" class="omni-qt-toggle-panel btn-toggle-panel" title="SL / TP Settings">
          ${this.prefs.minimized ? '▼' : '▲'}
        </button>
      </div>

      <div class="omni-qt-panel" style="display: ${this.prefs.minimized ? 'none' : 'block'};">
        <div class="omni-qt-row">
          <label class="omni-qt-check">
            <input type="checkbox" class="cb-tp" ${this.prefs.tpEnabled ? 'checked' : ''} />
            <span>TP (pips)</span>
          </label>
          <input type="number" class="omni-qt-input-num input-tp" value="${this.prefs.tpPips}" min="1" step="1" />
        </div>
        <div class="omni-qt-row">
          <label class="omni-qt-check">
            <input type="checkbox" class="cb-sl" ${this.prefs.slEnabled ? 'checked' : ''} />
            <span>SL (pips)</span>
          </label>
          <input type="number" class="omni-qt-input-num input-sl" value="${this.prefs.slPips}" min="1" step="1" />
        </div>
        <div class="omni-qt-row omni-qt-instant-row">
          <label class="omni-qt-check" title="Skip confirmation dialog and execute immediately">
            <input type="checkbox" class="cb-instant" ${this.prefs.instantExecution ? 'checked' : ''} />
            <span style="color:#fbbf24;">⚡ One-Click Trading</span>
          </label>
        </div>
      </div>
    `;

    this.wireEvents();
  }

  private wireEvents(): void {
    if (!this.el) return;

    const lotsInput = this.el.querySelector('.input-lots') as HTMLInputElement;
    const btnDown = this.el.querySelector('.btn-lot-down') as HTMLButtonElement;
    const btnUp = this.el.querySelector('.btn-lot-up') as HTMLButtonElement;

    const step = this.symbolSpec.stepVolume || 0.01;
    const minVol = this.symbolSpec.minVolume || 0.01;

    lotsInput?.addEventListener('change', () => {
      const val = parseFloat(lotsInput.value);
      if (val >= minVol) {
        this.prefs.lots = Math.round(val * 100) / 100;
        savePrefs(this.prefs);
      }
    });

    btnDown?.addEventListener('click', () => {
      const next = Math.max(minVol, Math.round((this.prefs.lots - step) * 100) / 100);
      this.prefs.lots = next;
      if (lotsInput) lotsInput.value = String(next);
      savePrefs(this.prefs);
    });

    btnUp?.addEventListener('click', () => {
      const next = Math.round((this.prefs.lots + step) * 100) / 100;
      this.prefs.lots = next;
      if (lotsInput) lotsInput.value = String(next);
      savePrefs(this.prefs);
    });

    // Toggle panel
    this.el.querySelector('.btn-toggle-panel')?.addEventListener('click', () => {
      this.prefs.minimized = !this.prefs.minimized;
      savePrefs(this.prefs);
      this.render();
    });

    // Panel inputs
    const cbTp = this.el.querySelector('.cb-tp') as HTMLInputElement;
    const inputTp = this.el.querySelector('.input-tp') as HTMLInputElement;
    cbTp?.addEventListener('change', () => {
      this.prefs.tpEnabled = cbTp.checked;
      savePrefs(this.prefs);
    });
    inputTp?.addEventListener('change', () => {
      this.prefs.tpPips = Math.max(1, parseInt(inputTp.value, 10) || 20);
      savePrefs(this.prefs);
    });

    const cbSl = this.el.querySelector('.cb-sl') as HTMLInputElement;
    const inputSl = this.el.querySelector('.input-sl') as HTMLInputElement;
    cbSl?.addEventListener('change', () => {
      this.prefs.slEnabled = cbSl.checked;
      savePrefs(this.prefs);
    });
    inputSl?.addEventListener('change', () => {
      this.prefs.slPips = Math.max(1, parseInt(inputSl.value, 10) || 15);
      savePrefs(this.prefs);
    });

    const cbInstant = this.el.querySelector('.cb-instant') as HTMLInputElement;
    cbInstant?.addEventListener('change', () => {
      this.prefs.instantExecution = cbInstant.checked;
      savePrefs(this.prefs);
    });

    // Buy / Sell execution
    this.el.querySelector('.btn-sell')?.addEventListener('click', () => this.handleOrderClick('sell'));
    this.el.querySelector('.btn-buy')?.addEventListener('click', () => this.handleOrderClick('buy'));

    this.setupDragging();
  }

  private handleOrderClick(side: OrderSide): void {
    const cell = this.currentCell || this.getWorkspace()?.active;
    const sym = cell?.symbol;
    if (!sym) {
      this.toast('⚠️ No active symbol to trade.');
      return;
    }

    const estPrice = side === 'buy' ? (this.lastAsk || 0) : (this.lastBid || 0);

    let slPrice: number | undefined;
    let tpPrice: number | undefined;
    const pipPos = this.symbolSpec.pipPosition;
    const pipVal = Math.pow(10, -pipPos);

    if (this.prefs.slEnabled && this.prefs.slPips > 0 && estPrice > 0) {
      slPrice = side === 'buy' ? estPrice - this.prefs.slPips * pipVal : estPrice + this.prefs.slPips * pipVal;
    }
    if (this.prefs.tpEnabled && this.prefs.tpPips > 0 && estPrice > 0) {
      tpPrice = side === 'buy' ? estPrice + this.prefs.tpPips * pipVal : estPrice - this.prefs.tpPips * pipVal;
    }

    const orderParams = {
      symbol: sym,
      side,
      lots: this.prefs.lots,
      stopLoss: slPrice,
      takeProfit: tpPrice,
      estPrice,
    };

    if (this.prefs.instantExecution) {
      this.executeOrder(orderParams);
    } else {
      this.showConfirmation(orderParams);
    }
  }

  private showConfirmation(params: {
    symbol: string;
    side: OrderSide;
    lots: number;
    stopLoss?: number;
    takeProfit?: number;
    estPrice: number;
  }): void {
    document.querySelectorAll('.omni-trade-confirm-modal').forEach((m) => m.remove());

    const modal = document.createElement('div');
    modal.className = 'omni-trade-confirm-modal ct-overlay';
    modal.style.zIndex = '999999';

    const sideLabel = params.side.toUpperCase();
    const sideColor = params.side === 'buy' ? '#22c55e' : '#ef4444';
    const digits = this.symbolSpec.digits;

    const registry = BrokerRegistry.getInstance();
    const adapter = registry.getActiveAdapter();
    const account = registry.getActiveAccount();
    const brokerName = adapter.name.split('(')[0].trim();
    const env = account?.environment || 'paper';

    modal.innerHTML = `
      <div class="ct-card" style="max-width:440px; padding:22px; background:#0f172a; border: 1px solid #334155; border-radius:12px; box-shadow:0 25px 60px rgba(0,0,0,0.8);">
        <header class="ct-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:12px;">
          <div>
            <h2 style="margin:0; font-size:16px; font-weight:700; color:#f8fafc; display:flex; align-items:center; gap:8px;">
              <span>Confirm Order</span>
              <span style="font-size:11px; padding:2px 6px; border-radius:4px; background:${env === 'live' ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.2)'}; color:${env === 'live' ? '#ef4444' : '#38bdf8'}; font-weight:700;">
                ${brokerName} (${env.toUpperCase()})
              </span>
            </h2>
            <p style="margin:3px 0 0 0; font-size:12px; color:#94a3b8;">Manual order execution</p>
          </div>
          <button type="button" class="ct-btn-close btn-cancel" style="background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">✕</button>
        </header>

        <div style="margin:16px 0; display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center; padding:8px 14px; background:${params.side === 'buy' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'}; border:1px solid ${params.side === 'buy' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}; border-radius:6px;">
            <span style="color:#94a3b8; font-size:13px; font-weight:600;">Action</span>
            <strong style="color:${sideColor}; font-size:15px; font-weight:800;">${sideLabel} ${params.lots.toFixed(2)} Lots</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 14px;">
            <span style="color:#94a3b8; font-size:13px;">Instrument</span>
            <strong style="color:#f8fafc; font-size:14px;">${params.symbol}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 14px;">
            <span style="color:#94a3b8; font-size:13px;">Estimated Fill Price</span>
            <strong style="color:#38bdf8; font-size:14px;">${params.estPrice > 0 ? params.estPrice.toFixed(digits) : 'Market Price'}</strong>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 14px;">
            <span style="color:#94a3b8; font-size:13px;">Stop Loss</span>
            <span style="color:#f87171; font-weight:600; font-size:13px;">
              ${params.stopLoss ? `${params.stopLoss.toFixed(digits)} (${this.prefs.slPips} pips)` : 'None'}
            </span>
          </div>
          <div style="display:flex; justify-content:space-between; align-items:center; padding:4px 14px;">
            <span style="color:#94a3b8; font-size:13px;">Take Profit</span>
            <span style="color:#4ade80; font-weight:600; font-size:13px;">
              ${params.takeProfit ? `${params.takeProfit.toFixed(digits)} (${this.prefs.tpPips} pips)` : 'None'}
            </span>
          </div>
        </div>

        <footer style="display:flex; justify-content:flex-end; gap:10px; margin-top:16px;">
          <button type="button" class="btn-cancel" style="background:#1e293b; color:#cbd5e1; border:1px solid #334155; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:600;">Cancel</button>
          <button type="button" class="btn-confirm" style="background:${sideColor}; color:#fff; border:none; padding:8px 20px; border-radius:6px; cursor:pointer; font-size:13px; font-weight:700;">
            Confirm ${sideLabel}
          </button>
        </footer>
      </div>
    `;

    modal.querySelector('.btn-cancel')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.ct-btn-close')?.addEventListener('click', () => modal.remove());
    modal.querySelector('.btn-confirm')?.addEventListener('click', () => {
      modal.remove();
      this.executeOrder(params);
    });

    document.body.appendChild(modal);
  }

  private async executeOrder(params: {
    symbol: string;
    side: OrderSide;
    lots: number;
    stopLoss?: number;
    takeProfit?: number;
    estPrice: number;
  }): Promise<void> {
    const registry = BrokerRegistry.getInstance();
    const adapter = registry.getActiveAdapter();

    try {
      this.toast(`⏳ Submitting ${params.side.toUpperCase()} ${params.lots.toFixed(2)} ${params.symbol} to ${adapter.name}...`);

      const res = await adapter.placeOrder({
        symbol: params.symbol,
        side: params.side,
        volume: params.lots,
        price: params.estPrice,
        stopLoss: params.stopLoss,
        takeProfit: params.takeProfit,
        type: 'market',
      });

      if (res.success) {
        try {
          playExecutionSound('default', 0.7);
        } catch {}
        this.toast(`✅ ${params.side.toUpperCase()} ${params.lots.toFixed(2)} ${params.symbol} filled at ${res.executionPrice || params.estPrice}!`);
      } else {
        this.toast(`❌ Order rejected: ${res.message || 'Check broker log'}`);
      }
    } catch (err: any) {
      console.error('[omni] Quick trade error:', err);
      this.toast(`❌ Order failed: ${err?.message || err}`);
    }
  }

  private setupDragging(): void {
    if (!this.el) return;
    const handle = this.el.querySelector('.omni-qt-drag-handle') as HTMLElement;
    if (!handle) return;

    handle.style.cursor = 'grab';
    handle.style.touchAction = 'none';

    handle.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (this.el) {
        this.el.style.left = '94px';
        this.el.style.top = '6px';
        delete this.prefs.posX;
        delete this.prefs.posY;
        savePrefs(this.prefs);
      }
    });

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0 || !this.el) return;
      e.preventDefault();
      e.stopPropagation();
      handle.style.cursor = 'grabbing';

      const startX = e.clientX;
      const startY = e.clientY;
      const rect = this.el.getBoundingClientRect();
      const parentRect = this.el.parentElement?.getBoundingClientRect() || {
        left: 0,
        top: 0,
        width: window.innerWidth,
        height: window.innerHeight,
      };
      const origLeft = rect.left - parentRect.left;
      const origTop = rect.top - parentRect.top;

      const onPointerMove = (moveEv: PointerEvent) => {
        if (!this.el) return;
        const dx = moveEv.clientX - startX;
        const dy = moveEv.clientY - startY;
        const maxL = Math.max(10, parentRect.width - rect.width - 10);
        const maxT = Math.max(10, parentRect.height - rect.height - 10);
        const newL = Math.max(4, Math.min(maxL, Math.round(origLeft + dx)));
        const newT = Math.max(4, Math.min(maxT, Math.round(origTop + dy)));
        this.el.style.left = `${newL}px`;
        this.el.style.top = `${newT}px`;
      };

      const onPointerUp = (upEv: PointerEvent) => {
        handle.style.cursor = 'grab';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        if (!this.el) return;
        const dx = upEv.clientX - startX;
        const dy = upEv.clientY - startY;
        const maxL = Math.max(10, parentRect.width - rect.width - 10);
        const maxT = Math.max(10, parentRect.height - rect.height - 10);
        const finalL = Math.max(4, Math.min(maxL, Math.round(origLeft + dx)));
        const finalT = Math.max(4, Math.min(maxT, Math.round(origTop + dy)));
        this.prefs.posX = finalL;
        this.prefs.posY = finalT;
        savePrefs(this.prefs);
      };

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }

  public destroy(): void {
    if ((window as any).__omniQuickTrade === this) {
      delete (window as any).__omniQuickTrade;
    }
    this.el?.remove();
    this.el = null;
  }
}
