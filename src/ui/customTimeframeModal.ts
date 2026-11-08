/**
 * OmniTrading - Custom Timeframe Creator & Manager
 *
 * Allows traders to generate and switch to any custom timeframe:
 * Ticks (e.g., 50T, 100T, 500T), Seconds (1S, 5S, 15S), Minutes (2m, 3m, 12m),
 * Hours (2h, 6h, 8h, 12h), Days (2D, 3D), and Range bars (5R, 10R).
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

export type TimeframeUnit = 'T' | 'S' | 'm' | 'h' | 'D' | 'R';

interface PresetEntry {
  label: string;
  category: string;
  val: number;
  unit: TimeframeUnit;
  canonical: string;
}

const PRESETS: PresetEntry[] = [
  { label: '50 Ticks', category: 'Ticks', val: 50, unit: 'T', canonical: '50T' },
  { label: '100 Ticks', category: 'Ticks', val: 100, unit: 'T', canonical: '100T' },
  { label: '500 Ticks', category: 'Ticks', val: 500, unit: 'T', canonical: '500T' },
  { label: '1000 Ticks', category: 'Ticks', val: 1000, unit: 'T', canonical: '1000T' },
  { label: '1 Second', category: 'Seconds', val: 1, unit: 'S', canonical: '1S' },
  { label: '5 Seconds', category: 'Seconds', val: 5, unit: 'S', canonical: '5S' },
  { label: '15 Seconds', category: 'Seconds', val: 15, unit: 'S', canonical: '15S' },
  { label: '30 Seconds', category: 'Seconds', val: 30, unit: 'S', canonical: '30S' },
  { label: '2 Minutes', category: 'Minutes', val: 2, unit: 'm', canonical: '2' },
  { label: '3m (ICT)', category: 'Minutes', val: 3, unit: 'm', canonical: '3' },
  { label: '12m (Harmonic)', category: 'Minutes', val: 12, unit: 'm', canonical: '12' },
  { label: '45 Minutes', category: 'Minutes', val: 45, unit: 'm', canonical: '45' },
  { label: '2 Hours', category: 'Hours', val: 2, unit: 'h', canonical: '120' },
  { label: '6h (Session)', category: 'Hours', val: 6, unit: 'h', canonical: '360' },
  { label: '8h (Shift)', category: 'Hours', val: 8, unit: 'h', canonical: '480' },
  { label: '12h (Half-Day)', category: 'Hours', val: 12, unit: 'h', canonical: '720' },
  { label: '2 Days', category: 'Days', val: 2, unit: 'D', canonical: '2880' },
  { label: '3 Days', category: 'Days', val: 3, unit: 'D', canonical: '4320' },
  { label: '10 Range (Pips)', category: 'Range', val: 10, unit: 'R', canonical: '10R' },
  { label: '20 Range (Pips)', category: 'Range', val: 20, unit: 'R', canonical: '20R' },
];

export function openCustomTimeframeModal(onApply: (canonical: string) => void): void {
  const existing = document.getElementById('omni-custom-tf-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'omni-custom-tf-modal';
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
    color: #e2e8f0;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: var(--vela-surface-elev, #131722);
    border: 1px solid var(--vela-border, #2a2e39);
    border-radius: 12px;
    width: 480px;
    max-width: 94vw;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
    overflow: hidden;
  `;

  let selectedUnit: TimeframeUnit = 'T';

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2a2e39;background:var(--vela-surface,#0e1118);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#22d3a5,#089981);display:flex;align-items:center;justify-content:center;font-size:15px;color:#0b0e11;font-weight:bold;">
          ⏱️
        </div>
        <div style="font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:0.2px;">Custom Timeframe Creator</div>
      </div>
      <button id="omni-ctf-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
    </div>

    <div style="padding:20px;display:flex;flex-direction:column;gap:18px;">
      <!-- Custom Value and Unit Input -->
      <div>
        <label style="display:block;font-size:11.5px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Create Custom Interval
        </label>
        <div style="display:flex;gap:8px;">
          <input
            id="omni-ctf-val"
            type="number"
            min="1"
            max="100000"
            value="100"
            style="flex:1;background:#0d1117;border:1px solid #2a2e39;border-radius:6px;color:#f8fafc;padding:9px 12px;font-size:15px;font-weight:600;outline:none;"
          />
          <div id="omni-ctf-units" style="display:flex;background:#0d1117;border:1px solid #2a2e39;border-radius:6px;padding:3px;gap:2px;">
            <button type="button" class="ctf-unit-btn" data-unit="T" style="background:#22d3a5;color:#0b0e11;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer;">Ticks</button>
            <button type="button" class="ctf-unit-btn" data-unit="S" style="background:transparent;color:#94a3b8;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Sec</button>
            <button type="button" class="ctf-unit-btn" data-unit="m" style="background:transparent;color:#94a3b8;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Min</button>
            <button type="button" class="ctf-unit-btn" data-unit="h" style="background:transparent;color:#94a3b8;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Hour</button>
            <button type="button" class="ctf-unit-btn" data-unit="D" style="background:transparent;color:#94a3b8;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Day</button>
            <button type="button" class="ctf-unit-btn" data-unit="R" style="background:transparent;color:#94a3b8;border:none;padding:4px 10px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer;">Range</button>
          </div>
        </div>
      </div>

      <!-- Quick Presets -->
      <div>
        <label style="display:block;font-size:11.5px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px;">
          Popular Trader Presets
        </label>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px;max-height:180px;overflow-y:auto;padding-right:4px;">
          ${PRESETS.map(
            (p) => `
            <button
              type="button"
              class="ctf-preset-btn"
              data-canonical="${p.canonical}"
              data-val="${p.val}"
              data-unit="${p.unit}"
              style="text-align:left;background:rgba(255,255,255,0.03);border:1px solid #2a2e39;border-radius:6px;padding:8px 10px;color:#cbd5e1;cursor:pointer;display:flex;flex-direction:column;gap:2px;transition:all 0.15s ease;"
            >
              <span style="font-size:12px;font-weight:600;color:#f8fafc;">${p.label}</span>
              <span style="font-size:10px;color:#64748b;">${p.category}</span>
            </button>
          `,
          ).join('')}
        </div>
      </div>
    </div>

    <div style="padding:12px 20px;background:#0d1117;border-top:1px solid #2a2e39;display:flex;justify-content:space-between;align-items:center;">
      <span id="omni-ctf-preview" style="font-size:12px;color:#22d3a5;font-weight:600;">Selected: 100 Ticks (100T)</span>
      <div style="display:flex;gap:8px;">
        <button id="omni-ctf-cancel" style="background:#2a2e39;border:1px solid #3b4252;color:#cbd5e1;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Cancel</button>
        <button id="omni-ctf-apply" style="background:linear-gradient(135deg,#22d3a5,#089981);border:none;color:#0b0e11;padding:7px 20px;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer;">
          Apply Timeframe
        </button>
      </div>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  modal.querySelector('#omni-ctf-close')?.addEventListener('click', close);
  modal.querySelector('#omni-ctf-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const valInput = modal.querySelector('#omni-ctf-val') as HTMLInputElement;
  const previewEl = modal.querySelector('#omni-ctf-preview') as HTMLElement;
  const unitButtons = modal.querySelectorAll<HTMLButtonElement>('.ctf-unit-btn');

  const getCanonical = (num: number, unit: TimeframeUnit): string => {
    if (unit === 'T') return `${num}T`;
    if (unit === 'S') return `${num}S`;
    if (unit === 'R') return `${num}R`;
    if (unit === 'm') return `${num}`;
    if (unit === 'h') return `${num * 60}`;
    if (unit === 'D') return `${num * 1440}`;
    return `${num}`;
  };

  const updatePreview = () => {
    const n = Math.max(1, parseInt(valInput.value, 10) || 1);
    const unitName =
      selectedUnit === 'T'
        ? 'Ticks'
        : selectedUnit === 'S'
        ? 'Seconds'
        : selectedUnit === 'm'
        ? 'Minutes'
        : selectedUnit === 'h'
        ? 'Hours'
        : selectedUnit === 'D'
        ? 'Days'
        : 'Range';
    const canonical = getCanonical(n, selectedUnit);
    previewEl.textContent = `Selected: ${n} ${unitName} (${canonical})`;
  };

  unitButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedUnit = btn.getAttribute('data-unit') as TimeframeUnit;
      unitButtons.forEach((b) => {
        b.style.background = 'transparent';
        b.style.color = '#94a3b8';
      });
      btn.style.background = '#22d3a5';
      btn.style.color = '#0b0e11';
      updatePreview();
    });
  });

  valInput.addEventListener('input', updatePreview);

  modal.querySelectorAll<HTMLButtonElement>('.ctf-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const canonical = btn.getAttribute('data-canonical');
      if (canonical) {
        close();
        onApply(canonical);
      }
    });
  });

  modal.querySelector('#omni-ctf-apply')?.addEventListener('click', () => {
    const n = Math.max(1, parseInt(valInput.value, 10) || 1);
    const canonical = getCanonical(n, selectedUnit);
    close();
    onApply(canonical);
  });
}
