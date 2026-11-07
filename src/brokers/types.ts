/**
 * OmniTrading - Universal Broker Adapter Architecture
 *
 * Defines the standard interface for connecting brokers, exchanges,
 * and data providers to the OmniTrading platform.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

export type BrokerEnvironment = 'paper' | 'demo' | 'live';
export type OrderType = 'market' | 'limit' | 'stop';
export type OrderSide = 'buy' | 'sell';

export interface CredentialField {
  name: string;
  label: string;
  type: 'text' | 'password' | 'select' | 'checkbox';
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: Array<{ label: string; value: string }>;
  defaultValue?: string | boolean | number;
}

export interface CredentialSchema {
  authType: 'oauth' | 'api-key' | 'none';
  fields: CredentialField[];
  oauthUrl?: string;
  oauthRedirectUri?: string;
  docsUrl?: string;
  instructions?: string;
}

export interface BrokerAccount {
  id: string;
  handle: string;
  brokerId: string;
  accountNumber: string | number;
  name: string;
  environment: BrokerEnvironment;
  currency: string;
  balance: number;
  balanceFormatted?: string;
  equity?: number;
  margin?: number;
  freeMargin?: number;
  tradingEnabled: boolean; // For LIVE accounts, starts disabled until explicitly enabled by user
}

export interface SymbolSpec {
  symbol: string;
  baseAsset?: string;
  quoteAsset?: string;
  minVolume: number;
  maxVolume: number;
  stepVolume: number;
  lotSize: number; // e.g. 100,000 for standard forex, 1 for spot crypto
  digits: number; // decimal places for price
  pipPosition: number; // e.g. 4 for EURUSD (0.0001), 2 for USDJPY (0.01)
  tickSize: number;
}

export interface OrderRequest {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  volume: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
  comment?: string;
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  executionPrice?: number;
  filledVolume?: number;
  message?: string;
  error?: string;
}

export interface Position {
  id: string;
  symbol: string;
  side: OrderSide;
  volume: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  stopLoss?: number;
  takeProfit?: number;
  openTime: number;
}

export interface ModifyPositionRequest {
  positionId: string;
  stopLoss?: number;
  takeProfit?: number;
}

export interface BrokerCapabilities {
  supportsMarketOrders: boolean;
  supportsLimitOrders: boolean;
  supportsStopOrders: boolean;
  supportsStopLoss: boolean;
  supportsTakeProfit: boolean;
  supportsPartialClose?: boolean;
  supportsHistoricalBars: boolean;
  supportsLiveTicks: boolean;
  maxOrderVolume?: number;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly status: 'stable' | 'experimental';
  readonly capabilities: BrokerCapabilities;
  readonly credentialSchema: CredentialSchema;
  readonly supportedEnvironments: BrokerEnvironment[];

  connect(credentials: Record<string, any>, env: BrokerEnvironment): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  getAccounts(): Promise<BrokerAccount[]>;
  selectAccount(accountId: string): Promise<BrokerAccount>;
  getActiveAccount(): BrokerAccount | null;

  createDataProvider(account: BrokerAccount): any;
  getSymbolSpec(symbol: string): Promise<SymbolSpec>;

  placeOrder?(order: OrderRequest): Promise<OrderResult>;
  modifyPosition?(req: ModifyPositionRequest): Promise<void>;
  closePosition?(positionId: string, volume?: number): Promise<void>;
  closeAllPositions?(): Promise<void>;
  getPositions?(): Promise<Position[]>;
  getOrdersHistory?(): Promise<any[]>;

  onQuote?(symbol: string, cb: (quote: { bid: number; ask: number; time: number }) => void): () => void;
  onPositionChange?(cb: (positions: Position[]) => void): () => void;
}
