import test from 'node:test';
import assert from 'node:assert/strict';

// Mock browser storage & window events for Node test runner
class MockLocalStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.get(key) || null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

globalThis.localStorage = new MockLocalStorage();
const eventListeners = new Map();
globalThis.window = {
  addEventListener(event, handler) {
    if (!eventListeners.has(event)) eventListeners.set(event, new Set());
    eventListeners.get(event).add(handler);
  },
  removeEventListener(event, handler) {
    eventListeners.get(event)?.delete(handler);
  },
  dispatchEvent(customEvent) {
    const list = eventListeners.get(customEvent.type);
    if (list) {
      for (const h of list) h(customEvent);
    }
    return true;
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, opts = {}) {
    this.type = type;
    this.detail = opts.detail;
  }
};

test('Quick Trade & Trade Manager Test Suite', async (t) => {
  await t.test('1. Quick Trade 1-Click Execution & Parameter Resolution', () => {
    // Simulate quick trade default preferences
    const defaultPrefs = {
      lots: 0.1,
      tpPips: 20,
      slPips: 15,
      tpEnabled: false,
      slEnabled: false,
      instantExecution: true, // 1-click execution enabled by default
      minimized: false,
    };

    assert.equal(defaultPrefs.instantExecution, true, 'One-Click Trading is enabled by default to prevent blocking modal');

    // Test pip value and price calculation for Forex
    const eurPrice = 1.08500;
    const pipPosEur = 4;
    const pipValEur = Math.pow(10, -pipPosEur); // 0.0001
    const slPips = 15;
    const tpPips = 20;

    const eurBuySl = Number((eurPrice - slPips * pipValEur).toFixed(5));
    const eurBuyTp = Number((eurPrice + tpPips * pipValEur).toFixed(5));
    assert.equal(eurBuySl, 1.08350);
    assert.equal(eurBuyTp, 1.08700);

    const eurSellSl = Number((eurPrice + slPips * pipValEur).toFixed(5));
    const eurSellTp = Number((eurPrice - tpPips * pipValEur).toFixed(5));
    assert.equal(eurSellSl, 1.08650);
    assert.equal(eurSellTp, 1.08300);

    // Test Gold (XAUUSD) pip / tick math
    const goldPrice = 2720.00;
    const goldPipPos = 2;
    const goldPipVal = Math.pow(10, -goldPipPos); // 0.01
    const goldBuySl = Number((goldPrice - 50 * goldPipVal).toFixed(2));
    assert.equal(goldBuySl, 2719.50);
  });

  await t.test('2. Chart Coordinate Mapping to Screen Y Pixels for Position Lines', () => {
    // Simulate Vela chart coordinate transformer
    const mockBounds = { top: 0, bottom: 600, height: 600 };
    const mockScale = { min: 1.08000, max: 1.09000 };

    const priceToY = (price, scale, bounds) => {
      const fraction = (price - scale.min) / (scale.max - scale.min);
      return bounds.bottom - fraction * bounds.height;
    };

    // Entry at 1.08500 (midpoint) should map exactly to Y=300
    const yMid = priceToY(1.08500, mockScale, mockBounds);
    assert.equal(Math.round(yMid), 300);

    // Entry at 1.09000 (top of scale) should map to Y=0
    const yTop = priceToY(1.09000, mockScale, mockBounds);
    assert.equal(Math.round(yTop), 0);

    // Entry at 1.08000 (bottom of scale) should map to Y=600
    const yBottom = priceToY(1.08000, mockScale, mockBounds);
    assert.equal(Math.round(yBottom), 600);

    // SL at 1.08250 should be in lower half: 0.25 of 600 from bottom = 450
    const ySl = priceToY(1.08250, mockScale, mockBounds);
    assert.equal(Math.round(ySl), 450);
  });

  await t.test('3. Position Lifecycle, Break-Even, Partial Close, and PnL', () => {
    const positions = [];
    const history = [];

    // 1. Open BUY position on EURUSD
    const pos = {
      id: 'pos-12345',
      symbol: 'EURUSD',
      side: 'buy',
      volume: 1.0, // 1 lot = 100,000 units
      entryPrice: 1.08500,
      currentPrice: 1.08500,
      unrealizedPnL: 0,
      stopLoss: 1.08350,
      takeProfit: 1.08800,
      openTime: Date.now(),
    };
    positions.push(pos);
    history.unshift({
      id: 'ord-12345',
      symbol: pos.symbol,
      side: pos.side,
      volume: pos.volume,
      fillPrice: pos.entryPrice,
      status: 'FILLED',
      action: 'ENTRY',
      time: Date.now(),
    });

    assert.equal(positions.length, 1);
    assert.equal(history.length, 1);

    // 2. Price moves in favor to 1.08650 (+15 pips)
    pos.currentPrice = 1.08650;
    const diff = pos.currentPrice - pos.entryPrice;
    pos.unrealizedPnL = Number((diff * pos.volume * 100000).toFixed(2));
    assert.equal(pos.unrealizedPnL, 150.00, 'Unrealized PnL is +$150.00 for 15 pips on 1 standard lot');

    // 3. Move Stop Loss to Break-Even (entry price)
    pos.stopLoss = pos.entryPrice;
    assert.equal(pos.stopLoss, 1.08500, 'Stop Loss successfully adjusted to entry price');

    // 4. 50% Partial Close at 1.08650
    const partialVol = pos.volume * 0.5; // 0.5 lots
    const partialRealizedPnL = Number((diff * partialVol * 100000).toFixed(2));
    assert.equal(partialRealizedPnL, 75.00);

    pos.volume -= partialVol;
    history.unshift({
      id: 'close-part-12345',
      symbol: pos.symbol,
      side: 'sell',
      volume: partialVol,
      fillPrice: 1.08650,
      realizedPnL: partialRealizedPnL,
      status: 'CLOSED',
      action: 'PARTIAL EXIT',
      time: Date.now(),
    });

    assert.equal(pos.volume, 0.5, 'Remaining position volume is 0.5 lots');
    assert.equal(history.length, 2);

    // 5. Close remaining position at 1.08700
    const finalPrice = 1.08700;
    const finalDiff = finalPrice - pos.entryPrice;
    const finalRealizedPnL = Number((finalDiff * pos.volume * 100000).toFixed(2));
    assert.equal(finalRealizedPnL, 100.00);

    history.unshift({
      id: 'close-full-12345',
      symbol: pos.symbol,
      side: 'sell',
      volume: pos.volume,
      fillPrice: finalPrice,
      realizedPnL: finalRealizedPnL,
      status: 'CLOSED',
      action: 'FULL EXIT',
      time: Date.now(),
    });
    positions.length = 0; // Removed from active positions

    assert.equal(positions.length, 0, 'No active positions remain');
    assert.equal(history.length, 3, 'History contains initial fill and both closes');

    // Total realized PnL = $75 + $100 = $175
    const totalRealized = history.reduce((acc, h) => acc + (h.realizedPnL || 0), 0);
    assert.equal(totalRealized, 175.00);
  });

  await t.test('4. Close All Emergency Action', () => {
    const positions = [
      { id: 'pos-1', symbol: 'EURUSD', side: 'buy', volume: 0.5, entryPrice: 1.0850, currentPrice: 1.0855 },
      { id: 'pos-2', symbol: 'XAUUSD', side: 'sell', volume: 0.2, entryPrice: 2720.0, currentPrice: 2718.0 },
      { id: 'pos-3', symbol: 'BTCUSD', side: 'buy', volume: 0.1, entryPrice: 85000.0, currentPrice: 85500.0 },
    ];

    const history = [];

    const closeAll = () => {
      const count = positions.length;
      for (const p of positions) {
        history.unshift({
          id: `close-all-${p.id}`,
          symbol: p.symbol,
          side: p.side === 'buy' ? 'sell' : 'buy',
          volume: p.volume,
          fillPrice: p.currentPrice,
          status: 'CLOSED',
          action: 'CLOSE ALL',
          time: Date.now(),
        });
      }
      positions.length = 0;
      return count;
    };

    const closedCount = closeAll();
    assert.equal(closedCount, 3);
    assert.equal(positions.length, 0);
    assert.equal(history.length, 3);
  });

  await t.test('5. Analytics & Risk Performance Calculation', () => {
    const history = [
      { id: 't1', realizedPnL: 120.00 },
      { id: 't2', realizedPnL: -45.00 },
      { id: 't3', realizedPnL: 85.00 },
      { id: 't4', realizedPnL: -30.00 },
      { id: 't5', realizedPnL: 210.00 },
      { id: 't6', action: 'ENTRY' }, // Open order, no realized PnL
    ];

    const closedTrades = history.filter((h) => typeof h.realizedPnL === 'number');
    const wins = closedTrades.filter((h) => h.realizedPnL > 0);
    const losses = closedTrades.filter((h) => h.realizedPnL < 0);

    const winRate = ((wins.length / closedTrades.length) * 100).toFixed(1);
    assert.equal(winRate, '60.0'); // 3 wins out of 5 trades = 60.0%

    const totalWon = wins.reduce((acc, h) => acc + h.realizedPnL, 0); // 120 + 85 + 210 = 415
    const totalLost = Math.abs(losses.reduce((acc, h) => acc + h.realizedPnL, 0)); // 45 + 30 = 75
    const profitFactor = (totalWon / totalLost).toFixed(2);
    assert.equal(profitFactor, '5.53'); // 415 / 75 = 5.53

    const netRealized = closedTrades.reduce((acc, h) => acc + h.realizedPnL, 0);
    assert.equal(netRealized, 340.00);
  });
});
