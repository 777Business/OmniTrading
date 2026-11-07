import type { VelaWorkspace } from '@luxalgo/vela/workspace';

interface ReplaySpeed {
  label: string;
  ms: number;
}

const SPEED_OPTIONS: ReplaySpeed[] = [
  { label: '0.1s (10x)', ms: 100 },
  { label: '0.2s (5x)', ms: 200 },
  { label: '0.5s (2x)', ms: 500 },
  { label: '1s (1x)', ms: 1000 },
  { label: '2s (0.5x)', ms: 2000 },
  { label: '3s (0.33x)', ms: 3000 },
];

export class ReplayManager {
  private active = false;
  private jumpMode = false;
  private speedMs = 1000;
  private toolbarEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private playBtn: HTMLButtonElement | null = null;
  private jumpBtn: HTMLButtonElement | null = null;
  private speedBtn: HTMLButtonElement | null = null;
  private speedMenu: HTMLElement | null = null;
  private jumpCleanups: Array<() => void> = [];
  private lastHoveredTime: number | null = null;
  private lastHoveredCell: any = null;
  private jumpExecuted = false;
  private unsubs: Array<() => void> = [];

  constructor(
    private readonly getWorkspace: () => VelaWorkspace | null,
    private readonly showToast: (msg: string) => void,
  ) {
    this.bindKeyboardShortcuts();
  }

  public toggle(): void {
    if (this.active) {
      this.close();
    } else {
      this.open();
    }
  }

  public open(): void {
    const ws = this.getWorkspace();
    if (!ws) {
      this.showToast('Workspace is loading…');
      return;
    }

    this.active = true;
    this.createToolbar();
    this.bindWorkspaceEvents(ws);

    // If no replay session is running yet, automatically arm Jump mode
    if (!ws.replay.state.active) {
      this.armJumpMode();
    } else {
      this.updateUI();
    }

    this.highlightTopbarButton(true);
  }

  public close(): void {
    this.active = false;
    this.cancelJumpMode();

    const ws = this.getWorkspace();
    if (ws?.replay.state.active) {
      ws.replay.stop();
      this.showToast('Exited Replay mode — Live real-time feed restored');
    }

    this.unsubs.forEach((u) => u());
    this.unsubs = [];

    this.toolbarEl?.remove();
    this.toolbarEl = null;
    this.speedMenu?.remove();
    this.speedMenu = null;

    this.highlightTopbarButton(false);
  }

  private highlightTopbarButton(on: boolean): void {
    const btn = document.querySelector(
      '[data-action-id="vela.bar-replay"], button[title*="Replay"], button[aria-label*="Replay"]'
    ) as HTMLElement | null;
    if (btn) {
      btn.style.color = on ? '#38bdf8' : '';
      btn.style.background = on ? 'rgba(56, 189, 248, 0.16)' : '';
      btn.dataset.active = on ? '1' : '0';
    }
  }

