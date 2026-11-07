/**
 * OmniTrading - cTrader Broker Adapter
 *
 * Connects to cTrader Open API via the local OmniTrading secure helper service.
 * Supports multi-account selection, live market data, and order execution.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import type {
  BrokerAdapter,
  BrokerAccount,
  BrokerCapabilities,
  CredentialSchema,
  SymbolSpec,
  OrderRequest,
  OrderResult,
  Position,
  ModifyPositionRequest,
  BrokerEnvironment,
} from '../../types';
import { CtClient } from './client';
import { CtProvider } from './provider';

export class CTraderAdapter implements BrokerAdapter {
  public readonly id = 'ctrader';
  public readonly name = 'cTrader (Open API)';
  public readonly description = 'Connects to cTrader brokers (IC Markets, Pepperstone, etc.) via official Open API.';
  public readonly status = 'beta';
  public readonly supportedEnvironments: BrokerEnvironment[] = ['demo', 'live'];

  public readonly capabilities: BrokerCapabilities = {
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsStopOrders: true,
    supportsStopLoss: true,
    supportsTakeProfit: true,
    supportsPartialClose: true,
    supportsHistoricalBars: true,
    supportsLiveTicks: true,
    maxOrderVolume: 50,
  };

  public readonly credentialSchema: CredentialSchema = {
    authType: 'oauth',
    fields: [
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        placeholder: 'cTrader Open API Client ID',
        helpText: 'From openapi.ctrader.com/apps',
      },
      {
        name: 'clientSecret',
        label: 'Client Secret',
        type: 'password',
        required: true,
        placeholder: 'cTrader Open API Client Secret',
        helpText: 'Kept securely on your local device. Never sent to any third party.',
      },
    ],
    docsUrl: 'https://openapi.ctrader.com/apps',
    instructions:
      'Create an Open API application on the Spotware developer portal with Scope "Trading". Add redirect URI http://127.0.0.1:8787/api/auth/callback, then enter your credentials.',
  };

  private client: CtClient | null = null;
  private provider: CtProvider | null = null;
  private activeAccount: BrokerAccount | null = null;
  private accountsCache: BrokerAccount[] = [];
  private ordersHistory: any[] = [];

  public async connect(_credentials: Record<string, any>, _env: BrokerEnvironment): Promise<void> {
    // Connection is established when an account handle is selected
  }

  public async disconnect(): Promise<void> {
    try {
      this.provider?.destroy();
      this.client?.close();
    } finally {
      this.provider = null;
      this.client = null;
      this.activeAccount = null;
    }
  }

  public isConnected(): boolean {
    return Boolean(this.client && this.activeAccount);
  }

  public async getAccounts(): Promise<BrokerAccount[]> {
    try {
      const res = await fetch('/api/accounts', { cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      const list = Array.isArray(data.accounts) ? data.accounts : [];

      this.accountsCache = list.map((a: any) => ({
        id: a.handle,
        handle: a.handle,
        brokerId: 'ctrader',
        accountNumber: a.login || a.accountId || a.handle,
        name: a.broker ? `${a.broker} (${a.login || a.accountId})` : `cTrader #${a.login || a.accountId}`,
        environment: a.environment === 'live' ? 'live' : 'demo',
        currency: a.currency || 'USD',
        balance: Number(a.balance || 0),
        balanceFormatted: a.balanceFormatted,
        tradingEnabled: a.environment !== 'live', // Live accounts start disabled
      }));

      return this.accountsCache;
    } catch {
      return [];
    }
  }

  public async selectAccount(accountId: string): Promise<BrokerAccount> {
    const accounts = await this.getAccounts();
    const target = accounts.find((a) => a.id === accountId || a.handle === accountId);
    if (!target) throw new Error(`cTrader account ${accountId} not found.`);

    if (this.activeAccount?.handle !== target.handle) {
      this.client?.close();
      this.client = new CtClient();
      await this.client.connect(target.handle);
      this.provider = new CtProvider(this.client, 0);
      this.activeAccount = target;
    }

    return target;
  }

  public getActiveAccount(): BrokerAccount | null {
    return this.activeAccount;
  }

  public createDataProvider(account: BrokerAccount): any {
    if (!this.client || this.activeAccount?.handle !== account.handle) {
      this.client?.close();
      this.client = new CtClient();
      this.client.connect(account.handle);
      this.provider = new CtProvider(this.client, 0);
      this.activeAccount = account;
    }
    return this.provider;
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    if (this.client) {
      try {
        const ctSym = await this.client.resolveSymbol(symbol);
        if (ctSym) {
          const stepVol = (ctSym.stepVolume || 100) / (ctSym.lotSize || 100000);
          const minVol = (ctSym.minVolume || 100) / (ctSym.lotSize || 100000);
          const maxVol = (ctSym.maxVolume || 10000000) / (ctSym.lotSize || 100000);
          return {
            symbol,
            baseAsset: ctSym.baseAsset,
            quoteAsset: ctSym.quoteAsset,
            minVolume: Math.max(0.01, stepVol, minVol),
            maxVolume: maxVol,
            stepVolume: Math.max(0.01, stepVol),
            lotSize: ctSym.lotSize || 100000,
            digits: ctSym.digits ?? 5,
            pipPosition: ctSym.pipPosition ?? (ctSym.digits ? ctSym.digits - 1 : 4),
            tickSize: 1 / Math.pow(10, ctSym.digits ?? 5),
          };
        }
      } catch {
        /* fallback to standard forex */
      }
    }

    const isJpy = symbol.toUpperCase().endsWith('JPY');
    return {
      symbol,
      minVolume: 0.01,
      maxVolume: 50.0,
      stepVolume: 0.01,
      lotSize: 100000,
      digits: isJpy ? 3 : 5,
      pipPosition: isJpy ? 2 : 4,
      tickSize: isJpy ? 0.001 : 0.00001,
    };
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.client) throw new Error('cTrader client is not connected.');

    const ctSym = await this.client.resolveSymbol(order.symbol);
    if (!ctSym) throw new Error(`Symbol ${order.symbol} could not be resolved.`);

    const lotSize = ctSym.lotSize || 100000;
    const rawVolume = Math.round(order.volume * lotSize);

    const res = await this.client.sendOrder({
      symbolId: ctSym.id,
      side: order.side === 'buy' ? 'BUY' : 'SELL',
      volume: rawVolume,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
    });

    if (res.error) {
      return { success: false, error: res.error.message || 'cTrader order execution failed' };
    }

    const orderId = String(res.position?.positionId || res.order?.orderId || Date.now());
    this.ordersHistory.unshift({
      id: orderId,
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      type: order.type,
      volume: order.volume,
      price: res.position?.price || 0,
      status: 'FILLED',
      time: Date.now(),
    });

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omni:position-change'));
      window.dispatchEvent(new CustomEvent('omni:order-placed', { detail: { orderId, symbol: order.symbol, side: order.side } }));
    }

    return {
      success: true,
      orderId,
      executionPrice: res.position?.price,
      filledVolume: order.volume,
      message: `Order filled at ${res.position?.price || 'market'}`,
    };
  }

  public async modifyPosition(req: ModifyPositionRequest): Promise<void> {
    if (!this.client) throw new Error('cTrader client is not connected.');
    await this.client.modifyPosition({
      positionId: Number(req.positionId),
      stopLoss: req.stopLoss,
      takeProfit: req.takeProfit,
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omni:position-change'));
    }
  }

  public async closePosition(positionId: string, volume?: number): Promise<void> {
    if (!this.client) throw new Error('cTrader client is not connected.');
    await this.client.closePosition(Number(positionId), volume);
    this.ordersHistory.unshift({
      id: `ctrader-close-${positionId}-${Date.now()}`,
      symbol: 'POSITION',
      side: 'close',
      type: 'market',
      volume: volume || 0,
      price: 0,
      status: 'CLOSED',
      time: Date.now(),
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('omni:position-change'));
    }
  }

  public async closeAllPositions(): Promise<number> {
    const positions = await this.getPositions();
    let count = 0;
    for (const pos of positions) {
      try {
        await this.closePosition(pos.id);
        count++;
      } catch {
        /* ignore individual close errors */
      }
    }
    return count;
  }

  public async getOrdersHistory(): Promise<any[]> {
    return [...this.ordersHistory];
  }

  public async getPositions(): Promise<Position[]> {
    if (!this.client) return [];
    try {
      const raw = await this.client.reconcile();
      const list = raw.position || [];
      return list.map((p: any) => ({
        id: String(p.positionId),
        symbol: p.symbolName || String(p.tradeData?.symbolId),
        side: p.tradeData?.tradeSide === 1 ? 'buy' : 'sell',
        volume: (p.tradeData?.volume || 0) / 100000,
        entryPrice: p.price,
        currentPrice: p.price,
        unrealizedPnL: 0,
        stopLoss: p.stopLoss,
        takeProfit: p.takeProfit,
        openTime: p.tradeData?.openTimestamp || Date.now(),
      }));
    } catch {
      return [];
    }
  }

  public onQuote(symbol: string, cb: (quote: { bid: number; ask: number; time: number }) => void): () => void {
    if (!this.client) return () => {};
    let active = true;

    this.client.resolveSymbol(symbol).then((ctSym) => {
      if (!active || !ctSym || !this.client) return;
      return this.client.subscribeSpots(ctSym.id, (bid, ask) => {
        if (!active) return;
        cb({ bid, ask, time: Date.now() });
      });
    });

    return () => {
      active = false;
    };
  }

  public getRawClient(): CtClient | null {
    return this.client;
  }
}
