import type { VelaWorkspace } from '@luxalgo/vela/workspace';

interface IndicatorInfo {
  name: string;
  url: string;
  language: string;
  enabled: boolean;
}

const DEFAULT_PINE_TEMPLATE = `//@version=5
indicator("My Custom Indicator", overlay=true)

// Inputs
len = input.int(20, "Length", minval=1)
src = input.source(close, "Source")
col = input.color(#38bdf8, "Line Color")

// Calculations
val = ta.sma(src, len)

// Plots
plot(val, "SMA", color=col, linewidth=2)
`;

export class PineScriptEditor {
  private modal: HTMLElement | null = null;
  private currentFilename: string = 'new_indicator.pine';
  private codeCache: Map<string, string> = new Map();

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly toast: (msg: string) => void,
  ) {}

  public async open(initialCode?: string, initialName?: string): Promise<void> {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }

    const modal = document.createElement('div');
    modal.className = 'vela-pine-editor-overlay';
    modal.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.75);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 20px;
      box-sizing: border-box;
    `;

    const card = document.createElement('div');
    card.className = 'vela-pine-editor-card';
    card.style.cssText = `
      width: 1000px;
      max-width: 95vw;
      height: 85vh;
      background: #0b0e14;
      border: 1px solid #1e293b;
      border-radius: 12px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      color: #e2e8f0;
    `;

    // Header
    const head = document.createElement('div');
    head.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 20px;
      border-bottom: 1px solid #1e293b;
      background: #0f172a;
    `;
    head.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 6px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-weight: 700; font-size: 14px;">&lt;/&gt;</span>
        <div>
          <h2 style="margin: 0; font-size: 16px; font-weight: 700; color: #f8fafc; display: flex; align-items: center; gap: 8px;">
            Pine Script Code Editor
            <span style="font-size: 11px; padding: 2px 6px; border-radius: 4px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-weight: 600;">PineTS v5 / v6</span>
          </h2>
          <p style="margin: 2px 0 0 0; font-size: 12px; color: #94a3b8;">Write or paste Pine Script code, compile live to chart, or save permanently to indicators list.</p>
        </div>
      </div>
      <button type="button" class="btn-close" style="background: transparent; border: none; color: #94a3b8; font-size: 18px; cursor: pointer; padding: 4px 8px; border-radius: 4px;">✕</button>
    `;

    // Script selector / toolbar
    const toolbar = document.createElement('div');
    toolbar.style.cssText = `
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 20px;
      background: #0b0f19;
      border-bottom: 1px solid #1e293b;
    `;
    toolbar.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
        <label style="font-size: 12px; font-weight: 600; color: #94a3b8;">Indicator:</label>
        <select class="sel-indicator" style="background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; font-size: 13px; outline: none; cursor: pointer;">
          <option value="new">+ New Indicator</option>
        </select>
        <label style="font-size: 12px; font-weight: 600; color: #94a3b8; margin-left: 10px;">Name:</label>
        <input type="text" class="input-name" placeholder="Indicator Name" value="${initialName || 'My Custom Indicator'}" style="background: #1e293b; color: #f8fafc; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; font-size: 13px; width: 220px; outline: none;" />
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <button type="button" class="btn-template" style="background: rgba(255, 255, 255, 0.05); color: #cbd5e1; border: 1px solid #334155; border-radius: 6px; padding: 6px 12px; font-size: 12px; font-weight: 600; cursor: pointer;">Reset Template</button>
      </div>
    `;

    // Editor Area with Line Numbers
    const isPineInstalled = typeof (window as any).PineWorkerEngine === 'function';

    const addonBanner = document.createElement('div');
    addonBanner.className = 'omni-pine-addon-banner';
    addonBanner.style.cssText = `
      padding: 10px 20px;
      background: rgba(56, 189, 248, 0.08);
      border-bottom: 1px solid rgba(56, 189, 248, 0.2);
      display: ${isPineInstalled ? 'none' : 'flex'};
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    `;
    addonBanner.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 13px; color: #38bdf8; display: flex; align-items: center; gap: 6px;">
          <span>ℹ️</span> Optional Pine Script™ Add-on Not Installed
        </div>
        <div style="font-size: 12px; color: #94a3b8; margin-top: 2px;">
          To keep OmniTrading 100% MIT-licensed, Pine Script execution is an optional user add-on. Run <code style="background: rgba(0,0,0,0.4); padding: 2px 6px; border-radius: 4px; color: #f8fafc;">npm run add:pine</code> in your terminal to enable execution.
        </div>
      </div>
      <a href="https://github.com/777Business/OmniTrading#optional-pine-script-add-on" target="_blank" rel="noopener noreferrer" style="white-space: nowrap; font-size: 12px; color: #38bdf8; text-decoration: underline; font-weight: 600;">Setup Instructions ↗</a>
    `;

    const editorContainer = document.createElement('div');
    editorContainer.style.cssText = `
      flex: 1;
      display: flex;
      overflow: hidden;
      background: #07090e;
      position: relative;
    `;

    const lineNumbers = document.createElement('div');
    lineNumbers.style.cssText = `
      width: 48px;
      padding: 12px 6px;
      background: #07090e;
      border-right: 1px solid #1e293b;
      color: #475569;
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      font-size: 13px;
      line-height: 20px;
      text-align: right;
      user-select: none;
      overflow: hidden;
      box-sizing: border-box;
    `;

    const textarea = document.createElement('textarea');
    textarea.style.cssText = `
      flex: 1;
      background: transparent;
      color: #e2e8f0;
      border: none;
      outline: none;
      resize: none;
      padding: 12px 16px;
      font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
      font-size: 13px;
      line-height: 20px;
      tab-size: 4;
      white-space: pre;
      overflow: auto;
      box-sizing: border-box;
    `;
    textarea.value = initialCode || DEFAULT_PINE_TEMPLATE;
    textarea.spellcheck = false;

    // Handle Tab key indentation
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 4;
        updateLineNumbers();
      }
    });

    const updateLineNumbers = () => {
      const lines = textarea.value.split('\n').length;
      let nums = '';
      for (let i = 1; i <= lines; i++) {
        nums += i + '\n';
      }
      lineNumbers.textContent = nums;
    };

    textarea.addEventListener('input', updateLineNumbers);
    textarea.addEventListener('scroll', () => {
      lineNumbers.scrollTop = textarea.scrollTop;
    });

    editorContainer.append(lineNumbers, textarea);

    // Status / Console Output
    const consoleBox = document.createElement('div');
    consoleBox.style.cssText = `
      height: 52px;
      background: #0f172a;
      border-top: 1px solid #1e293b;
      padding: 8px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 12px;
      color: #94a3b8;
    `;
    consoleBox.innerHTML = `
      <span style="font-weight: 600; color: #64748b; font-family: monospace;">CONSOLE:</span>
      <span class="console-msg" style="color: #38bdf8;">Ready. Enter your Pine Script code and click 'Add to Chart' or 'Save to Indicators'.</span>
    `;

    // Footer actions
    const footer = document.createElement('div');
    footer.style.cssText = `
      padding: 12px 20px;
      border-top: 1px solid #1e293b;
      background: #0b0e14;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    footer.innerHTML = `
      <div style="font-size: 12px; color: #64748b;">
        Press <strong>Ctrl+S</strong> to Save &amp; Apply
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <button type="button" class="btn-cancel" style="background: rgba(255, 255, 255, 0.05); color: #94a3b8; border: 1px solid #334155; border-radius: 6px; padding: 7px 16px; font-size: 13px; font-weight: 600; cursor: pointer;">Close</button>
        <button type="button" class="btn-save-file" style="background: #1e293b; color: #f8fafc; border: 1px solid #475569; border-radius: 6px; padding: 7px 16px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          💾 Save to Indicators List
        </button>
        <button type="button" class="btn-apply-chart" style="background: #0284c7; color: #ffffff; border: 1px solid #38bdf8; border-radius: 6px; padding: 7px 18px; font-size: 13px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px;">
          ⚡ Add to Chart Now
        </button>
      </div>
    `;

    card.append(head, toolbar, addonBanner, editorContainer, consoleBox, footer);
    modal.appendChild(card);
    document.body.appendChild(modal);
    this.modal = modal;

    updateLineNumbers();

    // Event handlers
    const nameInput = toolbar.querySelector('.input-name') as HTMLInputElement;
    const indSelect = toolbar.querySelector('.sel-indicator') as HTMLSelectElement;
    const consoleMsg = consoleBox.querySelector('.console-msg') as HTMLElement;

    const setStatus = (msg: string, isError = false) => {
      consoleMsg.textContent = msg;
      consoleMsg.style.color = isError ? '#ef4444' : '#38bdf8';
    };

    // Load available indicators list from server
    try {
      const res = await fetch('/api/indicators');
      if (res.ok) {
        const list: IndicatorInfo[] = await res.json();
        for (const item of list) {
          const opt = document.createElement('option');
          opt.value = item.url;
          opt.textContent = item.name;
          indSelect.appendChild(opt);
        }
      }
    } catch {
      /* ignore */
    }

    indSelect.addEventListener('change', async () => {
      const val = indSelect.value;
      if (val === 'new') {
        textarea.value = DEFAULT_PINE_TEMPLATE;
        nameInput.value = 'My Custom Indicator';
        this.currentFilename = 'new_indicator.pine';
        updateLineNumbers();
        setStatus('Loaded blank indicator template.');
        return;
      }

      const selectedName = indSelect.selectedOptions[0]?.textContent || '';
      nameInput.value = selectedName;
      this.currentFilename = val.split('/').pop() || 'indicator.pine';

      if (this.codeCache.has(val)) {
        textarea.value = this.codeCache.get(val)!;
        updateLineNumbers();
        setStatus(`Loaded cached ${selectedName}.`);
        return;
      }

      setStatus(`Loading ${selectedName}...`);
      try {
        const res = await fetch(val);
        if (res.ok) {
          const text = await res.text();
          this.codeCache.set(val, text);
          textarea.value = text;
          updateLineNumbers();
          setStatus(`Loaded ${selectedName} (${text.split('\n').length} lines).`);
        } else {
          setStatus(`Failed to fetch ${val}: HTTP ${res.status}`, true);
        }
      } catch (err: any) {
        setStatus(`Error loading file: ${err?.message || err}`, true);
      }
    });

    toolbar.querySelector('.btn-template')?.addEventListener('click', () => {
      if (confirm('Reset editor to default indicator template?')) {
        textarea.value = DEFAULT_PINE_TEMPLATE;
        updateLineNumbers();
        setStatus('Template reset.');
      }
    });

    const close = () => {
      modal.remove();
      this.modal = null;
    };

    head.querySelector('.btn-close')?.addEventListener('click', close);
    footer.querySelector('.btn-cancel')?.addEventListener('click', close);

    // Apply to chart
    const applyToChart = async () => {
      const code = textarea.value.trim();
      if (!code) {
        setStatus('Code is empty. Please enter Pine Script code.', true);
        return;
      }

      if (!isPineInstalled) {
        setStatus('Optional Pine add-on is not installed. Run `npm run add:pine` in terminal to enable execution.', true);
        this.toast('⚠️ Pine add-on not installed. Run `npm run add:pine` in terminal.');
        return;
      }

      const ws = this.getWorkspace();
      const activeCell = ws?.active;
      if (!activeCell || !activeCell.chart) {
        setStatus('No active chart available.', true);
        this.toast('❌ No active chart found to add indicator.');
        return;
      }

      const indName = nameInput.value.trim() || 'Custom Indicator';
      setStatus('Compiling and running Pine Script...');
      try {
        let handle: any = null;
        if (typeof (activeCell as any).addManifestInstance === 'function') {
          handle = (activeCell as any).addManifestInstance({ name: indName, script: code, language: 'pine' });
        } else {
          handle = activeCell.chart.addIndicator(code, { language: 'pine', title: indName });
        }
        this.toast(`✅ Indicator '${indName}' added to chart!`);
        setStatus(`Successfully added to active chart!`);

        // Trigger dirty mark and persist immediately
        if (typeof (ws as any).markStateDirty === 'function') {
          (ws as any).markStateDirty();
        }
        if (typeof (ws as any).persistNow === 'function') {
          (ws as any).persistNow();
        }
      } catch (err: any) {
        console.error('[vela] Pine script compile error:', err);
        setStatus(`Compilation Error: ${err?.message || err}`, true);
        this.toast(`❌ Compile error: ${err?.message || 'Check console'}`);
      }
    };

    // Save to server
    const saveToFile = async () => {
      const code = textarea.value.trim();
      const name = nameInput.value.trim() || 'Custom Indicator';
      if (!code) {
        setStatus('Code is empty. Please enter Pine Script code.', true);
        return;
      }

      const filename = (this.currentFilename && this.currentFilename !== 'new_indicator.pine')
        ? this.currentFilename
        : name.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_') + '.pine';

      setStatus(`Saving ${name} to server...`);
      try {
        const res = await fetch('/api/indicators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, code, filename }),
        });

        if (res.ok) {
          const data = await res.json();
          this.currentFilename = data.filename || filename;
          this.codeCache.set(data.url, code);
          this.toast(`💾 '${name}' saved to indicators catalog!`);
          setStatus(`Saved to ${data.url}! It is now permanently in the Indicators dialog.`);

          // If option doesn't exist in dropdown, add it
          let found = false;
          for (let i = 0; i < indSelect.options.length; i++) {
            if (indSelect.options[i].value === data.url) {
              found = true;
              indSelect.selectedIndex = i;
              break;
            }
          }
          if (!found) {
            const opt = document.createElement('option');
            opt.value = data.url;
            opt.textContent = name;
            indSelect.appendChild(opt);
            indSelect.value = data.url;
          }

          // Refresh workspace manifest from /api/indicators so dialog includes it immediately
          try {
            const ws = this.getWorkspace();
            const resList = await fetch('/api/indicators');
            if (resList.ok) {
              const list = await resList.json();
              const fullList: any[] = [];
              for (const item of list) {
                try {
                  const sRes = await fetch(item.url);
                  const script = await sRes.text();
                  fullList.push({ name: item.name, script, language: item.language || 'pine', enabled: item.enabled });
                } catch {}
              }
              if (typeof (ws as any)?.setManifest === 'function') {
                (ws as any).setManifest(fullList);
              } else if ((ws as any)?.cellsById) {
                for (const c of (ws as any).cellsById.values()) {
                  c.setManifest?.(fullList, false);
                }
              }
              if ((ws as any)?.indicatorPicker?.sync) {
                (ws as any).indicatorPicker.sync();
              }
            }
          } catch (mErr) {
            console.warn('[vela] manifest refresh error:', mErr);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setStatus(`Save failed: ${err.error || res.statusText}`, true);
        }
      } catch (err: any) {
        setStatus(`Network error saving file: ${err?.message || err}`, true);
      }
    };

    footer.querySelector('.btn-apply-chart')?.addEventListener('click', applyToChart);
    footer.querySelector('.btn-save-file')?.addEventListener('click', saveToFile);

    // Keyboard shortcut Ctrl+S inside modal
    modal.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveToFile().then(() => applyToChart());
      }
      if (e.key === 'Escape') {
        close();
      }
    });
  }
}
