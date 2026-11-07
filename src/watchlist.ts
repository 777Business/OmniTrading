import { registerSidePanel, registerIcon } from '@luxalgo/vela';
import type { VelaWorkspace } from '@luxalgo/vela/workspace';

const WATCHLIST_STORAGE_KEY = 'omni-watchlist-v1';
const WATCHLIST_OPTIONS_KEY = 'omni-watchlist-options';

export interface WatchlistOptions {
  showChange: boolean;
  showPrice: boolean;
  abbreviate: boolean;
}

export interface WatchlistItem {
  id: string;
  type: 'symbol' | 'section';
  value: string; // e.g. "EURUSD" or "Forex Majors"
}

const DEFAULT_OPTIONS: WatchlistOptions = {
  showChange: true,
  showPrice: true,
  abbreviate: false,
};

const DEFAULT_ITEMS: WatchlistItem[] = [
  { id: 'sec-crypto', type: 'section', value: 'Crypto & Digital Assets' },
  { id: 'btcusdt', type: 'symbol', value: 'BTCUSDT' },
  { id: 'ethusdt', type: 'symbol', value: 'ETHUSDT' },
  { id: 'solusdt', type: 'symbol', value: 'SOLUSDT' },
  { id: 'sec-forex', type: 'section', value: 'Major Currencies' },
  { id: 'eurusd', type: 'symbol', value: 'EURUSD' },
  { id: 'gbpusd', type: 'symbol', value: 'GBPUSD' },
  { id: 'usdjpy', type: 'symbol', value: 'USDJPY' },
  { id: 'sec-commodities', type: 'section', value: 'Commodities & Metals' },
  { id: 'xauusd', type: 'symbol', value: 'XAUUSD' },
  { id: 'usoil', type: 'symbol', value: 'USOIL' },
];

export function getWatchlistItems(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_STORAGE_KEY);
    if (!raw) return DEFAULT_ITEMS;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'string') {
      return parsed.map((sym: string) => ({
        id: `sym-${sym}`,
        type: 'symbol',
        value: sym.toUpperCase().replace(/[\/\s_-]/g, ''),
      }));
    }
    return parsed;
  } catch {
    return DEFAULT_ITEMS;
  }
}

