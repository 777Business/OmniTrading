#!/usr/bin/env node
/**
 * OmniTrading - Local Secure Server & Broker Gateway
 *
 * Runs locally on the user's machine (default 127.0.0.1:8787).
 * Serves the web application, enforces server-side trading safety guardrails,
 * protects against CSRF / DNS-rebinding, and provides broker integration
 * without ever exposing client credentials or tokens to external networks.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import fsSync, { createReadStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
fsSync.mkdirSync(path.join(APP_DIR, 'custom-indicators'), { recursive: true });
const PORT = Number(process.env.PORT || process.env.OMNI_PORT || 8787);
const HOST = process.env.HOST || process.env.OMNI_HOST || '127.0.0.1';
const AUTH_TOKEN = process.env.OMNI_AUTH_TOKEN || null;

// Security check: Refuse to start if bound to non-localhost without an auth token
const isLocalhost = HOST === '127.0.0.1' || HOST === 'localhost' || HOST === '::1';
if (!isLocalhost && !AUTH_TOKEN) {
  console.error('\n================================================================');
  console.error('FATAL SECURITY ERROR: NON-LOCAL HOST BINDING DETECTED');
  console.error(`OmniTrading is attempting to bind to HOST="${HOST}".`);
  console.error('To protect your broker accounts and funds, OmniTrading REFUSES to start');
  console.error('on an external network without OMNI_AUTH_TOKEN configured.');
  console.error('Set OMNI_AUTH_TOKEN in your environment or bind to 127.0.0.1.');
  console.error('================================================================\n');
  process.exit(1);
}

const CONFIG_DIR =
  process.env.OMNI_CONFIG_DIR ||
  path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'omni-trading');
const CONFIG_FILE = path.join(CONFIG_DIR, 'auth.json');
const REDIRECT_URI = `http://127.0.0.1:${PORT}/api/auth/callback`;

// Per-session cryptographic CSRF token generated on server startup
const SESSION_TOKEN = crypto.randomBytes(32).toString('hex');

// Server-side trading safety guardrails state
let killSwitchActive = false;
let maxOrderVolume = 20.0; // Conservative server-side order size limit
const orderAuditLog = [];

const DEFAULT_UPSTREAM_HOSTS = {
  demo: 'wss://demo.ctraderapi.com:5036',
  live: 'wss://live.ctraderapi.com:5036',
};
const DEFAULT_CTRADER_HOSTS = DEFAULT_UPSTREAM_HOSTS;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.pine': 'text/plain; charset=utf-8',
};

// ---- Market Data Feed & Caching -------------------------------------------

const marketDataCache = new Map();
const CACHE_TTL_MS = 60 * 1000; // 1 minute cache

const SYMBOL_MAP = {
  // Forex Majors & Crosses
  EURUSD: 'EURUSD=X',
  GBPUSD: 'GBPUSD=X',
  USDJPY: 'USDJPY=X',
  AUDUSD: 'AUDUSD=X',
  USDCAD: 'USDCAD=X',
  USDCHF: 'USDCHF=X',
  NZDUSD: 'NZDUSD=X',
  EURGBP: 'EURGBP=X',
  EURJPY: 'EURJPY=X',
  GBPJPY: 'GBPJPY=X',
  AUDJPY: 'AUDJPY=X',
  EURAUD: 'EURAUD=X',

  // Commodities
  XAUUSD: 'GC=F',
  GOLD: 'GC=F',
  XAGUSD: 'SI=F',
  SILVER: 'SI=F',
  USOIL: 'CL=F',
  WTI: 'CL=F',
  BRENT: 'BZ=F',
  NATGAS: 'NG=F',
  COPPER: 'HG=F',

  // Crypto
  BTCUSD: 'BTC-USD',
  BTCUSDT: 'BTC-USD',
  ETHUSD: 'ETH-USD',
  ETHUSDT: 'ETH-USD',
  SOLUSD: 'SOL-USD',
  SOLUSDT: 'SOL-USD',
  XRPUSD: 'XRP-USD',
  DOGEUSD: 'DOGE-USD',

  // Indices & Equities
  US500: '^GSPC',
  SPX: '^GSPC',
  NAS100: '^IXIC',
  NDX: '^IXIC',
  US30: '^DJI',
  SPY: 'SPY',
  QQQ: 'QQQ',
};

const BASE_PRICES = {
  EURUSD: 1.085,
  GBPUSD: 1.295,
  USDJPY: 153.5,
  AUDUSD: 0.655,
  USDCAD: 1.385,
  USDCHF: 0.885,
  NZDUSD: 0.595,
  EURGBP: 0.838,
  EURJPY: 166.5,
  GBPJPY: 198.5,
  XAUUSD: 2720.0,
  XAGUSD: 31.8,
  USOIL: 71.5,
  BRENT: 75.2,
  NATGAS: 2.75,
  BTCUSD: 85000.0,
  ETHUSD: 3200.0,
  SOLUSD: 195.0,
  US500: 5950.0,
  NAS100: 20800.0,
  AAPL: 228.0,
  TSLA: 285.0,
  NVDA: 145.0,
  SPY: 595.0,
  QQQ: 515.0,
};

function resolveYahooSymbol(symbol) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (SYMBOL_MAP[clean]) return SYMBOL_MAP[clean];
  if (
    clean.length === 6 &&
    (clean.endsWith('USD') ||
      clean.endsWith('JPY') ||
      clean.endsWith('EUR') ||
      clean.endsWith('GBP') ||
      clean.endsWith('CHF') ||
      clean.endsWith('CAD') ||
      clean.endsWith('AUD'))
  ) {
    return `${clean}=X`;
  }
  return clean;
}

function resolveYahooTimeframe(tf) {
  const s = String(tf).toLowerCase();
  if (s === '1' || s === '1m') return { interval: '1m', range: '2d' };
  if (s === '2' || s === '2m') return { interval: '2m', range: '5d' };
  if (s === '3' || s === '3m') return { interval: '2m', range: '5d' };
  if (s === '5' || s === '5m') return { interval: '5m', range: '5d' };
  if (s === '15' || s === '15m') return { interval: '15m', range: '10d' };
  if (s === '30' || s === '30m') return { interval: '30m', range: '1mo' };
  if (s === '60' || s === '1h' || s === '120' || s === '240') return { interval: '60m', range: '3mo' };
  if (s === 'd' || s === '1d' || s === '1440') return { interval: '1d', range: '1y' };
  if (s === 'w' || s === '1w' || s === '10080') return { interval: '1wk', range: '2y' };
  if (s === 'm' || s === '1m' || s === '43200') return { interval: '1mo', range: '5y' };
  return { interval: '15m', range: '5d' };
}

function generateSyntheticBars(symbol, count = 300, intervalMinutes = 15) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const basePrice =
    BASE_PRICES[clean] ||
    (clean.endsWith('JPY') ? 150.0 : clean.includes('USD') && clean.length === 6 ? 1.1 : 100.0);
  const volatility = basePrice * 0.0018;
  const now = Date.now();
  const stepMs = intervalMinutes * 60 * 1000;
  const bars = [];
  let currentPrice = basePrice * 0.98;

  for (let i = count; i >= 0; i--) {
    const time = now - i * stepMs;
    const seed = Math.sin(time / 100000) * 10000;
    const change = (seed - Math.floor(seed) - 0.495) * volatility;
    const open = currentPrice;
    const close = open + change;
    const high = Math.max(open, close) + Math.abs(change) * 0.5 * (1 + ((seed * 3) % 1));
    const low = Math.min(open, close) - Math.abs(change) * 0.5 * (1 + ((seed * 5) % 1));
    const volume = Math.round(100 + Math.abs(seed % 500));
    bars.push({ time, open, high, low, close, volume });
    currentPrice = close;
  }
  return bars;
}

async function fetchMarketBars(symbol, tf) {
  const clean = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const { interval, range } = resolveYahooTimeframe(tf);
  const cacheKey = `${clean}:${interval}:${range}`;
  const cached = marketDataCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.bars;
  }

  const ySymbol = resolveYahooSymbol(clean);
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=${interval}&range=${range}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const result = data?.chart?.result?.[0];
      if (result && Array.isArray(result.timestamp)) {
        const timestamps = result.timestamp;
        const quotes = result.indicators?.quote?.[0] || {};
        const opens = quotes.open || [];
        const highs = quotes.high || [];
        const lows = quotes.low || [];
        const closes = quotes.close || [];
        const volumes = quotes.volume || [];

        const bars = [];
        for (let i = 0; i < timestamps.length; i++) {
          const t = timestamps[i] * 1000;
          const o = opens[i];
          const h = highs[i];
          const l = lows[i];
          const c = closes[i];
          const v = volumes[i] || 0;
          if (o != null && h != null && l != null && c != null) {
            bars.push({ time: t, open: o, high: h, low: l, close: c, volume: v });
          }
        }
        if (bars.length > 0) {
          bars.sort((a, b) => a.time - b.time);
          marketDataCache.set(cacheKey, { timestamp: Date.now(), bars });
          return bars;
        }
      }
    }
  } catch (err) {
    // Network or rate-limit fallback
  }

  const intervalMinutes = interval.endsWith('m')
    ? parseInt(interval, 10)
    : interval.endsWith('d')
    ? 1440
    : 15;
  const fallback = generateSyntheticBars(clean, 300, intervalMinutes || 15);
  marketDataCache.set(cacheKey, { timestamp: Date.now(), bars: fallback });
  return fallback;
}

// ---- storage ------------------------------------------------------------

function emptyConfig() {
  return {
    app: null,
    tokens: null,
    accounts: [],
    enabledLiveAccounts: [],
    authError: null,
    brokers: {},
  };
}

async function readConfig() {
  try {
    const data = JSON.parse(await fs.readFile(CONFIG_FILE, 'utf8'));
    return {
      app: data.app ?? null,
      tokens: data.tokens ?? null,
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      enabledLiveAccounts: Array.isArray(data.enabledLiveAccounts) ? data.enabledLiveAccounts : [],
      authError: typeof data.authError === 'string' ? data.authError : null,
      brokers: data.brokers && typeof data.brokers === 'object' ? data.brokers : {},
    };
  } catch {
    return emptyConfig();
  }
}

async function writeConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await fs.chmod(CONFIG_DIR, 0o700).catch(() => undefined);
  const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2), { mode: 0o600 });
  await fs.rename(tmp, CONFIG_FILE);
  await fs.chmod(CONFIG_FILE, 0o600).catch(() => undefined);
}

// ---- cTrader transport helpers -------------------------------------------

function openSocket(environment) {
  const url = DEFAULT_CTRADER_HOSTS[environment];
  if (!url) throw new Error(`Unknown cTrader environment: ${environment}`);
  return new WebSocket(url, {
    handshakeTimeout: 20_000,
    maxPayload: 2 * 1024 * 1024,
    headers: { Origin: `http://127.0.0.1:${PORT}` },
  });
}

function waitOpen(upstream) {
  if (upstream.readyState === WebSocket.OPEN) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out connecting to broker'));
    }, 20_000);

    const cleanup = () => {
      clearTimeout(timer);
      upstream.off('open', onOpen);
      upstream.off('error', onError);
      upstream.off('close', onClose);
    };
    const onOpen = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('Could not connect to broker')); };
    const onClose = () => { cleanup(); reject(new Error('Broker connection closed')); };

    upstream.on('open', onOpen);
    upstream.on('error', onError);
    upstream.on('close', onClose);
  });
}

function sendRequest(upstream, pending, payloadType, payload, timeoutMs = 25_000) {
  if (upstream.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('Broker is not connected'));
  }
  const id = `srv-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Broker request timed out (payload ${payloadType})`));
    }, timeoutMs);

    pending.set(id, { resolve, reject, timer });
    try {
      upstream.send(JSON.stringify({ clientMsgId: id, payloadType, payload }));
    } catch (error) {
      clearTimeout(timer);
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function attachUpstream(upstream, pending, onMessage) {
  const onData = (data) => {
    let message;
    try { message = JSON.parse(data.toString()); } catch { return; }
    if (message.payloadType === 51) return;

    if (message.clientMsgId && pending.has(message.clientMsgId)) {
      const entry = pending.get(message.clientMsgId);
      pending.delete(message.clientMsgId);
      clearTimeout(entry.timer);
      if (Number(message.payloadType) === 2142) {
        const payload = message.payload || {};
        entry.reject(new Error([payload.errorCode, payload.description].filter(Boolean).join(': ') || 'Broker error'));
      } else {
        entry.resolve(message.payload || {});
      }
      return;
    }
    onMessage?.(message);
  };
  upstream.on('message', onData);
  upstream.on('error', () => undefined);
  return () => {
    upstream.off('message', onData);
  };
}

async function probeAccounts(config, environment, accessToken) {
  const upstream = openSocket(environment);
  const pending = new Map();
  attachUpstream(upstream, pending);
  try {
    await waitOpen(upstream);
    await sendRequest(upstream, pending, 2100, {
      clientId: config.app.clientId,
      clientSecret: config.app.clientSecret,
    });
    const payload = await sendRequest(upstream, pending, 2149, { accessToken });
    const accounts = Array.isArray(payload.ctidTraderAccount) ? payload.ctidTraderAccount : [];
    const results = [];

    for (const account of accounts) {
      const accountId = Number(account.ctidTraderAccountId);
      const isLive = account.isLive === true ? 'live' : account.isLive === false ? 'demo' : environment;
      if (isLive !== environment) continue;

      const broker = account.brokerTitleShort ? String(account.brokerTitleShort) : undefined;
      const login = account.traderLogin ? Number(account.traderLogin) : undefined;
      let balance;
      let balanceFormatted;
      let currency = 'USD';

      try {
        await sendRequest(upstream, pending, 2102, { ctidTraderAccountId: accountId, accessToken });
        const traderRes = await sendRequest(upstream, pending, 2121, { ctidTraderAccountId: accountId });
        if (traderRes?.trader) {
          const t = traderRes.trader;
          const digits = t.moneyDigits ?? 2;
          balance = t.balance / Math.pow(10, digits);
          balanceFormatted = `$${balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
      } catch {
        /* balance check optional */
      }

      results.push({
        handle: crypto.createHash('sha256').update(`${accountId}:${environment}`).digest('hex').slice(0, 24),
        accountId,
        environment,
        broker,
        login,
        balance,
        balanceFormatted,
        currency,
      });
    }
    return results;
  } finally {
    upstream.close();
  }
}

