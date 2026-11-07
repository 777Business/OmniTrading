import type { VelaWorkspace } from '@luxalgo/vela/workspace';

export interface PriceAlert {
  id: string;
  symbol: string;
  targetPrice: number;
  direction: 'above' | 'below';
  createdAt: number;
  triggered: boolean;
  drawingId?: string;
  cellId?: string;
}

const ALERTS_STORAGE_KEY = 'omni-price-alerts';

const symbolLastPrices = new Map<string, number>();

export function recordCurrentPrice(symbol: string, price: number): void {
  if (!price || isNaN(price) || price <= 0) return;
  const cleanSym = symbol.toUpperCase().replace(/[\/\s_-]/g, '');
  symbolLastPrices.set(cleanSym, price);
}

export function getCurrentSymbolPrice(symbol: string): number | undefined {
  const cleanSym = symbol.toUpperCase().replace(/[\/\s_-]/g, '');
  return symbolLastPrices.get(cleanSym);
}

export function updateTopbarAlertBadge(): void {
  try {
    const activeCount = getAlerts().filter((a) => !a.triggered).length;
    const buttons = document.querySelectorAll(
      '[data-action-id="vela.manage-alerts-topbar"], .vela-widget-alerts, button[title*="Alerts"], button[aria-label*="Alerts"]',
    );
    buttons.forEach((btn) => {
      let badge = btn.querySelector('.vela-alerts-badge') as HTMLElement | null;
      if (activeCount > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'vela-alerts-badge';
          (btn as HTMLElement).style.position = 'relative';
          btn.appendChild(badge);
        }
        badge.textContent = String(activeCount);
        badge.style.display = 'flex';
      } else if (badge) {
        badge.style.display = 'none';
      }
    });
  } catch {
    /* ignore DOM errors */
  }
}

export function getAlerts(): PriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveAlerts(alerts: PriceAlert[]): void {
  try {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    updateTopbarAlertBadge();
  } catch {
    /* ignore */
  }
}