export function saveWatchlistItems(items: WatchlistItem[]): void {
  try {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

export function getWatchlistOptions(): WatchlistOptions {
  try {
    const raw = localStorage.getItem(WATCHLIST_OPTIONS_KEY);
    if (raw) return { ...DEFAULT_OPTIONS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_OPTIONS;
}

export function saveWatchlistOptions(options: WatchlistOptions): void {
  try {
    localStorage.setItem(WATCHLIST_OPTIONS_KEY, JSON.stringify(options));
  } catch {
    /* ignore */
  }
}

function formatSymbol(sym: string, abbreviate: boolean): string {
  if (abbreviate && sym.length === 6) {
    return `${sym.slice(0, 3)}/${sym.slice(3)}`;
  }
  return sym;
}

export class WatchlistManager {
  private dockEl: HTMLElement | null = null;
  private headerHandle: any = null;
  public isOpen = false;
  private options: WatchlistOptions = getWatchlistOptions();
  private priceCache: Map<string, { price: number; change?: number }> = new Map();
  private contextMenuEl: HTMLElement | null = null;

  constructor(private readonly getWorkspace: () => VelaWorkspace | null) {}

  init(): void {
    // Register custom 16x16 line SVG icon matching Vela's native icon geometry
    registerIcon(
      'watchlist',
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><line x1="5.5" y1="4" x2="14" y2="4"/><line x1="5.5" y1="8" x2="14" y2="8"/><line x1="5.5" y1="12" x2="14" y2="12"/><circle cx="2" cy="4" r="1" fill="currentColor"/><circle cx="2" cy="8" r="1" fill="currentColor"/><circle cx="2" cy="12" r="1" fill="currentColor"/></svg>'
    );

    // Register Watchlist as official native Vela docked side panel
    registerSidePanel({
      id: 'vela.watchlist',
      title: 'Watchlist',
      icon: 'watchlist',
      order: 15,
      width: 290,
      minWidth: 220,
      maxWidth: 480,
      resizable: true,
      placement: 'column',
      header: 'none',
      mount: (_ctx, body, header) => {
        this.mountTo(body, header);
        return {
          onChart: () => this.render(),
          onOpen: () => {
            this.isOpen = true;
            this.render();
          },
          destroy: () => {
            this.isOpen = false;
            this.unmount();
          },
        };
      },
    });

    document.addEventListener('click', () => {
      this.closeContextMenu();
    });
  }

  mountTo(body: HTMLElement, header: any): void {
    this.dockEl = body;
    this.headerHandle = header;
    this.isOpen = true;
    body.classList.add('vw-dock-body');
    body.style.cssText = 'height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--vela-surface, #1e293b); font-family: inherit; color: var(--vela-fg-bright, #f8fafc);';
    this.render();
  }

  unmount(): void {
    this.dockEl = null;
    this.headerHandle = null;
    this.isOpen = false;
  }

  toggle(): void {
    const ws = this.getWorkspace();
    if (ws) {
      const dock = (ws as any).dock;
      if (dock && typeof dock.toggle === 'function') {
        dock.toggle('vela.watchlist');
        return;
      }
      const ctx = (ws as any).context?.();
      if (ctx && typeof ctx.togglePanel === 'function') {
        ctx.togglePanel('vela.watchlist');
        return;
      }
    }

    if (this.isOpen && this.headerHandle) {
      this.headerHandle.close();
      this.isOpen = false;
      return;
    }

    const btn = document.querySelector(
      '[data-panel-id="vela.watchlist"], [data-sidebar-id="vela.watchlist"], [data-id="vela.watchlist"], button[aria-label*="Watchlist"]'
    ) as HTMLButtonElement | null;
    btn?.click();
  }

  close(): void {
    if (this.headerHandle) {
      this.headerHandle.close();
    }
    this.isOpen = false;
  }

  updatePrice(symbol: string, price: number, changePercent?: number): void {
    const clean = symbol.toUpperCase().replace(/[\/\s_-]/g, '');
    this.priceCache.set(clean, { price, change: changePercent });

    if (!this.dockEl || !this.isOpen) return;
    const row = this.dockEl.querySelector(`.vw-row[data-symbol="${clean}"]`);
    if (row) {
      const priceEl = row.querySelector('.vcol-price-val');
      if (priceEl) priceEl.textContent = price.toFixed(price > 100 ? 2 : 5);
      const chgEl = row.querySelector('.vcol-chg-val');
      if (chgEl && changePercent !== undefined) {
        chgEl.textContent = `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%`;
        chgEl.className = `vcol-chg-val ${changePercent >= 0 ? 'bull' : 'bear'}`;
      }
    }
  }

  private closeContextMenu(): void {
    this.contextMenuEl?.remove();
    this.contextMenuEl = null;
  }

  private openContextMenu(e: MouseEvent, item: WatchlistItem, index: number): void {
    e.preventDefault();
    e.stopPropagation();
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'vw-context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${e.clientY}px;
      left: ${Math.min(window.innerWidth - 180, e.clientX)}px;
      z-index: 10000;
      background: var(--vela-surface, #1e293b);
      border: 1px solid var(--vela-border, #334155);
      border-radius: 6px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      padding: 4px 0;
      font-size: 13px;
      min-width: 160px;
    `;

    menu.innerHTML = `
      <div class="vw-ctx-item" data-act="rename" style="padding:7px 14px;cursor:pointer;">✏ Rename</div>
      ${item.type === 'symbol' ? '<div class="vw-ctx-item" data-act="add-sec" style="padding:7px 14px;cursor:pointer;">+ Add Section Above</div>' : ''}
      <div class="vw-ctx-divider" style="height:1px;background:var(--vela-border,#334155);margin:4px 0;"></div>
      <div class="vw-ctx-item" data-act="move-up" style="padding:7px 14px;cursor:pointer;">↑ Move Up</div>
      <div class="vw-ctx-item" data-act="move-down" style="padding:7px 14px;cursor:pointer;">↓ Move Down</div>
      <div class="vw-ctx-divider" style="height:1px;background:var(--vela-border,#334155);margin:4px 0;"></div>
      <div class="vw-ctx-item danger" data-act="remove" style="padding:7px 14px;cursor:pointer;color:#ef4444;">✕ Remove</div>
    `;

    menu.querySelectorAll('.vw-ctx-item').forEach((it) => {
      const el = it as HTMLElement;
      el.addEventListener('mouseenter', () => (el.style.background = 'var(--vela-hover, rgba(255,255,255,0.08))'));
      el.addEventListener('mouseleave', () => (el.style.background = 'transparent'));
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const act = el.dataset.act;
        this.closeContextMenu();
        this.handleContextAction(act, item, index);
      });
    });

    document.body.appendChild(menu);
    this.contextMenuEl = menu;
  }

  private handleContextAction(act?: string, item?: WatchlistItem, index = 0): void {
    if (!item) return;
    const items = getWatchlistItems();

    if (act === 'rename') {
      const promptLabel = item.type === 'section' ? 'Section name:' : 'Symbol name:';
      const next = prompt(promptLabel, item.value);
      if (next && next.trim()) {
        item.value = item.type === 'symbol' ? next.trim().toUpperCase().replace(/[\/\s_-]/g, '') : next.trim();
        saveWatchlistItems(items);
        this.render();
      }
    } else if (act === 'add-sec') {
      const name = prompt('Section name:');
      if (name && name.trim()) {
        items.splice(index, 0, {
          id: `sec-${Date.now()}`,
          type: 'section',
          value: name.trim(),
        });
        saveWatchlistItems(items);
        this.render();
      }
    } else if (act === 'move-up' && index > 0) {
      const temp = items[index];
      items[index] = items[index - 1];
      items[index - 1] = temp;
      saveWatchlistItems(items);
      this.render();
    } else if (act === 'move-down' && index < items.length - 1) {
      const temp = items[index];
      items[index] = items[index + 1];
      items[index + 1] = temp;
      saveWatchlistItems(items);
      this.render();
    } else if (act === 'remove') {
      const remaining = items.filter((it) => it.id !== item.id);
      saveWatchlistItems(remaining);
      this.render();
    }
  }

  render(): void {
    if (!this.dockEl) return;

    this.dockEl.innerHTML = `
      <div class="vw-header" style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid var(--vela-border,#334155);flex:none;">
        <div class="vw-title" style="font-weight:600;font-size:14px;">
          <span>Watchlist</span>
        </div>
        <div class="vw-actions" style="display:flex;align-items:center;gap:6px;">
          <button type="button" class="vw-text-btn vw-add-sec-btn" title="Add Section divider" style="padding:3px 8px;font-size:11px;border-radius:4px;border:1px solid var(--vela-border,#334155);background:transparent;color:var(--vela-fg-muted,#94a3b8);cursor:pointer;">+ Section</button>
          <div class="vw-opt-dropdown" style="position:relative;">
            <button type="button" class="vw-icon-btn vw-gear-btn" title="Display Options" style="padding:4px 6px;border-radius:4px;border:none;background:transparent;color:var(--vela-fg-muted,#94a3b8);cursor:pointer;">⚙</button>
            <div class="vw-opt-menu" style="display:none;position:absolute;top:calc(100% + 4px);right:0;background:var(--vela-surface,#1e293b);border:1px solid var(--vela-border,#334155);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:8px;min-width:180px;z-index:9999;">
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:6px;cursor:pointer;">
                <input type="checkbox" data-opt="showChange" ${this.options.showChange ? 'checked' : ''} />
                <span>Show Change %</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;margin-bottom:6px;cursor:pointer;">
                <input type="checkbox" data-opt="showPrice" ${this.options.showPrice ? 'checked' : ''} />
                <span>Show Last Price</span>
              </label>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;">
                <input type="checkbox" data-opt="abbreviate" ${this.options.abbreviate ? 'checked' : ''} />
                <span>Abbreviate (EUR/USD)</span>
              </label>
            </div>
          </div>
          <button type="button" class="vw-icon-btn vw-close-btn" title="Close Watchlist" style="padding:4px 6px;border-radius:4px;border:none;background:transparent;color:var(--vela-fg-muted,#94a3b8);cursor:pointer;font-size:13px;">✕</button>
        </div>
      </div>

      <div class="vw-add-row" style="display:flex;gap:6px;padding:8px 14px;border-bottom:1px solid var(--vela-border,#334155);flex:none;">
        <input type="text" class="vw-input" placeholder="Add symbol (e.g. GBPUSD)" spellcheck="false" style="flex:1;background:var(--vela-bg,#0f172a);border:1px solid var(--vela-border,#334155);border-radius:6px;padding:5px 8px;font-size:12px;color:inherit;outline:none;" />
        <button type="button" class="vw-add-btn" style="padding:5px 10px;background:var(--vela-accent,#22d3a5);color:#0f172a;font-weight:600;border:none;border-radius:6px;font-size:12px;cursor:pointer;">+ Add</button>
      </div>

      <div class="vw-col-headers" style="display:flex;align-items:center;padding:6px 14px;font-size:11px;color:var(--vela-fg-muted,#94a3b8);border-bottom:1px solid var(--vela-border,#334155);flex:none;text-transform:uppercase;">
        <span style="flex:1;">Symbol</span>
        ${this.options.showPrice ? '<span style="width:65px;text-align:right;">Last</span>' : ''}
        ${this.options.showChange ? '<span style="width:55px;text-align:right;">Chg %</span>' : ''}
        <span style="width:24px;"></span>
      </div>

      <div class="vw-list" id="vw-items-container" style="flex:1;overflow-y:auto;overflow-x:hidden;"></div>
    `;

    const closeBtn = this.dockEl.querySelector('.vw-close-btn') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.close());

    // Options dropdown
    const gearBtn = this.dockEl.querySelector('.vw-gear-btn') as HTMLButtonElement;
    const optMenu = this.dockEl.querySelector('.vw-opt-menu') as HTMLElement;
    gearBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      optMenu.style.display = optMenu.style.display === 'block' ? 'none' : 'block';
    });

    optMenu.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
      chk.addEventListener('change', (e) => {
        const input = e.target as HTMLInputElement;
        const key = input.dataset.opt as keyof WatchlistOptions;
        if (key) {
          this.options[key] = input.checked;
          saveWatchlistOptions(this.options);
          this.render();
        }
      });
    });

    // Add Section button
    const addSecBtn = this.dockEl.querySelector('.vw-add-sec-btn') as HTMLButtonElement;
    addSecBtn.addEventListener('click', () => {
      const name = prompt('Enter section divider title (e.g. Indices, Crypto, Metals):');
      if (name && name.trim()) {
        const items = getWatchlistItems();
        items.push({
          id: `sec-${Date.now()}`,
          type: 'section',
          value: name.trim(),
        });
        saveWatchlistItems(items);
        this.render();
      }
    });

    // Add Symbol
    const addInput = this.dockEl.querySelector('.vw-input') as HTMLInputElement;
    const addBtn = this.dockEl.querySelector('.vw-add-btn') as HTMLButtonElement;
    const doAdd = () => {
      const sym = addInput.value.trim().toUpperCase().replace(/[\/\s_-]/g, '');
      if (!sym) return;
      const items = getWatchlistItems();
      if (!items.some((it) => it.type === 'symbol' && it.value === sym)) {
        items.push({
          id: `sym-${sym}`,
          type: 'symbol',
          value: sym,
        });
        saveWatchlistItems(items);
        this.render();
      }
      addInput.value = '';
    };

    addBtn.addEventListener('click', doAdd);
    addInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doAdd();
    });

    this.renderList();
  }

  private renderList(): void {
    const container = this.dockEl?.querySelector('#vw-items-container');
    if (!container) return;

    container.innerHTML = '';
    const items = getWatchlistItems();
    const ws = this.getWorkspace();
    const activeSymbol = ws?.active?.symbol?.toUpperCase().replace(/[\/\s_-]/g, '') || '';

    items.forEach((item, index) => {
      if (item.type === 'section') {
        const sec = document.createElement('div');
        sec.className = 'vw-section-divider';
        sec.style.cssText = 'padding:8px 14px 4px;font-size:11px;font-weight:700;color:var(--vela-fg-muted,#94a3b8);text-transform:uppercase;letter-spacing:0.5px;display:flex;align-items:center;justify-content:space-between;cursor:default;';
        sec.innerHTML = `
          <span>${item.value}</span>
          <span class="vw-sec-more" style="cursor:pointer;font-size:12px;opacity:0.6;">⋮</span>
        `;
        sec.querySelector('.vw-sec-more')?.addEventListener('click', (e) => {
          this.openContextMenu(e as MouseEvent, item, index);
        });
        sec.addEventListener('contextmenu', (e) => {
          this.openContextMenu(e, item, index);
        });
        container.appendChild(sec);
      } else {
        const sym = item.value;
        const cached = this.priceCache.get(sym);
        const isActive = activeSymbol === sym;

        const row = document.createElement('div');
        row.className = `vw-row${isActive ? ' active' : ''}`;
        row.dataset.symbol = sym;
        row.style.cssText = `
          display: flex;
          align-items: center;
          padding: 7px 14px;
          cursor: pointer;
          border-bottom: 1px solid var(--vela-border, #334155);
          font-size: 13px;
          background: ${isActive ? 'var(--vela-hover, rgba(255,255,255,0.08))' : 'transparent'};
          transition: background 0.15s ease;
        `;

        row.addEventListener('mouseenter', () => {
          if (!row.classList.contains('active')) row.style.background = 'var(--vela-hover, rgba(255,255,255,0.05))';
        });
        row.addEventListener('mouseleave', () => {
          if (!row.classList.contains('active')) row.style.background = 'transparent';
        });

        const displaySym = formatSymbol(sym, this.options.abbreviate);
        const priceStr = cached ? cached.price.toFixed(cached.price > 100 ? 2 : 5) : '—';
        const chgVal = cached?.change;
        const chgStr = chgVal !== undefined ? `${chgVal >= 0 ? '+' : ''}${chgVal.toFixed(2)}%` : '—';
        const chgCls = chgVal !== undefined ? (chgVal >= 0 ? 'color:#22d3a5;' : 'color:#ef4444;') : 'color:var(--vela-fg-muted,#94a3b8);';

        row.innerHTML = `
          <span style="flex:1;font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${displaySym}</span>
          ${this.options.showPrice ? `<span class="vcol-price-val" style="width:65px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;">${priceStr}</span>` : ''}
          ${this.options.showChange ? `<span class="vcol-chg-val" style="width:55px;text-align:right;font-variant-numeric:tabular-nums;font-size:12px;${chgCls}">${chgStr}</span>` : ''}
          <span class="vcol-del-btn" style="width:24px;text-align:right;color:var(--vela-fg-muted,#94a3b8);opacity:0.6;font-size:12px;" title="Options / Remove">⋮</span>
        `;

        row.addEventListener('click', () => {
          const w = this.getWorkspace();
          if (!w) return;
          try {
            w.active.setSymbol(sym);
          } catch {
            /* ignore */
          }
          this.renderList();
        });

        row.querySelector('.vcol-del-btn')?.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openContextMenu(e as MouseEvent, item, index);
        });

        row.addEventListener('contextmenu', (e) => {
          this.openContextMenu(e, item, index);
        });

        container.appendChild(row);
      }
    });
  }
}
