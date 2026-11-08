import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Order Flow, Footprint, Heatmap & Quad Layout Test Suite', () => {
  it('1. Tick Interval Parser & Aggregator Math', () => {
    const isTick = (tf) => String(tf || '').toUpperCase().endsWith('T');
    const parseTicks = (tf) => {
      const match = String(tf).match(/^(\d+)T$/i);
      return match ? parseInt(match[1], 10) : 0;
    };

    assert.equal(isTick('100T'), true);
    assert.equal(isTick('500t'), true);
    assert.equal(isTick('1000T'), true);
    assert.equal(isTick('15m'), false);
    assert.equal(isTick('1D'), false);

    assert.equal(parseTicks('100T'), 100);
    assert.equal(parseTicks('250T'), 250);
    assert.equal(parseTicks('500T'), 500);
    assert.equal(parseTicks('1000T'), 1000);
    assert.equal(parseTicks('2000T'), 2000);
    assert.equal(parseTicks('invalid'), 0);
  });

  it('2. Tick Bar Trade Aggregation Logic', () => {
    // Simulating TickAggregator batching
    const targetCount = 5;
    let completedBars = [];
    let curBar = null;

    const processTrade = (price, volume, time) => {
      if (!curBar) {
        curBar = { open: price, high: price, low: price, close: price, volume, tickCount: 1, time };
      } else {
        curBar.high = Math.max(curBar.high, price);
        curBar.low = Math.min(curBar.low, price);
        curBar.close = price;
        curBar.volume += volume;
        curBar.tickCount += 1;

        if (curBar.tickCount >= targetCount) {
          completedBars.push({ ...curBar });
          curBar = null;
        }
      }
    };

    // Feed 12 trades
    const prices = [100, 102, 99, 103, 101, 105, 104, 106, 108, 107, 110, 109];
    prices.forEach((p, i) => processTrade(p, 10, 1000 + i));

    assert.equal(completedBars.length, 2, 'Should have completed exactly 2 5-tick bars');
    assert.equal(completedBars[0].open, 100);
    assert.equal(completedBars[0].high, 103);
    assert.equal(completedBars[0].low, 99);
    assert.equal(completedBars[0].close, 101);
    assert.equal(completedBars[0].volume, 50);

    assert.equal(completedBars[1].open, 105);
    assert.equal(completedBars[1].high, 108);
    assert.equal(completedBars[1].low, 104);
    assert.equal(completedBars[1].close, 107);
    assert.equal(completedBars[1].volume, 50);

    assert.ok(curBar, 'Current bar should hold the remaining 2 trades');
    assert.equal(curBar.tickCount, 2);
    assert.equal(curBar.open, 110);
    assert.equal(curBar.close, 109);
  });

  it('3. Footprint Diagonal Imbalance Detection & Bar Statistics', () => {
    // Simulate diagonal imbalance calculation
    const levels = [
      { price: 100, bidVolume: 10, askVolume: 5 },
      { price: 101, bidVolume: 15, askVolume: 60 }, // Ask (60) vs lower bid (10) = 6x ratio -> Buy Imbalance!
      { price: 102, bidVolume: 80, askVolume: 10 }, // Bid (80) vs higher ask (15) = 5.3x ratio -> Sell Imbalance!
      { price: 103, bidVolume: 12, askVolume: 15 },
    ];

    const ratio = 3.0; // 300%
    for (let i = 0; i < levels.length; i++) {
      levels[i].isBuyImbalance = false;
      levels[i].isSellImbalance = false;

      // Diagonal Buy Imbalance: Ask at i vs Bid at i-1
      if (i > 0 && levels[i].askVolume >= levels[i - 1].bidVolume * ratio && levels[i].askVolume >= 5) {
        levels[i].isBuyImbalance = true;
      }
      // Diagonal Sell Imbalance: Bid at i vs Ask at i+1
      if (i < levels.length - 1 && levels[i].bidVolume >= levels[i + 1].askVolume * ratio && levels[i].bidVolume >= 5) {
        levels[i].isSellImbalance = true;
      }
    }

    assert.equal(levels[1].isBuyImbalance, true, 'Level 101 should trigger aggressive Buy Imbalance');
    assert.equal(levels[2].isSellImbalance, true, 'Level 102 should trigger aggressive Sell Imbalance');
    assert.equal(levels[0].isBuyImbalance, false);
    assert.equal(levels[3].isSellImbalance, false);

    // Calculate Bar Statistics
    const totalVol = levels.reduce((sum, l) => sum + l.bidVolume + l.askVolume, 0);
    const totalDelta = levels.reduce((sum, l) => sum + (l.askVolume - l.bidVolume), 0);
    const deltaPct = (totalDelta / totalVol) * 100;

    assert.equal(totalVol, 207);
    assert.equal(totalDelta, (5 - 10) + (60 - 15) + (10 - 80) + (15 - 12)); // -5 + 45 - 70 + 3 = -27
    assert.ok(Math.abs(deltaPct - (-13.04)) < 0.1);
  });

  it('4. Liquidity Heatmap Depth Slices & Colormap Ratio Scaling', () => {
    const centerPrice = 75000;
    const tickStep = 5.0;
    const asks = new Map();
    const bids = new Map();
    let maxVol = 1;

    for (let i = 1; i <= 20; i++) {
      const askP = centerPrice + i * tickStep;
      const bidP = centerPrice - i * tickStep;
      const isWall = i % 5 === 0;
      const askVol = isWall ? 200 : 20;
      const bidVol = isWall ? 250 : 25;

      asks.set(askP, askVol);
      bids.set(bidP, bidVol);

      if (askVol > maxVol) maxVol = askVol;
      if (bidVol > maxVol) maxVol = bidVol;
    }

    assert.equal(maxVol, 250, 'Max volume should be highest bid wall');
    assert.equal(asks.get(centerPrice + 5 * tickStep), 200);
    assert.equal(bids.get(centerPrice - 5 * tickStep), 250);

    // Test contrast scaling
    const contrast = 2.2;
    const ratioWall = Math.pow(250 / maxVol, 1 / contrast);
    const ratioNormal = Math.pow(25 / maxVol, 1 / contrast);

    assert.equal(ratioWall, 1.0, 'Full wall ratio must scale to 1.0');
    assert.ok(ratioNormal < 0.4, 'Low resting depth ratio should remain low');
  });

  it('5. Order Flow Quad Layout Cell Initialization & Synchronization', () => {
    // Mock workspace
    let activeLayout = '1';
    const mockCells = [
      { id: 'c1', symbol: 'BTCUSDT', timeframe: '240', chart: { priceStyle: 'candles', setPriceStyle(s) { this.priceStyle = s; } }, setTimeframe(t) { this.timeframe = t; }, setSymbol(s) { this.symbol = s; } },
      { id: 'c2', symbol: 'BTCUSDT', timeframe: '240', chart: { priceStyle: 'candles', setPriceStyle(s) { this.priceStyle = s; } }, setTimeframe(t) { this.timeframe = t; }, setSymbol(s) { this.symbol = s; } },
      { id: 'c3', symbol: 'BTCUSDT', timeframe: '240', chart: { priceStyle: 'candles', setPriceStyle(s) { this.priceStyle = s; } }, setTimeframe(t) { this.timeframe = t; }, setSymbol(s) { this.symbol = s; } },
      { id: 'c4', symbol: 'BTCUSDT', timeframe: '240', chart: { priceStyle: 'candles', setPriceStyle(s) { this.priceStyle = s; } }, setTimeframe(t) { this.timeframe = t; }, setSymbol(s) { this.symbol = s; } },
    ];

    const mockWorkspace = {
      active: mockCells[0],
      setLayout(l) { activeLayout = l; },
      cells() { return mockCells; },
    };

    const colorGroups = new Map();
    const setCellColorGroup = (id, grp) => colorGroups.set(id, grp);

    // Apply Quad Layout
    mockWorkspace.setLayout('4');
    mockCells.forEach((c) => {
      setCellColorGroup(c.id, 'blue');
      c.setSymbol('ETHUSDT');
    });

    // Cell 0: Normal Candlestick (15m)
    mockCells[0].setTimeframe('15');
    mockCells[0].chart.setPriceStyle('candles');

    // Cell 1: Liquidity Heatmap (5m)
    mockCells[1].setTimeframe('5');
    mockCells[1].chart.setPriceStyle('candles');

    // Cell 2: Footprint (5m)
    mockCells[2].setTimeframe('5');
    mockCells[2].chart.setPriceStyle('footprint');

    // Cell 3: Tick Chart (1000T)
    mockCells[3].setTimeframe('1000T');
    mockCells[3].chart.setPriceStyle('candles');

    assert.equal(activeLayout, '4');
    assert.equal(colorGroups.get('c1'), 'blue');
    assert.equal(colorGroups.get('c2'), 'blue');
    assert.equal(colorGroups.get('c3'), 'blue');
    assert.equal(colorGroups.get('c4'), 'blue');

    assert.equal(mockCells[0].timeframe, '15');
    assert.equal(mockCells[0].chart.priceStyle, 'candles');

    assert.equal(mockCells[1].timeframe, '5');

    assert.equal(mockCells[2].timeframe, '5');
    assert.equal(mockCells[2].chart.priceStyle, 'footprint');

    assert.equal(mockCells[3].timeframe, '1000T');
  });
});
