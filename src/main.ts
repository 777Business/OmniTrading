/**
 * OmniTrading - Main Application Entry Point
 *
 * Fast, local, private, fully customizable trading platform.
 * Integrates Vela open-source charting, universal broker adapters,
 * multi-account management, top navigation bar, Pine Script editor,
 * cell splitting and grouping, and server-enforced safety guardrails.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { registerIcon, registerWidgetAction } from '@luxalgo/vela';

import {
  BUILTIN_THEMES,
  getAllThemes,
  applyTheme,
  getSavedThemeId,
  getSavedThemePreset,
  registerAllThemes,
  openThemeSettingsModal,
  openCustomThemeModal,
  deleteCustomTheme,
} from './theme';

import {
  getSavedLayouts,
  saveLayout,
  loadLayout,
  deleteLayout,
  addChartCell,
  closeCell,
  duplicateIndicator,
  applyCleanView,
  toggleGridlines,
} from './layoutManager';

import {
  renderColorLinkBadge,
  updateWorkspaceColorSync,
  refreshAllColorBadges,
  getCellColorGroup,
  setCellColorGroupDirect,
  setCellColorGroup,
  COLOR_GROUPS,
} from './colorLink';
import * as colorLink from './colorLink';

(window as any).colorLink = colorLink;
(window as any).layoutManager = { addChartCell, closeCell, duplicateIndicator, saveLayout, loadLayout };

import { WatchlistManager } from './watchlist';
import { FavoritesBarController } from './favoritesBar';
import './templateModal';

import {
  addAlert,
  getAlerts,
  removeAlert,
  checkPriceAlerts,
  wireCellAlerts,
  openManageAlertsModal,
  createOmniAlertDrawing,
  playOmniAlertSound,
  updateTopbarAlertBadge,
  initAlertsWorkspaceWiring,
} from './alerts';

import { QuickTradeWidget } from './quickTrade';
import { SpreadVisualizer } from './spread';
import { PineScriptEditor } from './pineEditor';
import { ReplayManager } from './replay';
import { openAboutModal } from './ui/aboutModal';
import { registerFootprintStyle } from './footprint';
import { ChartPositionsOverlay } from './ui/chartPositionsOverlay';
import { TradingPanel } from './ui/tradingPanel';

import { BrokerRegistry } from './brokers/registry';
import type { BrokerAccount } from './brokers/types';
import { openBrokerModal } from './ui/brokerModal';
import * as api from './api';
import { loadPrefs, savePrefs } from './config';

const PERSIST_KEY = 'omni-workspace';
const DEFAULT_TIMEFRAME = '240';
const DEFAULT_BARS = 1000;
const DEFAULT_SYMBOL = 'BTCUSDT';

let workspace: VelaWorkspace | null = null;
let favBarInstance: FavoritesBarController | null = null;
let brokerChip: HTMLButtonElement | null = null;
let killSwitchBtn: HTMLButtonElement | null = null;
let isKillSwitchActive = false;

// ---- Sub-components -------------------------------------------------------

const watchlist = new WatchlistManager(() => workspace);
const spreadVisualizer = new SpreadVisualizer(() => workspace);
const quickTrade = new QuickTradeWidget(() => workspace, (msg) => showToast(msg));
const chartPositionsOverlay = new ChartPositionsOverlay(() => workspace, (msg) => showToast(msg));
const tradingPanel = new TradingPanel(() => workspace, (msg) => showToast(msg));
const pineEditor = new PineScriptEditor(() => workspace, (msg) => showToast(msg));
const replayManager = new ReplayManager(() => workspace, (msg) => showToast(msg));

(window as any).__openPineEditor = (code?: string, name?: string) => pineEditor.open(code, name);
(window as any).__replayManager = replayManager;
(window as any).__quickTrade = quickTrade;
(window as any).__chartPositionsOverlay = chartPositionsOverlay;
(window as any).__tradingPanel = tradingPanel;
(window as any).__spreadVisualizer = spreadVisualizer;

// ---- Register Footprint (Order Flow) Chart Style --------------------------

try {
  registerFootprintStyle();
} catch (err) {
  console.warn('[omni] footprint style registration:', err);
}

// ---- Register Topbar Icons & Widget Actions -------------------------------

try {
  registerIcon(
    'bar-replay',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6.5 4 2.5 8 6.5 12"/><polyline points="13.5 4 9.5 8 13.5 12"/><line x1="2.5" y1="4" x2="2.5" y2="12"/></svg>',
  );
  registerIcon(
    'code-editor',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><polyline points="5 4 1.5 8 5 12"/><polyline points="11 4 14.5 8 11 12"/><line x1="9.5" y1="2.5" x2="6.5" y2="13.5"/></svg>',
  );
  registerIcon(
    'alerts-bell',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11V6a4 4 0 0 1 8 0v5l1.5 2H2.5L4 11z"/><path d="M6.5 13a1.5 1.5 0 0 0 3 0"/></svg>',
  );
  registerIcon(
    'trade-quick',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 10.5 6 7l2.5 2.5L13.5 4.5"/><path d="M10 4.5h3.5V8"/></svg>',
  );
  registerIcon(
    'popout-window',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9.5V13.5H2.5V4H6.5"/><polyline points="9.5 2.5 13.5 2.5 13.5 6.5"/><line x1="7" y1="9" x2="13.5" y2="2.5"/></svg>',
  );
  registerIcon(
    'split-chart',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><line x1="8" y1="2.5" x2="8" y2="13.5"/></svg>',
  );
  registerIcon(
    'info-about',
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6.5"/><line x1="8" y1="11" x2="8" y2="7.5"/><line x1="8" y1="5" x2="8.01" y2="5"/></svg>',
  );

  registerWidgetAction({
    id: 'vela.add-chart-cell',
    target: 'topbar',
    label: 'Add Chart (+)',
    icon: 'split-chart',
    order: 82,
    run: () => {
      if (workspace) addChartCell(workspace, undefined, showToast);
    },
  });

  registerWidgetAction({
    id: 'vela.bar-replay',
    target: 'topbar',
    label: 'Replay',
    icon: 'bar-replay',
    order: 83,
    run: () => {
      replayManager.toggle();
    },
  });

  registerWidgetAction({
    id: 'vela.pine-script-editor',
    target: 'topbar',
    label: 'Pine Editor',
    icon: 'code-editor',
    order: 84,
    run: () => {
      pineEditor.open();
    },
  });

  registerWidgetAction({
    id: 'vela.manage-alerts-topbar',
    target: 'topbar',
    label: 'Alerts',
    icon: 'alerts-bell',
    order: 85,
    run: () => {
      if (workspace) openManageAlertsModal(workspace, showToast);
    },
  });

  registerWidgetAction({
    id: 'vela.toggle-watchlist',
    target: 'topbar',
    label: 'Watchlist',
    icon: 'watchlist',
    order: 86,
    run: () => {
      watchlist.toggle();
    },
  });

  registerWidgetAction({
    id: 'vela.toggle-quick-trade',
    target: 'topbar',
    label: 'Quick Trade',
    icon: 'trade-quick',
    order: 87,
    run: () => {
      quickTrade.toggleVisibility();
    },
  });

  registerWidgetAction({
    id: 'vela.toggle-trading-panel',
    target: 'topbar',
    label: 'Trade Manager',
    icon: 'trade-quick',
    order: 87.5,
    run: () => {
      tradingPanel.toggle();
    },
  });

  registerWidgetAction({
    id: 'vela.popout-chart',
    target: 'topbar',
    label: 'Pop Out (New Window)',
    icon: 'popout-window',
    order: 88,
    run: () => {
      openPopoutWindow();
    },
  });

  registerWidgetAction({
    id: 'omni.about',
    target: 'topbar',
    label: 'About',
    icon: 'info-about',
    order: 89,
    run: () => {
      openAboutModal();
    },
  });
} catch {
  /* ignore */
}

