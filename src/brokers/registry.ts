/**
 * OmniTrading - Broker Registry & Multi-Account Manager
 *
 * Manages registered broker adapters, active connections, and multi-account state.
 * Enforces broker neutrality: Paper Trading is the default zero-config entry point,
 * and all external brokers are presented alphabetically with no favoritism.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type { BrokerAdapter, BrokerAccount } from './types';
import { PaperTradingAdapter } from './adapters/paper/adapter';
import { CTraderAdapter } from './adapters/ctrader/adapter';

const PREFS_KEY = 'omni-broker-preferences';

export interface BrokerPreferences {
  activeBrokerId: string;
  activeAccountId?: string;
}

export class BrokerRegistry {
  private static instance: BrokerRegistry | null = null;
  private adapters = new Map<string, BrokerAdapter>();
  private activeAdapterId: string = 'paper';
  private activeAccount: BrokerAccount | null = null;
  private listeners = new Set<() => void>();

  public static getInstance(): BrokerRegistry {
    if (!BrokerRegistry.instance) {
      BrokerRegistry.instance = new BrokerRegistry();
    }
    return BrokerRegistry.instance;
  }

  private constructor() {
    // 1. Paper trading is registered first as the built-in default
    this.register(new PaperTradingAdapter());

    // 2. Register external broker adapters
    this.register(new CTraderAdapter());

    // Restore saved preferences if any
    const prefs = this.loadPreferences();
    if (prefs.activeBrokerId && this.adapters.has(prefs.activeBrokerId)) {
      this.activeAdapterId = prefs.activeBrokerId;
    }
  }

  public register(adapter: BrokerAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  public getAdapters(): BrokerAdapter[] {
    const list = Array.from(this.adapters.values());
    const paper = list.find((a) => a.id === 'paper');
    const others = list.filter((a) => a.id !== 'paper').sort((a, b) => a.name.localeCompare(b.name));
    return paper ? [paper, ...others] : others;
  }

  public getAdapter(id: string): BrokerAdapter | undefined {
    return this.adapters.get(id);
  }

  public getActiveAdapter(): BrokerAdapter {
    return this.adapters.get(this.activeAdapterId) || this.adapters.get('paper')!;
  }

  public async setActiveAdapter(id: string): Promise<void> {
    if (!this.adapters.has(id)) {
      throw new Error(`Broker adapter '${id}' is not registered.`);
    }
    this.activeAdapterId = id;
    this.savePreferences();
    this.notify();
  }

  public getActiveAccount(): BrokerAccount | null {
    const adapter = this.getActiveAdapter();
    return this.activeAccount || adapter.getActiveAccount();
  }

  public setActiveAccount(account: BrokerAccount | null): void {
    this.activeAccount = account;
    this.savePreferences();
    this.notify();
  }

  public loadPreferences(): BrokerPreferences {
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return { activeBrokerId: 'paper' };
  }

  public savePreferences(): void {
    try {
      const prefs: BrokerPreferences = {
        activeBrokerId: this.activeAdapterId,
        activeAccountId: this.activeAccount?.id,
      };
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }

  public subscribe(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) {
      try {
        cb();
      } catch (err) {
        console.error('[omni-broker] listener error:', err);
      }
    }
  }
}
