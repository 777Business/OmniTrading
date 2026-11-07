/**
 * OmniTrading - Live Server Security Integration Test
 *
 * Tests:
 * 1. Health check returns 200.
 * 2. Cross-origin request rejected with 403.
 * 3. Missing CSRF session token rejected with 403.
 * 4. Valid session token succeeds with 200.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const TEST_PORT = 8795;
let serverProc = null;

describe('Live Server Security & CSRF Suite', () => {
  before(async () => {
    serverProc = spawn('node', ['server/omni-server.mjs'], {
      env: { ...process.env, PORT: String(TEST_PORT), HOST: '127.0.0.1' },
      stdio: 'pipe',
    });

    // Wait for server to be ready
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
        if (res.ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  });

  after(() => {
    if (serverProc) serverProc.kill();
  });

  test('GET /api/health responds with 200 OK', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.name, 'OmniTrading');
  });

  test('POST with foreign Origin header is rejected with 403 Forbidden', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/trade/validate-order`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil-attacker-website.com',
      },
      body: JSON.stringify({ symbol: 'EURUSD', volume: 1.0 }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /Cross-origin request rejected/);
  });

  test('POST without session token is rejected with 403 Forbidden', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/trade/validate-order`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${TEST_PORT}`,
      },
      body: JSON.stringify({ symbol: 'EURUSD', volume: 1.0 }),
    });
    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /session token/);
  });

  test('POST with valid session token succeeds with 200 OK', async () => {
    // 1. Get session token
    const sRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/session`);
    assert.equal(sRes.status, 200);
    const sData = await sRes.json();
    const token = sData.sessionToken;
    assert.ok(token);

    // 2. Validate order
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/trade/validate-order`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${TEST_PORT}`,
        'x-omni-session': token,
      },
      body: JSON.stringify({ symbol: 'EURUSD', side: 'buy', volume: 1.0, environment: 'paper' }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.validated, true);
  });

  test('GET /api/market/bars returns candlestick history for Forex & Gold', async () => {
    const fxRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=EURUSD&timeframe=15`);
    assert.equal(fxRes.status, 200);
    const fxData = await fxRes.json();
    assert.equal(fxData.symbol, 'EURUSD');
    assert.ok(Array.isArray(fxData.bars));
    assert.ok(fxData.bars.length > 0);
    assert.ok(fxData.bars[0].open > 0);
    assert.ok(fxData.bars[0].close > 0);

    const goldRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=XAUUSD&timeframe=5`);
    assert.equal(goldRes.status, 200);
    const goldData = await goldRes.json();
    assert.equal(goldData.symbol, 'XAUUSD');
    assert.ok(goldData.bars.length > 0);
  });

  test('GET /api/market/quote returns live bid, ask, and price', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/quote?symbol=EURUSD`);
    assert.equal(res.status, 200);
    const quote = await res.json();
    assert.equal(quote.symbol, 'EURUSD');
    assert.ok(quote.bid > 0);
    assert.ok(quote.ask > 0);
    assert.ok(quote.ask >= quote.bid);
  });

  test('POST /api/brokers/save and GET /api/brokers/saved manage broker configurations', async () => {
    const sRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/session`);
    const sData = await sRes.json();
    const token = sData.sessionToken;

    // Save IBKR
    const saveRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/brokers/save`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: `http://127.0.0.1:${TEST_PORT}`,
        'x-omni-session': token,
      },
      body: JSON.stringify({
        brokerId: 'ibkr',
        credentials: { accountId: 'DU999888', environment: 'paper' },
      }),
    });
    assert.equal(saveRes.status, 200);

    // Get saved
    const getRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/brokers/saved`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.ok(getData.brokers.ibkr);
    assert.equal(getData.brokers.ibkr.configured, true);
  });
});

