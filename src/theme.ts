import type { VelaWorkspace } from '@luxalgo/vela/workspace';
import { registerTheme } from '@luxalgo/vela';

export interface ChartThemePreset {
  id: string;
  name: string;
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  upColor: string;
  downColor: string;
  fontFamily: string;
  isCustom?: boolean;
}

export const BUILTIN_THEMES: ChartThemePreset[] = [
  {
    id: 'obsidian',
    name: 'Obsidian Black',
    background: '#0b0e11',
    textColor: '#94a3b8',
    gridColor: 'rgba(30, 41, 59, 0.4)',
    borderColor: '#1e293b',
    upColor: '#10b981',
    downColor: '#f43f5e',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  {
    id: 'minimal-light',
    name: 'Minimal Light (Red & Gray)',
    background: '#ffffff',
    textColor: '#1e293b',
    gridColor: 'rgba(226, 232, 240, 0.65)',
    borderColor: '#cbd5e1',
    upColor: '#64748b',   // Elegant slate gray bull candles
    downColor: '#dc2626', // Clean crimson red bear candles
    fontFamily: 'Inter, system-ui, sans-serif',
  },
];

const THEME_STORAGE_KEY = 'omni-active-theme';
const CUSTOM_THEMES_STORAGE_KEY = 'omni-custom-themes';

export function getCustomThemes(): ChartThemePreset[] {
  try {
    const raw = localStorage.getItem(CUSTOM_THEMES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveCustomTheme(theme: ChartThemePreset): void {
  const custom = getCustomThemes().filter((t) => t.id !== theme.id);
  theme.isCustom = true;
  custom.unshift(theme);
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(custom));

  // Register with Vela so it appears immediately in Chart Settings -> Canvas -> Theme
  try {
    registerTheme({
      id: theme.id,
      label: theme.name,
      theme: {
        background: theme.background,
        textColor: theme.textColor,
        gridColor: theme.gridColor,
        borderColor: theme.borderColor,
        upColor: theme.upColor,
        downColor: theme.downColor,
        fontFamily: theme.fontFamily,
      },
    });
  } catch {
    /* ignore if already registered */
  }
}

export function deleteCustomTheme(themeId: string): void {
  const custom = getCustomThemes().filter((t) => t.id !== themeId);
  localStorage.setItem(CUSTOM_THEMES_STORAGE_KEY, JSON.stringify(custom));
}

export function getAllThemes(): ChartThemePreset[] {
  return [...BUILTIN_THEMES, ...getCustomThemes()];
}

export function getSavedThemeId(): string {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) || 'obsidian';
  } catch {
    return 'obsidian';
  }
}

export function getSavedThemePreset(): ChartThemePreset {
  const id = getSavedThemeId();
  const all = getAllThemes();
  return all.find((t) => t.id === id) || BUILTIN_THEMES[0];
}

/**
 * Register themes into Vela so they populate directly in Chart Settings -> Canvas -> Theme
 */
export function registerAllThemes(): void {
  getAllThemes().forEach((t) => {
    try {
      registerTheme({
        id: t.id,
        label: t.name,
        theme: {
          background: t.background,
          textColor: t.textColor,
          gridColor: t.gridColor,
          borderColor: t.borderColor,
          upColor: t.upColor,
          downColor: t.downColor,
          fontFamily: t.fontFamily,
        },
      });
    } catch {
      /* ignore if already registered */
    }
  });
}

export function applyTheme(workspace: VelaWorkspace, themeId: string): void {
  const all = getAllThemes();
  const preset = all.find((t) => t.id === themeId) || BUILTIN_THEMES[0];
  try {
    workspace.setTheme(preset);
    localStorage.setItem(THEME_STORAGE_KEY, preset.id);

    // Apply background and text style to root document
    document.documentElement.style.setProperty('--ct-bg', preset.background);
    document.documentElement.style.setProperty('--ct-text', preset.textColor);
    document.documentElement.style.setProperty('--ct-border', preset.borderColor);

    // If light theme, adjust light/dark class
    const isLight = preset.background.toLowerCase() === '#ffffff' || preset.background.toLowerCase() === '#f8fafc';
    if (isLight) {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    if (typeof (window as any).__velaAutoSave === 'function') {
      (window as any).__velaAutoSave();
    }
  } catch (err) {
    console.error('[vela] Failed to set theme', err);
  }
}

/**
 * Dedicated Theme Settings & Management Modal.
 * Allows picking Obsidian Black, Minimal Light (Red & Gray), Custom Themes, or creating new ones.
 */
export function openThemeSettingsModal(
  workspace: VelaWorkspace,
  onApplied?: (theme: ChartThemePreset) => void,
): void {
  const existing = document.getElementById('vela-theme-picker-modal');
  existing?.remove();

  const modal = document.createElement('div');
  modal.id = 'vela-theme-picker-modal';
  modal.className = 'ct-overlay';

  const renderContent = () => {
    const all = getAllThemes();
    const activeId = getSavedThemeId();

    modal.innerHTML = `
      <div class="ct-card" style="max-width: 500px;">
        <header class="ct-head">
          <div class="ct-mark" style="background: linear-gradient(135deg, #0284c7, #8b5cf6);">🎨</div>
          <div>
            <h1>Chart Color Themes</h1>
            <p>Pick a pre-configured theme or build your own custom color scheme.</p>
          </div>
        </header>

        <div style="display:flex; flex-direction:column; gap:8px; margin: 16px 0;">
          ${all
            .map((t) => {
              const isActive = t.id === activeId;
              const isLight = t.background.toLowerCase() === '#ffffff' || t.background.toLowerCase() === '#f8fafc';
              return `
              <div class="theme-choice-card" data-id="${t.id}" style="
                display:flex; align-items:center; justify-content:space-between;
                padding: 10px 14px; border-radius: 8px; cursor: pointer;
                background: ${isActive ? 'rgba(56, 189, 248, 0.12)' : 'rgba(30, 41, 59, 0.35)'};
                border: 1px solid ${isActive ? '#38bdf8' : 'rgba(148, 163, 184, 0.15)'};
                transition: all 0.15s ease;
              ">
                <div style="display:flex; align-items:center; gap:12px;">
                  <!-- Swatch Preview -->
                  <div style="
                    width: 32px; height: 32px; border-radius: 6px;
                    background: ${t.background};
                    border: 1px solid ${t.borderColor};
                    display:flex; align-items:center; justify-content:center;
                    gap: 3px; overflow:hidden;
                  ">
                    <span style="width:4px; height:18px; background:${t.upColor}; border-radius:1px;"></span>
                    <span style="width:4px; height:14px; background:${t.downColor}; border-radius:1px;"></span>
                  </div>

                  <div>
                    <div style="font-weight: 600; font-size: 13px; color: ${isLight && !isActive ? '#cbd5e1' : '#f1f5f9'};">
                      ${t.name} ${isActive ? '<span style="color:#38bdf8; font-size:11px; margin-left:6px;">✓ Active</span>' : ''}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; display:flex; gap:8px; margin-top:2px;">
                      <span>Bg: ${t.background}</span>
                      <span>• Bull: <span style="color:${t.upColor}">■</span></span>
                      <span>• Bear: <span style="color:${t.downColor}">■</span></span>
                    </div>
                  </div>
                </div>

                <div style="display:flex; align-items:center; gap:8px;">
                  <button type="button" class="ct-btn ct-btn-sm" data-select="${t.id}" style="
                    font-size: 11px; padding: 4px 10px;
                    background: ${isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'};
                    color: ${isActive ? '#0b0e11' : '#f1f5f9'};
                    font-weight: 600;
                  ">
                    ${isActive ? 'Applied' : 'Apply'}
                  </button>
                  ${
                    t.isCustom
                      ? `<button type="button" class="ct-btn-del" data-del="${t.id}" title="Delete custom theme" style="
                          background: transparent; border:none; color: #ef4444; cursor: pointer; padding: 4px 6px; font-size: 13px;
                        ">✕</button>`
                      : ''
                  }
                </div>
              </div>
            `;
            })
            .join('')}
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; margin-top: 16px; border-top: 1px solid rgba(148, 163, 184, 0.15); padding-top: 14px;">
          <button type="button" class="ct-btn ct-btn-ghost" data-action="custom" style="color: #38bdf8; font-weight: 500;">
            + Create Custom Theme...
          </button>
          <button type="button" class="ct-btn ct-btn-ghost" data-action="close">Close</button>
        </div>
      </div>
    `;

    // Handlers
    modal.querySelectorAll('[data-select]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (btn as HTMLElement).dataset.select!;
        applyTheme(workspace, id);
        const chosen = getAllThemes().find((t) => t.id === id);
        if (chosen && onApplied) onApplied(chosen);
        renderContent();
      });
    });

    modal.querySelectorAll('.theme-choice-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = (card as HTMLElement).dataset.id!;
        applyTheme(workspace, id);
        const chosen = getAllThemes().find((t) => t.id === id);
        if (chosen && onApplied) onApplied(chosen);
        renderContent();
      });
    });

    modal.querySelectorAll('[data-del]').forEach((delBtn) => {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = (delBtn as HTMLElement).dataset.del!;
        deleteCustomTheme(id);
        renderContent();
      });
    });

    modal.querySelector('[data-action="custom"]')?.addEventListener('click', () => {
      modal.remove();
      openCustomThemeModal(workspace, (newTheme) => {
        if (onApplied) onApplied(newTheme);
      });
    });

    modal.querySelector('[data-action="close"]')?.addEventListener('click', () => {
      modal.remove();
    });
  };

  renderContent();
  document.body.appendChild(modal);
}