export function addAlert(
  symbol: string,
  targetPrice: number,
  currentPrice: number,
  drawingId?: string,
  cellId?: string,
): PriceAlert {
  const cleanSym = symbol.toUpperCase().replace(/[\/\s_-]/g, '');
  const refPrice = currentPrice || symbolLastPrices.get(cleanSym) || targetPrice;
  const direction = targetPrice >= refPrice ? 'above' : 'below';
  const alert: PriceAlert = {
    id: `alert-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    symbol: cleanSym,
    targetPrice,
    direction,
    createdAt: Date.now(),
    triggered: false,
    drawingId,
    cellId,
  };
  const list = getAlerts();
  list.unshift(alert);
  saveAlerts(list);
  return alert;
}

export function updateAlertPrice(id: string, newPrice: number, currentPrice?: number): void {
  const list = getAlerts();
  const found = list.find((a) => a.id === id);
  if (found) {
    found.targetPrice = newPrice;
    found.triggered = false;
    const ref = currentPrice ?? symbolLastPrices.get(found.symbol);
    if (ref !== undefined) {
      found.direction = newPrice >= ref ? 'above' : 'below';
    }
    saveAlerts(list);
  }
}

export function restartAlert(id: string): void {
  const list = getAlerts();
  const found = list.find((a) => a.id === id);
  if (found) {
    found.triggered = false;
    saveAlerts(list);
  }
}

export function removeAlert(id: string, workspace?: VelaWorkspace): void {
  const list = getAlerts();
  const alert = list.find((a) => a.id === id);
  if (alert?.drawingId && workspace) {
    try {
      const cells = workspace.cells();
      cells.forEach((cell) => {
        try {
          cell.chart.drawings.remove(alert.drawingId!);
        } catch {
          /* ignore */
        }
      });
    } catch {
      /* ignore */
    }
  }
  const remaining = list.filter((a) => a.id !== id);
  saveAlerts(remaining);
}

/**
 * Alerts configuration schema and helper
 */
export interface AlertsSettings {
  alertLines: boolean;
  alertLineColor: string;
  onlyActiveAlerts: boolean;
  alertVolume: number;
  autoHideToasts: boolean;
}

export function getAlertsSettings(): AlertsSettings {
  try {
    const raw = localStorage.getItem('vela-alerts-settings');
    if (raw) {
      return {
        alertLines: true,
        alertLineColor: '#ff9800',
        onlyActiveAlerts: false,
        alertVolume: 80,
        autoHideToasts: true,
        ...JSON.parse(raw),
      };
    }
  } catch {}
  return {
    alertLines: true,
    alertLineColor: '#ff9800',
    onlyActiveAlerts: false,
    alertVolume: 80,
    autoHideToasts: true,
  };
}

/**
 * Synthesize alert sounds directly using Web Audio API.
 * 100% in-code audio synthesis with zero external MP3 dependencies.
 */
export function playOmniAlertSound(_soundName?: string, volume?: number): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    const alSettings = getAlertsSettings();
    const effVol = typeof volume === 'number' ? volume : (alSettings.alertVolume ?? 80) / 100;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.35 * Math.max(0, Math.min(1, effVol)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    // Synthesized pleasant 3-tone arpeggio (D5 -> A5 -> D6)
    const tones = [
      { freq: 587.33, start: 0.0, dur: 0.25 },
      { freq: 880.0, start: 0.08, dur: 0.3 },
      { freq: 1174.66, start: 0.16, dur: 0.45 },
    ];

    for (const t of tones) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(t.freq, ctx.currentTime + t.start);

      gain.gain.setValueAtTime(0.001, ctx.currentTime + t.start);
      gain.gain.exponentialRampToValueAtTime(1.0, ctx.currentTime + t.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t.start + t.dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(ctx.currentTime + t.start);
      osc.stop(ctx.currentTime + t.start + t.dur + 0.05);
    }
  } catch {
    /* ignore audio errors */
  }
}

/**
 * Play order execution sounds synthesized via Web Audio API.
 * Options: 'default', 'chime', 'pop', 'bell', 'subtle'.
 */
export function playExecutionSound(soundType: string = 'default', volume?: number): void {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    let effVol = typeof volume === 'number' ? volume : 0.7;
    try {
      const trSettings = JSON.parse(localStorage.getItem('vela-trading-settings') || '{}');
      if (typeof volume !== 'number' && typeof trSettings.executionSoundVolume === 'number') {
        effVol = trSettings.executionSoundVolume / 100;
      }
    } catch {}

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.3 * Math.max(0, Math.min(1, effVol)), ctx.currentTime);
    masterGain.connect(ctx.destination);

    const s = String(soundType || 'default').toLowerCase();
    const now = ctx.currentTime;

    if (s.includes('chime')) {
      // Ascending chime (E5 -> B5)
      const notes = [659.25, 987.77];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.8, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.4);
      });
    } else if (s.includes('pop')) {
      // Damped downward frequency pop
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(360, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.05);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.07);
    } else if (s.includes('bell')) {
      // Resonant harmonic bell (C6)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1046.5, now);
      gain.gain.setValueAtTime(0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.55);
    } else if (s.includes('subtle')) {
      // Soft single high tick
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1200, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + 0.035);
    } else {
      // 'default': dual-tone confirmation beep (880Hz -> 1320Hz)
      const tones = [
        { freq: 880, start: 0, dur: 0.06 },
        { freq: 1320, start: 0.07, dur: 0.12 },
      ];
      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(t.freq, now + t.start);
        gain.gain.setValueAtTime(0.001, now + t.start);
        gain.gain.exponentialRampToValueAtTime(0.8, now + t.start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, now + t.start + t.dur);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now + t.start);
        osc.stop(now + t.start + t.dur + 0.02);
      }
    }
  } catch {
    /* ignore audio errors */
  }
}

/**
 * Web Audio API synthesized alert chime.
 */
export function playAlertChime(volume: number = 0.35): void {
  playOmniAlertSound(undefined, volume);
}

/**
 * Helper to create an alert line on a chart.
 */
export function createOmniAlertDrawing(
  chart: any,
  symbol: string,
  price: number,
): any {
  if (!chart?.drawings) return null;
  try {
    const alSettings = getAlertsSettings();
    if (alSettings.alertLines === false) return null;
    const col = alSettings.alertLineColor || '#ff9800';

    const drawing = chart.drawings.add('hline', {
      anchors: [{ time: Date.now(), price }],
    });
    if (drawing) {
      try {
        chart.drawings.update(drawing.id, {
          style: { lineColor: col, lineWidth: 1, lineStyle: 'dotted' },
          text: {
            value: `⏰ ${symbol} (${price.toFixed(5)})`,
            color: col,
            size: 'small',
            hAlign: 'right',
            vAlign: 'center',
            place: 'end',
            side: 'above',
          },
        });
      } catch {
        /* ignore */
      }
    }
    return drawing;
  } catch (err) {
    console.error('[vela] Failed to create alert drawing', err);
    return null;
  }
}

/**
 * Show rich Alert Trigger Modal Dialog on price crossing.
 */
export function showOmniAlertPopup(
  alert: PriceAlert,
  currentPrice: number,
  workspace?: VelaWorkspace,
  toast?: (msg: string) => void,
): void {
  // Play sound immediately
  playOmniAlertSound();

  const existing = document.getElementById(`omni-alert-pop-${alert.id}`);
  existing?.remove();

  const popup = document.createElement('div');
  popup.id = `omni-alert-pop-${alert.id}`;
  popup.className = 'omni-alert-popup';

  const directionText =
    alert.direction === 'above' ? 'Crossing Above' : 'Crossing Below';

  popup.innerHTML = `
    <div class="omni-alert-popup-head">
      <div style="display:flex; align-items:center; gap:8px;">
        <span class="omni-alert-icon">🔔</span>
        <span class="omni-alert-sym">${alert.symbol}</span>
        <span class="omni-alert-badge">ALERT TRIGGERED</span>
      </div>
      <button type="button" class="omni-alert-close" title="Dismiss">✕</button>
    </div>
    <div class="omni-alert-popup-body">
      <div class="omni-alert-desc">
        Price ${directionText} target level of <strong>${alert.targetPrice.toFixed(5)}</strong>
      </div>
      <div class="omni-alert-details">
        <span>Trigger Price: <strong>${currentPrice.toFixed(5)}</strong></span>
        <span>Time: ${new Date().toLocaleTimeString()}</span>
      </div>
    </div>
    <div class="omni-alert-popup-foot">
      <button type="button" class="omni-alert-btn omni-alert-btn-replay">🔊 Replay</button>
      <button type="button" class="omni-alert-btn omni-alert-btn-restart">Restart Alert</button>
      <button type="button" class="omni-alert-btn omni-alert-btn-edit">Edit</button>
      <button type="button" class="omni-alert-btn omni-alert-btn-dismiss">Dismiss</button>
    </div>
  `;

  popup.querySelector('.omni-alert-close')?.addEventListener('click', () => popup.remove());
  popup.querySelector('.omni-alert-btn-dismiss')?.addEventListener('click', () => popup.remove());

  popup.querySelector('.omni-alert-btn-replay')?.addEventListener('click', () => {
    playOmniAlertSound();
  });

  popup.querySelector('.omni-alert-btn-restart')?.addEventListener('click', () => {
    restartAlert(alert.id);
    toast?.(`Alert restarted for ${alert.symbol}`);
    popup.remove();
  });

  popup.querySelector('.omni-alert-btn-edit')?.addEventListener('click', () => {
    popup.remove();
    if (workspace) {
      openAlertEditPrompt(alert, workspace, toast);
    }
  });

  document.body.appendChild(popup);

  // Auto-dismiss after 5 seconds if automatically hide toasts is on (standard default), else 30s
  const alSettings = getAlertsSettings();
  const hideMs = alSettings.autoHideToasts !== false ? 5000 : 30000;
  setTimeout(() => {
    if (popup.parentElement) popup.remove();
  }, hideMs);
}

/**
 * Open single alert price editor dialog.
 */
export function openAlertEditPrompt(
  alert: PriceAlert,
  workspace: VelaWorkspace,
  toast?: (msg: string) => void,
): void {
  const existing = document.getElementById('omni-alert-edit-modal');
  existing?.remove();

  const modal = document.createElement('div');
  modal.id = 'omni-alert-edit-modal';
  modal.className = 'ct-overlay';

  modal.innerHTML = `
    <div class="ct-card" style="max-width: 380px;">
      <header class="ct-head">
        <div class="ct-mark" style="background: linear-gradient(135deg, #f59e0b, #ef4444);">⏰</div>
        <div>
          <h1>Edit Alert Price</h1>
          <p>${alert.symbol} alert target</p>
        </div>
      </header>
      <div style="margin: 18px 0; display:flex; flex-direction:column; gap:8px;">
        <label style="font-size:12px; color:#94a3b8; font-weight:600;">Target Price</label>
        <input type="number" step="0.00001" id="omni-edit-price-val" class="alert-price-input" value="${alert.targetPrice.toFixed(5)}" style="width:100%; font-size:14px; padding:8px 12px;" />
      </div>
      <footer class="ct-actions" style="display:flex; justify-content:space-between; align-items:center;">
        <button type="button" class="ct-btn ct-btn-danger btn-del">Remove</button>
        <div style="display:flex; gap:8px;">
          <button type="button" class="ct-btn ct-btn-ghost btn-cancel">Cancel</button>
          <button type="button" class="ct-btn ct-btn-primary btn-save">Save</button>
        </div>
      </footer>
    </div>
  `;

  modal.querySelector('.btn-cancel')?.addEventListener('click', () => modal.remove());

  modal.querySelector('.btn-del')?.addEventListener('click', () => {
    removeAlert(alert.id, workspace);
    toast?.(`Alert for ${alert.symbol} removed`);
    modal.remove();
  });

  modal.querySelector('.btn-save')?.addEventListener('click', () => {
    const input = modal.querySelector('#omni-edit-price-val') as HTMLInputElement;
    const newPrice = parseFloat(input.value);
    if (isNaN(newPrice) || newPrice <= 0) {
      window.alert('Please enter a valid price.');
      return;
    }
    updateAlertPrice(alert.id, newPrice);
    if (alert.drawingId) {
      workspace.cells().forEach((cell) => {
        try {
          cell.chart.drawings.update(alert.drawingId!, {
            anchors: [{ time: Date.now(), price: newPrice }],
            text: {
              value: `⏰ ${alert.symbol} (${newPrice.toFixed(5)})`,
              color: '#ffffff',
              size: 'small',
              hAlign: 'right',
              vAlign: 'center',
              place: 'end',
              side: 'above',
            },
          });
        } catch {
          /* ignore */
        }
      });
    }
    toast?.(`🔔 Alert updated to ${newPrice.toFixed(5)}`);
    modal.remove();
  });

  document.body.appendChild(modal);
}

/**
 * Check price against all registered alerts with genuine transition detection.
 */
export function checkPriceAlerts(
  symbol: string,
  currentPrice: number,
  toast: (msg: string) => void,
  workspace?: VelaWorkspace,
): void {
  if (!currentPrice || isNaN(currentPrice) || currentPrice <= 0) return;
  const cleanSym = symbol.toUpperCase().replace(/[\/\s_-]/g, '');
  const prevPrice = symbolLastPrices.get(cleanSym);
  symbolLastPrices.set(cleanSym, currentPrice);

  if (prevPrice === undefined) {
    // First price tick observed for this symbol: record it to arm future crossings
    return;
  }

  const alerts = getAlerts();
  let changed = false;

  for (const alert of alerts) {
    if (alert.triggered) continue;
    if (alert.symbol !== cleanSym) continue;

    // Crossing logic:
    // Crossed above: prevPrice < alert.targetPrice && currentPrice >= alert.targetPrice
    // Crossed below: prevPrice > alert.targetPrice && currentPrice <= alert.targetPrice
    // Also trigger if price brackets the target ((prev - target) * (cur - target) <= 0)
    const crossedAbove = prevPrice < alert.targetPrice && currentPrice >= alert.targetPrice;
    const crossedBelow = prevPrice > alert.targetPrice && currentPrice <= alert.targetPrice;
    const bracketed =
      (prevPrice - alert.targetPrice) * (currentPrice - alert.targetPrice) <= 0 &&
      prevPrice !== currentPrice;

    const hit =
      (alert.direction === 'above' && crossedAbove) ||
      (alert.direction === 'below' && crossedBelow) ||
      bracketed;

    if (hit) {
      alert.triggered = true;
      changed = true;

      // Show Alert Trigger Modal with sound
      showOmniAlertPopup(alert, currentPrice, workspace, toast);

      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(`Price Alert: ${alert.symbol}`, {
          body: `Price reached ${alert.targetPrice.toFixed(5)} (${alert.direction})`,
        });
      }
    }
  }

  if (changed) {
    saveAlerts(alerts);
  }
}

/**
 * Wire chart events to listen for drawing edits (when user drags an alert hline)
 * and selection (showing interactive alert button/pill on the chart).
 */
export function wireCellAlerts(
  cell: any,
  toast: (msg: string) => void,
  workspace?: VelaWorkspace,
): void {
  const chart = cell.chart;
  if (!chart || (cell as any)._alertsWired) return;
  (cell as any)._alertsWired = true;

  // 1. Draggable Alert Line Update
  chart.on('drawing:edited', ({ id }: { id: string }) => {
    const alerts = getAlerts();
    const alert = alerts.find((a) => a.drawingId === id);
    if (!alert) return;

    const all = chart.drawings.all();
    const drawing = all.find((d: any) => d.id === id);
    if (drawing && drawing.anchors && drawing.anchors[0]) {
      const newPrice = drawing.anchors[0].price;
      const curPrice = symbolLastPrices.get(alert.symbol);
      alert.targetPrice = newPrice;
      alert.triggered = false;
      if (curPrice !== undefined) {
        alert.direction = newPrice >= curPrice ? 'above' : 'below';
      }
      saveAlerts(alerts);

      try {
        chart.drawings.update(id, {
          style: { lineColor: '#ffffff', lineWidth: 1, lineStyle: 'dotted' },
          text: {
            value: `⏰ ${alert.symbol} (${newPrice.toFixed(5)})`,
            color: '#ffffff',
            size: 'small',
            hAlign: 'right',
            vAlign: 'center',
            place: 'end',
            side: 'above',
          },
        });
      } catch {
        /* ignore */
      }

      toast(`🔔 Alert adjusted to ${newPrice.toFixed(5)}`);
    }
  });

  // 2. Alert Line Removed
  chart.on('drawing:removed', ({ id }: { id: string }) => {
    const alerts = getAlerts();
    const alert = alerts.find((a) => a.drawingId === id);
    if (alert) {
      removeAlert(alert.id);
      toast(`Alert for ${alert.symbol} removed`);
      removeFloatingAlertPill(cell.host);
    }
  });

  // 3. Alert Line Selection -> Show Interactive Action Pill/Button on line
  chart.on('drawing:selected', ({ id }: { id: string | null }) => {
    if (!id) {
      removeFloatingAlertPill(cell.host);
      return;
    }
    const alerts = getAlerts();
    const alert = alerts.find((a) => a.drawingId === id);
    if (alert) {
      showFloatingAlertPill(cell, alert, workspace, toast);
    } else {
      removeFloatingAlertPill(cell.host);
    }
  });
}

function removeFloatingAlertPill(host: HTMLElement): void {
  host.querySelectorAll('.omni-alert-inline-pill').forEach((el) => el.remove());
}

function showFloatingAlertPill(
  cell: any,
  alert: PriceAlert,
  workspace?: VelaWorkspace,
  toast?: (msg: string) => void,
): void {
  const host = cell.host as HTMLElement;
  if (!host) return;
  removeFloatingAlertPill(host);

  const pill = document.createElement('div');
  pill.className = 'omni-alert-inline-pill';
  pill.innerHTML = `
    <span class="omni-pill-icon">⏰</span>
    <span class="omni-pill-text">${alert.symbol} ${alert.targetPrice.toFixed(5)}</span>
    <button type="button" class="omni-pill-btn omni-pill-edit" title="Edit Price">⚙️</button>
    <button type="button" class="omni-pill-btn omni-pill-del" title="Remove Alert">✕</button>
  `;

  pill.querySelector('.omni-pill-edit')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (workspace) openAlertEditPrompt(alert, workspace, toast);
  });

  pill.querySelector('.omni-pill-del')?.addEventListener('click', (e) => {
    e.stopPropagation();
    removeAlert(alert.id, workspace);
    toast?.(`Alert removed`);
    pill.remove();
  });

  host.appendChild(pill);
}

/**
 * Open interactive Alert Management Modal.
 */
export function openManageAlertsModal(
  workspace: VelaWorkspace,
  toast: (msg: string) => void,
): void {
  const existing = document.getElementById('vela-alerts-modal');
  existing?.remove();

  const modal = document.createElement('div');
  modal.id = 'vela-alerts-modal';
  modal.className = 'ct-overlay';

  const renderContent = () => {
    const alerts = getAlerts();

    const rowsHtml =
      alerts.length === 0
        ? `<div style="text-align:center; padding:30px 10px; color:#94a3b8; font-size:13px;">
            No active alerts.<br />Right-click anywhere on a chart or press <kbd style="background:#1e293b; padding:2px 6px; border-radius:4px;">Alt+A</kbd> to place an alert line at your mouse cursor.
          </div>`
        : alerts
            .map((alert) => {
              const statusClass = alert.triggered ? 'status-triggered' : 'status-active';
              const statusText = alert.triggered ? 'TRIGGERED' : 'ACTIVE';
              return `
              <div class="alert-item-row" data-id="${alert.id}">
                <div style="display:flex; align-items:center; gap:10px;">
                  <strong style="font-size:14px; letter-spacing:0.04em;">${alert.symbol}</strong>
                  <span class="alert-chip ${statusClass}">${statusText}</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                  <input type="number" step="0.00001" class="alert-price-input" value="${alert.targetPrice.toFixed(5)}" style="width:110px;" />
                  <button type="button" class="ct-btn ct-btn-ghost btn-save-price" style="padding:4px 8px; font-size:11px;" title="Update Price">Save</button>
                  <button type="button" class="ct-btn ct-btn-danger btn-del-alert" style="padding:4px 8px; font-size:11px;" title="Delete Alert">✕</button>
                </div>
              </div>
            `;
            })
            .join('');

    modal.innerHTML = `
      <div class="ct-card" style="max-width: 540px;">
        <header class="ct-head">
          <div class="ct-mark" style="background: linear-gradient(135deg, #f59e0b, #ef4444);">🔔</div>
          <div>
            <h1>Price Alerts &amp; Alarms</h1>
            <p>Precision price crossing alerts with audio playback.</p>
          </div>
        </header>

        <div style="max-height: 340px; overflow-y: auto; display:flex; flex-direction:column; gap:8px; margin-bottom:18px;">
          ${rowsHtml}
        </div>

        <footer class="ct-actions" style="display:flex; justify-content:space-between; align-items:center;">
          <button type="button" class="ct-btn ct-btn-ghost btn-test-sound" style="color:#f59e0b;">🔊 Test Sound</button>
          <div style="display:flex; gap:8px;">
            <button type="button" class="ct-btn ct-btn-ghost btn-clear-all" style="color:#ef4444;">Clear All</button>
            <button type="button" class="ct-btn ct-btn-primary btn-close">Done</button>
          </div>
        </footer>
      </div>
    `;

    // Wire buttons
    modal.querySelector('.btn-test-sound')?.addEventListener('click', () => {
      playOmniAlertSound();
      toast('Playing alert sound...');
    });

    modal.querySelectorAll('.alert-item-row').forEach((row) => {
      const id = row.getAttribute('data-id');
      const input = row.querySelector('.alert-price-input') as HTMLInputElement;
      const saveBtn = row.querySelector('.btn-save-price') as HTMLButtonElement;
      const delBtn = row.querySelector('.btn-del-alert') as HTMLButtonElement;

      saveBtn.addEventListener('click', () => {
        const newPrice = parseFloat(input.value);
        if (isNaN(newPrice) || newPrice <= 0) {
          window.alert('Please enter a valid positive price.');
          return;
        }
        if (id) {
          updateAlertPrice(id, newPrice);
          const alert = getAlerts().find((a) => a.id === id);
          if (alert?.drawingId) {
            workspace.cells().forEach((cell) => {
              try {
                cell.chart.drawings.update(alert.drawingId!, {
                  anchors: [{ time: Date.now(), price: newPrice }],
                  style: { lineColor: '#ffffff', lineWidth: 1, lineStyle: 'dotted' },
                  text: {
                    value: `⏰ ${alert.symbol} (${newPrice.toFixed(5)})`,
                    color: '#ffffff',
                    size: 'small',
                    hAlign: 'right',
                    vAlign: 'center',
                    place: 'end',
                    side: 'above',
                  },
                });
              } catch {
                /* ignore */
              }
            });
          }
          toast(`🔔 Alert updated to ${newPrice.toFixed(5)}`);
          renderContent();
        }
      });

      delBtn.addEventListener('click', () => {
        if (id) {
          removeAlert(id, workspace);
          toast('Alert removed.');
          renderContent();
        }
      });
    });

    modal.querySelector('.btn-clear-all')?.addEventListener('click', () => {
      if (confirm('Clear all price alerts?')) {
        const all = getAlerts();
        all.forEach((a) => removeAlert(a.id, workspace));
        toast('All alerts cleared.');
        renderContent();
      }
    });

    modal.querySelector('.btn-close')?.addEventListener('click', () => modal.remove());
  };

  renderContent();
  document.body.appendChild(modal);
}

/**
 * Initialize global wiring for Chart Settings alerts integration.
 */
export function initAlertsWorkspaceWiring(workspace: VelaWorkspace): void {
  // 1. Color update handler
  (window as any).__velaSetAlertLineColor = (color: string) => {
    const alerts = getAlerts();
    workspace.cells().forEach((cell) => {
      alerts.forEach((a) => {
        if (a.drawingId) {
          try {
            cell.chart.drawings.update(a.drawingId, {
              style: { lineColor: color, lineWidth: 1, lineStyle: 'dotted' },
              text: {
                value: `⏰ ${a.symbol} (${a.targetPrice.toFixed(5)})`,
                color: color,
                size: 'small',
                hAlign: 'right',
                vAlign: 'center',
                place: 'end',
                side: 'above',
              },
            });
          } catch {}
        }
      });
    });
  };

  // 2. Visibility toggle handler
  (window as any).__velaSetAlertLinesVisible = (visible: boolean) => {
    const alerts = getAlerts();
    workspace.cells().forEach((cell) => {
      alerts.forEach((a) => {
        if (a.drawingId) {
          try {
            if (visible) {
              const all = cell.chart.drawings.all();
              const existing = all.find((d: any) => d.id === a.drawingId);
              if (!existing) {
                const alSettings = getAlertsSettings();
                const d = createOmniAlertDrawing(cell.chart, a.symbol, a.targetPrice);
                if (d) a.drawingId = d.id;
              }
            } else {
              cell.chart.drawings.remove(a.drawingId);
            }
          } catch {}
        }
      });
    });
  };

  // 3. Filter active alerts handler
  (window as any).__velaFilterActiveAlerts = (onlyActive: boolean) => {
    const alerts = getAlerts();
    workspace.cells().forEach((cell) => {
      alerts.forEach((a) => {
        if (a.drawingId && a.triggered) {
          try {
            if (onlyActive) {
              cell.chart.drawings.remove(a.drawingId);
            } else {
              createOmniAlertDrawing(cell.chart, a.symbol, a.targetPrice);
            }
          } catch {}
        }
      });
    });
  };

  // 4. Sound preview helpers
  (window as any).__playAlertSoundPreview = (volPercent: number) => {
    playOmniAlertSound(undefined, volPercent / 100);
  };

  (window as any).__playExecutionSoundPreview = (soundType: string, volPercent: number) => {
    playExecutionSound(soundType, volPercent / 100);
  };

  // Listen to external settings update event
  window.addEventListener('vela:alerts-settings-updated', (e: any) => {
    const al = e.detail;
    if (!al) return;
    if (typeof al.alertLineColor === 'string') {
      (window as any).__velaSetAlertLineColor?.(al.alertLineColor);
    }
    if (typeof al.alertLines === 'boolean') {
      (window as any).__velaSetAlertLinesVisible?.(al.alertLines);
    }
    if (typeof al.onlyActiveAlerts === 'boolean') {
      (window as any).__velaFilterActiveAlerts?.(al.onlyActiveAlerts);
    }
  });
}
