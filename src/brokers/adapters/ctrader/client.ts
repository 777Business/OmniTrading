/**
 * Browser-side cTrader client.
 *
 * The browser never talks to cTrader directly and never receives the app
 * client secret or the cTrader access token. It connects to the local Vela
 * helper's restricted proxy, which performs app/account authentication and
 * forwards only read-only market-data messages.
 *
 * Protocol: JSON frames `{ clientMsgId, payloadType, payload }` over
 * `ws://127.0.0.1:<port>/ctrader?account=<opaque handle>`.
 */

export type CtEnvironment = 'demo' | 'live';

export interface CtLightSymbol {
  symbolId: number;
  symbolName?: string;
  description?: string;
  enabled?: boolean;
  baseAssetId?: number;
  quoteAssetId?: number;
  symbolCategoryId?: number;
  sortingNumber?: number;
}

export interface CtSymbol {
  symbolId: number;
  digits?: number;
  pipPosition?: number;
  lotSize?: number;
  minVolume?: number;
  stepVolume?: number;
  maxVolume?: number;
  tradingMode?: number;
}

export interface CtTrendbar {
  volume?: number;
  period?: number;
  low?: number;
  deltaOpen?: number;
  deltaClose?: number;
  deltaHigh?: number;
  utcTimestampInMinutes?: number;
}

export interface CtEnvelope {
  payloadType: number;
  payload?: Record<string, unknown>;
  clientMsgId?: string;
}

export interface CtCloseInfo {
  code: number;
  reason: string;
  local: boolean;
}

interface Pending {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: number;
}

const HEARTBEAT_MS = 10_000;
const REQUEST_TIMEOUT_MS = 25_000;

export class CtClient {
  private ws: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<string, Pending>();
  private listeners = new Set<(msg: CtEnvelope) => void>();
  private closeListeners = new Set<(info: CtCloseInfo) => void>();
  private heartbeat: number | null = null;
  private localClose = false;
  private requestQueue: Array<() => void> = [];
  private requestDraining = false;
  private lastRequestTime = 0;
  private readonly MIN_REQUEST_INTERVAL_MS = 200;

  /**
   * Connect through the local helper. Resolves only after the helper has
   * authenticated the cTrader app and the selected account upstream.
   */
  async connectProxy(handle: string): Promise<void> {
    const url = new URL('/ctrader', window.location.href);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('account', handle);

    const ws = new WebSocket(url);
    this.ws = ws;
    this.localClose = false;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = window.setTimeout(() => {
        finish(new Error('Timed out waiting for the cTrader connection'));
      }, REQUEST_TIMEOUT_MS);

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        if (error) {
          try {
            ws.close();
          } catch {
            /* ignore */
          }
          reject(error);
        } else {
          resolve();
        }
      };

