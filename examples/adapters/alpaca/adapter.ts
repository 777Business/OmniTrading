/**
 * OmniTrading - Alpaca Broker Adapter (Template Example - Not Functional)
 *
 * Demonstrates an API Key credential schema for US stock brokers.
 * Provided for developer reference only; not functional for trading.
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
  BrokerEnvironment,
} from '../../../src/brokers/types';

export class AlpacaPaperAdapter implements BrokerAdapter {
  public readonly id = 'alpaca';
  public readonly name = 'Alpaca (Template Example)';
  public readonly description = 'Template adapter example (not functional for live trading). Reference implementation only.';
  public readonly status = 'experimental';
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
    maxOrderVolume: 10000,
  };

  public readonly credentialSchema: CredentialSchema = {
    authType: 'api-key',
    fields: [
      {
        name: 'apiKeyId',
        label: 'Paper API Key ID',
        type: 'text',
        required: true,
        placeholder: 'PK...',
        helpText: 'Generated in your Alpaca dashboard under Paper Trading.',
      },
      {
        name: 'secretKey',
        label: 'Paper Secret Key',
        type: 'password',
        required: true,
        placeholder: 'Alpaca Paper Secret Key',
        helpText: 'Stored only on your local device. Restricted to Paper sandbox.',
      },
    ],
    docsUrl: 'https://docs.alpaca.markets/',
    instructions:
      'Log into your Alpaca account, toggle to "Paper Trading" mode, and generate an API key pair.',
  };

  private connected = false;
  private apiKeyId = '';
  private secretKey = '';
  private positions: Position[] = [];

  public async connect(credentials: Record<string, any>, _env: BrokerEnvironment): Promise<void> {
    if (!credentials.apiKeyId) throw new Error('Alpaca API Key ID is required');
    this.apiKeyId = credentials.apiKeyId;
    this.secretKey = credentials.secretKey || '';
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.apiKeyId = '';
    this.secretKey = '';
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async getAccounts(): Promise<BrokerAccount[]> {
    return [
      {
        id: 'alpaca-paper-account',
        handle: 'alpaca-paper-handle',
        brokerId: 'alpaca',
        accountNumber: 'ALPACA-PAPER-01',
        name: 'Alpaca Paper Trading',
        environment: 'paper',
        currency: 'USD',
        balance: 100000,
        balanceFormatted: '$100,000.00',
        equity: 100000,
        tradingEnabled: true,
      },
    ];
  }

  public async selectAccount(_accountId: string): Promise<BrokerAccount> {
    const accs = await this.getAccounts();
    return accs[0];
  }

  public getActiveAccount(): BrokerAccount | null {
    if (!this.connected) return null;
    return {
      id: 'alpaca-paper-account',
      handle: 'alpaca-paper-handle',
      brokerId: 'alpaca',
      accountNumber: 'ALPACA-PAPER-01',
      name: 'Alpaca Paper Trading',
      environment: 'paper',
      currency: 'USD',
      balance: 100000,
      balanceFormatted: '$100,000.00',
      equity: 100000,
      tradingEnabled: true,
    };
  }

  public createDataProvider(_account: BrokerAccount): any {
    // Returns data provider for US stocks
    return null;
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    return {
      symbol: symbol.toUpperCase(),
      minVolume: 1,
      maxVolume: 10000,
      stepVolume: 1,
      lotSize: 1,
      digits: 2,
      pipPosition: 2,
      tickSize: 0.01,
    };
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.connected) throw new Error('Alpaca Paper adapter is not connected.');

    const orderId = `alpaca-ord-${Date.now()}`;
    const fillPrice = order.price || 150.0;

    this.positions.push({
      id: orderId,
      symbol: order.symbol.toUpperCase(),
      side: order.side,
      volume: order.volume,
      entryPrice: fillPrice,
      currentPrice: fillPrice,
      unrealizedPnL: 0,
      openTime: Date.now(),
    });

    return {
      success: true,
      orderId,
      executionPrice: fillPrice,
      filledVolume: order.volume,
      message: `Alpaca Paper ${order.side.toUpperCase()} order placed`,
    };
  }

  public async closePosition(positionId: string): Promise<void> {
    const idx = this.positions.findIndex((p) => p.id === positionId);
    if (idx >= 0) this.positions.splice(idx, 1);
  }

  public async getPositions(): Promise<Position[]> {
    return [...this.positions];
  }
}
