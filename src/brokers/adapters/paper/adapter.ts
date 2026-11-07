/**
 * OmniTrading - Built-in Paper Trading Broker Adapter
 *
 * Provides a 100% local simulated trading environment.
 * Requires no external account or credentials. Orders are executed
 * against live and simulated prices with local balance and position tracking.
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
import { BinanceProvider } from '@luxalgo/vela/providers/binance';

const STORAGE_KEY = 'omni-paper-trading-account';
const DEFAULT_INITIAL_BALANCE = 50000;

interface PaperState {
  balance: number;
  positions: Position[];
  ordersHistory: any[];
}

export class PaperTradingAdapter implements BrokerAdapter {
  public readonly id = 'paper';
  public readonly name = 'Paper Trading (Local Simulation)';
  public readonly description = 'Free instant simulated trading account. Zero setup, no credentials required.';
  public readonly status = 'stable';
  public readonly supportedEnvironments: BrokerEnvironment[] = ['paper'];

  public readonly capabilities: BrokerCapabilities = {
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsStopOrders: true,
    supportsStopLoss: true,
    supportsTakeProfit: true,
    supportsPartialClose: true,
    supportsHistoricalBars: true,
    supportsLiveTicks: true,
    maxOrderVolume: 100,
  };

  public readonly credentialSchema: CredentialSchema = {
    authType: 'none',
    fields: [
      {
        name: 'startingBalance',
        label: 'Starting Balance ($)',
        type: 'text',
        required: false,
        defaultValue: '50000',
        helpText: 'Simulated cash balance for paper trading.',
      },
    ],
    instructions: 'Paper Trading runs entirely locally on your device. No API keys or broker accounts are required.',
  };

  private connected = true;
  private state: PaperState;
  private currentQuotes = new Map<string, { bid: number; ask: number; time: number }>();
  private quoteSubscribers = new Map<string, Set<(q: any) => void>>();
  private positionSubscribers = new Set<(positions: Position[]) => void>();

  constructor() {
    this.state = this.loadState();
  }

  private loadState(): PaperState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return {
      balance: DEFAULT_INITIAL_BALANCE,
      positions: [],
      ordersHistory: [],
    };
  }

  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  public async connect(_credentials: Record<string, any>, _env: BrokerEnvironment): Promise<void> {
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async getAccounts(): Promise<BrokerAccount[]> {
    const equity = this.calculateEquity();
    return [
      {
        id: 'paper-primary',
        handle: 'paper-account-default',
        brokerId: 'paper',
        accountNumber: 'SIM-777001',
        name: 'Paper Simulation Account',
        environment: 'paper',
        currency: 'USD',
        balance: this.state.balance,
        balanceFormatted: `$${this.state.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        equity,
        tradingEnabled: true,
      },
    ];
  }

  public async selectAccount(accountId: string): Promise<BrokerAccount> {
    const accounts = await this.getAccounts();
    const found = accounts.find((a) => a.id === accountId);
    if (!found) throw new Error(`Paper account ${accountId} not found`);
    return found;
  }

  public getActiveAccount(): BrokerAccount | null {
    const equity = this.calculateEquity();
    return {
      id: 'paper-primary',
      handle: 'paper-account-default',
      brokerId: 'paper',
      accountNumber: 'SIM-777001',
      name: 'Paper Simulation Account',
      environment: 'paper',
      currency: 'USD',
      balance: this.state.balance,
      balanceFormatted: `$${this.state.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      equity,
      tradingEnabled: true,
    };
  }

  public createDataProvider(_account: BrokerAccount): any {
    return new BinanceProvider();
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const isForex = cleanSym.length === 6 && (cleanSym.endsWith('USD') || cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP'));
    const isJpy = cleanSym.endsWith('JPY');

    if (isForex) {
      return {
        symbol: cleanSym,
        minVolume: 0.01,
        maxVolume: 100.0,
        stepVolume: 0.01,
        lotSize: 100000,
        digits: isJpy ? 3 : 5,
        pipPosition: isJpy ? 2 : 4,
        tickSize: isJpy ? 0.001 : 0.00001,
      };
    }

    // Default Crypto / US Equities
    return {
      symbol: cleanSym,
      minVolume: 0.001,
      maxVolume: 1000.0,
      stepVolume: 0.001,
      lotSize: 1,
      digits: 2,
      pipPosition: 2,
      tickSize: 0.01,
    };
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    const spec = await this.getSymbolSpec(order.symbol);
    const quote = this.currentQuotes.get(order.symbol.toUpperCase()) || {
      bid: order.price || 100,
      ask: (order.price || 100) * 1.0001,
      time: Date.now(),
    };

    const fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
    const orderId = `paper-ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newPosition: Position = {
      id: `pos-${orderId}`,
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      volume: order.volume,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      unrealizedPnL: 0,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      openTime: Date.now(),
    };

    this.state.positions.push(newPosition);
    this.state.ordersHistory.push({
      orderId,
      symbol: order.symbol,
      side: order.side,
      type: order.type,
      volume: order.volume,
      fillPrice,
      time: Date.now(),
    });

    this.saveState();
    this.notifyPositions();

    return {
      success: true,
      orderId,
      executionPrice: fillPrice,
      filledVolume: order.volume,
      message: `Paper ${order.side.toUpperCase()} order executed at ${fillPrice.toFixed(spec.digits)}`,
    };
  }

  public async modifyPosition(req: ModifyPositionRequest): Promise<void> {
    const pos = this.state.positions.find((p) => p.id === req.positionId);
    if (!pos) throw new Error(`Position ${req.positionId} not found`);

    if (req.stopLoss !== undefined) pos.stopLoss = req.stopLoss;
    if (req.takeProfit !== undefined) pos.takeProfit = req.takeProfit;

    this.saveState();
    this.notifyPositions();
  }

  public async closePosition(positionId: string, volume?: number): Promise<void> {
    const idx = this.state.positions.findIndex((p) => p.id === positionId);
    if (idx < 0) throw new Error(`Position ${positionId} not found`);

    const pos = this.state.positions[idx];
    const spec = await this.getSymbolSpec(pos.symbol);
    const quote = this.currentQuotes.get(pos.symbol) || {
      bid: pos.currentPrice,
      ask: pos.currentPrice,
      time: Date.now(),
    };

    const closePrice = pos.side === 'buy' ? quote.bid : quote.ask;
    const pnlPoints = pos.side === 'buy' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
    const realizedPnL = pnlPoints * pos.volume * spec.lotSize;

    this.state.balance += realizedPnL;
    this.state.positions.splice(idx, 1);

    this.saveState();
    this.notifyPositions();
  }

  public async getPositions(): Promise<Position[]> {
    return [...this.state.positions];
  }

  public onQuote(symbol: string, cb: (quote: { bid: number; ask: number; time: number }) => void): () => void {
    const sym = symbol.toUpperCase();
    if (!this.quoteSubscribers.has(sym)) {
      this.quoteSubscribers.set(sym, new Set());
    }
    this.quoteSubscribers.get(sym)!.add(cb);

    return () => {
      this.quoteSubscribers.get(sym)?.delete(cb);
    };
  }

  public onPositionChange(cb: (positions: Position[]) => void): () => void {
    this.positionSubscribers.add(cb);
    cb(this.state.positions);
    return () => {
      this.positionSubscribers.delete(cb);
    };
  }

  public updateLivePrice(symbol: string, bid: number, ask: number): void {
    const sym = symbol.toUpperCase();
    this.currentQuotes.set(sym, { bid, ask, time: Date.now() });

    // Update positions PnL
    let changed = false;
    for (const pos of this.state.positions) {
      if (pos.symbol === sym) {
        pos.currentPrice = pos.side === 'buy' ? bid : ask;
        const diff = pos.side === 'buy' ? pos.currentPrice - pos.entryPrice : pos.entryPrice - pos.currentPrice;
        pos.unrealizedPnL = diff * pos.volume * 100000;
        changed = true;
      }
    }

    if (changed) this.notifyPositions();

    const subs = this.quoteSubscribers.get(sym);
    if (subs) {
      for (const cb of subs) cb({ bid, ask, time: Date.now() });
    }
  }

  private notifyPositions(): void {
    for (const cb of this.positionSubscribers) {
      cb([...this.state.positions]);
    }
  }

  private calculateEquity(): number {
    let unPnL = 0;
    for (const p of this.state.positions) {
      unPnL += p.unrealizedPnL;
    }
    return this.state.balance + unPnL;
  }
}
