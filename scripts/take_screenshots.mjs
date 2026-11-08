import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';

const CHROMIUM_PATH = '/usr/bin/chromium';
const PORT = 9222;
const APP_URL = 'http://127.0.0.1:8787';
const ARTIFACT_DIR = '/home/shadow/.gemini/antigravity/brain/65cfee9b-c97b-40ea-9aa8-1bfc9fd5ef18';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    console.error(`Failed to parse JSON from ${url}:`, text);
    throw err;
  }
}

async function run() {
  console.log('[screenshot-script] Launching headless chromium with target URL...');
  const browserProc = spawn(CHROMIUM_PATH, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    `--remote-debugging-port=${PORT}`,
    '--window-size=1920,1080',
    APP_URL,
  ], { stdio: 'ignore' });

  // Wait for CDP to be ready
  let targets = null;
  for (let i = 0; i < 30; i++) {
    await sleep(300);
    try {
      targets = await fetchJson(`http://127.0.0.1:${PORT}/json/list`);
      if (Array.isArray(targets) && targets.length > 0) break;
    } catch {}
  }

  if (!Array.isArray(targets) || targets.length === 0) {
    console.error('[screenshot-script] Failed to find page target in Chromium');
    browserProc.kill();
    process.exit(1);
  }

  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  console.log('[screenshot-script] Connected to target page:', pageTarget.url);

  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.once('open', resolve));

  let reqId = 1;
  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = reqId++;
      const handler = (msg) => {
        const data = JSON.parse(msg.toString());
        if (data.id === id) {
          ws.off('message', handler);
          if (data.error) reject(new Error(JSON.stringify(data.error)));
          else resolve(data.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  });

  console.log('[screenshot-script] Waiting 5 seconds for chart and market data to render...');
  await sleep(5000);

  // Take Screenshot 1: Default view
  console.log('[screenshot-script] Capturing default view...');
  let shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_1_default.png'), Buffer.from(shot.data, 'base64'));

  // Trigger Order Flow Quad Layout
  console.log('[screenshot-script] Applying Order Flow Quad Layout...');
  await send('Runtime.evaluate', {
    expression: `
      if (window.layoutManager && window.layoutManager.applyOrderFlowQuadLayout && window.workspace) {
        window.layoutManager.applyOrderFlowQuadLayout(window.workspace);
      }
    `,
    awaitPromise: true,
  });

  await sleep(4000);

  console.log('[screenshot-script] Capturing Order Flow Quad Layout...');
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_orderflow_quad.png'), Buffer.from(shot.data, 'base64'));

  // Open Footprint Settings Modal
  console.log('[screenshot-script] Opening Footprint Settings modal...');
  await send('Runtime.evaluate', {
    expression: `
      if (typeof window.__openFootprintSettings === 'function') {
        window.__openFootprintSettings();
      }
    `,
  });

  await sleep(1000);

  console.log('[screenshot-script] Capturing Footprint Settings modal...');
  shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(ARTIFACT_DIR, 'screenshot_footprint_settings.png'), Buffer.from(shot.data, 'base64'));

  console.log('[screenshot-script] Screenshots captured successfully!');
  ws.close();
  browserProc.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error('[screenshot-script] Error:', err);
  process.exit(1);
});
