/**
 * OmniTrading - Left Side Menu Bar Integration
 *
 * Relocates action features from the overcrowded top navigation bar to the
 * left-hand side toolbar rail, rendering them as clean native icons that
 * perfectly match Vela's theme, colors, sizing, fonts, and hover ergonomics.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type { VelaWorkspace } from '@luxalgo/vela/workspace';

export interface SideMenuAction {
  id: string;
  title: string;
  iconSvg: string;
  run: () => void;
  isActive?: () => boolean;
}

export class SideMenuBar {
  private getWorkspace: () => VelaWorkspace | null;
  private onToast: (msg: string) => void;
  private actions: SideMenuAction[] = [];
  private attachedContainer: HTMLElement | null = null;
  private observer: MutationObserver | null = null;

  constructor(
    getWorkspace: () => VelaWorkspace | null,
    onToast: (msg: string) => void,
    actions: SideMenuAction[]
  ) {
    this.getWorkspace = getWorkspace;
    this.onToast = onToast;
    this.actions = actions;

    this.initObserver();
  }

  private initObserver(): void {
    if (typeof window === 'undefined') return;

    // Observe document for .vela-dtb mounting
    const findAndMount = () => {
      const dtb = document.querySelector('.vela-dtb') as HTMLElement | null;
      if (dtb && dtb !== this.attachedContainer) {
        this.mount(dtb);
      }
    };

    this.observer = new MutationObserver(() => {
      findAndMount();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });

    // Initial check
    setTimeout(findAndMount, 300);
    setTimeout(findAndMount, 1000);
  }

  public mount(dtb: HTMLElement): void {
    if (!dtb) return;

    // Clean up previous injection if any
    const existing = dtb.querySelector('.omni-side-actions-group');
    if (existing) existing.remove();

    this.attachedContainer = dtb;

    // Separator line exactly matching Vela drawing toolbar dividers
    const group = document.createElement('div');
    group.className = 'omni-side-actions-group';
    group.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
      margin-top: 4px;
      padding-top: 4px;
    `;

    const sep = document.createElement('div');
    sep.className = 'omni-dtb-sep';
    sep.style.cssText = `
      width: 22px;
      height: 1px;
      margin: 4px auto 6px auto;
      background: var(--vela-border, rgba(255, 255, 255, 0.12));
      flex: none;
    `;
    group.appendChild(sep);

    // Create action buttons
    for (const act of this.actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vela-dtb-btn omni-sidebar-action-btn';
      btn.dataset.actionId = act.id;
      btn.title = act.title;
      btn.setAttribute('aria-label', act.title);

      const hit = document.createElement('div');
      hit.className = 'vela-dtb-hit';
      hit.innerHTML = act.iconSvg;

      btn.appendChild(hit);

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        try {
          act.run();
          this.updateActiveStates();
        } catch (err) {
          console.error(`[SideMenuBar] Failed running action ${act.id}:`, err);
        }
      });

      group.appendChild(btn);
    }

    dtb.appendChild(group);
    this.updateActiveStates();
  }

  public updateActiveStates(): void {
    if (!this.attachedContainer) return;
    const btns = this.attachedContainer.querySelectorAll<HTMLButtonElement>('.omni-sidebar-action-btn');
    btns.forEach((btn) => {
      const actId = btn.dataset.actionId;
      const act = this.actions.find((a) => a.id === actId);
      if (act && act.isActive) {
        const active = act.isActive();
        btn.dataset.active = active ? '1' : '';
        const hit = btn.querySelector('.vela-dtb-hit') as HTMLElement | null;
        if (hit) {
          hit.style.background = active ? 'var(--vela-hover, rgba(255, 255, 255, 0.12))' : '';
          hit.style.color = active ? 'var(--vela-fg-bright, #f8fafc)' : '';
        }
      }
    });
  }

  public refresh(): void {
    const dtb = document.querySelector('.vela-dtb') as HTMLElement | null;
    if (dtb) this.mount(dtb);
  }

  public destroy(): void {
    this.observer?.disconnect();
    this.observer = null;
    this.attachedContainer?.querySelector('.omni-side-actions-group')?.remove();
    this.attachedContainer = null;
  }
}