      ws.onmessage = (event) => {
        let message: CtEnvelope;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }
        if (message.payloadType !== -2) return;
        if (message.payload?.ready) {
          finish();
        } else {
          finish(new Error(String(message.payload?.error || 'cTrader authentication failed')));
        }
      };
      ws.onerror = () => {
        finish(new Error('Could not connect to the local cTrader service'));
      };
      ws.onclose = (event) => {
        this.failAll(new Error(`cTrader connection closed (${event.code})`));
        finish(new Error(event.reason || `cTrader connection closed (${event.code})`));
      };
    });

    ws.onmessage = (event) => this.onMessage(event.data);
    ws.onerror = () => {
      /* surfaced through close / request timeouts */
    };
    ws.onclose = (event) => {
      this.stopHeartbeat();
      this.failAll(new Error(`cTrader connection closed (${event.code})`));
      this.emit({ payloadType: -1, payload: { reason: event.reason || 'closed' } });
      if (!this.localClose) {
        this.emitClose({
          code: event.code,
          reason: event.reason || 'cTrader connection closed',
          local: false,
        });
      }
    };

    this.startHeartbeat();
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  onEvent(listener: (msg: CtEnvelope) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onClose(listener: (info: CtCloseInfo) => void): () => void {
    this.closeListeners.add(listener);
    return () => this.closeListeners.delete(listener);
  }

  close(): void {
    this.localClose = true;
    this.stopHeartbeat();
    this.failAll(new Error('Disconnected'));
    try {
      this.ws?.close(1000, 'client closed');
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  // ---- read-only market data --------------------------------------------

  async symbols(accountId = 0): Promise<CtLightSymbol[]> {
    const payload = await this.request(2114, {
      ctidTraderAccountId: accountId,
    });
    return ((payload.symbol as CtLightSymbol[] | undefined) ?? []).filter(
      (symbol) => symbol.enabled !== false,
    );
  }

  async symbolsById(accountId: number, symbolIds: number[]): Promise<CtSymbol[]> {
    const payload = await this.request(2116, {
      ctidTraderAccountId: accountId,
      symbolId: symbolIds,
    });
    return (payload.symbol as CtSymbol[] | undefined) ?? [];
  }

  async trendbars(
    accountId: number,
    options: {
      symbolId: number;
      period: number;
      from?: number;
      to: number;
      count: number;
    },
  ): Promise<{ trendbar: CtTrendbar[]; hasMore?: boolean }> {
    const payload = await this.request(2137, {
      ctidTraderAccountId: accountId,
      symbolId: options.symbolId,
      period: options.period,
      ...(options.from != null ? { fromTimestamp: Math.floor(options.from) } : {}),
      toTimestamp: Math.floor(options.to),
      count: options.count,
    });
    return {
      trendbar: (payload.trendbar as CtTrendbar[] | undefined) ?? [],
      hasMore: payload.hasMore as boolean | undefined,
    };
  }

  async subscribeSpots(accountId: number, symbolId: number): Promise<void> {
    await this.request(2127, {
      ctidTraderAccountId: accountId,
      symbolId: [symbolId],
      subscribeToSpotTimestamp: true,
    });
  }

  async unsubscribeSpots(accountId: number, symbolId: number): Promise<void> {
    await this.request(2129, {
      ctidTraderAccountId: accountId,
      symbolId: [symbolId],
    });
  }

  async subscribeTrendbar(accountId: number, symbolId: number, period: number): Promise<void> {
    await this.request(2135, {
      ctidTraderAccountId: accountId,
      symbolId,
      period,
    });
  }

  async unsubscribeTrendbar(accountId: number, symbolId: number, period: number): Promise<void> {
    await this.request(2136, {
      ctidTraderAccountId: accountId,
      symbolId,
      period,
    });
  }

  // ---- live trading execution --------------------------------------------

  async newOrder(options: {
    accountId?: number;
    symbolId: number;
    tradeSide: 'buy' | 'sell';
    volume: number;
    stopLoss?: number;
    takeProfit?: number;
    comment?: string;
  }): Promise<Record<string, unknown>> {
    const payload: Record<string, unknown> = {
      ctidTraderAccountId: options.accountId ?? 0,
      symbolId: options.symbolId,
      orderType: 1, // MARKET
      tradeSide: options.tradeSide === 'buy' ? 1 : 2,
      volume: options.volume,
      comment: options.comment || 'Vela Quick Trade',
    };
    if (options.stopLoss && options.stopLoss > 0) {
      payload.stopLoss = options.stopLoss;
    }
    if (options.takeProfit && options.takeProfit > 0) {
      payload.takeProfit = options.takeProfit;
    }
    return this.request(2106, payload);
  }

  async getTrader(accountId = 0): Promise<Record<string, unknown>> {
    return this.request(2121, { ctidTraderAccountId: accountId });
  }

  async getPositions(accountId = 0): Promise<Record<string, unknown>> {
    return this.request(2124, { ctidTraderAccountId: accountId });
  }

  async closePosition(options: {
    accountId?: number;
    positionId: number;
    volume: number;
  }): Promise<Record<string, unknown>> {
    return this.request(2125, {
      ctidTraderAccountId: options.accountId ?? 0,
      positionId: options.positionId,
      volume: options.volume,
    });
  }

  // ---- transport --------------------------------------------------------

  private async processRequestQueue(): Promise<void> {
    if (this.requestDraining) return;
    this.requestDraining = true;

    while (this.requestQueue.length > 0) {
      const task = this.requestQueue.shift();
      if (!task) break;

      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < this.MIN_REQUEST_INTERVAL_MS) {
        await new Promise((r) => setTimeout(r, this.MIN_REQUEST_INTERVAL_MS - elapsed));
      }
      this.lastRequestTime = Date.now();
      task();
    }

    this.requestDraining = false;
  }

  private request(
    payloadType: number,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('cTrader is not connected'));
    }

    const clientMsgId = `vela-${Date.now()}-${++this.seq}`;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(clientMsgId);
        reject(new Error(`cTrader request timed out (payload ${payloadType})`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(clientMsgId, { resolve, reject, timer });

      this.requestQueue.push(() => {
        try {
          if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            window.clearTimeout(timer);
            this.pending.delete(clientMsgId);
            reject(new Error('cTrader connection lost before request was sent'));
            return;
          }
          this.ws.send(JSON.stringify({ clientMsgId, payloadType, payload }));
        } catch (error) {
          window.clearTimeout(timer);
          this.pending.delete(clientMsgId);
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });

      void this.processRequestQueue();
    });
  }

  private onMessage(data: unknown): void {
    let message: CtEnvelope;
    try {
      message = typeof data === 'string' ? JSON.parse(data) : JSON.parse(String(data));
    } catch {
      return;
    }

    if (message.payloadType === -2) {
      // A ready/fatal frame from the helper.
      if (message.payload?.ready === false) {
        this.emit(message);
      }
      return;
    }

    if (message.payloadType === 2142 || message.payloadType === 50) {
      const payload = message.payload ?? {};
      const desc = String(payload.description || '');
      const code = String(payload.errorCode || '');
      if (code === 'BLOCKED_PAYLOAD_TYPE' || desc.includes('rate limited')) {
        this.lastRequestTime = Date.now() + 1200;
      }
      const error = new Error(
        [payload.errorCode, payload.description].filter(Boolean).join(': ') ||
          'cTrader error',
      );
      if (message.clientMsgId && this.pending.has(message.clientMsgId)) {
        this.settle(message.clientMsgId, undefined, error);
      }
      this.emit(message);
      return;
    }

    if (message.clientMsgId && this.pending.has(message.clientMsgId)) {
      this.settle(message.clientMsgId, message.payload ?? {});
      return;
    }

    this.emit(message);
  }

  private settle(
    clientMsgId: string,
    payload?: Record<string, unknown>,
    error?: Error,
  ): void {
    const pending = this.pending.get(clientMsgId);
    if (!pending) return;
    this.pending.delete(clientMsgId);
    window.clearTimeout(pending.timer);
    if (error) pending.reject(error);
    else pending.resolve(payload ?? {});
  }

  private failAll(error: Error): void {
    this.requestQueue = [];
    for (const [id, pending] of this.pending) {
      window.clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private emit(message: CtEnvelope): void {
    for (const listener of this.listeners) {
      try {
        listener(message);
      } catch (err) {
        console.error('[ctrader] listener failed', err);
      }
    }
  }

  private emitClose(info: CtCloseInfo): void {
    for (const listener of this.closeListeners) {
      try {
        listener(info);
      } catch (err) {
        console.error('[ctrader] close listener failed', err);
      }
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const beat = () => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ payloadType: 51, payload: {} }));
        } catch {
          /* ignore */
        }
      }
    };
    this.heartbeat = window.setInterval(beat, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat != null) {
      window.clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }
}
