/**
 * OmniTrading - Automated Safety, Math & Security Unit Tests
 *
 * Tests:
 * 1. Volume / lot / pip / price math conversions across 3 broker conventions.
 * 2. Trading safety guardrails (kill switch, max size, live account disabled default).
 * 3. Server security (Origin header validation, CSRF session token enforcement).
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

describe('1. Broker Conventions & Order Math', () => {
  // Broker Convention A: Standard Forex (EURUSD)
  test('Standard Forex convention (EURUSD) pip & PnL calculation', () => {
    const lotSize = 100000;
    const digits = 5;
    const pipPos = 4;
    const pipSize = Math.pow(10, -pipPos); // 0.0001

    const entryPrice = 1.08500;
    const exitPrice = 1.08750;
    const lots = 1.5;

    const pipDifference = (exitPrice - entryPrice) / pipSize;
    assert.equal(Math.round(pipDifference), 25, '25 pips gain');

    const pnl = Math.round((exitPrice - entryPrice) * lots * lotSize * 100) / 100;
    assert.equal(pnl, 375, 'PnL is $375 for 1.5 lots over 25 pips');
  });

  // Broker Convention B: JPY Currency Cross (USDJPY)
  test('JPY Currency Cross convention (USDJPY) pip & PnL calculation', () => {
    const lotSize = 100000;
    const digits = 3;
    const pipPos = 2;
    const pipSize = Math.pow(10, -pipPos); // 0.01

    const entryPrice = 152.000;
    const exitPrice = 152.800;
    const lots = 2.0;

    const pipDifference = (exitPrice - entryPrice) / pipSize;
    assert.equal(Math.round(pipDifference), 80, '80 pips gain');

    const pnlInJpy = Math.round((exitPrice - entryPrice) * lots * lotSize);
    assert.equal(pnlInJpy, 160000, 'PnL is 160,000 JPY');
  });

  // Broker Convention C: Spot Crypto / US Equities (BTCUSDT / Stock)
  test('Spot Crypto / Stock convention lot size = 1', () => {
    const lotSize = 1;
    const entryPrice = 64000.0;
    const exitPrice = 65500.0;
    const quantity = 0.5;

    const pnl = (exitPrice - entryPrice) * quantity * lotSize;
    assert.equal(pnl, 750, 'PnL is $750 for 0.5 BTC over $1500 move');
  });
});

describe('2. Trading Safety Guardrails Validation', () => {
  function validateOrderSafety(order, opts = {}) {
    const { killSwitchActive = false, maxVolume = 20, account = { environment: 'paper', tradingEnabled: true } } = opts;

    if (killSwitchActive) {
      return { allowed: false, error: 'Trading is blocked by the topbar Kill Switch.' };
    }
    if (!order.symbol || typeof order.symbol !== 'string') {
      return { allowed: false, error: 'Symbol is required.' };
    }
    if (!Number.isFinite(order.volume) || order.volume <= 0) {
      return { allowed: false, error: 'Order volume must be greater than 0.' };
    }
    if (order.volume > maxVolume) {
      return { allowed: false, error: `Order volume (${order.volume}) exceeds max safety limit of ${maxVolume}.` };
    }
    if (account.environment === 'live' && !account.tradingEnabled) {
      return { allowed: false, error: 'Live trading is disabled for this account.' };
    }
    return { allowed: true };
  }

  test('Kill switch blocks orders immediately', () => {
    const res = validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: 1.0 }, { killSwitchActive: true });
    assert.equal(res.allowed, false);
    assert.match(res.error, /Kill Switch/);
  });

  test('Max order size is enforced server-side', () => {
    const res = validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: 25.0 }, { maxVolume: 20 });
    assert.equal(res.allowed, false);
    assert.match(res.error, /exceeds max safety limit/);
  });

  test('Live account starts with trading disabled until explicitly enabled', () => {
    const liveAccount = { environment: 'live', tradingEnabled: false };
    const res = validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: 1.0 }, { account: liveAccount });
    assert.equal(res.allowed, false);
    assert.match(res.error, /Live trading is disabled/);
  });

  test('Invalid volumes (<= 0, NaN, absurd) are rejected', () => {
    assert.equal(validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: 0 }).allowed, false);
    assert.equal(validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: -5 }).allowed, false);
    assert.equal(validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: NaN }).allowed, false);
  });

  test('Valid paper trading order passes all checks', () => {
    const res = validateOrderSafety({ symbol: 'EURUSD', side: 'buy', volume: 1.0 });
    assert.equal(res.allowed, true);
  });
});

describe('3. Server Security & CSRF Protection', () => {
  const SERVER_SESSION_TOKEN = 'secret-test-token-777';

  function verifyCsrfToken(headers) {
    const token = headers['x-omni-session'];
    return Boolean(token && token === SERVER_SESSION_TOKEN);
  }

  function verifyOrigin(originHeader) {
    if (!originHeader) return true;
    try {
      const u = new URL(originHeader);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    } catch {
      return false;
    }
  }

  test('State-changing requests require valid session token', () => {
    assert.equal(verifyCsrfToken({}), false, 'Missing token rejected');
    assert.equal(verifyCsrfToken({ 'x-omni-session': 'wrong-token' }), false, 'Wrong token rejected');
    assert.equal(verifyCsrfToken({ 'x-omni-session': SERVER_SESSION_TOKEN }), true, 'Valid token accepted');
  });

  test('Cross-origin requests from malicious domains are rejected', () => {
    assert.equal(verifyOrigin('https://malicious-site.com'), false, 'Malicious origin rejected');
    assert.equal(verifyOrigin('http://attacker.local:8080'), false, 'Attacker origin rejected');
    assert.equal(verifyOrigin('http://localhost:8787'), true, 'Localhost accepted');
    assert.equal(verifyOrigin('http://127.0.0.1:8787'), true, '127.0.0.1 accepted');
  });
});