function openPopoutWindow(): void {
  if (!workspace) return;
  const active = workspace.active;
  const sym = active?.symbol || DEFAULT_SYMBOL;
  const tf = active?.timeframe || DEFAULT_TIMEFRAME;
  const url = `${window.location.origin}${window.location.pathname}?popout=true&symbol=${encodeURIComponent(sym)}&timeframe=${encodeURIComponent(tf)}`;
  window.open(url, '_blank', 'width=1280,height=850,menubar=no,toolbar=no,location=no,status=no');
  showToast(`Opened ${sym} in pop-out window — Drag to second monitor`);
}

// ---- Register Right-Click Context Menu Actions ----------------------------

try {
  registerWidgetAction({
    id: 'duplicate-chart',
    target: 'context:body',
    label: '⧉ Duplicate Chart (Split View)',
    order: -40,
    run: () => {
      if (workspace) {
        addChartCell(workspace, workspace.active?.id, showToast);
      }
    },
  });

  registerWidgetAction({
    id: 'close-chart',
    target: 'context:body',
    label: '✕ Close Chart',
    order: -39.5,
    when: () => {
      return Boolean(workspace && workspace.cells().length > 1);
    },
    run: () => {
      if (workspace && workspace.active) {
        closeCell(workspace, workspace.active.id, showToast);
      }
    },
  });

  registerWidgetAction({
    id: 'duplicate-indicator',
    target: 'context:body',
    label: '⧉ Duplicate Indicator',
    order: -39,
    when: () => {
      const active = workspace?.active;
      const inds = active?.chart?.indicators?.();
      return Boolean(inds && inds.length > 0);
    },
    run: (ctx: any) => {
      if (!workspace) return;
      const active = workspace.active;
      const inds = active?.chart?.indicators?.();
      if (!inds || inds.length === 0) {
        showToast('No indicators on this chart to duplicate');
        return;
      }
      const targetPane = ctx?.pointer?.paneId;
      let targetInd = targetPane ? inds.find((h: any) => (h as any).paneId === targetPane) : null;
      if (!targetInd) {
        targetInd = inds[inds.length - 1];
      }
      duplicateIndicator(workspace, targetInd.id, showToast);
    },
  });

  registerWidgetAction({
    id: 'duplicate-drawing',
    target: 'context:body',
    label: '📋 Duplicate Drawing',
    order: -38,
    when: (ctx: any) => {
      const d = ctx?.chart?.drawings;
      return Boolean(d && (d.selectedIds?.length > 0 || (d as any)._userDrawings?.selectedIds?.size > 0 || (d as any)._userDrawings?.hoveredId));
    },
    run: (ctx: any) => {
      const d = ctx?.chart?.drawings;
      if (!d) return;
      const sel = d.selectedIds?.length > 0 ? d.selectedIds : Array.from((d as any)._userDrawings?.selectedIds || []);
      const target = sel.length > 0 ? sel : [(d as any)._userDrawings?.hoveredId].filter(Boolean);
      if (target.length > 0) {
        d.duplicate?.(target);
        showToast('Drawing duplicated');
      }
    },
  });

  registerWidgetAction({
    id: 'set-price-alert',
    target: 'context:body',
    label: '⏰ Add Alert at Price (Alt+A)',
    order: -35,
    run: (ctx: any) => {
      const activeCell = workspace?.active;
      const activeChart = activeCell?.chart;
      if (!activeChart) return;

      const price =
        ctx.pointer?.price ??
        (activeCell as any)?._lastCrossPrice ??
        (window as any)._lastCrosshairPrice ??
        activeChart.getVisibleRange()?.to;

      if (!price || isNaN(price)) {
        showToast('⚠️ Could not detect price at cursor');
        return;
      }

      const symbol = ctx.symbol || activeCell?.symbol || DEFAULT_SYMBOL;
      const drawing = createOmniAlertDrawing(activeChart, symbol, price);

      addAlert(symbol, price, price, drawing?.id, activeCell?.id);
      playOmniAlertSound();
      showToast(`⏰ Alert set for ${symbol} at ${price.toFixed(5)} (Drag line to adjust)`);
    },
  });

  registerWidgetAction({
    id: 'set-price-alert-axis',
    target: 'context:price-axis',
    label: '⏰ Add Alert (Alt+A)',
    order: -90,
    run: (ctx: any) => {
      const activeCell = workspace?.active;
      const activeChart = activeCell?.chart;
      if (!activeChart) return;

      const price =
        ctx.pointer?.price ??
        (activeCell as any)?._lastCrossPrice ??
        (window as any)._lastCrosshairPrice;

      if (!price || isNaN(price)) return;
      const symbol = ctx.symbol || activeCell?.symbol || DEFAULT_SYMBOL;

      const drawing = createOmniAlertDrawing(activeChart, symbol, price);

      addAlert(symbol, price, price, drawing?.id, activeCell?.id);
      playOmniAlertSound();
      showToast(`⏰ Alert set for ${symbol} at ${price.toFixed(5)}`);
    },
  });

  registerWidgetAction({
    id: 'omni-hline',
    target: 'context:body',
    label: '― Horizontal Line (Alt+H)',
    order: -33,
    run: (ctx: any) => {
      const activeCell = workspace?.active;
      const activeChart = activeCell?.chart;
      if (!activeChart) return;

      const price =
        ctx.pointer?.price ??
        (activeCell as any)?._lastCrossPrice ??
        (window as any)._lastCrosshairPrice;

      if (!price || isNaN(price)) return;
      activeChart.drawings.add('hline', {
        anchors: [{ time: Date.now(), price }],
        style: { lineColor: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
      });
      showToast(`― Horizontal line at ${price.toFixed(5)}`);
    },
  });

  registerWidgetAction({
    id: 'vela-clean-view',
    target: 'context:body',
    label: '✨ Reset Chart / Clean View (Alt+R)',
    order: -32,
    run: () => {
      if (workspace) {
        applyCleanView(workspace, 'active');
        showToast('Clean View applied to active chart.');
      }
    },
  });

  registerWidgetAction({
    id: 'vela-fav-bar-toggle',
    target: 'context:body',
    label: '⭐ Toggle Favorite Drawings Bar',
    order: -31,
    run: () => {
      window.dispatchEvent(new CustomEvent('vela:toggle-favorites-bar'));
    },
  });

  registerWidgetAction({
    id: 'manage-price-alerts',
    target: 'context:body',
    label: '⚙️ Manage Alerts (Alarms)...',
    order: -30,
    run: () => {
      if (workspace) {
        openManageAlertsModal(workspace, showToast);
      }
    },
  });

  registerWidgetAction({
    id: 'open-pine-editor',
    target: 'context:body',
    label: '</> Pine Script Code Editor (Alt+P)',
    order: -29,
    run: () => {
      pineEditor.open();
    },
  });

  registerWidgetAction({
    id: 'omni.about-menu',
    target: 'context:body',
    label: 'ℹ About OmniTrading...',
    order: 100,
    run: () => {
      openAboutModal();
    },
  });
} catch (err) {
  /* ignore */
}

// Global Alt+P shortcut to open Pine Editor
window.addEventListener('keydown', (e) => {
  if (e.altKey && (e.key === 'p' || e.key === 'P')) {
    e.preventDefault();
    pineEditor.open();
  }
});

// Observer to inject "Pine Script Editor" button into Vela Indicator Picker dialog
const indDialogObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    for (const node of Array.from(m.addedNodes)) {
      if (!(node instanceof HTMLElement)) continue;
      // Skip high-frequency chart SVG elements and trade panel/overlay DOM elements
      if (node.tagName === 'svg' || node.tagName === 'line' || node.tagName === 'rect' || node.tagName === 'path') continue;
      if (node.classList?.contains('omni-chart-position-badge') || node.classList?.contains('omni-positions-lines-svg')) continue;
      if (node.closest?.('.omni-trading-panel, .omni-chart-positions-overlay, .vela-statusline')) continue;

      const dialog = node.matches?.('.vela-dialog, [class*="indicator"]') ? node : node.querySelector?.('.vela-dialog');
      if (dialog) {
        const titleEl = dialog.querySelector('.vela-dialog-title, [class*="title"]');
        if (titleEl && /indicator/i.test(titleEl.textContent || '')) {
          const header = dialog.querySelector('.vela-dialog-header, [class*="header"]');
          if (header && !header.querySelector('.btn-open-pine-editor')) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn-open-pine-editor';
            btn.textContent = '+ Pine Script Editor';
            btn.style.cssText = 'margin-left: auto; margin-right: 12px; background: rgba(56, 189, 248, 0.15); border: 1px solid rgba(56, 189, 248, 0.3); color: #38bdf8; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 4px; cursor: pointer;';
            btn.onclick = (e) => {
              e.stopPropagation();
              pineEditor.open();
            };
            header.insertBefore(btn, header.lastElementChild);
          }
        }
      }
    }
  }
});
indDialogObserver.observe(document.body, { childList: true, subtree: true });

