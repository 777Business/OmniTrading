/**
 * OmniTrading - Built-in Multi-Asset Paper Trading Broker Adapter
 *
 * Provides a 100% local simulated trading environment across Forex,
 * Commodities (Gold, Silver, Oil), Cryptocurrencies, and US Equities.
 * Requires zero setup or API keys. Orders execute against real and simulated market feeds.
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
import { UniversalMarketDataProvider, CATALOG_SYMBOLS } from './universalProvider';

const STORAGE_KEY = 'omni-paper-trading-accounts-v2';

interface AccountState {
  balance: number;
  positions: Position[];
  ordersHistory: any[];
}

interface MultiAccountPaperState {
  activeAccountId: string;
  accounts: Record<string, AccountState>;
}

const DEFAULT_ACCOUNTS_DEF = [
  {
    id: 'paper-universal',
    handle: 'paper-universal-multi-asset',
    accountNumber: 'SIM-ALL-777',
    name: 'Omni Universal Paper (Multi-Asset: Forex, Gold, Crypto, Stocks)',
    currency: 'USD',
    defaultBalance: 50000,
  },
  {
    id: 'paper-forex',
    handle: 'paper-forex-commodities',
    accountNumber: 'SIM-FX-10K',
    name: 'Forex & Commodities Paper (EURUSD, GBPUSD, XAUUSD, Oil)',
    currency: 'USD',
    defaultBalance: 10000,
  },
  {
    id: 'paper-crypto',
    handle: 'paper-crypto-binance',
    accountNumber: 'SIM-BINANCE-USDT',
    name: 'Binance Crypto Paper (Spot & Futures Simulation)',
    currency: 'USDT',
    defaultBalance: 100000,
  },
  {
    id: 'paper-equity',
    handle: 'paper-alpaca-equities',
    accountNumber: 'SIM-EQUITY-100K',
    name: 'Alpaca US Equities Paper (Stocks & ETFs Simulation)',
    currency: 'USD',
    defaultBalance: 100000,
  },
];

export class PaperTradingAdapter implements BrokerAdapter {
  public readonly id = 'paper';
  public readonly name = 'Paper Trading (Universal Multi-Asset)';
  public readonly description = 'Instant simulated trading across Forex, Commodities, Crypto, and US Equities. Zero setup, no keys needed.';
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
        label: 'Starting Balance',
        type: 'text',
        required: false,
        defaultValue: '50000',
        helpText: 'Simulated cash balance for paper trading account.',
      },
    ],
    instructions: 'Universal Paper Trading runs locally on your device with real-time multi-asset market data. No API keys or external broker accounts are required.',
  };

  private connected = true;
  private state: MultiAccountPaperState;
  private dataProvider: UniversalMarketDataProvider;
  private currentQuotes = new Map<string, { bid: number; ask: number; time: number }>();
  private quoteSubscribers = new Map<string, Set<(q: any) => void>>();
  private positionSubscribers = new Set<(positions: Position[]) => void>();

  constructor() {
    this.state = this.loadState();
    this.dataProvider = new UniversalMarketDataProvider();

    // Connect data provider live ticks to internal paper engine
    this.dataProvider.onLiveQuote((q) => {
      this.updateLivePrice(q.symbol, q.bid, q.ask);
    });
  }

  private loadState(): MultiAccountPaperState {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }

    const initialAccounts: Record<string, AccountState> = {};
    for (const acc of DEFAULT_ACCOUNTS_DEF) {
      initialAccounts[acc.id] = {
        balance: acc.defaultBalance,
        positions: [],
        ordersHistory: [],
      };
    }

    return {
      activeAccountId: 'paper-universal',
      accounts: initialAccounts,
    };
  }

  private saveState(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  private getActiveAccountState(): AccountState {
    let acc = this.state.accounts[this.state.activeAccountId];
    if (!acc) {
      this.state.activeAccountId = 'paper-universal';
      acc = this.state.accounts['paper-universal'] || {
        balance: 50000,
        positions: [],
        ordersHistory: [],
      };
      this.state.accounts['paper-universal'] = acc;
    }
    return acc;
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
    return DEFAULT_ACCOUNTS_DEF.map((def) => {
      const accState = this.state.accounts[def.id] || { balance: def.defaultBalance, positions: [] };
      let unPnL = 0;
      for (const p of accState.positions || []) {
        unPnL += p.unrealizedPnL || 0;
      }
      const equity = accState.balance + unPnL;

      const symbol = def.currency === 'USDT' ? 'USDT' : '$';
      const balanceFormatted = `${symbol}${accState.balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

      return {
        id: def.id,
        handle: def.handle,
        brokerId: 'paper',
        accountNumber: def.accountNumber,
        name: def.name,
        environment: 'paper',
        currency: def.currency,
        balance: accState.balance,
        balanceFormatted,
        equity,
        tradingEnabled: true,
      };
    });
  }

  public async selectAccount(accountId: string): Promise<BrokerAccount> {
    const accounts = await this.getAccounts();
    const found = accounts.find((a) => a.id === accountId);
    if (!found) throw new Error(`Paper account ${accountId} not found`);
    this.state.activeAccountId = accountId;
    this.saveState();
    this.notifyPositions();
    return found;
  }

  public getActiveAccount(): BrokerAccount | null {
    const def =
      DEFAULT_ACCOUNTS_DEF.find((a) => a.id === this.state.activeAccountId) ||
      DEFAULT_ACCOUNTS_DEF[0];
    const accState = this.getActiveAccountState();

    let unPnL = 0;
    for (const p of accState.positions || []) {
      unPnL += p.unrealizedPnL || 0;
    }
    const equity = accState.balance + unPnL;
    const symbol = def.currency === 'USDT' ? 'USDT' : '$';

    return {
      id: def.id,
      handle: def.handle,
      brokerId: 'paper',
      accountNumber: def.accountNumber,
      name: def.name,
      environment: 'paper',
      currency: def.currency,
      balance: accState.balance,
      balanceFormatted: `${symbol}${accState.balance.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`,
      equity,
      tradingEnabled: true,
    };
  }

  public createDataProvider(_account: BrokerAccount): any {
    return this.dataProvider;
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    const cleanSym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const found = CATALOG_SYMBOLS.find((s) => s.ticker === cleanSym);

    if (found) {
      return {
        symbol: found.ticker,
        minVolume: found.minVolume,
        maxVolume: found.maxVolume,
        stepVolume: found.stepVolume,
        lotSize: found.lotSize,
        digits: found.digits,
        pipPosition: found.pipPosition,
        tickSize: 1 / Math.pow(10, found.digits),
      };
    }

    const isForex =
      cleanSym.length === 6 &&
      (cleanSym.endsWith('USD') || cleanSym.startsWith('EUR') || cleanSym.startsWith('GBP'));
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
    const sym = order.symbol.toUpperCase();
    const spec = await this.getSymbolSpec(sym);

    let quote = this.currentQuotes.get(sym);
    if (!quote || quote.bid <= 0) {
      const defaultP =
        order.price && order.price > 0
          ? order.price
          : sym.includes('JPY')
          ? 153.5
          : sym.length === 6 && (sym.endsWith('USD') || sym.startsWith('EUR'))
          ? 1.085
          : sym === 'XAUUSD'
          ? 2720.0
          : sym === 'USOIL'
          ? 71.5
          : sym === 'BTCUSD'
          ? 85000.0
          : 100.0;
      const spread = defaultP * 0.00015;
      quote = {
        bid: Number((defaultP - spread / 2).toFixed(spec.digits)),
        ask: Number((defaultP + spread / 2).toFixed(spec.digits)),
        time: Date.now(),
      };
      this.currentQuotes.set(sym, quote);
    }

    const fillPrice = order.side === 'buy' ? quote.ask : quote.bid;
    const orderId = `paper-ord-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const newPosition: Position = {
      id: `pos-${orderId}`,
      symbol: sym,
      side: order.side,
      volume: order.volume,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      unrealizedPnL: 0,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      openTime: Date.now(),
    };

    const accState = this.getActiveAccountState();
    accState.positions.push(newPosition);
    accState.ordersHistory.unshift({
      orderId,
      symbol: sym,
      side: order.side,
      type: order.type || 'market',
      volume: order.volume,
      fillPrice,
      stopLoss: order.stopLoss,
      takeProfit: order.takeProfit,
      time: Date.now(),
      status: 'FILLED',
      action: 'ENTRY',
    });

    this.saveState();
    this.notifyPositions();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('omni:order-placed', {
          detail: {
            orderId,
            symbol: sym,
            side: order.side,
            volume: order.volume,
            fillPrice,
            position: newPosition,
          },
        }),
      );
    }

    return {
      success: true,
      orderId,
      executionPrice: fillPrice,
      filledVolume: order.volume,
      message: `Paper ${order.side.toUpperCase()} order executed at ${fillPrice.toFixed(spec.digits)}`,
    };
  }

  public async modifyPosition(req: ModifyPositionRequest): Promise<void> {
    const accState = this.getActiveAccountState();
    const pos = accState.positions.find((p) => p.id === req.positionId);
    if (!pos) throw new Error(`Position ${req.positionId} not found`);

    if (req.stopLoss !== undefined) pos.stopLoss = req.stopLoss;
    if (req.takeProfit !== undefined) pos.takeProfit = req.takeProfit;

    this.saveState();
    this.notifyPositions();
  }

  public async closePosition(positionId: string, volume?: number): Promise<void> {
    const accState = this.getActiveAccountState();
    const idx = accState.positions.findIndex((p) => p.id === positionId);
    if (idx < 0) throw new Error(`Position ${positionId} not found`);

    const pos = accState.positions[idx];
    const spec = await this.getSymbolSpec(pos.symbol);
    const quote = this.currentQuotes.get(pos.symbol) || {
      bid: pos.currentPrice,
      ask: pos.currentPrice,
      time: Date.now(),
    };

    const closePrice = pos.side === 'buy' ? quote.bid : quote.ask;
    const pnlPoints = pos.side === 'buy' ? closePrice - pos.entryPrice : pos.entryPrice - closePrice;
    const closeVol = volume && volume < pos.volume ? volume : pos.volume;
    let realizedPnL = pnlPoints * closeVol * spec.lotSize;
    if (pos.symbol.endsWith('JPY') && closePrice > 0) {
      realizedPnL = realizedPnL / closePrice;
    }
    realizedPnL = Number(realizedPnL.toFixed(2));

    accState.balance += realizedPnL;

    accState.ordersHistory.unshift({
      orderId: `close-${pos.id}-${Date.now().toString(36)}`,
      symbol: pos.symbol,
      side: pos.side === 'buy' ? 'sell' : 'buy',
      type: 'market',
      volume: closeVol,
      fillPrice: closePrice,
      time: Date.now(),
      status: 'CLOSED',
      action: 'EXIT',
      realizedPnL,
    });

    if (volume && volume < pos.volume) {
      pos.volume -= volume;
    } else {
      accState.positions.splice(idx, 1);
    }

    this.saveState();
    this.notifyPositions();
  }

  public async closeAllPositions(): Promise<number> {
    const accState = this.getActiveAccountState();
    const positionsToClose = [...accState.positions];
    let count = 0;
    for (const p of positionsToClose) {
      await this.closePosition(p.id);
      count++;
    }
    return count;
  }

  public async getOrdersHistory(): Promise<any[]> {
    const accState = this.getActiveAccountState();
    return [...(accState.ordersHistory || [])];
  }

  public async getPositions(): Promise<Position[]> {
    const accState = this.getActiveAccountState();
    return [...accState.positions];
  }

  public onQuote(symbol: string, cb: (quote: { bid: number; ask: number; time: number }) => void): () => void {
    const sym = symbol.toUpperCase();
    if (!this.quoteSubscribers.has(sym)) {
      this.quoteSubscribers.set(sym, new Set());
    }
    this.quoteSubscribers.get(sym)!.add(cb);

    // If we have a cached quote, emit immediately
    const existing = this.currentQuotes.get(sym);
    if (existing) cb(existing);

    return () => {
      this.quoteSubscribers.get(sym)?.delete(cb);
    };
  }

  public onPositionChange(cb: (positions: Position[]) => void): () => void {
    this.positionSubscribers.add(cb);
    const accState = this.getActiveAccountState();
    cb(accState.positions);
    return () => {
      this.positionSubscribers.delete(cb);
    };
  }

  public updateLivePrice(symbol: string, bid: number, ask: number): void {
    const sym = symbol.toUpperCase();
    this.currentQuotes.set(sym, { bid, ask, time: Date.now() });

    const accState = this.getActiveAccountState();
    let changed = false;

    for (const pos of accState.positions) {
      if (pos.symbol === sym) {
        pos.currentPrice = pos.side === 'buy' ? bid : ask;
        const diff = pos.side === 'buy' ? pos.currentPrice - pos.entryPrice : pos.entryPrice - pos.currentPrice;
        const isJpy = sym.endsWith('JPY');
        const lotSize =
          sym.length === 6 && (sym.endsWith('USD') || sym.endsWith('JPY') || sym.startsWith('EUR'))
            ? 100000
            : sym === 'XAUUSD'
            ? 100
            : sym === 'USOIL'
            ? 1000
            : 1;
        let pnl = diff * pos.volume * lotSize;
        if (isJpy && pos.currentPrice > 0) {
          pnl = pnl / pos.currentPrice;
        }
        pos.unrealizedPnL = Number(pnl.toFixed(2));
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
    const accState = this.getActiveAccountState();
    for (const cb of this.positionSubscribers) {
      cb([...accState.positions]);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('omni:position-change', {
          detail: { positions: [...accState.positions] },
        }),
      );
    }
  }
}