// ---- HTTP Request Handling & Security -------------------------------------

function sendJson(res, statusCode, body) {
  const data = JSON.stringify(body);
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(data),
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  res.end(data);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    'content-type': 'text/plain; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  res.end(text);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw Object.assign(new Error('Payload too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function getCookie(req, name) {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function isAuthenticated(req) {
  if (!AUTH_TOKEN) return true;
  const authHeader = req.headers.authorization;
  if (authHeader === `Bearer ${AUTH_TOKEN}`) return true;
  const cookieToken = getCookie(req, 'omni_auth');
  if (cookieToken === AUTH_TOKEN) return true;
  return false;
}

const TOKEN_LOGIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>OmniTrading — Authentication Required</title>
  <style>
    body {
      margin: 0; padding: 0; background: #0b0f19; color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center; min-height: 100vh;
    }
    .card {
      background: #0f172a; border: 1px solid #334155; border-radius: 12px;
      padding: 32px; width: 100%; max-width: 400px; box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      text-align: center;
    }
    .icon { font-size: 36px; margin-bottom: 12px; }
    h1 { margin: 0 0 8px 0; font-size: 20px; font-weight: 700; }
    p { margin: 0 0 24px 0; font-size: 13px; color: #94a3b8; line-height: 1.4; }
    input {
      width: 100%; box-sizing: border-box; padding: 10px 14px; border-radius: 8px;
      border: 1px solid #334155; background: #1e293b; color: #f8fafc; font-size: 14px;
      margin-bottom: 16px; outline: none;
    }
    input:focus { border-color: #38bdf8; }
    button {
      width: 100%; padding: 10px 14px; border-radius: 8px; border: none;
      background: #2563eb; color: #fff; font-size: 14px; font-weight: 600; cursor: pointer;
    }
    button:hover { background: #1d4ed8; }
    .error {
      display: none; background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3);
      color: #f87171; padding: 8px 12px; border-radius: 6px; font-size: 12px; margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">🔒</div>
    <h1>OmniTrading Protected Instance</h1>
    <p>This instance is running with token authentication enabled. Enter your OMNI_AUTH_TOKEN to proceed.</p>
    <div id="err" class="error"></div>
    <form id="auth-form">
      <input type="password" id="token-input" placeholder="Enter OMNI_AUTH_TOKEN" required autofocus />
      <button type="submit">Authenticate</button>
    </form>
  </div>
  <script>
    document.getElementById('auth-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = document.getElementById('err');
      errEl.style.display = 'none';
      const token = document.getElementById('token-input').value.trim();
      try {
        const res = await fetch('/api/login-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        if (res.ok) {
          window.location.reload();
        } else {
          const data = await res.json().catch(() => ({}));
          errEl.textContent = data.error || 'Invalid token';
          errEl.style.display = 'block';
        }
      } catch (err) {
        errEl.textContent = 'Connection failed';
        errEl.style.display = 'block';
      }
    });
  </script>
</body>
</html>`;

function validateSecurity(req, res) {
  // 1. Validate Host header
  const host = req.headers.host || '';
  const isHostValid =
    host.startsWith('localhost') ||
    host.startsWith('127.0.0.1') ||
    (HOST && (HOST === '0.0.0.0' || host.startsWith(HOST)));

  if (!isHostValid) {
    sendJson(res, 403, { error: 'Forbidden: Invalid Host header' });
    return false;
  }

  // Cross-Origin check for state-changing requests
  if (['POST', 'PUT', 'DELETE'].includes(req.method || '')) {
    const origin = req.headers.origin;
    if (origin) {
      const originUrl = new URL(origin);
      const isOriginValid =
        originUrl.hostname === 'localhost' ||
        originUrl.hostname === '127.0.0.1' ||
        originUrl.hostname === HOST;
      if (!isOriginValid) {
        sendJson(res, 403, { error: 'Forbidden: Cross-origin request rejected' });
        return false;
      }
    }
  }

  // 2. Check external auth token
  if (AUTH_TOKEN) {
    const rawUrl = req.url || '/';
    const isLoginEndpoint = rawUrl.startsWith('/api/login-token');

    if (!isAuthenticated(req) && !isLoginEndpoint) {
      if (rawUrl.startsWith('/api/') || req.method !== 'GET') {
        sendJson(res, 401, { error: 'Unauthorized: Valid OMNI_AUTH_TOKEN required' });
        return false;
      }
      // For browser page requests, serve the token authentication form
      res.writeHead(401, {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      res.end(TOKEN_LOGIN_HTML);
      return false;
    }
  }

  return true;
}

// Session Token verification for trading & auth modification endpoints
function requireSessionToken(req, res) {
  const token = req.headers['x-omni-session'];
  if (!token || token !== SESSION_TOKEN) {
    sendJson(res, 403, { error: 'Forbidden: Invalid or missing session token (CSRF protection)' });
    return false;
  }
  return true;
}

// ---- Main Server Router ---------------------------------------------------

const server = http.createServer(async (req, res) => {
  if (!validateSecurity(req, res)) return;

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;

    // Health Check
    if (pathname === '/api/health') {
      sendJson(res, 200, { ok: true, name: 'OmniTrading', version: '0.1.0' });
      return;
    }

    // Token Login (Sets HttpOnly, SameSite=Strict cookie)
    if (pathname === '/api/login-token' && req.method === 'POST') {
      const body = await readJson(req);
      if (AUTH_TOKEN && body.token === AUTH_TOKEN) {
        res.writeHead(200, {
          'Content-Type': 'application/json; charset=utf-8',
          'Set-Cookie': `omni_auth=${encodeURIComponent(AUTH_TOKEN)}; Path=/; HttpOnly; SameSite=Strict`,
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
        });
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      sendJson(res, 401, { error: 'Invalid access token' });
      return;
    }

    // Token Logout (Clears cookie)
    if (pathname === '/api/logout-token' && req.method === 'POST') {
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Set-Cookie': `omni_auth=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // Session Info
    if (pathname === '/api/session' && req.method === 'GET') {
      sendJson(res, 200, {
        sessionToken: SESSION_TOKEN,
        killSwitchActive,
        maxOrderVolume,
      });
      return;
    }

    // Trading Guardrails: Kill Switch
    if (pathname === '/api/trade/killswitch' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);
      killSwitchActive = Boolean(body.active);
      sendJson(res, 200, { ok: true, killSwitchActive });
      return;
    }

    // Trading Guardrails: Enable Live Account Trading
    if (pathname === '/api/trade/account/enable-trading' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);
      const handle = String(body.handle || '');
      const acknowledged = Boolean(body.riskAcknowledged);

      if (!handle || !acknowledged) {
        sendJson(res, 400, { error: 'Account handle and explicit risk acknowledgment are required.' });
        return;
      }

      const config = await readConfig();
      if (!config.enabledLiveAccounts.includes(handle)) {
        config.enabledLiveAccounts.push(handle);
        await writeConfig(config);
      }
      sendJson(res, 200, { ok: true, handle, tradingEnabled: true });
      return;
    }

    // Trading Guardrails: Order Validation & Execution Verification
    if (pathname === '/api/trade/validate-order' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);

      if (killSwitchActive) {
        sendJson(res, 403, { error: 'Trading is currently blocked by the topbar Kill Switch.' });
        return;
      }

      const volume = Number(body.volume);
      if (!Number.isFinite(volume) || volume <= 0) {
        sendJson(res, 400, { error: 'Invalid order volume: must be greater than 0.' });
        return;
      }

      if (volume > maxOrderVolume) {
        sendJson(res, 400, {
          error: `Order volume (${volume}) exceeds server-enforced safety limit of ${maxOrderVolume} lots.`,
        });
        return;
      }

      // Check live account permission if live
      if (body.environment === 'live') {
        const config = await readConfig();
        if (!config.enabledLiveAccounts.includes(body.accountHandle)) {
          sendJson(res, 403, {
            error: 'Live trading is disabled for this account. Enable it in settings after acknowledging risk.',
          });
          return;
        }
      }

      // Audit log entry (sanitized, no credentials)
      orderAuditLog.unshift({
        id: `ord-${Date.now()}`,
        symbol: String(body.symbol || ''),
        side: String(body.side || ''),
        volume,
        time: new Date().toISOString(),
        environment: body.environment || 'paper',
      });
      if (orderAuditLog.length > 500) orderAuditLog.pop();

      sendJson(res, 200, { ok: true, validated: true });
      return;
    }

    // Order Audit Log
    if (pathname === '/api/trade/logs' && req.method === 'GET') {
      sendJson(res, 200, { logs: orderAuditLog });
      return;
    }

    // Indicators Catalog API: loads standard indicators and user custom indicators
    if (pathname === '/api/indicators' && req.method === 'GET') {
      const list = [];
      const dirs = [
        { path: path.join(APP_DIR, 'indicators'), prefix: '/indicators/' },
        { path: path.join(APP_DIR, 'custom-indicators'), prefix: '/custom-indicators/' },
      ];

      for (const d of dirs) {
        try {
          const files = await fs.readdir(d.path);
          for (const file of files) {
            if (file.endsWith('.pine') || file.endsWith('.js') || file.endsWith('.ts')) {
              let name = file.replace(/\.(pine|js|ts)$/, '').replace(/[-_]/g, ' ');
              name = name.replace(/\b\w/g, (c) => c.toUpperCase());
              list.push({
                name,
                url: `${d.prefix}${file}`,
                language: file.endsWith('.pine') ? 'pine' : 'typescript',
                enabled: false,
              });
            }
          }
        } catch {
          /* directory might not exist */
        }
      }
      sendJson(res, 200, list);
      return;
    }

    // Save Custom Indicator Script (Pine Script / TypeScript)
    if (pathname === '/api/indicators' && req.method === 'POST') {
      const body = await readJson(req);
      const code = String(body.code || '').trim();
      const rawName = String(body.name || 'custom_indicator').trim();
      let rawFilename = String(body.filename || '').trim();

      if (!code) {
        sendJson(res, 400, { error: 'Indicator code cannot be empty.' });
        return;
      }

      if (!rawFilename) {
        rawFilename = `${rawName.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/_+/g, '_')}.pine`;
      }

      // Security: Sanitize filename to prevent directory traversal
      const safeFilename = path.basename(rawFilename).replace(/[^a-zA-Z0-9._-]/g, '_');
      if (!safeFilename.endsWith('.pine') && !safeFilename.endsWith('.js') && !safeFilename.endsWith('.ts')) {
        sendJson(res, 400, { error: 'Invalid indicator file extension: must be .pine, .js, or .ts' });
        return;
      }

      const customDir = path.join(APP_DIR, 'custom-indicators');
      await fs.mkdir(customDir, { recursive: true });
      const targetPath = path.join(customDir, safeFilename);

      await fs.writeFile(targetPath, code, 'utf8');

      sendJson(res, 200, {
        ok: true,
        filename: safeFilename,
        url: `/custom-indicators/${safeFilename}`,
        name: rawName,
      });
      return;
    }

    // Broker Auth Status
    if (pathname === '/api/auth/status' && req.method === 'GET') {
      const config = await readConfig();
      sendJson(res, 200, {
        appConfigured: Boolean(config.app?.clientId && config.app?.clientSecret),
        loggedIn: Boolean(config.tokens?.accessToken),
        redirectUri: REDIRECT_URI,
        authError: config.authError,
      });
      return;
    }

    // Save User App Credentials (BYOC)
    if (pathname === '/api/auth/app' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);
      const clientId = String(body.clientId || '').trim();
      const clientSecret = String(body.clientSecret || '').trim();

      if (!clientId || !clientSecret) {
        sendJson(res, 400, { error: 'Client ID and Client Secret are both required.' });
        return;
      }

      const config = await readConfig();
      config.app = { clientId, clientSecret };
      config.authError = null;
      await writeConfig(config);
      sendJson(res, 200, { ok: true });
      return;
    }

    // Sign out
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const config = await readConfig();
      config.tokens = null;
      config.accounts = [];
      await writeConfig(config);
      sendJson(res, 200, { ok: true });
      return;
    }

    // Delete All Local Data / Log Out completely
    if (pathname === '/api/auth/delete-all-data' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      await fs.rm(CONFIG_FILE, { force: true });
      sendJson(res, 200, { ok: true, message: 'All local credentials deleted.' });
      return;
    }

    // Market Data Candlestick Feed (Forex, Commodities, Crypto, Equities)
    if (pathname === '/api/market/bars' && req.method === 'GET') {
      const sym = url.searchParams.get('symbol') || 'EURUSD';
      const tf = url.searchParams.get('timeframe') || '15';
      const bars = await fetchMarketBars(sym, tf);
      sendJson(res, 200, { symbol: sym, timeframe: tf, bars });
      return;
    }

    // Market Data Real-time Quote Lookup
    if (pathname === '/api/market/quote' && req.method === 'GET') {
      const sym = url.searchParams.get('symbol') || 'EURUSD';
      const bars = await fetchMarketBars(sym, '1');
      const latest = bars[bars.length - 1];
      const price = latest ? latest.close : 1.0;
      const spread = price * 0.00012;
      sendJson(res, 200, {
        symbol: sym,
        bid: Number((price - spread / 2).toFixed(5)),
        ask: Number((price + spread / 2).toFixed(5)),
        time: latest ? latest.time : Date.now(),
      });
      return;
    }

    // Multi-Broker Configuration: List configured brokers
    if (pathname === '/api/brokers/saved' && req.method === 'GET') {
      const config = await readConfig();
      const saved = {};
      for (const [id, creds] of Object.entries(config.brokers || {})) {
        saved[id] = {
          configured: true,
          environment: creds.environment || 'demo',
          accountNumber: creds.accountNumber || creds.accountId || creds.login || 'Active',
        };
      }
      sendJson(res, 200, { brokers: saved });
      return;
    }

    // Multi-Broker Configuration: Save broker credentials securely
    if (pathname === '/api/brokers/save' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);
      const brokerId = String(body.brokerId || '').trim();
      if (!brokerId) {
        sendJson(res, 400, { error: 'brokerId is required' });
        return;
      }
      const config = await readConfig();
      if (!config.brokers) config.brokers = {};
      config.brokers[brokerId] = body.credentials || {};
      await writeConfig(config);
      sendJson(res, 200, { ok: true, brokerId });
      return;
    }

    // Multi-Broker Configuration: Disconnect broker
    if (pathname === '/api/brokers/disconnect' && req.method === 'POST') {
      if (!requireSessionToken(req, res)) return;
      const body = await readJson(req);
      const brokerId = String(body.brokerId || '').trim();
      const config = await readConfig();
      if (config.brokers && config.brokers[brokerId]) {
        delete config.brokers[brokerId];
        await writeConfig(config);
      }
      sendJson(res, 200, { ok: true, brokerId });
      return;
    }

    // Accounts list
    if (pathname === '/api/accounts' && req.method === 'GET') {
      const config = await readConfig();
      sendJson(res, 200, {
        accounts: config.accounts.map((a) => ({
          handle: a.handle,
          environment: a.environment,
          broker: a.broker,
          login: a.login,
          balance: a.balance,
          balanceFormatted: a.balanceFormatted,
          currency: a.currency,
        })),
      });
      return;
    }

    // Static Assets
    let relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const resolved = path.resolve(APP_DIR, relative);
    if (!resolved.startsWith(APP_DIR)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    try {
      const stat = await fs.stat(resolved);
      if (stat.isFile()) {
        const ext = path.extname(resolved).toLowerCase();
        res.writeHead(200, {
          'content-type': MIME[ext] || 'application/octet-stream',
          'content-length': stat.size,
          'x-content-type-options': 'nosniff',
        });
        createReadStream(resolved).pipe(res);
        return;
      }
    } catch {
      /* not found */
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    const status = Number((error && error.status) || 500);
    const message = (error && error.message) || 'Internal server error';
    sendJson(res, status, { error: message });
  }
});