// ---- Cell Corner Controls Bar (Link Badge, Add Chart '+', Close Chart '✕') ---

function attachCellControls(ws: VelaWorkspace): void {
  const cells = ws.cells();
  cells.forEach((cell) => {
    // 1. Mount or update link badge into .vela-statusline (next to symbol ticker)
    const sl = cell.host.querySelector('.vela-statusline');
    if (sl) {
      const existingSlBadge = sl.querySelector('.omni-link-badge-statusline') as HTMLElement | null;
      if (!existingSlBadge) {
        const badge = renderColorLinkBadge(cell, ws, 'statusline', showToast);
        const symEl = sl.querySelector('.vela-sl-symbol');
        if (symEl && symEl.parentElement) {
          symEl.parentElement.insertBefore(badge, symEl);
        } else {
          sl.insertBefore(badge, sl.firstChild);
        }
      } else {
        existingSlBadge.dataset.cellId = cell.id;
      }
    }

    // 2. Corner controls bar (contains Link Badge, Add Chart '+', Close Chart '✕')
    let bar = cell.host.querySelector('.vela-cell-corner-controls') as HTMLElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'vela-cell-corner-controls';
      bar.dataset.cellId = cell.id;

      // Color link badge
      const cornerBadge = renderColorLinkBadge(cell, ws, 'corner', showToast);
      bar.appendChild(cornerBadge);

      // Separator
      const sep = document.createElement('span');
      sep.className = 'vela-corner-sep';
      bar.appendChild(sep);

      // Add chart '+' button
      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'vela-corner-btn add-btn';
      addBtn.title = 'Duplicate Chart (All Settings)';
      addBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/></svg>';
      addBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = bar?.dataset.cellId || cell.id;
        addChartCell(ws, targetId, showToast);
      });
      bar.appendChild(addBtn);

      // Close chart '✕' button
      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.className = 'vela-corner-btn close-btn';
      closeBtn.title = `Close ${cell.symbol || 'chart'}`;
      closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/></svg>';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const targetId = bar?.dataset.cellId || cell.id;
        closeCell(ws, targetId, showToast);
      });
      bar.appendChild(closeBtn);

      cell.host.style.position = 'relative';
      cell.host.appendChild(bar);
    } else {
      bar.dataset.cellId = cell.id;
      const cornerBadge = bar.querySelector('.omni-link-badge-corner') as HTMLElement | null;
      if (cornerBadge) cornerBadge.dataset.cellId = cell.id;
      const closeBtn = bar.querySelector('.close-btn') as HTMLElement | null;
      if (closeBtn) closeBtn.title = `Close ${cell.symbol || 'chart'}`;
    }

    // Toggle close button visibility based on cell count
    const closeBtn = bar.querySelector('.close-btn') as HTMLElement | null;
    if (closeBtn) {
      closeBtn.style.display = cells.length > 1 ? 'inline-flex' : 'none';
    }

    const oldCloseBtn = cell.host.querySelector('.vela-cell-close-btn');
    oldCloseBtn?.remove();
  });

  refreshAllColorBadges(ws);
  updateWorkspaceColorSync(ws);
}

