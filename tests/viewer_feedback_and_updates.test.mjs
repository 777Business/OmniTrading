/**
 * OmniTrading - Viewer Feedback & Update System Verification Test Suite
 *
 * Verifies fixes for:
 * 1. Windows startup spawn logic and esbuild options.
 * 2. BrokerAdapter status transparency (in-development badges, live warnings).
 * 3. Sub-minute scalping timeframes (15S, 30S).
 * 4. Mobile responsiveness (@media queries, safe areas).
 * 5. In-app auto-updater endpoints (/api/system/update-status & CSRF on perform-update).
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const TEST_PORT = 8798;
let serverProc = null;

describe('Viewer Feedback & Update System Verification Suite', () => {
  before(async () => {
    serverProc = spawn('node', ['server/omni-server.mjs'], {
      cwd: rootDir,
      env: { ...process.env, PORT: String(TEST_PORT), HOST: '127.0.0.1' },
      stdio: 'pipe',
    });

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

  test('1. Windows startup launcher configures shell option and esbuild fallback', () => {
    const startScript = fs.readFileSync(path.join(rootDir, 'server', 'start.mjs'), 'utf8');
    assert.match(startScript, /shell:\s*isWin/, 'Must pass shell: isWin to spawnSync for Windows CVE-2024-27980');
    assert.match(startScript, /buildRes\.error/, 'Must diagnose and report buildRes.error');
    assert.match(startScript, /directEsbuild/, 'Must have direct fallback to esbuild script');
  });

  test('2. Broker adapter transparency statuses are accurately set', () => {
    const mt5 = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'metatrader', 'adapter.ts'), 'utf8');
    assert.match(mt5, /status\s*=\s*'in-development'/, 'MT5 must be marked in-development');

    const ibkr = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'ibkr', 'adapter.ts'), 'utf8');
    assert.match(ibkr, /status\s*=\s*'in-development'/, 'IBKR must be marked in-development');

    const binance = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'binance', 'adapter.ts'), 'utf8');
    assert.match(binance, /status\s*=\s*'in-development'/, 'Binance must be marked in-development');

    const alpaca = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'alpaca', 'adapter.ts'), 'utf8');
    assert.match(alpaca, /status\s*=\s*'in-development'/, 'Alpaca must be marked in-development');

    const oanda = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'oanda', 'adapter.ts'), 'utf8');
    assert.match(oanda, /status\s*=\s*'in-development'/, 'OANDA must be marked in-development');

    const ctrader = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'ctrader', 'adapter.ts'), 'utf8');
    assert.match(ctrader, /status\s*=\s*'beta'/, 'cTrader is beta');

    const paper = fs.readFileSync(path.join(rootDir, 'src', 'brokers', 'adapters', 'paper', 'adapter.ts'), 'utf8');
    assert.match(paper, /status\s*=\s*'stable'/, 'Paper is stable');
  });

  test('3. Mobile media queries and viewport-fit exist in index.html', () => {
    const html = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
    assert.match(html, /viewport-fit=cover/, 'Must support viewport-fit=cover for notch/island devices');
    assert.match(html, /@media\s*\(max-width:\s*768px\)/, 'Must contain responsive media queries for phone screens');
    assert.match(html, /env\(safe-area-inset-top/, 'Must handle safe-area-inset');
  });

  test('4. Sub-minute timeframes (15S, 30S) return sub-minute candlestick bars', async () => {
    const res15 = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=EURUSD&timeframe=15S`);
    assert.equal(res15.status, 200);
    const data15 = await res15.json();
    assert.equal(data15.symbol, 'EURUSD');
    assert.equal(data15.timeframe, '15S');
    assert.ok(Array.isArray(data15.bars) && data15.bars.length > 0);

    // Verify sub-minute 15s bar step spacing
    if (data15.bars.length >= 2) {
      const step = data15.bars[1].time - data15.bars[0].time;
      assert.equal(step, 15000, 'Time step between bars should be 15,000ms (15s)');
    }

    const res30 = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=XAUUSD&timeframe=30S`);
    assert.equal(res30.status, 200);
    const data30 = await res30.json();
    assert.equal(data30.timeframe, '30S');
    assert.ok(Array.isArray(data30.bars) && data30.bars.length > 0);

    if (data30.bars.length >= 2) {
      const step = data30.bars[1].time - data30.bars[0].time;
      assert.equal(step, 30000, 'Time step between bars should be 30,000ms (30s)');
    }
  });

  test('5. GET /api/system/update-status returns valid system update schema', async () => {
    const res = await fetch(`http://127.0.0.1:${TEST_PORT}/api/system/update-status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(typeof data.updateAvailable, 'boolean');
    assert.equal(typeof data.currentVersion, 'string');
    assert.equal(typeof data.currentCommit, 'string');
    assert.equal(typeof data.isGitRepo, 'boolean');
  });

  test('6. POST /api/system/perform-update enforces CSRF session token check', async () => {
    const unauthRes = await fetch(`http://127.0.0.1:${TEST_PORT}/api/system/perform-update`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(unauthRes.status, 403, 'Must reject unauthenticated update requests');
  });

  test('7. MT5 Gateway bridge script and documentation exist', () => {
    assert.ok(fs.existsSync(path.join(rootDir, 'scripts', 'mt5-bridge.py')), 'scripts/mt5-bridge.py must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'docs', 'MT5_GATEWAY.md')), 'docs/MT5_GATEWAY.md must exist');
  });

  test('8. Tick charts (100T, 500T) and Range bars (10R) return valid bars', async () => {
    const res100T = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=EURUSD&timeframe=100T`);
    assert.equal(res100T.status, 200);
    const data100T = await res100T.json();
    assert.equal(data100T.timeframe, '100T');
    assert.ok(Array.isArray(data100T.bars) && data100T.bars.length > 0);
    assert.equal(data100T.bars[0].volume, 100, 'Bar volume should reflect tick count');

    const res10R = await fetch(`http://127.0.0.1:${TEST_PORT}/api/market/bars?symbol=XAUUSD&timeframe=10R`);
    assert.equal(res10R.status, 200);
    const data10R = await res10R.json();
    assert.equal(data10R.timeframe, '10R');
    assert.ok(Array.isArray(data10R.bars) && data10R.bars.length > 0);
  });

  test('9. Custom Timeframe Creator module exists and exports openCustomTimeframeModal', () => {
    const customTfFile = path.join(rootDir, 'src', 'ui', 'customTimeframeModal.ts');
    assert.ok(fs.existsSync(customTfFile), 'customTimeframeModal.ts must exist');
    const content = fs.readFileSync(customTfFile, 'utf8');
    assert.match(content, /export function openCustomTimeframeModal/, 'Must export openCustomTimeframeModal');
    assert.match(content, /Ticks/, 'Must offer Ticks');
    assert.match(content, /Range/, 'Must offer Range');
  });
});
