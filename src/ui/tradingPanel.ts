/**
 * OmniTrading - TradingView-Style Bottom Trading Panel & Trade Manager
 *
 * Provides a persistent docked bottom panel for managing live positions,
 * viewing real-time PnL, 1-click break-even & close actions, and order history.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { BrokerRegistry } from '../brokers/registry';
import type { Position, BrokerAccount } from '../brokers/types';
import type { VelaWorkspace } from '@luxalgo/vela/workspace';

function escapeHtml(t: string): string {
  return String(t || '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

export class TradingPanel {
  private panelEl: HTMLElement | null = null;
  private isExpanded: boolean = true;
  private activeTab: 'positions' | 'history' | 'analytics' = 'positions';
  private positions: Position[] = [];
  private history: any[] = [];
  private unsubs: Array<() => void> = [];

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly toast: (msg: string) => void,
  ) {
    this.initPanel();
    this.bindEvents();
    this.refresh();
  }

  private initPanel(): void {
    const existing = document.getElementById('omni-bottom-trading-panel');
    if (existing) existing.remove();

    const panel = document.createElement('div');
    panel.id = 'omni-bottom-trading-panel';
    panel.className = 'omni-trading-panel';
    panel.style.cssText = `
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 900;
      background: #090e17;
      border-top: 1px solid #1e293b;
      box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.5);
      display: flex;
      flex-direction: column;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      user-select: none;
      transition: height 0.2s ease;
    `;

    document.body.appendChild(panel);
    this.panelEl = panel;
    this.render();
  }

  private bindEvents(): void {
    const onUpdate = () => this.refresh();
    window.addEventListener('omni:position-change', onUpdate);
    window.addEventListener('omni:order-placed', onUpdate);
    window.addEventListener('omni:price-tick', onUpdate);
    window.addEventListener('vela:price-tick', onUpdate);

    this.unsubs.push(() => window.removeEventListener('omni:position-change', onUpdate));
    this.unsubs.push(() => window.removeEventListener('omni:order-placed', onUpdate));
    this.unsubs.push(() => window.removeEventListener('omni:price-tick', onUpdate));
    this.unsubs.push(() => window.removeEventListener('vela:price-tick', onUpdate));

    const registry = BrokerRegistry.getInstance();
    const unsubReg = registry.subscribe(() => this.refresh());
    this.unsubs.push(unsubReg);
  }

  public async refresh(): Promise<void> {
    const registry = BrokerRegistry.getInstance();
    try {
      this.positions = await registry.getPositions();
      this.history = await registry.getOrdersHistory();
      this.render();
    } catch {
      /* ignore */
    }
  }

  public toggle(): void {
    this.isExpanded = !this.isExpanded;
    this.render();
  }

  private render(): void {
    if (!this.panelEl) return;

    const registry = BrokerRegistry.getInstance();
    const adapter = registry.getActiveAdapter();
    const account = registry.getActiveAccount();

    const brokerName = adapter?.name.split('(')[0].trim() || 'Broker';
    const accNum = account?.accountNumber ? `#${account.accountNumber}` : 'Account';
    const env = account?.environment || 'paper';

    // Calculate total unrealized PnL
    let totalUnrealizedPnL = 0;
    for (const p of this.positions) {
      totalUnrealizedPnL += p.unrealizedPnL || 0;
    }
    const pnlFormatted = `${totalUnrealizedPnL >= 0 ? '+' : ''}$${totalUnrealizedPnL.toFixed(2)}`;
    const pnlColor = totalUnrealizedPnL >= 0 ? '#4ade80' : '#f87171';

    const balanceText = account?.balanceFormatted || `$${(account?.balance || 50000).toFixed(2)}`;
    const equityVal = (account?.balance || 50000) + totalUnrealizedPnL;
    const equityText = `$${equityVal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const posCount = this.positions.length;
    const histCount = this.history.length;

    this.panelEl.style.height = this.isExpanded ? '230px' : '36px';

    this.panelEl.innerHTML = `
      <!-- Docked Header Bar -->
      <div style="height: 36px; min-height: 36px; padding: 0 16px; background: #0f172a; border-bottom: ${this.isExpanded ? '1px solid #1e293b' : 'none'}; display: flex; align-items: center; justify-content: space-between;">
        
        <!-- Left: Title, Account, Tabs -->
        <div style="display: flex; align-items: center; gap: 14px;">
          <!-- Expand/Collapse Button -->
          <button type="button" class="btn-toggle-expand" style="background: none; border: none; color: #94a3b8; cursor: pointer; font-size: 13px; padding: 2px 6px; display: flex; align-items: center; gap: 4px;">
            <span>${this.isExpanded ? '▼' : '▲'}</span>
            <strong style="color: #f8fafc; font-size: 12px; letter-spacing: 0.3px;">TRADE MANAGER</strong>
          </button>

          <!-- Account Pill -->
          <div style="display: flex; align-items: center; gap: 8px; font-size: 11px; background: #1e293b; padding: 3px 10px; border-radius: 5px; border: 1px solid #334155;">
            <span style="color: #38bdf8; font-weight: 700;">${escapeHtml(brokerName)}</span>
            <span style="color: #94a3b8;">${escapeHtml(accNum)}</span>
            <span style="background: ${env === 'live' ? 'rgba(239,68,68,0.2)' : 'rgba(56,189,248,0.2)'}; color: ${env === 'live' ? '#ef4444' : '#38bdf8'}; font-size: 9px; font-weight: 800; padding: 1px 4px; border-radius: 3px;">
              ${env.toUpperCase()}
            </span>
            <span style="color: #475569;">|</span>
            <span style="color: #cbd5e1;">Bal: <strong>${balanceText}</strong></span>
            <span style="color: #475569;">|</span>
            <span style="color: #cbd5e1;">Eq: <strong style="color: ${pnlColor};">${equityText}</strong></span>
          </div>

          <!-- Tab Buttons (Visible when expanded) -->
          ${
            this.isExpanded
              ? `
            <div style="display: flex; align-items: center; gap: 4px; margin-left: 8px;">
              <button type="button" class="tab-btn" data-tab="positions" style="background: ${this.activeTab === 'positions' ? '#0284c7' : 'transparent'}; color: ${this.activeTab === 'positions' ? '#fff' : '#94a3b8'}; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                Positions (${posCount})
              </button>
              <button type="button" class="tab-btn" data-tab="history" style="background: ${this.activeTab === 'history' ? '#0284c7' : 'transparent'}; color: ${this.activeTab === 'history' ? '#fff' : '#94a3b8'}; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                Orders History (${histCount})
              </button>
              <button type="button" class="tab-btn" data-tab="analytics" style="background: ${this.activeTab === 'analytics' ? '#0284c7' : 'transparent'}; color: ${this.activeTab === 'analytics' ? '#fff' : '#94a3b8'}; border: none; border-radius: 4px; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer;">
                Analytics &amp; Risk
              </button>
            </div>
          `
              : ''
          }
        </div>

        <!-- Right: Net PnL & Emergency Close All -->
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 6px; font-size: 12px;">
            <span style="color: #94a3b8;">Unrealized PnL:</span>
            <strong style="color: ${pnlColor}; font-family: monospace; font-size: 13px;">${pnlFormatted}</strong>
          </div>

          ${
            posCount > 0
              ? `
            <button type="button" class="btn-close-all" style="background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #f87171; font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 4px; cursor: pointer; transition: all 0.15s ease;">
              Close All (${posCount})
            </button>
          `
              : ''
          }
        </div>
      </div>

      <!-- Drawer Body (when expanded) -->
      ${
        this.isExpanded
          ? `
        <div class="omni-panel-body" style="flex: 1; overflow-y: auto; padding: 10px 16px; background: #080d1a;">
          ${this.renderActiveTabContent()}
        </div>
      `
          : ''
      }
    `;

    // Wire events
    this.panelEl.querySelector('.btn-toggle-expand')?.addEventListener('click', () => this.toggle());

    this.panelEl.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab') as any;
        if (tab) {
          this.activeTab = tab;
          this.render();
        }
      });
    });

    this.panelEl.querySelector('.btn-close-all')?.addEventListener('click', async () => {
      if (confirm(`Are you sure you want to CLOSE ALL ${posCount} open positions at market price?`)) {
        try {
          await registry.closeAllPositions();
          this.toast(`✅ Closed all ${posCount} positions at market.`);
          this.refresh();
        } catch (err: any) {
          this.toast(`❌ Close all failed: ${err.message}`);
        }
      }
    });

    this.wireTableActions();
  }

  private renderActiveTabContent(): string {
    if (this.activeTab === 'positions') {
      return this.renderPositionsTable();
    }
    if (this.activeTab === 'history') {
      return this.renderHistoryTable();
    }
    return this.renderAnalytics();
  }

  private renderPositionsTable(): string {
    if (this.positions.length === 0) {
      return `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 140px; color: #64748b; gap: 8px;">
          <div style="font-size: 24px;">📊</div>
          <div style="font-size: 13px; font-weight: 600; color: #94a3b8;">No open positions</div>
          <div style="font-size: 11px;">Place an order using the Quick Trade widget on the chart to start trading.</div>
        </div>
      `;
    }

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 11.5px; text-align: left;">
        <thead>
          <tr style="color: #64748b; border-bottom: 1px solid #1e293b; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 6px 10px;">Symbol</th>
            <th style="padding: 6px 10px;">Side</th>
            <th style="padding: 6px 10px;">Volume</th>
            <th style="padding: 6px 10px;">Entry Price</th>
            <th style="padding: 6px 10px;">Current Price</th>
            <th style="padding: 6px 10px;">Stop Loss</th>
            <th style="padding: 6px 10px;">Take Profit</th>
            <th style="padding: 6px 10px;">PnL ($)</th>
            <th style="padding: 6px 10px; text-align: right;">Manage Position</th>
          </tr>
        </thead>
        <tbody>
          ${this.positions
            .map((pos) => {
              const isBuy = pos.side === 'buy';
              const sideColor = isBuy ? '#22c55e' : '#ef4444';
              const pnl = pos.unrealizedPnL || 0;
              const pnlColor = pnl >= 0 ? '#4ade80' : '#f87171';
              const pnlFormatted = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.04); transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">
                  <td style="padding: 8px 10px; font-weight: 700; color: #f8fafc;">${escapeHtml(pos.symbol)}</td>
                  <td style="padding: 8px 10px;">
                    <span style="background: ${isBuy ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${sideColor}; font-weight: 800; padding: 2px 6px; border-radius: 4px; font-size: 10px;">
                      ${isBuy ? 'BUY' : 'SELL'}
                    </span>
                  </td>
                  <td style="padding: 8px 10px; color: #cbd5e1; font-family: monospace;">${pos.volume.toFixed(2)}</td>
                  <td style="padding: 8px 10px; color: #cbd5e1; font-family: monospace;">${pos.entryPrice}</td>
                  <td style="padding: 8px 10px; color: #38bdf8; font-family: monospace;">${pos.currentPrice}</td>
                  <td style="padding: 8px 10px; color: ${pos.stopLoss ? '#f87171' : '#64748b'}; font-family: monospace;">
                    ${pos.stopLoss || 'None'}
                  </td>
                  <td style="padding: 8px 10px; color: ${pos.takeProfit ? '#4ade80' : '#64748b'}; font-family: monospace;">
                    ${pos.takeProfit || 'None'}
                  </td>
                  <td style="padding: 8px 10px; font-weight: 700; color: ${pnlColor}; font-family: monospace; font-size: 12px;">
                    ${pnlFormatted}
                  </td>
                  <td style="padding: 8px 10px; text-align: right;">
                    <div style="display: inline-flex; align-items: center; gap: 6px;">
                      <!-- Break Even Button -->
                      <button type="button" class="btn-be" data-id="${pos.id}" data-entry="${pos.entryPrice}" title="Set Stop Loss to Entry Price (Break-Even)" style="background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 4px; cursor: pointer;">
                        BE
                      </button>
                      <!-- Edit SL/TP Button -->
                      <button type="button" class="btn-edit-sl-tp" data-id="${pos.id}" data-sym="${pos.symbol}" data-sl="${pos.stopLoss || ''}" data-tp="${pos.takeProfit || ''}" title="Edit Stop Loss and Take Profit" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; font-size: 10px; font-weight: 600; padding: 3px 6px; border-radius: 4px; cursor: pointer;">
                        ✏️ SL/TP
                      </button>
                      <!-- Partial Close (50%) -->
                      <button type="button" class="btn-partial-close" data-id="${pos.id}" data-vol="${pos.volume}" title="Close 50% of position" style="background: rgba(245, 158, 11, 0.15); border: 1px solid rgba(245, 158, 11, 0.3); color: #fbbf24; font-size: 10px; font-weight: 700; padding: 3px 6px; border-radius: 4px; cursor: pointer;">
                        50%
                      </button>
                      <!-- Close Full -->
                      <button type="button" class="btn-close-single" data-id="${pos.id}" title="Close position" style="background: rgba(239, 68, 68, 0.18); border: 1px solid #ef4444; color: #f87171; font-size: 10px; font-weight: 700; padding: 3px 7px; border-radius: 4px; cursor: pointer;">
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  private renderHistoryTable(): string {
    if (this.history.length === 0) {
      return `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 140px; color: #64748b; gap: 8px;">
          <div style="font-size: 24px;">📜</div>
          <div style="font-size: 13px; font-weight: 600; color: #94a3b8;">No trade history yet</div>
          <div style="font-size: 11px;">Filled orders and closed trades will be logged here.</div>
        </div>
      `;
    }

    return `
      <table style="width: 100%; border-collapse: collapse; font-size: 11px; text-align: left;">
        <thead>
          <tr style="color: #64748b; border-bottom: 1px solid #1e293b; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px;">
            <th style="padding: 6px 10px;">Time</th>
            <th style="padding: 6px 10px;">Order ID</th>
            <th style="padding: 6px 10px;">Symbol</th>
            <th style="padding: 6px 10px;">Side</th>
            <th style="padding: 6px 10px;">Action</th>
            <th style="padding: 6px 10px;">Volume</th>
            <th style="padding: 6px 10px;">Exec Price</th>
            <th style="padding: 6px 10px;">Status</th>
            <th style="padding: 6px 10px; text-align: right;">Realized PnL</th>
          </tr>
        </thead>
        <tbody>
          ${this.history
            .slice(0, 50)
            .map((h) => {
              const timeStr = new Date(h.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const isBuy = h.side === 'buy';
              const pnl = h.realizedPnL;
              const hasPnl = typeof pnl === 'number';
              const pnlColor = hasPnl ? (pnl >= 0 ? '#4ade80' : '#f87171') : '#64748b';
              const pnlText = hasPnl ? `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}` : '--';

              const orderIdStr = String(h.orderId || h.id || '');
              const execPrice = h.fillPrice || h.price || 0;

              return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.03);">
                  <td style="padding: 6px 10px; color: #94a3b8; font-family: monospace;">${timeStr}</td>
                  <td style="padding: 6px 10px; color: #64748b; font-family: monospace;">${escapeHtml(orderIdStr.slice(-10))}</td>
                  <td style="padding: 6px 10px; font-weight: 700; color: #f8fafc;">${escapeHtml(h.symbol)}</td>
                  <td style="padding: 6px 10px;">
                    <span style="color: ${isBuy ? '#22c55e' : '#ef4444'}; font-weight: 700;">${isBuy ? 'BUY' : 'SELL'}</span>
                  </td>
                  <td style="padding: 6px 10px; color: #94a3b8;">${h.action || 'TRADE'}</td>
                  <td style="padding: 6px 10px; color: #cbd5e1; font-family: monospace;">${Number(h.volume).toFixed(2)}</td>
                  <td style="padding: 6px 10px; color: #38bdf8; font-family: monospace;">${execPrice}</td>
                  <td style="padding: 6px 10px;">
                    <span style="background: rgba(56,189,248,0.15); color:#38bdf8; font-size:9.5px; padding:1px 5px; border-radius:3px; font-weight:700;">
                      ${h.status || 'FILLED'}
                    </span>
                  </td>
                  <td style="padding: 6px 10px; text-align: right; font-weight: 700; color: ${pnlColor}; font-family: monospace;">
                    ${pnlText}
                  </td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  private renderAnalytics(): string {
    const closedTrades = this.history.filter((h) => typeof h.realizedPnL === 'number');
    const winningTrades = closedTrades.filter((h) => h.realizedPnL > 0);
    const losingTrades = closedTrades.filter((h) => h.realizedPnL < 0);
    const winRate = closedTrades.length > 0 ? ((winningTrades.length / closedTrades.length) * 100).toFixed(1) : '0.0';

    let totalRealized = 0;
    for (const h of closedTrades) totalRealized += h.realizedPnL;

    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; padding: 10px 0;">
        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">WIN RATE</div>
          <div style="font-size: 20px; font-weight: 800; color: #38bdf8; margin-top: 4px;">${winRate}%</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">${winningTrades.length} won / ${closedTrades.length} closed</div>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">NET REALIZED PNL</div>
          <div style="font-size: 20px; font-weight: 800; color: ${totalRealized >= 0 ? '#4ade80' : '#f87171'}; margin-top: 4px;">
            ${totalRealized >= 0 ? '+' : ''}$${totalRealized.toFixed(2)}
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Cumulative profits</div>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">OPEN TRADES COUNT</div>
          <div style="font-size: 20px; font-weight: 800; color: #f8fafc; margin-top: 4px;">${this.positions.length}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Active in market</div>
        </div>

        <div style="background: #0f172a; border: 1px solid #1e293b; border-radius: 8px; padding: 12px 16px;">
          <div style="font-size: 11px; color: #64748b; font-weight: 600;">PROFIT FACTOR</div>
          <div style="font-size: 20px; font-weight: 800; color: #a78bfa; margin-top: 4px;">
            ${winningTrades.length > 0 && losingTrades.length > 0 ? (winningTrades.length / losingTrades.length).toFixed(2) : '--'}
          </div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 2px;">Wins to Losses ratio</div>
        </div>
      </div>
    `;
  }

  private wireTableActions(): void {
    if (!this.panelEl) return;
    const registry = BrokerRegistry.getInstance();

    // 1. Break-Even Button
    this.panelEl.querySelectorAll('.btn-be').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const entry = parseFloat(btn.getAttribute('data-entry') || '0');
        if (id && entry > 0) {
          try {
            await registry.modifyPosition({ positionId: id, stopLoss: entry });
            this.toast(`🛡️ Position moved to Break-Even (SL: ${entry})`);
            this.refresh();
          } catch (err: any) {
            this.toast(`❌ Break-Even failed: ${err.message}`);
          }
        }
      });
    });

    // 2. Close Single Position
    this.panelEl.querySelectorAll('.btn-close-single').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        if (id) {
          try {
            await registry.closePosition(id);
            this.toast('✅ Position closed at market price.');
            this.refresh();
          } catch (err: any) {
            this.toast(`❌ Close failed: ${err.message}`);
          }
        }
      });
    });

    // 3. Partial Close (50%)
    this.panelEl.querySelectorAll('.btn-partial-close').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const vol = parseFloat(btn.getAttribute('data-vol') || '0');
        if (id && vol > 0) {
          const halfVol = Number((vol / 2).toFixed(2));
          try {
            await registry.closePosition(id, halfVol);
            this.toast(`✅ Closed 50% (${halfVol} lots) of position.`);
            this.refresh();
          } catch (err: any) {
            this.toast(`❌ Partial close failed: ${err.message}`);
          }
        }
      });
    });

    // 4. Edit SL/TP Modal
    this.panelEl.querySelectorAll('.btn-edit-sl-tp').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const sym = btn.getAttribute('data-sym') || '';
        const curSl = btn.getAttribute('data-sl') || '';
        const curTp = btn.getAttribute('data-tp') || '';
        if (id) {
          this.openEditPositionModal(id, sym, curSl, curTp);
        }
      });
    });
  }

  private openEditPositionModal(positionId: string, symbol: string, currentSl: string, currentTp: string): void {
    const existing = document.getElementById('omni-edit-pos-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'omni-edit-pos-modal';
    modal.className = 'ct-overlay';
    modal.style.zIndex = '999999';

    modal.innerHTML = `
      <div class="ct-card" style="max-width: 400px; padding: 22px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; box-shadow: 0 25px 60px rgba(0,0,0,0.85); font-family: system-ui, sans-serif;">
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #1e293b; padding-bottom: 12px;">
          <h3 style="margin: 0; font-size: 16px; color: #f8fafc; font-weight: 700;">Manage Trade: ${escapeHtml(symbol)}</h3>
          <button type="button" class="btn-cancel" style="background:none; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">✕</button>
        </div>

        <form class="edit-pos-form" style="display: flex; flex-direction: column; gap: 14px; margin-top: 16px;">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 12px; color: #f87171; font-weight: 600;">Stop Loss (SL Price)</label>
            <input type="number" step="any" name="sl" value="${escapeHtml(currentSl)}" placeholder="Leave empty for None" style="padding: 8px 12px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 13px;" />
          </div>

          <div style="display: flex; flex-direction: column; gap: 4px;">
            <label style="font-size: 12px; color: #4ade80; font-weight: 600;">Take Profit (TP Price)</label>
            <input type="number" step="any" name="tp" value="${escapeHtml(currentTp)}" placeholder="Leave empty for None" style="padding: 8px 12px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 13px;" />
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px;">
            <button type="button" class="btn-cancel" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 8px 14px; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">Cancel</button>
            <button type="submit" style="background: #0284c7; color: #fff; border: none; padding: 8px 18px; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Save Protection</button>
          </div>
        </form>
      </div>
    `;

    document.body.appendChild(modal);

    const closeModal = () => modal.remove();
    modal.querySelectorAll('.btn-cancel').forEach((b) => b.addEventListener('click', closeModal));

    const form = modal.querySelector('.edit-pos-form') as HTMLFormElement;
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const slVal = fd.get('sl') ? parseFloat(fd.get('sl') as string) : undefined;
      const tpVal = fd.get('tp') ? parseFloat(fd.get('tp') as string) : undefined;

      try {
        const registry = BrokerRegistry.getInstance();
        await registry.modifyPosition({
          positionId,
          stopLoss: isNaN(slVal as any) ? undefined : slVal,
          takeProfit: isNaN(tpVal as any) ? undefined : tpVal,
        });
        this.toast(`✅ Updated protection for ${symbol}`);
        closeModal();
        this.refresh();
      } catch (err: any) {
        alert('Failed to update position: ' + err.message);
      }
    });
  }

  public destroy(): void {
    if (this.panelEl) {
      this.panelEl.remove();
      this.panelEl = null;
    }
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }
}