// ---- Workspace persistence ------------------------------------------------

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function autoSaveWorkspace(ws?: VelaWorkspace | null): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }

  const targetWs = ws || workspace;
  if (!targetWs || (targetWs as any).destroyed) return;

  try {
    (targetWs as any).flushPendingState?.();
    (targetWs as any).persistNow?.();

    const activePersistKey = (targetWs as any).persistKey || PERSIST_KEY;
    if (activePersistKey && typeof (targetWs as any).getState === 'function') {
      const state = (targetWs as any).getState();
      if (state) {
        localStorage.setItem(activePersistKey, JSON.stringify(state));
      }
    }

    const activeCell = targetWs.active;
    if (activeCell?.symbol) {
      const rawSym = String(activeCell.symbol).replace(/^.*:/, '');
      if (rawSym) {
        const curPrefs = loadPrefs();
        if (curPrefs.defaultSymbol !== rawSym) {
          savePrefs({ ...curPrefs, defaultSymbol: rawSym });
        }
      }
    }
  } catch (err) {
    console.error('[omni] autoSaveWorkspace failed:', err);
  }
}

export function debouncedAutoSaveWorkspace(ws?: VelaWorkspace | null, delayMs = 800): void {
  if (autoSaveTimer !== null) {
    clearTimeout(autoSaveTimer);
  }
  autoSaveTimer = setTimeout(() => {
    autoSaveTimer = null;
    autoSaveWorkspace(ws);
  }, delayMs);
}