  private createToolbar(): void {
    this.toolbarEl?.remove();

    const bar = document.createElement('div');
    bar.className = 'vela-replay-toolbar';
    bar.style.cssText = `
      position: fixed;
      top: 48px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 4px 8px;
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 20px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      user-select: none;
      animation: vela-fade-in 0.15s ease-out;
    `;

    // 1. Drag Handle
    const dragHandle = document.createElement('div');
    dragHandle.title = 'Drag Replay Toolbar';
    dragHandle.innerHTML = '⋮⋮';
    dragHandle.style.cssText = `
      cursor: grab;
      color: #64748b;
      padding: 2px 4px;
      font-size: 13px;
      font-weight: bold;
      line-height: 1;
      display: flex;
      align-items: center;
    `;
    this.makeDraggable(bar, dragHandle);
    bar.appendChild(dragHandle);

    // 2. Jump to Bar Button
    const jumpBtn = document.createElement('button');
    jumpBtn.type = 'button';
    jumpBtn.className = 'vela-replay-btn vela-replay-jump';
    jumpBtn.title = 'Jump to Bar (Click any candle to replay from that bar)';
    jumpBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 2v12M12 2v12M4 8l6-4v8L4 8z" fill="currentColor" fill-opacity="0.2"/>
      </svg>
      <span>Jump</span>
    `;
    jumpBtn.style.cssText = this.buttonStyle();
    jumpBtn.addEventListener('click', () => {
      if (this.jumpMode) {
        this.cancelJumpMode();
      } else {
        this.armJumpMode();
      }
    });
    this.jumpBtn = jumpBtn;
    bar.appendChild(jumpBtn);

    // Divider
    bar.appendChild(this.makeDivider());

    // 3. Step Forward Button
    const stepBtn = document.createElement('button');
    stepBtn.type = 'button';
    stepBtn.className = 'vela-replay-btn';
    stepBtn.title = 'Step Forward 1 Bar (Right Arrow)';
    stepBtn.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="4,3 10,8 4,13" fill="currentColor"/>
        <line x1="12" y1="3" x2="12" y2="13"/>
      </svg>
    `;
    stepBtn.style.cssText = this.buttonStyle();
    stepBtn.addEventListener('click', () => this.stepForward());
    bar.appendChild(stepBtn);

    // 4. Play / Pause Button
    const playBtn = document.createElement('button');
    playBtn.type = 'button';
    playBtn.className = 'vela-replay-btn vela-replay-play';
    playBtn.title = 'Play / Pause (Space)';
    playBtn.style.cssText = this.buttonStyle(true);
    playBtn.addEventListener('click', () => this.togglePlay());
    this.playBtn = playBtn;
    bar.appendChild(playBtn);

    // Divider
    bar.appendChild(this.makeDivider());

    // 5. Speed Selector Button & Popover
    const speedBtn = document.createElement('button');
    speedBtn.type = 'button';
    speedBtn.className = 'vela-replay-btn';
    speedBtn.title = 'Playback Speed';
    speedBtn.style.cssText = this.buttonStyle();
    speedBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleSpeedMenu();
    });
    this.speedBtn = speedBtn;
    bar.appendChild(speedBtn);

    // Divider
    bar.appendChild(this.makeDivider());

    // 6. Status / Progress Info
    const status = document.createElement('div');
    status.className = 'vela-replay-status';
    status.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 0 6px;
      color: #94a3b8;
      font-size: 11px;
      font-weight: 500;
      white-space: nowrap;
    `;
    this.statusEl = status;
    bar.appendChild(status);

    // Divider
    bar.appendChild(this.makeDivider());

    // 7. Close / Exit Button
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'vela-replay-btn';
    closeBtn.title = 'To Real-time / Exit Replay';
    closeBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <line x1="3" y1="3" x2="13" y2="13"/>
        <line x1="13" y1="3" x2="3" y2="13"/>
      </svg>
    `;
    closeBtn.style.cssText = this.buttonStyle();
    closeBtn.addEventListener('mouseenter', () => {
      closeBtn.style.color = '#ef4444';
      closeBtn.style.borderColor = 'rgba(239, 68, 68, 0.4)';
    });
    closeBtn.addEventListener('mouseleave', () => {
      closeBtn.style.color = '#94a3b8';
      closeBtn.style.borderColor = 'transparent';
    });
    closeBtn.addEventListener('click', () => this.close());
    bar.appendChild(closeBtn);

    document.body.appendChild(bar);
    this.toolbarEl = bar;
    this.updateUI();
  }

  private makeDivider(): HTMLElement {
    const div = document.createElement('div');
    div.style.cssText = 'width: 1px; height: 16px; background: rgba(51, 65, 85, 0.6); margin: 0 2px;';
    return div;
  }

  private buttonStyle(isPrimary = false): string {
    return `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 26px;
      padding: 0 8px;
      border: 1px solid transparent;
      border-radius: 13px;
      background: ${isPrimary ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
      color: ${isPrimary ? '#38bdf8' : '#cbd5e1'};
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.12s ease;
    `;
  }

  private updateUI(): void {
    const ws = this.getWorkspace();
    const replay = ws?.replay;
    const isPlaying = replay?.state.playing ?? false;
    const isActive = replay?.state.active ?? false;
    const remaining = replay?.state.remaining ?? 0;
    const cursorTime = replay?.state.cursorTime;

    // Play/Pause button
    if (this.playBtn) {
      if (isPlaying) {
        this.playBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <rect x="4" y="3" width="3" height="10" rx="1"/>
            <rect x="9" y="3" width="3" height="10" rx="1"/>
          </svg>
          <span>Pause</span>
        `;
        this.playBtn.style.color = '#38bdf8';
        this.playBtn.style.background = 'rgba(56, 189, 248, 0.2)';
      } else {
        this.playBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
            <polygon points="4,3 13,8 4,13"/>
          </svg>
          <span>Play</span>
        `;
        this.playBtn.style.color = '#38bdf8';
        this.playBtn.style.background = 'rgba(56, 189, 248, 0.1)';
      }
    }

    // Jump button state
    if (this.jumpBtn) {
      if (this.jumpMode) {
        this.jumpBtn.style.color = '#38bdf8';
        this.jumpBtn.style.background = 'rgba(56, 189, 248, 0.25)';
        this.jumpBtn.style.borderColor = '#38bdf8';
      } else {
        this.jumpBtn.style.color = '#cbd5e1';
        this.jumpBtn.style.background = 'transparent';
        this.jumpBtn.style.borderColor = 'transparent';
      }
    }

    // Speed button text
    if (this.speedBtn) {
      const cur = SPEED_OPTIONS.find((s) => s.ms === this.speedMs) || SPEED_OPTIONS[3];
      this.speedBtn.innerHTML = `<span>${cur.label.split(' ')[0]}</span> <span style="font-size:9px;opacity:0.7;">▾</span>`;
    }

    // Status text
    if (this.statusEl) {
      if (this.jumpMode) {
        this.statusEl.innerHTML = `<span style="color:#38bdf8;font-weight:600;">👆 Click any candle to cut & replay</span>`;
      } else if (isActive) {
        const dateStr = cursorTime
          ? new Date(cursorTime).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : '';
        this.statusEl.innerHTML = `
          <span style="color:#f8fafc;font-weight:600;">${dateStr}</span>
          <span style="color:#64748b;">•</span>
          <span style="color:#38bdf8;">${remaining} bars left</span>
        `;
      } else {
        this.statusEl.innerHTML = `<span style="color:#94a3b8;">Click Jump to start</span>`;
      }
    }
  }

  private toggleSpeedMenu(): void {
    if (this.speedMenu) {
      this.speedMenu.remove();
      this.speedMenu = null;
      return;
    }

    if (!this.toolbarEl || !this.speedBtn) return;

    const rect = this.speedBtn.getBoundingClientRect();
    const menu = document.createElement('div');
    menu.className = 'vela-replay-speed-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 6}px;
      left: ${rect.left - 20}px;
      z-index: 1050;
      background: #0f172a;
      border: 1px solid rgba(56, 189, 248, 0.3);
      border-radius: 8px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.8);
      padding: 4px;
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 110px;
    `;

    SPEED_OPTIONS.forEach((opt) => {
      const item = document.createElement('div');
      const isSelected = opt.ms === this.speedMs;
      item.style.cssText = `
        padding: 5px 10px;
        font-size: 11px;
        font-weight: 500;
        color: ${isSelected ? '#38bdf8' : '#e2e8f0'};
        background: ${isSelected ? 'rgba(56, 189, 248, 0.15)' : 'transparent'};
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: space-between;
      `;
      item.innerHTML = `<span>${opt.label}</span>${isSelected ? '<span>✓</span>' : ''}`;

      item.addEventListener('mouseenter', () => {
        if (!isSelected) item.style.background = 'rgba(255, 255, 255, 0.08)';
      });
      item.addEventListener('mouseleave', () => {
        if (!isSelected) item.style.background = 'transparent';
      });

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setSpeed(opt.ms);
        menu.remove();
        this.speedMenu = null;
      });

      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    this.speedMenu = menu;

    const onOutside = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== this.speedBtn) {
        menu.remove();
        this.speedMenu = null;
        document.removeEventListener('pointerdown', onOutside);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', onOutside), 10);
  }

  public setSpeed(ms: number): void {
    this.speedMs = ms;
    const ws = this.getWorkspace();
    if (ws?.replay.state.playing) {
      ws.replay.play(this.speedMs);
    }
    this.updateUI();
  }

  public togglePlay(): void {
    const ws = this.getWorkspace();
    if (!ws) return;

    if (!ws.replay.state.active) {
      this.armJumpMode();
      return;
    }

    if (ws.replay.state.playing) {
      ws.replay.pause();
    } else {
      ws.replay.play(this.speedMs);
    }
    this.updateUI();
  }

  public stepForward(): void {
    const ws = this.getWorkspace();
    if (!ws) return;

    if (!ws.replay.state.active) {
      this.armJumpMode();
      return;
    }

    if (ws.replay.state.playing) {
      ws.replay.pause();
    }

    const hasNext = ws.replay.step();
    if (!hasNext) {
      this.showToast('Reached the most recent candle in replay');
    }
    this.updateUI();
  }

  public armJumpMode(): void {
    const ws = this.getWorkspace();
    if (!ws) return;

    this.cancelJumpMode();
    this.jumpMode = true;
    this.jumpExecuted = false;
    this.updateUI();
    this.showToast('Bar Replay: Click any candle on the chart to start replay from that point');
    document.body.classList.add('vela-replay-jump-armed');

    // Ensure jump cursor style exists
    if (!document.getElementById('vela-replay-jump-style')) {
      const style = document.createElement('style');
      style.id = 'vela-replay-jump-style';
      style.textContent = `
        .vela-replay-jump-armed, .vela-replay-jump-armed canvas {
          cursor: crosshair !important;
        }
      `;
      document.head.appendChild(style);
    }

    const cells = ws.cells();
    cells.forEach((cell: any) => {
      try {
        cell.chart?.renderer?.set?.({
          crosshairOverride: { horizontal: false, shadeRight: { color: 'rgba(0, 0, 0, 0.45)' } },
          drawingsInteractive: false,
        });
      } catch {
        /* ignore */
      }

      // Track hovered candle time via onCrosshairMove
      try {
        if (cell.chart?.renderer?.onCrosshairMove) {
          const offMove = cell.chart.renderer.onCrosshairMove((e: any) => {
            if (e?.time != null) {
              this.lastHoveredTime = e.time;
              this.lastHoveredCell = cell;
            }
          });
          this.jumpCleanups.push(offMove);
        }
      } catch {
        /* ignore */
      }

      // Listen on renderer's onClick (reports exact candle time on click)
      try {
        if (cell.chart?.renderer?.onClick) {
          const offClick = cell.chart.renderer.onClick(({ time }: any) => {
            const targetTime = time ?? this.lastHoveredTime;
            if (targetTime != null) {
              this.executeJump(targetTime, cell);
            }
          });
          this.jumpCleanups.push(offClick);
        }
      } catch {
        /* ignore */
      }

      // DOM fallback: pointerup directly on cell container
      const cellEl: HTMLElement | null = cell.element ?? cell.chart?.orchestrator?.element ?? null;
      if (cellEl) {
        const onPointerUp = (e: PointerEvent) => {
          if (!this.jumpMode || this.jumpExecuted) return;
          if (e.button !== 0) return;
          if ((e.target as HTMLElement)?.closest('.vela-replay-toolbar, .vela-widget-topbar')) return;
          const targetTime = this.lastHoveredTime;
          if (targetTime != null) {
            this.executeJump(targetTime, cell);
          }
        };
        cellEl.addEventListener('pointerup', onPointerUp, true);
        this.jumpCleanups.push(() => cellEl.removeEventListener('pointerup', onPointerUp, true));
      }
    });
  }

  private async executeJump(time: number, cell: any): Promise<void> {
    if (this.jumpExecuted) return;
    this.jumpExecuted = true;
    this.cancelJumpMode();

    const ws = this.getWorkspace();
    if (!ws) return;

    try {
      const dateStr = new Date(time).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      this.showToast(`Starting Replay from ${dateStr}…`);
      await ws.replay.start({ from: time, cell: cell?.id });
      this.updateUI();
    } catch (err: any) {
      console.error('[replay] start error:', err);
      this.showToast(`Replay error: ${err?.message || err}`);
    }
  }

  public cancelJumpMode(): void {
    this.jumpMode = false;
    document.body.classList.remove('vela-replay-jump-armed');

    this.jumpCleanups.forEach((cleanup) => {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    });
    this.jumpCleanups = [];

    const ws = this.getWorkspace();
    if (ws) {
      ws.cells().forEach((cell: any) => {
        try {
          cell.chart?.renderer?.set?.({
            crosshairOverride: null,
            drawingsInteractive: true,
          });
        } catch {
          /* ignore */
        }
      });
    }

    this.updateUI();
  }

  private bindWorkspaceEvents(ws: VelaWorkspace): void {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];

    const onStart = () => this.updateUI();
    const onStep = () => this.updateUI();
    const onPlay = () => this.updateUI();
    const onPause = () => this.updateUI();
    const onEnd = () => {
      this.updateUI();
    };

    const off1 = ws.replay.on('replay:start', onStart);
    const off2 = ws.replay.on('replay:step', onStep);
    const off3 = ws.replay.on('replay:play', onPlay);
    const off4 = ws.replay.on('replay:pause', onPause);
    const off5 = ws.replay.on('replay:end', onEnd);

    this.unsubs.push(off1, off2, off3, off4, off5);
  }

  private bindKeyboardShortcuts(): void {
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      // Ignore if user is inside an input, textarea, or contenteditable
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      if (!this.active) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.togglePlay();
      } else if (e.code === 'ArrowRight' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        this.stepForward();
      } else if (e.code === 'Escape') {
        if (this.jumpMode) {
          e.preventDefault();
          this.cancelJumpMode();
        }
      }
    });
  }

  private makeDraggable(element: HTMLElement, handle: HTMLElement): void {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    const onPointerMove = (e: PointerEvent) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      element.style.left = `${Math.max(10, Math.min(window.innerWidth - 100, initialLeft + dx))}px`;
      element.style.top = `${Math.max(10, Math.min(window.innerHeight - 50, initialTop + dy))}px`;
      element.style.transform = 'none';
    };

    const onPointerUp = () => {
      handle.style.cursor = 'grab';
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    handle.addEventListener('pointerdown', (e: PointerEvent) => {
      e.preventDefault();
      handle.style.cursor = 'grabbing';
      startX = e.clientX;
      startY = e.clientY;
      const rect = element.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });
  }
}
