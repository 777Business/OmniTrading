// Save Template Modal

export interface ChartTemplate {
  name: string;
  config: any;
  builtin?: boolean;
  rememberSymbol?: boolean;
  rememberInterval?: boolean;
  symbol?: string;
  timeframe?: string;
}

const TEMPLATES_KEY = 'omni-chart-templates-v2';

export const BUILTIN_TEMPLATES: ChartTemplate[] = [
  {
    name: 'Clean View',
    builtin: true,
    config: {
      series: { spacing: 0.6, style: 'candles' },
      candles: {
        bodyVisible: true,
        borderVisible: true,
        wickVisible: true,
        upColor: '#22d3a5',
        downColor: '#ef4444',
        borderUpColor: '#22d3a5',
        borderDownColor: '#ef4444',
        wickUpColor: '#22d3a5',
        wickDownColor: '#ef4444',
      },
      grid: {
        horizontal: { visible: false },
        vertical: { visible: false },
      },
    },
  },
  {
    name: 'Obsidian Black',
    builtin: true,
    config: {
      series: { spacing: 0.6, style: 'candles' },
      candles: {
        bodyVisible: true,
        borderVisible: true,
        wickVisible: true,
        upColor: '#22d3a5',
        downColor: '#ff4d4f',
        borderUpColor: '#22d3a5',
        borderDownColor: '#ff4d4f',
        wickUpColor: '#22d3a5',
        wickDownColor: '#ff4d4f',
      },
      grid: {
        horizontal: { visible: true, color: 'rgba(255, 255, 255, 0.04)' },
        vertical: { visible: true, color: 'rgba(255, 255, 255, 0.04)' },
      },
    },
  },
  {
    name: 'Pure Light (Red & Gray)',
    builtin: true,
    config: {
      series: { spacing: 0.6, style: 'candles' },
      candles: {
        bodyVisible: true,
        borderVisible: true,
        wickVisible: true,
        upColor: '#64748b', // Gray up candles
        downColor: '#ef4444', // Red down candles
        borderUpColor: '#475569',
        borderDownColor: '#dc2626',
        wickUpColor: '#475569',
        wickDownColor: '#dc2626',
      },
      grid: {
        horizontal: { visible: true, color: '#f1f5f9' },
        vertical: { visible: true, color: '#f1f5f9' },
      },
    },
  },
  {
    name: 'Order Flow Quad (4-in-1)',
    builtin: true,
    config: {
      series: { spacing: 0.6, style: 'footprint' },
      grid: {
        horizontal: { visible: false },
        vertical: { visible: false },
      },
    },
  },
];

export function getChartTemplates(): ChartTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const userTemplates: ChartTemplate[] = raw ? JSON.parse(raw) : [];
    return [...BUILTIN_TEMPLATES, ...userTemplates];
  } catch {
    return BUILTIN_TEMPLATES;
  }
}

export function saveUserTemplate(template: ChartTemplate): void {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const list: ChartTemplate[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((t) => t.name.toLowerCase() !== template.name.toLowerCase());
    filtered.push(template);
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

export function deleteUserTemplate(name: string): void {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY);
    const list: ChartTemplate[] = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((t) => t.name.toLowerCase() !== name.toLowerCase());
    localStorage.setItem(TEMPLATES_KEY, JSON.stringify(filtered));
  } catch {
    /* ignore */
  }
}

/**
 * Open "Save template as" modal dialog
 */
export function openSaveChartTemplateModal(currentConfig: any, onSaved?: (name: string) => void): void {
  const existing = document.getElementById('vela-save-template-modal');
  existing?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'vela-save-template-modal';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.65);
    backdrop-filter: blur(2px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: inherit;
    color: var(--vela-fg-bright, #f8fafc);
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    width: 380px;
    max-width: calc(100% - 32px);
    background: var(--vela-surface, #1e293b);
    border: 1px solid var(--vela-border, #334155);
    border-radius: 12px;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    animation: velaFadeIn 0.15s ease-out;
  `;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--vela-border, #334155);">
      <span style="font-weight:600;font-size:15px;">Save template as</span>
      <button type="button" class="btn-close" style="background:transparent;border:none;color:var(--vela-fg-muted, #94a3b8);font-size:14px;cursor:pointer;padding:4px;">✕</button>
    </div>

    <div style="padding:18px;display:flex;flex-direction:column;gap:14px;">
      <div>
        <label style="display:block;font-size:12px;color:var(--vela-fg-muted, #94a3b8);margin-bottom:6px;">Template name</label>
        <input type="text" class="input-name" placeholder="Template name (e.g. Clean View)" style="width:100%;box-sizing:border-box;padding:8px 12px;background:var(--vela-bg, #0f172a);border:1px solid var(--vela-border, #334155);border-radius:6px;color:inherit;font-size:13px;outline:none;" />
      </div>

      <div style="display:flex;flex-direction:column;gap:8px;padding-top:4px;">
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="chk-symbol" />
          <span>Remember Symbol</span>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
          <input type="checkbox" class="chk-interval" />
          <span>Remember Interval</span>
        </label>
      </div>
    </div>

    <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:12px 18px;border-top:1px solid var(--vela-border, #334155);background:rgba(0,0,0,0.15);">
      <button type="button" class="btn-cancel" style="padding:7px 16px;border-radius:6px;background:transparent;border:1px solid var(--vela-border, #334155);color:var(--vela-fg-muted, #94a3b8);font-size:13px;cursor:pointer;">Cancel</button>
      <button type="button" class="btn-save" style="padding:7px 18px;border-radius:6px;background:var(--vela-accent, #22d3a5);color:#0f172a;font-weight:600;border:none;font-size:13px;cursor:pointer;">Save</button>
    </div>
  `;

  const inputName = modal.querySelector('.input-name') as HTMLInputElement;
  const chkSymbol = modal.querySelector('.chk-symbol') as HTMLInputElement;
  const chkInterval = modal.querySelector('.chk-interval') as HTMLInputElement;
  const btnClose = modal.querySelector('.btn-close') as HTMLButtonElement;
  const btnCancel = modal.querySelector('.btn-cancel') as HTMLButtonElement;
  const btnSave = modal.querySelector('.btn-save') as HTMLButtonElement;

  const close = () => backdrop.remove();

  btnClose.onclick = close;
  btnCancel.onclick = close;
  backdrop.onclick = (e) => {
    if (e.target === backdrop) close();
  };

  btnSave.onclick = () => {
    const name = inputName.value.trim();
    if (!name) {
      inputName.focus();
      inputName.style.borderColor = '#ef4444';
      return;
    }

    saveUserTemplate({
      name,
      config: currentConfig,
      rememberSymbol: chkSymbol.checked,
      rememberInterval: chkInterval.checked,
    });

    close();
    onSaved?.(name);
  };

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  inputName.focus();
}

// Bind to window for patched Vela SettingsDialog access
(window as any).__getChartTemplates = getChartTemplates;
(window as any).__deleteChartTemplate = deleteUserTemplate;
(window as any).__openSaveChartTemplateModal = openSaveChartTemplateModal;