(window as any).__omniAutoSave = () => autoSaveWorkspace(workspace);
(window as any).__omniDebouncedAutoSave = (delayMs?: number) => debouncedAutoSaveWorkspace(workspace, delayMs);

// ---- Toast Notifications --------------------------------------------------

export function showToast(message: string, durationMs = 3000): void {
  const existing = document.querySelector('.vela-alert-toast');
  existing?.remove();

  const toast = document.createElement('div');
  toast.className = 'vela-alert-toast';
  toast.innerHTML = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), durationMs);
}

// ---- Risk Disclaimer Modal (First Run) ---------------------------------

function checkRiskDisclaimer(): void {
  const accepted = localStorage.getItem('omni-risk-disclaimer-accepted');
  if (accepted === 'true') return;

  const modal = document.createElement('div');
  modal.className = 'ct-overlay';
  modal.style.zIndex = '999999';

  modal.innerHTML = `
    <div class="ct-card" style="max-width: 520px; background: #0f172a; border: 1px solid #334155; border-radius: 12px; padding: 24px; box-shadow: 0 25px 60px rgba(0,0,0,0.8);">
      <header style="display: flex; align-items: center; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 14px;">
        <div style="font-size: 24px;">⚖️</div>
        <div>
          <h2 style="margin: 0; font-size: 17px; color: #f8fafc; font-weight: 700;">Trading Risk Disclaimer</h2>
          <p style="margin: 2px 0 0; font-size: 12px; color: #94a3b8;">Please read carefully before using OmniTrading</p>
        </div>
      </header>

      <div style="margin: 16px 0; font-size: 13px; color: #cbd5e1; line-height: 1.5; display: flex; flex-direction: column; gap: 10px;">
        <p>Trading financial instruments (forex, stocks, crypto, commodities, futures) involves substantial risk of loss and is not suitable for every investor. You may lose all or more of your initial capital.</p>
        <p>OmniTrading is an open-source software tool provided on an <strong>"AS IS"</strong> basis without warranty of any kind. OmniTrading is <strong>not a broker</strong>, does not hold custody of funds, and does not provide financial or investment advice.</p>
        <p>You are solely responsible for all orders, trades, and broker credentials. Always test your strategies using Paper Trading before considering live execution.</p>
      </div>

      <footer style="display: flex; justify-content: flex-end; margin-top: 18px;">
        <button type="button" class="btn-accept-risk" style="padding: 10px 22px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer;">
          I Understand &amp; Accept
        </button>
      </footer>
    </div>
  `;

  modal.querySelector('.btn-accept-risk')?.addEventListener('click', () => {
    localStorage.setItem('omni-risk-disclaimer-accepted', 'true');
    modal.remove();
  });

  document.body.appendChild(modal);
}

// ---- Application Mounting -------------------------------------------------

async function mountApp(initialSymbol?: string, initialTf?: string): Promise<void> {
  const app = document.getElementById('app') || document.body;
  if (!document.getElementById('chart')) {
    app.innerHTML = '<div id="chart" style="width:100%;height:100%;"></div>';
  }

  const registry = BrokerRegistry.getInstance();
  const adapter = registry.getActiveAdapter();
  const activeAcc = registry.getActiveAccount();
  (window as any).omniBrokerRegistry = registry;

  const sym = initialSymbol || DEFAULT_SYMBOL;
  const tf = initialTf || DEFAULT_TIMEFRAME;

  registerAllThemes();
  const themePreset = getSavedThemePreset();

  const dataProvider = activeAcc ? adapter.createDataProvider(activeAcc) : adapter.createDataProvider(null as any);

  // Initialize Vela Workspace with MANDATORY attribution and Pine engine enabled
  workspace = new VelaWorkspace('#chart', {
    layout: '1',
    symbol: sym,
    timeframe: tf,
    bars: DEFAULT_BARS,
    live: true,
    theme: themePreset || 'dark',
    watermark: true, // MANDATORY: Attribution watermark kept permanently visible
    providers: {
      default: () => dataProvider,
      [adapter.id]: () => dataProvider,
    },
    engines: {
      pine: () => {
        if (typeof (window as any).PineWorkerEngine === 'function') {
          return new (window as any).PineWorkerEngine();
        }
        return {
          language: 'pine',
          compile: async () => ({
            run: async () => ({ plots: [] }),
            destroy: () => {},
          }),
          execute: async () => ({ plots: [] }),
          destroy: () => {},
        };
      },
    },
    indicators: '/api/indicators',
    timeframes: ['1', '3', '5', '15', '30', '60', '120', '240', 'D', 'W', 'M'],
    timeframeFavorites: ['1', '5', '15', '60', '240', 'D'],
    sync: {
      viewport: false,
      crosshair: false,
      drawings: false,
      symbol: false,
      timeframe: false,
      style: false,
    },
    margins: {
      top: 10,
      bottom: 10,
      right: 12,
    },
    persist: PERSIST_KEY,
  });

  (window as any).omni = workspace;
  (window as any).vela = workspace;
  (window as any).omniWorkspace = workspace;
  (window as any).workspace = workspace;

  initWorkspaceFeatures(workspace);
  mountTopbarControls();
  checkRiskDisclaimer();
}

