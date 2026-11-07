/**
 * OmniTrading - Universal Broker & Account Management UI
 *
 * Renders broker picker (Universal Paper Trading default, followed by top global brokers),
 * dynamically generates credential forms from adapter schemas, and provides multi-account switching.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { BrokerRegistry } from '../brokers/registry';
import type { BrokerAdapter, BrokerAccount } from '../brokers/types';

function escapeHtml(text: string): string {
  return String(text || '').replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function getBrokerCategory(id: string): string {
  switch (id) {
    case 'paper': return 'Multi-Asset';
    case 'ibkr': return 'Multi-Asset';
    case 'ctrader': return 'Forex / CFDs';
    case 'oanda': return 'Forex / CFDs';
    case 'metatrader5': return 'Forex / CFDs';
    case 'binance': return 'Crypto';
    case 'alpaca': return 'US Stocks / Crypto';
    default: return 'Broker';
  }
}

function getStatusBadge(adapter: BrokerAdapter, isConnected: boolean): string {
  if (adapter.id === 'paper') {
    return '<span style="font-size: 10px; background: rgba(34, 211, 165, 0.15); color: var(--vela-accent, #22d3a5); padding: 2px 6px; border-radius: 4px; font-weight: 700; letter-spacing: 0.3px;">BUILT-IN</span>';
  }
  if (isConnected) {
    return '<span style="font-size: 10px; background: rgba(34, 197, 94, 0.2); color: #4ade80; padding: 2px 6px; border-radius: 4px; font-weight: 700; letter-spacing: 0.3px;">CONNECTED</span>';
  }
  if (adapter.id === 'ctrader' || adapter.id === 'binance' || adapter.id === 'ibkr' || adapter.id === 'oanda' || adapter.id === 'alpaca' || adapter.id === 'metatrader5') {
    return '<span style="font-size: 10px; background: rgba(148, 163, 184, 0.15); color: #94a3b8; padding: 2px 6px; border-radius: 4px; font-weight: 600;">READY</span>';
  }
  return '<span style="font-size: 10px; background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 600;">BETA</span>';
}

export function openBrokerModal(onAccountSelected?: (account: BrokerAccount) => void): void {
  const existing = document.getElementById('omni-broker-modal');
  if (existing) existing.remove();

  const registry = BrokerRegistry.getInstance();
  const adapters = registry.getAdapters();
  const currentAdapter = registry.getActiveAdapter();
  const currentAccount = registry.getActiveAccount();

  const backdrop = document.createElement('div');
  backdrop.id = 'omni-broker-modal';
  backdrop.className = 'ct-overlay';

  backdrop.innerHTML = `
    <div class="ct-card" style="max-width: 760px; width: 94vw; max-height: 88vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 14px; background: var(--vela-surface-elev, #151619); border: 1px solid var(--vela-border, #2a2b30); box-shadow: 0 30px 80px rgba(0,0,0,0.85); font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      
      <!-- Modal Header -->
      <div style="padding: 18px 24px; border-bottom: 1px solid var(--vela-border, #2a2b30); display: flex; justify-content: space-between; align-items: center; background: var(--vela-surface, #12161c);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 36px; height: 36px; border-radius: 8px; background: linear-gradient(135deg, #22d3a5, #089981); color: #0b0e11; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 800;">
            ⚡
          </div>
          <div>
            <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: var(--vela-fg-bright, #f8fafc); letter-spacing: -0.2px;">Connect Broker or Platform</h2>
            <p style="margin: 2px 0 0 0; font-size: 12px; color: var(--vela-fg-muted, #8b98a5);">Choose a broker or paper trading platform. API keys and credentials never leave this device.</p>
          </div>
        </div>
        <button type="button" class="btn-close" style="background: none; border: none; color: var(--vela-fg-muted, #8b98a5); font-size: 20px; cursor: pointer; padding: 6px; line-height: 1; border-radius: 6px; transition: background 0.15s ease;">✕</button>
      </div>

      <!-- Main Body Container -->
      <div style="display: flex; flex: 1; min-height: 440px; overflow: hidden;">
        
        <!-- Left Sidebar: Broker Picker -->
        <div style="width: 260px; border-right: 1px solid var(--vela-border, #2a2b30); background: var(--vela-surface-sunken, #0b0e11); padding: 12px 10px; display: flex; flex-direction: column; gap: 6px; overflow-y: auto;">
          <div style="font-size: 10px; font-weight: 700; color: var(--vela-fg-muted, #8b98a5); text-transform: uppercase; padding: 4px 10px; letter-spacing: 0.6px;">Supported Brokers &amp; Feeds</div>
          
          <div class="broker-list-items" style="display: flex; flex-direction: column; gap: 4px;">
            ${adapters
              .map((adapter) => {
                const isSelected = adapter.id === currentAdapter.id;
                const isConn = adapter.isConnected();
                const badge = getStatusBadge(adapter, isConn);
                const category = getBrokerCategory(adapter.id);

                return `
                  <button type="button" class="btn-broker-item" data-id="${adapter.id}" style="width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px; border: 1px solid ${isSelected ? 'var(--vela-accent, #22d3a5)' : 'transparent'}; background: ${isSelected ? 'rgba(34, 211, 165, 0.12)' : 'transparent'}; color: ${isSelected ? 'var(--vela-fg-bright, #f8fafc)' : 'var(--vela-fg, #cbd5e1)'}; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: all 0.15s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                      <strong style="font-size: 13px; font-weight: 600;">${escapeHtml(adapter.name.split('(')[0].trim())}</strong>
                      ${badge}
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                      <span style="font-size: 11px; color: var(--vela-fg-muted, #8b98a5);">${escapeHtml(category)}</span>
                      ${isSelected ? '<span style="font-size: 11px; color: var(--vela-accent, #22d3a5); font-weight: 700;">● Active</span>' : ''}
                    </div>
                  </button>
                `;
              })
              .join('')}
          </div>

          <div style="margin-top: auto; padding: 10px; border-top: 1px solid var(--vela-border, #2a2b30); font-size: 11px; color: var(--vela-fg-muted, #8b98a5); line-height: 1.4;">
            <div style="display: flex; align-items: center; gap: 6px; color: var(--vela-accent, #22d3a5); font-weight: 600; margin-bottom: 2px;">
              <span>🛡️ 100% Broker-Neutral</span>
            </div>
            Universal architecture. No broker is locked in or promoted.
          </div>
        </div>

        <!-- Right Content Pane: Details & Form -->
        <div class="omni-adapter-detail" style="flex: 1; padding: 22px 28px; overflow-y: auto; display: flex; flex-direction: column; gap: 18px; background: var(--vela-surface-elev, #151619);">
          <!-- Dynamically populated -->
        </div>
      </div>

      <!-- Modal Footer -->
      <div style="padding: 14px 24px; border-top: 1px solid var(--vela-border, #2a2b30); background: var(--vela-surface, #12161c); display: flex; justify-content: space-between; align-items: center;">
        <button type="button" class="btn-delete-all" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; text-decoration: underline; padding: 4px;">
          Clear all saved credentials
        </button>
        <button type="button" class="btn-cancel" style="background: var(--vela-surface-sunken, #0b0e11); border: 1px solid var(--vela-border, #2a2b30); color: var(--vela-fg, #cbd5e1); padding: 8px 18px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
          Close
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  const detailContainer = backdrop.querySelector('.omni-adapter-detail') as HTMLElement;
  let activeDetailId = currentAdapter.id;

  const renderDetail = async (adapterId: string) => {
    const adapter = registry.getAdapter(adapterId);
    if (!adapter) return;

    const isConnected = adapter.isConnected();

    detailContainer.innerHTML = `
      <!-- Broker Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h3 style="margin: 0; font-size: 18px; font-weight: 700; color: #f8fafc;">${escapeHtml(adapter.name)}</h3>
            ${getStatusBadge(adapter, isConnected)}
          </div>
          <p style="margin: 4px 0 0 0; font-size: 13px; color: #94a3b8; line-height: 1.4;">${escapeHtml(adapter.description)}</p>
        </div>
        ${
          adapter.credentialSchema.docsUrl
            ? `
          <a href="${adapter.credentialSchema.docsUrl}" target="_blank" rel="noreferrer" style="font-size: 12px; color: var(--vela-accent, #22d3a5); text-decoration: none; border: 1px solid var(--vela-border, #2a2b30); background: var(--vela-surface-sunken, #0b0e11); padding: 5px 10px; border-radius: 6px; font-weight: 600; white-space: nowrap; display: inline-flex; align-items: center; gap: 4px;">
            Docs ↗
          </a>
        `
            : ''
        }
      </div>

      <!-- Instructions banner -->
      ${
        adapter.credentialSchema.instructions
          ? `
        <div style="padding: 12px 14px; background: rgba(34, 211, 165, 0.06); border: 1px solid rgba(34, 211, 165, 0.2); border-radius: 8px; font-size: 12px; color: var(--vela-fg-muted, #8b98a5); line-height: 1.5;">
          <strong style="color: var(--vela-accent, #22d3a5);">Setup Guide:</strong> ${escapeHtml(adapter.credentialSchema.instructions)}
        </div>
      `
          : ''
      }

      <!-- Accounts Section -->
      <div class="omni-accounts-section" style="display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 11px; font-weight: 700; color: #cbd5e1; text-transform: uppercase; letter-spacing: 0.5px;">
            ${adapter.id === 'paper' ? 'Available Paper Trading Platforms' : 'Configured Accounts'}
          </span>
          ${
            isConnected && adapter.id !== 'paper'
              ? `<button type="button" class="btn-disconnect-adapter" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; text-decoration: underline;">Disconnect</button>`
              : ''
          }
        </div>
        <div class="omni-accounts-list" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="color: #64748b; font-size: 12px;">Loading accounts…</div>
        </div>
      </div>

      <!-- Credential Form for external brokers -->
      ${
        adapter.credentialSchema.fields.length > 0 && adapter.credentialSchema.authType !== 'none'
          ? `
        <form class="omni-cred-form" style="display: flex; flex-direction: column; gap: 14px; border-top: 1px solid var(--vela-border, #2a2b30); padding-top: 16px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: var(--vela-fg, #cbd5e1); text-transform: uppercase; letter-spacing: 0.5px;">
              ${isConnected ? 'Update Credentials' : 'Connect Account'}
            </span>
            <span style="font-size: 11px; color: var(--vela-fg-muted, #8b98a5);">Saved locally (chmod 0600)</span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr; gap: 12px;">
            ${adapter.credentialSchema.fields
              .map((f) => {
                if (f.type === 'select' && f.options) {
                  return `
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                      <label style="font-size: 12px; font-weight: 600; color: var(--vela-fg-muted, #8b98a5);">${escapeHtml(f.label)}${f.required ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
                      <select name="${f.name}" style="padding: 9px 12px; background: var(--vela-surface-sunken, #0b0e11); border: 1px solid var(--vela-border, #2a2b30); border-radius: 6px; color: var(--vela-fg-bright, #f8fafc); font-size: 13px; outline: none;">
                        ${f.options
                          .map(
                            (opt) =>
                              `<option value="${opt.value}" ${opt.value === f.defaultValue ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`,
                          )
                          .join('')}
                      </select>
                      ${f.helpText ? `<span style="font-size: 11px; color: var(--vela-fg-muted, #8b98a5);">${escapeHtml(f.helpText)}</span>` : ''}
                    </div>
                  `;
                }

                return `
                  <div style="display: flex; flex-direction: column; gap: 4px;">
                    <label style="font-size: 12px; font-weight: 600; color: var(--vela-fg-muted, #8b98a5);">${escapeHtml(f.label)}${f.required ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
                    <input type="${f.type}" name="${f.name}" value="${f.defaultValue || ''}" placeholder="${escapeHtml(f.placeholder || '')}" style="padding: 9px 12px; background: var(--vela-surface-sunken, #0b0e11); border: 1px solid var(--vela-border, #2a2b30); border-radius: 6px; color: var(--vela-fg-bright, #f8fafc); font-size: 13px; outline: none;" ${f.required ? 'required' : ''} />
                    ${f.helpText ? `<span style="font-size: 11px; color: var(--vela-fg-muted, #8b98a5);">${escapeHtml(f.helpText)}</span>` : ''}
                  </div>
                `;
              })
              .join('')}
          </div>

          <div class="omni-cred-status" style="font-size: 12px; min-height: 16px;"></div>

          <div style="display: flex; gap: 10px; align-items: center;">
            <button type="submit" style="padding: 9px 20px; background: var(--vela-accent, #22d3a5); color: #0b0e11; border: none; border-radius: 6px; font-weight: 700; font-size: 13px; cursor: pointer; transition: background 0.15s ease;">
              ${isConnected ? 'Save Changes' : 'Connect Broker'}
            </button>
          </div>
        </form>
      `
          : ''
      }
    `;

    // Populate accounts
    const accListEl = detailContainer.querySelector('.omni-accounts-list') as HTMLElement;
    try {
      const accounts = await adapter.getAccounts();
      if (accounts.length === 0) {
        accListEl.innerHTML = `
          <div style="padding: 18px; background: #0d1527; border: 1px dashed #334155; border-radius: 8px; font-size: 12px; color: #64748b; text-align: center; line-height: 1.5;">
            No accounts connected for this broker yet.<br />
            Enter your credentials below and click <strong>Connect Broker</strong> to activate.
          </div>
        `;
      } else {
        accListEl.innerHTML = accounts
          .map((acc) => {
            const isAccActive = currentAccount?.id === acc.id && currentAdapter.id === adapter.id;
            const envTag =
              acc.environment === 'live'
                ? '<span style="background: rgba(239, 68, 68, 0.2); color: #f87171; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">LIVE</span>'
                : acc.environment === 'demo'
                ? '<span style="background: rgba(245, 158, 11, 0.2); color: #fbbf24; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">DEMO</span>'
                : '<span style="background: rgba(34, 211, 165, 0.15); color: #22d3a5; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">PAPER</span>';

            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: ${isAccActive ? 'rgba(34, 211, 165, 0.08)' : 'var(--vela-surface-sunken, #0b0e11)'}; border: 1px solid ${isAccActive ? 'var(--vela-accent, #22d3a5)' : 'var(--vela-border, #2a2b30)'}; border-radius: 8px; transition: border-color 0.15s ease;">
                <div style="display: flex; flex-direction: column; gap: 3px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 13px; color: #f8fafc;">${escapeHtml(acc.name)}</strong>
                    ${envTag}
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px; font-size: 12px; color: #64748b;">
                    <span>Account: <code style="color: #94a3b8; font-family: monospace;">${escapeHtml(String(acc.accountNumber))}</code></span>
                    <span>•</span>
                    <span>Balance: <strong style="color: var(--vela-accent, #22d3a5);">${escapeHtml(acc.balanceFormatted || `$${acc.balance.toFixed(2)}`)}</strong></span>
                  </div>
                </div>
                <button type="button" class="btn-select-acc" data-acc-id="${acc.id}" style="padding: 7px 16px; background: ${isAccActive ? '#089981' : 'var(--vela-accent, #22d3a5)'}; color: ${isAccActive ? '#fff' : '#0b0e11'}; border: none; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.15s ease;">
                  ${isAccActive ? '✓ Active' : 'Switch to Account'}
                </button>
              </div>
            `;
          })
          .join('');

        // Wire select account buttons
        accListEl.querySelectorAll('.btn-select-acc').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const accId = btn.getAttribute('data-acc-id');
            if (accId) {
              await registry.setActiveAdapter(adapterId);
              const selected = await adapter.selectAccount(accId);
              registry.setActiveAccount(selected);
              backdrop.remove();
              onAccountSelected?.(selected);
              window.location.reload();
            }
          });
        });
      }
    } catch (e: any) {
      accListEl.innerHTML = `<div style="color: #ef4444; font-size: 12px;">Error loading accounts: ${escapeHtml(e.message)}</div>`;
    }

    // Wire disconnect button
    detailContainer.querySelector('.btn-disconnect-adapter')?.addEventListener('click', async () => {
      if (confirm(`Disconnect ${adapter.name} and clear credentials?`)) {
        await adapter.disconnect();
        await registry.setActiveAdapter('paper');
        window.location.reload();
      }
    });

    // Wire form submit
    const form = detailContainer.querySelector('.omni-cred-form') as HTMLFormElement | null;
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusEl = form.querySelector('.omni-cred-status') as HTMLElement;
        statusEl.textContent = 'Connecting and verifying credentials…';
        statusEl.style.color = 'var(--vela-accent, #22d3a5)';

        const formData = new FormData(form);
        const credentials: Record<string, any> = {};
        formData.forEach((val, key) => (credentials[key] = val));

        try {
          if (adapter.credentialSchema.authType === 'oauth') {
            const res = await fetch('/api/auth/app', {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'x-omni-session': (window as any).__OMNI_SESSION_TOKEN || '',
              },
              body: JSON.stringify(credentials),
            });
            if (!res.ok) throw new Error('Failed to save app credentials');
            statusEl.textContent = 'Opening broker sign in window…';
            const winRes = await fetch('/api/auth/url');
            const { url } = await winRes.json();
            window.open(url, '_blank');
          } else {
            const env = credentials.environment || 'demo';
            await adapter.connect(credentials, env);
            await registry.setActiveAdapter(adapterId);
            const accounts = await adapter.getAccounts();
            if (accounts.length > 0) {
              registry.setActiveAccount(accounts[0]);
            }
            statusEl.textContent = 'Connected successfully! Reloading platform…';
            statusEl.style.color = '#22c55e';
            setTimeout(() => window.location.reload(), 600);
          }
        } catch (err: any) {
          statusEl.textContent = err.message || String(err);
          statusEl.style.color = '#ef4444';
        }
      });
    }
  };

  // Wire list items click
  backdrop.querySelectorAll('.btn-broker-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id') || 'paper';
      activeDetailId = id;

      backdrop.querySelectorAll<HTMLButtonElement>('.btn-broker-item').forEach((b) => {
        b.style.borderColor = 'transparent';
        b.style.backgroundColor = 'transparent';
      });
      (btn as HTMLButtonElement).style.borderColor = 'var(--vela-accent, #22d3a5)';
      (btn as HTMLButtonElement).style.backgroundColor = 'rgba(34, 211, 165, 0.12)';

      renderDetail(id);
    });
  });

  // Wire close buttons
  backdrop.querySelector('.btn-close')?.addEventListener('click', () => backdrop.remove());
  backdrop.querySelector('.btn-cancel')?.addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  // Wire delete all local data
  backdrop.querySelector('.btn-delete-all')?.addEventListener('click', async () => {
    if (confirm('Are you sure you want to delete all saved credentials on this device?')) {
      try {
        await fetch('/api/auth/delete-all-data', {
          method: 'POST',
          headers: { 'x-omni-session': (window as any).__OMNI_SESSION_TOKEN || '' },
        });
        localStorage.clear();
        alert('All local credentials and preferences have been deleted.');
        window.location.reload();
      } catch (err: any) {
        alert('Error: ' + err.message);
      }
    }
  });

  // Initial render
  renderDetail(activeDetailId);
}
