/**
 * OmniTrading - Cross-Platform Node Launcher
 *
 * Runs OmniTrading on Windows, macOS, and Linux using pure Node.js.
 * Automatically compiles the application bundle if dist/app.js is missing.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distAppJs = path.join(rootDir, 'dist', 'app.js');

// 1. Ensure dist/app.js exists; build automatically if missing
if (!fs.existsSync(distAppJs)) {
  console.log('[omni-start] dist/app.js not found. Running initial build...');

  // Run patch-vela
  const patchScript = path.join(rootDir, 'scripts', 'patch-vela.cjs');
  const patchRes = spawnSync(process.execPath, [patchScript], {
    cwd: rootDir,
    stdio: 'inherit',
  });
  if (patchRes.status !== 0) {
    console.error('[omni-start] Failed to run patch-vela.cjs');
    process.exit(patchRes.status || 1);
  }

  // Run esbuild
  const esbuildBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'esbuild.cmd' : 'esbuild'
  );
  const esbuildArgs = [
    'src/main.ts',
    '--bundle',
    '--format=iife',
    '--target=es2022',
    '--outfile=dist/app.js',
  ];

  let buildRes;
  if (fs.existsSync(esbuildBin)) {
    buildRes = spawnSync(esbuildBin, esbuildArgs, { cwd: rootDir, stdio: 'inherit' });
  } else {
    buildRes = spawnSync(process.execPath, [path.join(rootDir, 'node_modules', 'esbuild', 'bin', 'esbuild'), ...esbuildArgs], {
      cwd: rootDir,
      stdio: 'inherit',
    });
  }

  if (buildRes.status !== 0) {
    console.error('[omni-start] Failed to compile application bundle.');
    process.exit(buildRes.status || 1);
  }
  console.log('[omni-start] Application bundle compiled successfully.');
}

// 2. Start OmniTrading server
const serverScript = path.join(__dirname, 'omni-server.mjs');
const serverProcess = spawn(process.execPath, [serverScript], {
  cwd: rootDir,
  stdio: 'inherit',
  env: process.env,
});

serverProcess.on('exit', (code) => {
  process.exit(code || 0);
});

// Forward termination signals
process.on('SIGINT', () => serverProcess.kill('SIGINT'));
process.on('SIGTERM', () => serverProcess.kill('SIGTERM'));

// 3. Optional browser auto-launch for desktop sessions
const PORT = process.env.PORT || process.env.OMNI_PORT || 8787;
const HOST = process.env.HOST || process.env.OMNI_HOST || '127.0.0.1';
const appUrl = `http://${HOST}:${PORT}`;

if (process.stdout.isTTY && !process.env.CI && !process.env.NO_OPEN) {
  setTimeout(() => {
    try {
      if (process.platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', appUrl], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'darwin') {
        spawn('open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
      } else if (process.platform === 'linux') {
        spawn('xdg-open', [appUrl], { detached: true, stdio: 'ignore' }).unref();
      }
    } catch {
      /* ignore open errors */
    }
  }, 1000);
}
