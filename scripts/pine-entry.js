/**
 * Optional Pine Script execution runtime entry.
 * Bundled into dist/pine-engine.js when user runs `npm run add:pine`.
 */
import { PineWorkerEngine } from '@luxalgo/vela-pinets';

if (typeof window !== 'undefined') {
  window.PineWorkerEngine = PineWorkerEngine;
}