export function openCustomThemeModal(
  workspace: VelaWorkspace,
  onThemeSaved: (theme: ChartThemePreset) => void,
): void {
  const existing = document.getElementById('vela-theme-modal');
  existing?.remove();

  const modal = document.createElement('div');
  modal.id = 'vela-theme-modal';
  modal.className = 'ct-overlay';
  modal.innerHTML = `
    <div class="ct-card" style="max-width: 520px;">
      <header class="ct-head">
        <div class="ct-mark" style="background: linear-gradient(135deg, #ec4899, #8b5cf6);">🎨</div>
        <div>
          <h1>Create Custom Theme</h1>
          <p>Customize your chart colors and save your own personalized theme.</p>
        </div>
      </header>

      <div class="ct-grid">
        <label class="ct-field ct-span">
          <span>Theme Name</span>
          <input type="text" name="themeName" placeholder="e.g. Clean Slate" value="My Custom Palette" required />
        </label>

        <label class="ct-field">
          <span>Background</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="bgPick" value="#ffffff" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="bgText" value="#ffffff" style="flex:1;" />
          </div>
        </label>

        <label class="ct-field">
          <span>Text &amp; Axis</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="textPick" value="#1e293b" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="textText" value="#1e293b" style="flex:1;" />
          </div>
        </label>

        <label class="ct-field">
          <span>Bull Candle (Up)</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="upPick" value="#64748b" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="upText" value="#64748b" style="flex:1;" />
          </div>
        </label>

        <label class="ct-field">
          <span>Bear Candle (Down)</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="downPick" value="#dc2626" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="downText" value="#dc2626" style="flex:1;" />
          </div>
        </label>

        <label class="ct-field">
          <span>Grid Lines</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="gridPick" value="#e2e8f0" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="gridText" value="#e2e8f0" style="flex:1;" />
          </div>
        </label>

        <label class="ct-field">
          <span>Borders</span>
          <div style="display:flex; gap:8px; align-items:center;">
            <input type="color" name="borderPick" value="#cbd5e1" style="width:40px; height:36px; padding:0; cursor:pointer;" />
            <input type="text" name="borderText" value="#cbd5e1" style="flex:1;" />
          </div>
        </label>
      </div>

      <footer class="ct-actions" style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
        <button type="button" class="ct-btn ct-btn-ghost" data-action="cancel">Cancel</button>
        <button type="button" class="ct-btn ct-btn-primary" data-action="save">Save &amp; Apply Theme</button>
      </footer>
    </div>
  `;

  // Bind color pickers to text inputs
  const pairs = [
    ['bgPick', 'bgText'],
    ['textPick', 'textText'],
    ['upPick', 'upText'],
    ['downPick', 'downText'],
    ['gridPick', 'gridText'],
    ['borderPick', 'borderText'],
  ];

  pairs.forEach(([p, t]) => {
    const pickEl = modal.querySelector(`input[name="${p}"]`) as HTMLInputElement;
    const textEl = modal.querySelector(`input[name="${t}"]`) as HTMLInputElement;
    pickEl.addEventListener('input', () => (textEl.value = pickEl.value));
    textEl.addEventListener('input', () => {
      if (/^#[0-9A-Fa-f]{6}$/.test(textEl.value)) {
        pickEl.value = textEl.value;
      }
    });
  });

  const cancelBtn = modal.querySelector('[data-action="cancel"]') as HTMLButtonElement;
  cancelBtn.addEventListener('click', () => modal.remove());

  const saveBtn = modal.querySelector('[data-action="save"]') as HTMLButtonElement;
  saveBtn.addEventListener('click', () => {
    const nameInput = modal.querySelector('input[name="themeName"]') as HTMLInputElement;
    const name = nameInput.value.trim() || 'My Custom Theme';
    const id = `custom-${Date.now()}`;

    const bg = (modal.querySelector('input[name="bgText"]') as HTMLInputElement).value;
    const txt = (modal.querySelector('input[name="textText"]') as HTMLInputElement).value;
    const up = (modal.querySelector('input[name="upText"]') as HTMLInputElement).value;
    const down = (modal.querySelector('input[name="downText"]') as HTMLInputElement).value;
    const grid = (modal.querySelector('input[name="gridText"]') as HTMLInputElement).value;
    const border = (modal.querySelector('input[name="borderText"]') as HTMLInputElement).value;

    const customTheme: ChartThemePreset = {
      id,
      name,
      background: bg,
      textColor: txt,
      gridColor: grid,
      borderColor: border,
      upColor: up,
      downColor: down,
      fontFamily: 'Inter, system-ui, sans-serif',
      isCustom: true,
    };

    saveCustomTheme(customTheme);
    applyTheme(workspace, customTheme.id);
    onThemeSaved(customTheme);
    modal.remove();
  });

  document.body.appendChild(modal);
}
