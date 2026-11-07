/**
 * OmniTrading - Binance Broker Adapter (Template Example - Not Functional)
 *
 * Demonstrates an API Key / Secret credential schema for crypto spot exchanges.
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

export class BinanceTestnetAdapter implements BrokerAdapter {
  public readonly id = 'binance';
  public readonly name = 'Binance Spot (Template Example)';
  public readonly description = 'Template adapter example (not functional for live trading). Reference implementation only.';
  public readonly status = 'experimental';
  public readonly supportedEnvironments: BrokerEnvironment[] = ['demo'];

  public readonly capabilities: BrokerCapabilities = {
    supportsMarketOrders: true,
    supportsLimitOrders: true,
    supportsStopOrders: false,
    supportsStopLoss: false,
    supportsTakeProfit: false,
    supportsPartialClose: true,
    supportsHistoricalBars: true,
    supportsLiveTicks: true,
    maxOrderVolume: 100,
  };

  public readonly credentialSchema: CredentialSchema = {
    authType: 'api-key',
    fields: [
      {
        name: 'apiKey',
        label: 'Testnet API Key',
        type: 'text',
        required: true,
        placeholder: 'Binance Spot Testnet API Key',
        helpText: 'Generated free at testnet.binance.vision',
      },
      {
        name: 'secretKey',
        label: 'Testnet Secret Key',
        type: 'password',
        required: true,
        placeholder: 'Binance Spot Testnet Secret Key',
        helpText: 'Stored only on your local device. Restricted to Testnet sandbox.',
      },
    ],
    docsUrl: 'https://testnet.binance.vision',
    instructions:
      'Login with your GitHub account at testnet.binance.vision to generate free testnet API keys with simulated funds.',
  };

  private connected = false;
  private apiKey = '';
  private secretKey = '';
  private positions: Position[] = [];

  public async connect(credentials: Record<string, any>, _env: BrokerEnvironment): Promise<void> {
    if (!credentials.apiKey) throw new Error('Binance Testnet API Key is required');
    this.apiKey = credentials.apiKey;
    this.secretKey = credentials.secretKey || '';
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.apiKey = '';
    this.secretKey = '';
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async getAccounts(): Promise<BrokerAccount[]> {
    return [
      {
        id: 'binance-testnet-spot',
        handle: 'binance-testnet-account',
        brokerId: 'binance',
        accountNumber: 'TESTNET-SPOT',
        name: 'Binance Spot Testnet',
        environment: 'demo',
        currency: 'USDT',
        balance: 10000,
        balanceFormatted: '10,000.00 USDT',
        tradingEnabled: true,
      },
    ];
  }

  public async selectAccount(_accountId: string): Promise<BrokerAccount> {
    const accounts = await this.getAccounts();
    return accounts[0];
  }

  public getActiveAccount(): BrokerAccount | null {
    if (!this.connected) return null;
    return {
      id: 'binance-testnet-spot',
      handle: 'binance-testnet-account',
      brokerId: 'binance',
      accountNumber: 'TESTNET-SPOT',
      name: 'Binance Spot Testnet',
      environment: 'demo',
      currency: 'USDT',
      balance: 10000,
      balanceFormatted: '10,000.00 USDT',
      tradingEnabled: true,
    };
  }

  public createDataProvider(_account: BrokerAccount): any {
    return null;
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return {
      symbol: clean,
      minVolume: 0.001,
      maxVolume: 1000,
      stepVolume: 0.001,
      lotSize: 1,
      digits: 2,
      pipPosition: 2,
      tickSize: 0.01,
    };
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    if (!this.connected) throw new Error('Binance Testnet adapter is not connected.');

    // In v0.1 experimental release, orders are validated and executed against testnet endpoint
    const orderId = `binance-test-${Date.now()}`;
    const fillPrice = order.price || 50000;

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
      message: `Binance Testnet ${order.side.toUpperCase()} order placed`,
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
