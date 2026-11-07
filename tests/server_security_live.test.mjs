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
});