function initWorkspaceFeatures(ws: VelaWorkspace): void {
  ws.sync.set('viewport', false);
  ws.sync.set('crosshair', false);
  ws.sync.set('style', false);
  updateWorkspaceColorSync(ws);

  watchlist.init();
  if (!favBarInstance) {
    favBarInstance = new FavoritesBarController(ws);
    favBarInstance.init();
  } else {
    favBarInstance.updateWorkspace(ws);
  }

  registerAllThemes();
  applyTheme(ws, getSavedThemeId());
  attachCellControls(ws);

  const configureCell = (cell: any) => {
    if (!cell || (cell as any)._configured) return;
    (cell as any)._configured = true;

    // Track crosshair price
    try {
      cell.chart.onCrosshairMove?.((e: any) => {
        if (e && typeof e.price === 'number') {
          cell._lastCrossPrice = e.price;
          (window as any)._lastCrosshairPrice = e.price;
        }
      });
    } catch {}

    // Auto-save listeners on chart changes (debounced to eliminate frame drops & drag lag)
    try {
      cell.chart?.renderer?.onConfigChanged?.(() => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('market:changed', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('priceStyle:change', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('drawing:created', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('drawing:edited', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('drawing:removed', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('indicator:add', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('indicator:remove', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('indicator:change', () => debouncedAutoSaveWorkspace(ws));
      cell.chart?.on?.('theme:changed', () => debouncedAutoSaveWorkspace(ws));
    } catch {}

    wireCellAlerts(cell, (msg) => showToast(msg), ws);
    if (ws.active?.id === cell.id || ws.cells().length === 1) {
      quickTrade.attachToCell(cell);
      spreadVisualizer.attachToCell(cell);
      chartPositionsOverlay.attachToCell(cell);
    }
  };

  ws.cells().forEach(configureCell);

  ws.on('cell:created', ({ id }) => {
    attachCellControls(ws);
    const cell = ws.cell(id);
    if (cell) configureCell(cell);
    debouncedAutoSaveWorkspace(ws, 400);
  });

  ws.on('cell:active', ({ id }: any = {}) => {
    const cell = id ? ws.cell(id) : ws.active;
    if (cell) {
      quickTrade.attachToCell(cell);
      spreadVisualizer.attachToCell(cell);
      chartPositionsOverlay.attachToCell(cell);
    }
    debouncedAutoSaveWorkspace(ws, 600);
  });

  ws.on('layout:changed', () => {
    attachCellControls(ws);
    ws.cells().forEach(configureCell);
    watchlist.render();
    if (ws.active) {
      quickTrade.attachToCell(ws.active);
      spreadVisualizer.attachToCell(ws.active);
      chartPositionsOverlay.attachToCell(ws.active);
    }
    mountTopbarControls();
    debouncedAutoSaveWorkspace(ws, 400);
  });

  ws.on('cell:destroyed', () => {
    attachCellControls(ws);
    updateWorkspaceColorSync(ws);
    debouncedAutoSaveWorkspace(ws, 300);
  });

  ws.on('state:changed', () => debouncedAutoSaveWorkspace(ws));
  window.addEventListener('beforeunload', () => autoSaveWorkspace(ws));
  window.addEventListener('pagehide', () => autoSaveWorkspace(ws));
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') autoSaveWorkspace(ws);
  });

  window.addEventListener('vela:price-tick', (e: any) => {
    const detail = e.detail;
    if (!detail?.price) return;
    if (workspace) {
      checkPriceAlerts(detail.symbol, Number(detail.price), (msg) => showToast(msg), workspace);
    }
    watchlist.updatePrice(detail.symbol, Number(detail.price));
  });

  updateTopbarAlertBadge();
  initAlertsWorkspaceWiring(ws);

  // Periodic price-alert monitor fallback
  setInterval(() => {
    if (!workspace) return;
    workspace.cells().forEach((cell) => {
      const sym = cell.symbol;
      const readout = cell.chart?.dataWindowReadout?.();
      const curPrice = readout?.ohlc?.close ?? (cell as any)._lastCrossPrice;
      if (sym && curPrice && !isNaN(curPrice)) {
        checkPriceAlerts(sym, curPrice, (msg) => showToast(msg), workspace);
      }
    });
  }, 1500);
}

// ---- Topbar Controls: Multi-Broker Chip & Kill Switch ----------------------

function mountTopbarControls(): void {
  setTimeout(() => {
    const topbarRight = document.querySelector('.vela-topbar-right');
    if (!topbarRight) return;

    // 1. Kill Switch Button
    if (!killSwitchBtn) {
      killSwitchBtn = document.createElement('button');
      killSwitchBtn.type = 'button';
      killSwitchBtn.className = 'omni-killswitch-btn';
      updateKillSwitchUI();

      killSwitchBtn.addEventListener('click', async () => {
        try {
          const next = !isKillSwitchActive;
          const res = await api.toggleKillSwitch(next);
          isKillSwitchActive = res.killSwitchActive;
          updateKillSwitchUI();
          showToast(isKillSwitchActive ? '🛑 Trading Kill Switch ACTIVATED' : '✅ Trading Kill Switch Deactivated');
        } catch (err: any) {
          showToast('Error toggling kill switch: ' + err.message);
        }
      });
    }

    // 2. Broker & Account Chip
    if (!brokerChip) {
      brokerChip = document.createElement('button');
      brokerChip.type = 'button';
      brokerChip.className = 'omni-broker-chip ct-chip';
      updateBrokerChipUI();

      brokerChip.addEventListener('click', () => {
        openBrokerModal((acc) => {
          updateBrokerChipUI();
          if (workspace && acc) {
            const registry = BrokerRegistry.getInstance();
            const adapter = registry.getActiveAdapter();
            const dp = adapter.createDataProvider(acc);
            (workspace as any).providers = {
              default: () => dp,
              [adapter.id]: () => dp,
            };
          }
        });
      });
    }

    if (killSwitchBtn.parentElement !== topbarRight) topbarRight.prepend(killSwitchBtn);
    if (brokerChip.parentElement !== topbarRight) topbarRight.prepend(brokerChip);

    spreadVisualizer.mountToTopbar();
  }, 120);
}

function updateKillSwitchUI(): void {
  if (!killSwitchBtn) return;
  killSwitchBtn.style.cssText = `
    all: unset;
    cursor: pointer;
    box-sizing: border-box;
    height: 26px;
    line-height: 26px;
    padding: 0 8px;
    border-radius: 4px;
    margin-right: 4px;
    background: ${isKillSwitchActive ? 'rgba(242, 54, 69, 0.12)' : 'rgba(255, 255, 255, 0.03)'};
    color: ${isKillSwitchActive ? '#fca5a5' : 'var(--vela-fg, #d1d4dc)'};
    border: 1px solid ${isKillSwitchActive ? 'rgba(242, 54, 69, 0.4)' : 'var(--vela-border, #2a2b30)'};
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 500;
    transition: all 0.15s ease;
    user-select: none;
    flex: none;
  `;
  killSwitchBtn.onmouseenter = () => {
    killSwitchBtn!.style.background = isKillSwitchActive ? 'rgba(242, 54, 69, 0.18)' : 'var(--vela-hover, rgba(255, 255, 255, 0.06))';
    killSwitchBtn!.style.borderColor = isKillSwitchActive ? 'rgba(242, 54, 69, 0.6)' : 'rgba(255, 255, 255, 0.16)';
  };
  killSwitchBtn.onmouseleave = () => {
    killSwitchBtn!.style.background = isKillSwitchActive ? 'rgba(242, 54, 69, 0.12)' : 'rgba(255, 255, 255, 0.03)';
    killSwitchBtn!.style.borderColor = isKillSwitchActive ? 'rgba(242, 54, 69, 0.4)' : 'var(--vela-border, #2a2b30)';
  };

  if (isKillSwitchActive) {
    killSwitchBtn.innerHTML = `
      <span style="width:6px; height:6px; border-radius:50%; background:#f23645; display:inline-block; flex:none;"></span>
      <span style="color:#f87171; font-weight:600;">Kill Switch Active</span>
    `;
    killSwitchBtn.title = 'Trading is HALTED by Kill Switch. Click to resume trading.';
  } else {
    killSwitchBtn.innerHTML = `
      <span style="width:6px; height:6px; border-radius:50%; background:#10b981; display:inline-block; flex:none;"></span>
      <span style="color:var(--vela-fg-muted, #868a96);">Trading</span>
      <span style="color:var(--vela-fg, #d1d4dc); font-weight:600;">Active</span>
    `;
    killSwitchBtn.title = 'Trading Guardrails Active. Click to trigger emergency Kill Switch.';
  }
}

function updateBrokerChipUI(): void {
  if (!brokerChip) return;
  const registry = BrokerRegistry.getInstance();
  const adapter = registry.getActiveAdapter();
  const account = registry.getActiveAccount();

  const env = account?.environment || 'paper';
  const envColor = env === 'live' ? '#ef4444' : env === 'demo' ? '#f59e0b' : '#38bdf8';

  const brokerName = adapter.name.split('(')[0].trim();
  const accNum = account ? `#${account.accountNumber}` : 'Demo';

  brokerChip.style.cssText = `
    all: unset;
    cursor: pointer;
    box-sizing: border-box;
    height: 26px;
    line-height: 26px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--vela-border, #2a2b30);
    font-size: 11px;
    color: var(--vela-fg, #d1d4dc);
    margin-right: 4px;
    white-space: nowrap;
    transition: all 0.15s ease;
    user-select: none;
    flex: none;
  `;
  brokerChip.onmouseenter = () => {
    brokerChip!.style.background = 'var(--vela-hover, rgba(255, 255, 255, 0.06))';
    brokerChip!.style.borderColor = 'rgba(255, 255, 255, 0.16)';
  };
  brokerChip.onmouseleave = () => {
    brokerChip!.style.background = 'rgba(255, 255, 255, 0.03)';
    brokerChip!.style.borderColor = 'var(--vela-border, #2a2b30)';
  };

  brokerChip.innerHTML = `
    <span class="ct-chip-dot" style="background:${envColor}; width:6px; height:6px; border-radius:50%; display:inline-block; flex:none;"></span>
    <span style="color:var(--vela-fg, #d1d4dc); font-weight:550;">${escapeHtml(brokerName)}</span>
    <span style="color:var(--vela-fg-muted, #868a96); font-weight:400;">${escapeHtml(accNum)}</span>
    <span class="ct-chip-env" style="background:rgba(255,255,255,0.06); color:var(--vela-fg-muted, #868a96); font-size:9.5px; font-weight:600; padding:1px 4px; border-radius:3px; letter-spacing:0.03em;">${env.toUpperCase()}</span>
  `;
}

function escapeHtml(t: string): string {
  return t.replace(/[&<>"']/g, '');
}

// ---- Standard Keyboard Shortcuts & Quick Timeframe Switcher --------------

const TIMEFRAMES_STEP = [
  '1', '2', '3', '5', '10', '15', '30', '60', '120', '240', '720', '1440', '10080', '43200',
];

function normalizeTf(tf: string): string {
  const map: Record<string, string> = {
    '1m': '1', '2m': '2', '3m': '3', '5m': '5', '10m': '10',
    '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240',
    '12h': '720', '1d': '1440', '1D': '1440', 'D': '1440',
    '1w': '10080', '1W': '10080', 'W': '10080',
    '1M': '43200', '1mo': '43200', 'M': '43200',
  };
  return map[tf] || tf;
}

function formatTfDisplay(tf: string): string {
  const n = parseInt(tf, 10);
  if (isNaN(n)) return tf;
  if (n < 60) return `${n}m`;
  if (n % 1440 === 0) return `${n / 1440}D`;
  if (n % 60 === 0) return `${n / 60}h`;
  return `${n}m`;
}

document.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement | null;
  const isInput =
    target &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable);
  if (isInput) return;

  // Alt+A -> Add alert at cursor / price
  if (event.altKey && event.key.toLowerCase() === 'a') {
    event.preventDefault();
    const activeCell = workspace?.active;
    const activeChart = activeCell?.chart;
    if (activeChart && activeCell) {
      const price =
        (activeCell as any)?._lastCrossPrice ??
        (window as any)._lastCrosshairPrice ??
        activeChart.getVisibleRange()?.to;
      if (price && !isNaN(price)) {
        const symbol = activeCell.symbol || DEFAULT_SYMBOL;
        const drawing = createOmniAlertDrawing(activeChart, symbol, price);
        addAlert(symbol, price, price, drawing?.id, activeCell.id);
        playOmniAlertSound();
        showToast(`⏰ Alert set on ${symbol} at ${price.toFixed(5)} (Alt+A)`);
      }
    }
    return;
  }

  // Alt+H -> Add horizontal line at cursor / price
  if (event.altKey && event.key.toLowerCase() === 'h') {
    event.preventDefault();
    const activeCell = workspace?.active;
    const activeChart = activeCell?.chart;
    if (activeChart && activeCell) {
      const price =
        (activeCell as any)?._lastCrossPrice ??
        (window as any)._lastCrosshairPrice ??
        activeChart.getVisibleRange()?.to;
      if (price && !isNaN(price)) {
        activeChart.drawings.add('hline', {
          anchors: [{ time: Date.now(), price }],
          style: { lineColor: '#ffffff', lineWidth: 1, lineStyle: 'solid' },
        });
        showToast(`― Horizontal line at ${price.toFixed(5)} (Alt+H)`);
      }
    }
    return;
  }

  // Alt+R -> Reset chart view
  if (event.altKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (workspace && workspace.active) {
      applyCleanView(workspace, 'active');
      showToast('Chart view reset (Alt+R)');
    }
    return;
  }

  // ArrowUp / ArrowDown timeframe stepping (only when not interacting with open menus/modals)
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    // If a menu, popover, or modal is open in the DOM, let native/Zag keyboard navigation work without interference
    const isMenuOrModalOpen = !!document.querySelector(
      '[role="menu"], [data-scope="menu"], [data-part="content"], [data-part="positioner"], .vela-dropdown-menu, .vela-widget-tf-menu, .vela-popover, .omni-modal, .ct-modal, dialog[open]'
    );
    if (isMenuOrModalOpen) {
      return;
    }

    if (workspace && workspace.active) {
      const current = normalizeTf(workspace.active.timeframe || DEFAULT_TIMEFRAME);
      let idx = TIMEFRAMES_STEP.indexOf(current);
      if (idx === -1) {
        const curNum = parseInt(current, 10) || 240;
        idx = TIMEFRAMES_STEP.findIndex((t) => parseInt(t, 10) >= curNum);
        if (idx === -1) idx = 9;
      }

      if (event.key === 'ArrowUp' && idx < TIMEFRAMES_STEP.length - 1) {
        event.preventDefault();
        const next = TIMEFRAMES_STEP[idx + 1];
        workspace.active.setTimeframe(next);
        showToast(`Timeframe: ${formatTfDisplay(next)}`);
      } else if (event.key === 'ArrowDown' && idx > 0) {
        event.preventDefault();
        const prev = TIMEFRAMES_STEP[idx - 1];
        workspace.active.setTimeframe(prev);
        showToast(`Timeframe: ${formatTfDisplay(prev)}`);
      }
    }
    return;
  }
});

// Start application
void mountApp();
