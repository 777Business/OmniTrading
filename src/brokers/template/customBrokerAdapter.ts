/**
 * OmniTrading - Custom Broker Adapter Template
 *
 * Use this template to build and integrate a new broker or exchange
 * (e.g. MetaTrader 5, Interactive Brokers, DXtrade, Bybit, etc.).
 *
 * Instructions:
 * 1. Implement the BrokerAdapter interface below.
 * 2. Register your adapter in `src/brokers/registry.ts`.
 * 3. The OmniTrading UI will automatically discover your adapter,
 *    render its credentials form, and handle account switching.
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
} from '../types';

export class CustomBrokerAdapter implements BrokerAdapter {
  public readonly id = 'mybroker';
  public readonly name = 'My Broker';
  public readonly description = 'Connects to My Broker API for market data and trading.';
  public readonly status = 'experimental';
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
    maxOrderVolume: 100,
  };

  public readonly credentialSchema: CredentialSchema = {
    authType: 'api-key', // 'api-key' | 'oauth' | 'none'
    fields: [
      {
        name: 'apiKey',
        label: 'API Key',
        type: 'text',
        required: true,
        placeholder: 'Enter your API key',
      },
      {
        name: 'apiSecret',
        label: 'API Secret',
        type: 'password',
        required: true,
        placeholder: 'Enter your API secret',
      },
    ],
    docsUrl: 'https://example.com/api-docs',
    instructions: 'Generate your API keys from your broker dashboard and paste them here.',
  };

  private connected = false;
  private activeAccount: BrokerAccount | null = null;

  public async connect(_credentials: Record<string, any>, _env: BrokerEnvironment): Promise<void> {
    // 1. Authenticate with broker API
    this.connected = true;
  }

  public async disconnect(): Promise<void> {
    this.connected = false;
    this.activeAccount = null;
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public async getAccounts(): Promise<BrokerAccount[]> {
    return [
      {
        id: 'acc-1',
        handle: 'mybroker-1',
        brokerId: this.id,
        accountNumber: '123456',
        name: 'My Demo Account',
        environment: 'demo',
        currency: 'USD',
        balance: 10000,
        tradingEnabled: true,
      },
    ];
  }

  public async selectAccount(accountId: string): Promise<BrokerAccount> {
    const accs = await this.getAccounts();
    const found = accs.find((a) => a.id === accountId);
    if (!found) throw new Error('Account not found');
    this.activeAccount = found;
    return found;
  }

  public getActiveAccount(): BrokerAccount | null {
    return this.activeAccount;
  }

  public createDataProvider(_account: BrokerAccount): any {
    // Return a Vela DataProvider implementation
    return null;
  }

  public async getSymbolSpec(symbol: string): Promise<SymbolSpec> {
    return {
      symbol,
      minVolume: 0.01,
      maxVolume: 100,
      stepVolume: 0.01,
      lotSize: 100000,
      digits: 5,
      pipPosition: 4,
      tickSize: 0.00001,
    };
  }

  public async placeOrder(order: OrderRequest): Promise<OrderResult> {
    return {
      success: true,
      orderId: `ord-${Date.now()}`,
      executionPrice: order.price || 1.0,
      filledVolume: order.volume,
    };
  }

  public async modifyPosition(_req: ModifyPositionRequest): Promise<void> {
    // Update SL/TP with broker
  }

  public async closePosition(_positionId: string, _volume?: number): Promise<void> {
    // Send close position request to broker
  }

  public async getPositions(): Promise<Position[]> {
    return [];
  }
}
