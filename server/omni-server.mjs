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

// ---- storage ------------------------------------------------------------

function emptyConfig() {
  return { app: null, tokens: null, accounts: [], enabledLiveAccounts: [], authError: null };
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
