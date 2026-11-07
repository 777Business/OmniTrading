/**
 * OmniTrading - Local Device Preferences
 *
 * Stores user preferences (default symbol, active broker) locally on device.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

export interface OmniPreferences {
  activeBrokerId?: string;
  activeHandle?: string;
  defaultSymbol?: string;
}

const PREFS_KEY = 'omni.preferences';

export function loadPrefs(): OmniPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as OmniPreferences;
  } catch {
    return {};
  }
}

export function savePrefs(prefs: OmniPreferences): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function clearPrefs(): void {
  try {
    localStorage.removeItem(PREFS_KEY);
  } catch {
    /* ignore */
  }
}
