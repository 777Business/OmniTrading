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

import type { BrokerAdapter, BrokerAccount, Position, OrderRequest, OrderResult, ModifyPositionRequest } from './types';
import { PaperTradingAdapter } from './adapters/paper/adapter';
import { CTraderAdapter } from './adapters/ctrader/adapter';
import { IBKRAdapter } from './adapters/ibkr/adapter';
import { BinanceAdapter } from './adapters/binance/adapter';
import { AlpacaAdapter } from './adapters/alpaca/adapter';
import { OandaAdapter } from './adapters/oanda/adapter';
import { MetaTrader5Adapter } from './adapters/metatrader/adapter';

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
    this.register(new IBKRAdapter());
    this.register(new BinanceAdapter());
    this.register(new AlpacaAdapter());
    this.register(new OandaAdapter());
    this.register(new MetaTrader5Adapter());

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

  public async getPositions(): Promise<Position[]> {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.getPositions === 'function') {
      return adapter.getPositions();
    }
    return [];
  }

  public async getOrdersHistory(): Promise<any[]> {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.getOrdersHistory === 'function') {
      return adapter.getOrdersHistory();
    }
    return [];
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const adapter = this.getActiveAdapter();
    if (!adapter || typeof adapter.placeOrder !== 'function') {
      throw new Error(`Active broker '${adapter?.name || 'unknown'}' does not support order execution.`);
    }
    const res = await adapter.placeOrder(order);
    this.notify();
    return res;
  }

  public async modifyPosition(req: ModifyPositionRequest): Promise<void> {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.modifyPosition === 'function') {
      await adapter.modifyPosition(req);
      this.notify();
    }
  }

  public async closePosition(positionId: string, volume?: number): Promise<void> {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.closePosition === 'function') {
      await adapter.closePosition(positionId, volume);
      this.notify();
    }
  }

  public async closeAllPositions(): Promise<void> {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.closeAllPositions === 'function') {
      await adapter.closeAllPositions();
      this.notify();
    } else {
      const positions = await this.getPositions();
      for (const p of positions) {
        await this.closePosition(p.id);
      }
    }
  }

  public onPositionChange(cb: (positions: Position[]) => void): () => void {
    const adapter = this.getActiveAdapter();
    if (adapter && typeof adapter.onPositionChange === 'function') {
      return adapter.onPositionChange(cb);
    }
    return () => {};
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