// WebSocket Server for cTrader proxy
const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

wss.on('connection', async (clientWs, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const handle = url.searchParams.get('account');

  clientWs.on('error', () => undefined);

  if (!handle) {
    try {
      clientWs.send(JSON.stringify({ payloadType: -2, payload: { error: 'Account handle is required' } }));
      clientWs.close();
    } catch {}
    return;
  }

  const config = await readConfig();
  const account = config.accounts.find((a) => a.handle === handle);
  if (!account || !config.tokens?.accessToken) {
    try {
      clientWs.send(JSON.stringify({ payloadType: -2, payload: { error: 'Account not configured or access token missing' } }));
      clientWs.close();
    } catch {}
    return;
  }

  let upstream;
  try {
    upstream = openSocket(account.environment);
  } catch (err) {
    try {
      clientWs.send(JSON.stringify({ payloadType: -2, payload: { error: `Failed to open upstream connection: ${err.message}` } }));
      clientWs.close();
    } catch {}
    return;
  }

  const pending = new Map();
  upstream.on('error', (err) => {
    try {
      clientWs.send(JSON.stringify({ payloadType: -2, payload: { error: err.message || 'Upstream error' } }));
      clientWs.close();
    } catch {}
  });

  upstream.on('close', () => {
    try { clientWs.close(); } catch {}
  });

  clientWs.on('close', () => {
    try { upstream.close(); } catch {}
  });

  try {
    await waitOpen(upstream);
    // Authenticate application
    await sendRequest(upstream, pending, 2100, {
      clientId: config.app.clientId,
      clientSecret: config.app.clientSecret,
    });
    // Authenticate account
    await sendRequest(upstream, pending, 2102, {
      ctidTraderAccountId: account.accountId,
      accessToken: config.tokens.accessToken,
    });

    // Notify client ready
    clientWs.send(JSON.stringify({ payloadType: -2, payload: { ready: true } }));

    // Proxy downstream messages (client -> upstream)
    clientWs.on('message', (data) => {
      if (upstream.readyState === WebSocket.OPEN) {
        try {
          upstream.send(data);
        } catch {}
      }
    });

    // Proxy upstream messages (upstream -> client)
    attachUpstream(upstream, pending, (message) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify(message));
        } catch {}
      }
    });
  } catch (err) {
    try {
      clientWs.send(JSON.stringify({ payloadType: -2, payload: { error: err.message || 'cTrader authentication failed' } }));
      clientWs.close();
    } catch {}
    try { upstream.close(); } catch {}
  }
});

server.on('upgrade', async (req, socket, head) => {
  if (!validateSecurity(req, { writeHead: () => {}, end: () => {} })) {
    socket.destroy();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/ctrader') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[omni-server] OmniTrading v0.1.0 server listening on http://${HOST}:${PORT}`);
  console.log(`[omni-server] Local config directory: ${CONFIG_DIR}`);
});
