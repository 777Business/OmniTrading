import type { VelaWorkspace } from '@luxalgo/vela/workspace';

const STORAGE_FAV_OPEN = 'omni-fav-bar-open';
const STORAGE_FAV_POS = 'omni-fav-bar-pos';

// Common drawing tool icons (16x16 SVG)
const TOOL_ICONS: Record<string, string> = {
  'trend-line': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="2.5" y1="13.5" x2="13.5" y2="2.5"/><circle cx="2.5" cy="13.5" r="1.5" fill="currentColor"/><circle cx="13.5" cy="2.5" r="1.5" fill="currentColor"/></svg>',
  'ray': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="2.5" y1="13.5" x2="14.5" y2="1.5"/><circle cx="2.5" cy="13.5" r="1.5" fill="currentColor"/><polyline points="10.5,1.5 14.5,1.5 14.5,5.5"/></svg>',
  'horizontal-line': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="1" y1="8" x2="15" y2="8"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
  'horizontal-ray': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="4" y1="8" x2="15" y2="8"/><circle cx="4" cy="8" r="1.5" fill="currentColor"/><polyline points="11,5 15,8 11,11"/></svg>',
  'vertical-line': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="8" y1="1" x2="8" y2="15"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
  'cross-line': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="8" y1="1" x2="8" y2="15"/><line x1="1" y1="8" x2="15" y2="8"/><circle cx="8" cy="8" r="1.5" fill="currentColor"/></svg>',
  'fib-retracement': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="1.5" y1="3" x2="14.5" y2="3"/><line x1="1.5" y1="7" x2="14.5" y2="7"/><line x1="1.5" y1="10" x2="14.5" y2="10"/><line x1="1.5" y1="13" x2="14.5" y2="13"/><line x1="2" y1="13" x2="14" y2="3" stroke-dasharray="2 2"/></svg>',
  'rectangle': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2.5" y="4" width="11" height="8" rx="1"/></svg>',
  'brush': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M12 2.5a2 2 0 0 1 2 2c0 1.5-2.5 3.5-4 4.5L7 6l2.5-3.5L12 2.5z"/><path d="M7 6 3.5 9.5a2.5 2.5 0 0 0-.5 2.5L2 14l2-.5a2.5 2.5 0 0 0 2.5-.5L10 9.5"/></svg>',
  'text': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><polyline points="2.5,4 8,4 13.5,4"/><line x1="8" y1="4" x2="8" y2="13.5"/><line x1="5.5" y1="13.5" x2="10.5" y2="13.5"/></svg>',
  'arrow': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="2.5" y1="13.5" x2="13.5" y2="2.5"/><polyline points="7.5,2.5 13.5,2.5 13.5,8.5"/></svg>',
  'parallel-channel': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2"><line x1="2" y1="10" x2="14" y2="4"/><line x1="2" y1="14" x2="14" y2="8"/><line x1="2" y1="12" x2="14" y2="6" stroke-dasharray="2 2"/></svg>',
  'extended-line': '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="0.5" y1="14.5" x2="15.5" y2="1.5"/><circle cx="5" cy="10" r="1.5" fill="currentColor"/><circle cx="11" cy="5" r="1.5" fill="currentColor"/></svg>',
};

const DEFAULT_FAVORITES = ['trend-line', 'horizontal-line', 'ray', 'rectangle', 'fib-retracement'];

export class FavoritesBarController {
  private static instance: FavoritesBarController | null = null;
  private workspace: VelaWorkspace;
  private barEl: HTMLElement | null = null;
  private isOpen: boolean = false;
  private armedTool: string | null = null;

  constructor(workspace: VelaWorkspace) {
    if (FavoritesBarController.instance) {
      FavoritesBarController.instance.workspace = workspace;
      return FavoritesBarController.instance;
    }
    this.workspace = workspace;
    this.isOpen = localStorage.getItem(STORAGE_FAV_OPEN) === 'true';
    FavoritesBarController.instance = this;
  }

  public updateWorkspace(ws: VelaWorkspace): void {
    this.workspace = ws;
  }

  init(): void {
    // Ensure only one global toggle listener exists
    if ((window as any).__velaFavToggleHandler) {
      window.removeEventListener('vela:toggle-favorites-bar', (window as any).__velaFavToggleHandler);
    }
    const handler = () => this.toggle();
    (window as any).__velaFavToggleHandler = handler;
    window.addEventListener('vela:toggle-favorites-bar', handler);

    // Listen for drawings events to update armed status or favorite changes
    const ws = this.workspace as any;
    try {
      ws.on?.('drawings:favorites', () => this.render());
      ws.on?.('drawing:favorites', () => this.render());
    } catch {
      /* ignore */
    }

    if (this.isOpen) {
      this.show();
    }
    this.updateSidebarStar();
  }

