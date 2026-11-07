/**
 * OmniTrading - Universal Broker & Account Management UI
 *
 * Renders broker picker (Paper Trading default, followed by external brokers in alphabetical order),
 * dynamically generates credential forms from adapter schemas, and provides multi-account switching.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

import { BrokerRegistry } from '../brokers/registry';
import type { BrokerAdapter, BrokerAccount, BrokerEnvironment } from '../brokers/types';

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
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
    <div class="ct-card" style="max-width: 620px; width: 92vw; max-height: 90vh; display: flex; flex-direction: column; padding: 0; overflow: hidden; border-radius: 12px; background: #0f172a; border: 1px solid #334155; box-shadow: 0 25px 60px rgba(0,0,0,0.7);">
      <!-- Header -->
      <div style="padding: 18px 24px; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; background: #131c31;">
        <div>
          <h2 style="margin: 0; font-size: 17px; font-weight: 700; color: #f8fafc; letter-spacing: -0.2px;">Connect Broker or Exchange</h2>
          <p style="margin: 3px 0 0 0; font-size: 12px; color: #94a3b8;">Choose a broker to trade with your own credentials. Credentials are kept only on your device.</p>
        </div>
        <button type="button" class="btn-close" style="background: none; border: none; color: #94a3b8; font-size: 20px; cursor: pointer; padding: 4px;">✕</button>
      </div>

      <!-- Body / Tabs -->
      <div style="display: flex; flex: 1; min-height: 380px; overflow: hidden;">
        <!-- Left: Broker Selection List -->
        <div style="width: 220px; border-right: 1px solid #1e293b; background: #0d1527; padding: 12px 8px; display: flex; flex-direction: column; gap: 4px; overflow-y: auto;">
          <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase; padding: 6px 10px; letter-spacing: 0.5px;">Supported Adapters</div>
          ${adapters
            .map((adapter) => {
              const isSelected = adapter.id === currentAdapter.id;
              const isPaper = adapter.id === 'paper';
              const statusBadge = isPaper
                ? '<span style="font-size: 10px; background: rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 5px; border-radius: 4px; font-weight: 600;">DEFAULT</span>'
                : adapter.id === 'ctrader'
                ? '<span style="font-size: 9px; background: rgba(59, 130, 246, 0.2); color: #60a5fa; padding: 2px 5px; border-radius: 4px; font-weight: 600;">BETA</span>'
                : '<span style="font-size: 9px; background: rgba(245, 158, 11, 0.2); color: #f59e0b; padding: 2px 5px; border-radius: 4px; font-weight: 600;">PREVIEW (STUB)</span>';

              return `
                <button type="button" class="btn-broker-item" data-id="${adapter.id}" style="width: 100%; text-align: left; padding: 10px 12px; border-radius: 8px; border: 1px solid ${isSelected ? '#38bdf8' : 'transparent'}; background: ${isSelected ? 'rgba(56, 189, 248, 0.12)' : 'transparent'}; color: ${isSelected ? '#f8fafc' : '#cbd5e1'}; cursor: pointer; display: flex; flex-direction: column; gap: 4px; transition: all 0.15s ease;">
                  <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
                    <strong style="font-size: 13px;">${escapeHtml(adapter.name.split('(')[0].trim())}</strong>
                    ${statusBadge}
                  </div>
                  <span style="font-size: 11px; color: #64748b; line-height: 1.2;">${escapeHtml(adapter.name.includes('(') ? '(' + adapter.name.split('(')[1] : '')}</span>
                </button>
              `;
            })
            .join('')}
          <div style="font-size: 11px; color: #475569; padding: 12px 10px; border-top: 1px solid #1e293b; margin-top: auto; line-height: 1.4;">
            <strong>Wanted Adapters:</strong><br />Alpaca, Binance, IBKR.<br />Contributions welcome!
          </div>
        </div>

        <!-- Right: Config Form & Accounts -->
        <div class="omni-adapter-detail" style="flex: 1; padding: 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 16px;">
          <!-- Dynamically populated -->
        </div>
      </div>

      <!-- Footer -->
      <div style="padding: 12px 24px; border-top: 1px solid #1e293b; background: #131c31; display: flex; justify-content: space-between; align-items: center;">
        <button type="button" class="btn-delete-all" style="background: none; border: none; color: #ef4444; font-size: 12px; cursor: pointer; text-decoration: underline;">
          Delete all local credentials
        </button>
        <button type="button" class="btn-cancel" style="background: #1e293b; border: 1px solid #334155; color: #cbd5e1; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;">
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

    detailContainer.innerHTML = `
      <div>
        <h3 style="margin: 0; font-size: 16px; color: #f8fafc;">${escapeHtml(adapter.name)}</h3>
        <p style="margin: 4px 0 0 0; font-size: 12px; color: #94a3b8;">${escapeHtml(adapter.description)}</p>
      </div>

      <!-- Instructions & Docs -->
      ${
        adapter.credentialSchema.instructions
          ? `
        <div style="padding: 10px 14px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2); border-radius: 8px; font-size: 12px; color: #94a3b8; line-height: 1.4;">
          ${escapeHtml(adapter.credentialSchema.instructions)}
          ${
            adapter.credentialSchema.docsUrl
              ? `<div style="margin-top: 6px;"><a href="${adapter.credentialSchema.docsUrl}" target="_blank" rel="noreferrer" style="color: #38bdf8; text-decoration: underline; font-weight: 600;">Official Documentation &amp; Setup Guide ↗</a></div>`
              : ''
          }
        </div>
      `
          : ''
      }

      <!-- Configured Accounts List -->
      <div class="omni-accounts-section" style="display: flex; flex-direction: column; gap: 8px;">
        <span style="font-size: 12px; font-weight: 700; color: #cbd5e1; text-transform: uppercase;">Configured Accounts</span>
        <div class="omni-accounts-list" style="display: flex; flex-direction: column; gap: 6px;">
          <div style="color: #64748b; font-size: 12px;">Loading accounts…</div>
        </div>
      </div>

      <!-- Credential Form if required -->
      ${
        adapter.credentialSchema.fields.length > 0 && adapter.credentialSchema.authType !== 'none'
          ? `
        <form class="omni-cred-form" style="display: flex; flex-direction: column; gap: 12px; border-top: 1px solid #1e293b; padding-top: 14px;">
          <span style="font-size: 12px; font-weight: 700; color: #cbd5e1; text-transform: uppercase;">Add / Update Credentials</span>
          ${adapter.credentialSchema.fields
            .map(
              (f) => `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <label style="font-size: 12px; color: #94a3b8;">${escapeHtml(f.label)}${f.required ? ' <span style="color:#ef4444;">*</span>' : ''}</label>
              <input type="${f.type}" name="${f.name}" placeholder="${escapeHtml(f.placeholder || '')}" style="padding: 8px 12px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #f8fafc; font-size: 13px; outline: none;" ${f.required ? 'required' : ''} />
              ${f.helpText ? `<span style="font-size: 11px; color: #64748b;">${escapeHtml(f.helpText)}</span>` : ''}
            </div>
          `,
            )
            .join('')}
          <div class="omni-cred-status" style="font-size: 12px;"></div>
          <button type="submit" style="align-self: flex-start; padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 6px; font-weight: 600; font-size: 13px; cursor: pointer;">
            Save &amp; Connect
          </button>
        </form>
      `
          : ''
      }
    `;

    // Load accounts
    const accListEl = detailContainer.querySelector('.omni-accounts-list') as HTMLElement;
    try {
      const accounts = await adapter.getAccounts();
      if (accounts.length === 0) {
        accListEl.innerHTML = `
          <div style="padding: 12px; background: rgba(255,255,255,0.03); border-radius: 6px; font-size: 12px; color: #64748b; text-align: center;">
            No accounts connected for this adapter yet.
          </div>
        `;
      } else {
        accListEl.innerHTML = accounts
          .map((acc) => {
            const isAccActive = currentAccount?.id === acc.id;
            const envTag =
              acc.environment === 'live'
                ? '<span style="background: rgba(239, 68, 68, 0.2); color: #ef4444; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">LIVE</span>'
                : acc.environment === 'demo'
                ? '<span style="background: rgba(245, 158, 11, 0.2); color: #f59e0b; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">DEMO</span>'
                : '<span style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px;">PAPER</span>';

            return `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: ${isAccActive ? 'rgba(56, 189, 248, 0.1)' : '#162035'}; border: 1px solid ${isAccActive ? '#38bdf8' : '#334155'}; border-radius: 8px;">
                <div style="display: flex; flex-direction: column; gap: 2px;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <strong style="font-size: 13px; color: #f8fafc;">${escapeHtml(acc.name)}</strong>
                    ${envTag}
                  </div>
                  <span style="font-size: 12px; color: #38bdf8; font-weight: 600;">${escapeHtml(acc.balanceFormatted || `$${acc.balance.toFixed(2)}`)}</span>
                </div>
                <button type="button" class="btn-select-acc" data-acc-id="${acc.id}" style="padding: 6px 12px; background: ${isAccActive ? '#22c55e' : '#2563eb'}; color: #fff; border: none; border-radius: 5px; font-size: 12px; font-weight: 600; cursor: pointer;">
                  ${isAccActive ? '✓ Active' : 'Switch'}
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
      accListEl.innerHTML = `<div style="color: #ef4444; font-size: 12px;">Error loading accounts: ${e.message}</div>`;
    }

    // Wire form submit
    const form = detailContainer.querySelector('.omni-cred-form') as HTMLFormElement | null;
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const statusEl = form.querySelector('.omni-cred-status') as HTMLElement;
        statusEl.textContent = 'Connecting…';
        statusEl.style.color = '#38bdf8';

        const formData = new FormData(form);
        const credentials: Record<string, any> = {};
        formData.forEach((val, key) => (credentials[key] = val));

        try {
          if (adapter.credentialSchema.authType === 'oauth') {
            const res = await fetch('/api/auth/app', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(credentials),
            });
            if (!res.ok) throw new Error('Failed to save app credentials');
            statusEl.textContent = 'Opening broker sign in window…';
            const winRes = await fetch('/api/auth/url');
            const { url } = await winRes.json();
            window.open(url, '_blank');
          } else {
            await adapter.connect(credentials, 'demo');
            statusEl.textContent = 'Connected successfully!';
            statusEl.style.color = '#22c55e';
          }
          await renderDetail(adapterId);
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

      backdrop.querySelectorAll('.btn-broker-item').forEach((b) => {
        b.setAttribute('style', b.getAttribute('style')!.replace('#38bdf8', 'transparent').replace('rgba(56, 189, 248, 0.12)', 'transparent'));
      });
      btn.setAttribute('style', btn.getAttribute('style')!.replace('transparent', '#38bdf8').replace('transparent', 'rgba(56, 189, 248, 0.12)'));

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
        await fetch('/api/auth/delete-all-data', { method: 'POST' });
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
