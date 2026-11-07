/**
 * OmniTrading - Local Server API Client
 *
 * Provides typed methods for interacting with the local OmniTrading server.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

let cachedSessionToken: string | null = null;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(init?.body ? { 'content-type': 'application/json' } : {}),
    ...(init?.headers as Record<string, string> || {}),
  };

  if (cachedSessionToken && !headers['x-omni-session']) {
    headers['x-omni-session'] = cachedSessionToken;
  }

  const response = await fetch(path, {
    cache: 'no-store',
    ...init,
    headers,
  });

  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

export async function getSession(): Promise<{ sessionToken: string; killSwitchActive: boolean; maxOrderVolume: number }> {
  const data = await request<{ sessionToken: string; killSwitchActive: boolean; maxOrderVolume: number }>('/api/session');
  cachedSessionToken = data.sessionToken;
  return data;
}

export function getStatus(): Promise<{ appConfigured: boolean; loggedIn: boolean; redirectUri: string; authError?: string | null }> {
  return request('/api/auth/status');
}

export function toggleKillSwitch(active: boolean): Promise<{ ok: boolean; killSwitchActive: boolean }> {
  return request('/api/trade/killswitch', {
    method: 'POST',
    body: JSON.stringify({ active }),
  });
}

export function enableLiveAccountTrading(handle: string): Promise<{ ok: boolean }> {
  return request('/api/trade/account/enable-trading', {
    method: 'POST',
    body: JSON.stringify({ handle, riskAcknowledged: true }),
  });
}

export function getAccounts(): Promise<{ accounts: any[] }> {
  return request('/api/accounts');
}

export function logout(): Promise<unknown> {
  return request('/api/auth/logout', { method: 'POST' });
}

export function deleteAllData(): Promise<unknown> {
  return request('/api/auth/delete-all-data', { method: 'POST' });
}