  toggle(): void {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  show(): void {
    this.isOpen = true;
    localStorage.setItem(STORAGE_FAV_OPEN, 'true');
    this.ensureBar();
    this.render();
    if (this.barEl) this.barEl.style.display = 'flex';
    this.updateSidebarStar();
  }

  hide(): void {
    this.isOpen = false;
    localStorage.setItem(STORAGE_FAV_OPEN, 'false');
    if (this.barEl) this.barEl.style.display = 'none';
    this.updateSidebarStar();
  }

  private updateSidebarStar(): void {
    const starBtns = document.querySelectorAll('.vela-dtb-fav-bar-btn, .vela-dtb-fav-toggle');
    starBtns.forEach((btn) => {
      if (this.isOpen) {
        btn.classList.add('active');
        (btn as HTMLElement).style.color = '#eab308'; // Gold star
      } else {
        btn.classList.remove('active');
        (btn as HTMLElement).style.color = '';
      }
    });
  }

  private getFavorites(): string[] {
    const ws = this.workspace as any;
    try {
      const activeChart = ws.active?.chart;
      if (activeChart && typeof activeChart.drawings?.favorites === 'function') {
        const favs = activeChart.drawings.favorites();
        if (Array.isArray(favs) && favs.length > 0) return favs;
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_FAVORITES;
  }

  private ensureBar(): void {
    // Clean up any stale or orphaned duplicate bars in DOM
    const existingBars = document.querySelectorAll('.vela-floating-fav-bar');
    if (existingBars.length > 1) {
      existingBars.forEach((b, idx) => {
        if (idx > 0) b.remove();
      });
    }

    const existing = document.getElementById('vela-floating-fav-bar');
    if (existing) {
      this.barEl = existing;
      return;
    }

    const el = document.createElement('div');
    el.className = 'vela-floating-fav-bar';
    el.id = 'vela-floating-fav-bar';

    // Position restoration
    const savedPos = localStorage.getItem(STORAGE_FAV_POS);
    let left = 80;
    let top = window.innerHeight - 80;
    if (savedPos) {
      try {
        const parsed = JSON.parse(savedPos);
        if (Number.isFinite(parsed.x) && Number.isFinite(parsed.y)) {
          left = Math.max(10, Math.min(window.innerWidth - 200, parsed.x));
          top = Math.max(10, Math.min(window.innerHeight - 60, parsed.y));
        }
      } catch {
        /* ignore */
      }
    }

    el.style.cssText = `
      position: fixed;
      left: ${left}px;
      top: ${top}px;
      z-index: 1000;
      display: flex;
      align-items: center;
      background: var(--vela-surface, #1e293b);
      border: 1px solid var(--vela-border, #334155);
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
      padding: 3px 6px;
      gap: 3px;
      user-select: none;
      font-family: inherit;
    `;

    // Make Draggable
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let origX = 0;
    let origY = 0;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('button')) return; // Allow clicking buttons
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = el.getBoundingClientRect();
      origX = rect.left;
      origY = rect.top;
      el.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      const newX = Math.max(10, Math.min(window.innerWidth - el.offsetWidth - 10, origX + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - el.offsetHeight - 10, origY + dy));
      el.style.left = `${newX}px`;
      el.style.top = `${newY}px`;
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDragging) return;
      isDragging = false;
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rect = el.getBoundingClientRect();
      localStorage.setItem(STORAGE_FAV_POS, JSON.stringify({ x: rect.left, y: rect.top }));
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerUp);

    document.body.appendChild(el);
    this.barEl = el;
  }

  private render(): void {
    if (!this.barEl) return;
    this.barEl.innerHTML = '';

    // Drag Handle
    const handle = document.createElement('div');
    handle.className = 'vela-fav-handle';
    handle.title = 'Drag toolbar';
    handle.style.cssText = 'cursor: grab; display: flex; align-items: center; padding: 4px 3px; color: var(--vela-fg-muted, #94a3b8);';
    handle.innerHTML = '<svg width="8" height="16" viewBox="0 0 8 16" fill="currentColor"><circle cx="2" cy="3" r="1.2"/><circle cx="6" cy="3" r="1.2"/><circle cx="2" cy="8" r="1.2"/><circle cx="6" cy="8" r="1.2"/><circle cx="2" cy="13" r="1.2"/><circle cx="6" cy="13" r="1.2"/></svg>';
    this.barEl.appendChild(handle);

    // Favorite Tool Buttons
    const favs = this.getFavorites();
    favs.forEach((toolType) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `vela-fav-tool-btn${this.armedTool === toolType ? ' active' : ''}`;
      btn.title = formatToolTitle(toolType);
      btn.style.cssText = `
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: ${this.armedTool === toolType ? 'var(--vela-hover, rgba(255,255,255,0.15))' : 'transparent'};
        color: ${this.armedTool === toolType ? 'var(--vela-accent, #22d3a5)' : 'var(--vela-fg-muted, #94a3b8)'};
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
        transition: all 0.15s ease;
      `;
      btn.innerHTML = TOOL_ICONS[toolType] || '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="8" r="4"/></svg>';

      btn.addEventListener('mouseenter', () => {
        if (this.armedTool !== toolType) btn.style.background = 'var(--vela-hover, rgba(255,255,255,0.08))';
      });
      btn.addEventListener('mouseleave', () => {
        if (this.armedTool !== toolType) btn.style.background = 'transparent';
      });

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.armTool(toolType);
      });

      this.barEl?.appendChild(btn);
    });

    // Divider
    const div = document.createElement('div');
    div.style.cssText = 'width: 1px; height: 18px; background: var(--vela-border, #334155); margin: 0 3px;';
    this.barEl.appendChild(div);

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vela-fav-close-btn';
    closeBtn.title = 'Hide favorite drawings bar';
    closeBtn.style.cssText = `
      width: 24px;
      height: 24px;
      border-radius: 4px;
      border: none;
      background: transparent;
      color: var(--vela-fg-muted, #94a3b8);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 13px;
    `;
    closeBtn.innerHTML = '✕';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
    this.barEl.appendChild(closeBtn);
  }

  private armTool(type: string): void {
    const ws = this.workspace as any;
    const isAlreadyArmed = this.armedTool === type;
    this.armedTool = isAlreadyArmed ? null : type;

    try {
      const activeChart = ws.active?.chart;
      if (activeChart?.drawings?.arm) {
        activeChart.drawings.arm(this.armedTool);
      }
    } catch (err) {
      console.warn('[vela] arm drawing tool error', err);
    }
    this.render();
  }
}

function formatToolTitle(type: string): string {
  return type
    .split('-')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
