// OmniTrading About Dialog
// Displays application information, legal attribution, and risk disclaimers.

import { openUpdateModal } from './updateModal';

export function openAboutModal(): void {
  const existing = document.getElementById('omni-about-modal');
  existing?.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'omni-about-modal';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #e2e8f0;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: #131722;
    border: 1px solid #2a2e39;
    border-radius: 12px;
    width: 480px;
    max-width: 90vw;
    box-shadow: 0 20px 40px rgba(0,0,0,0.6);
    overflow: hidden;
    animation: omni-fade-in 0.15s ease-out;
  `;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2a2e39;">
      <div style="display:flex;align-items:center;gap:10px;">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#22d3a5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <path d="m8 12 3 3 5-6"></path>
        </svg>
        <div style="font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:0.3px;">About OmniTrading</div>
      </div>
      <button id="omni-about-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
    </div>

    <div style="padding:20px;display:flex;flex-direction:column;gap:16px;font-size:13px;line-height:1.6;color:#cbd5e1;">
      <div>
        <div style="font-weight:600;font-size:14px;color:#f8fafc;margin-bottom:4px;">OmniTrading v0.1.0</div>
        <div>Fast, local, private, fully customizable broker-neutral trading platform.</div>
        <div style="margin-top:4px;">
          Repository: <a href="https://github.com/777Business/OmniTrading" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none;">github.com/777Business/OmniTrading</a>
        </div>
      </div>

      <div style="border-top:1px solid #2a2e39;padding-top:12px;">
        <div style="font-weight:600;color:#f8fafc;margin-bottom:4px;">Charting Engine Attribution</div>
        <div>
          Charts powered by <a href="https://luxalgo.com/vela" target="_blank" rel="noopener noreferrer" style="color:#22d3a5;text-decoration:underline;font-weight:600;">Vela</a> (<a href="https://velacharts.dev" target="_blank" rel="noopener noreferrer" style="color:#38bdf8;text-decoration:none;">velacharts.dev</a>), developed by LuxAlgo under the Apache License, Version 2.0.
        </div>
        <div style="font-size:12px;color:#94a3b8;margin-top:4px;">
          Vela's visible attribution mark is preserved and displayed on all chart views in compliance with Section 4(d) of the Apache 2.0 License.
        </div>
      </div>

      <div style="border-top:1px solid #2a2e39;padding-top:12px;">
        <div style="font-weight:600;color:#f8fafc;margin-bottom:4px;">Licenses</div>
        <div style="font-size:12px;color:#94a3b8;">
          OmniTrading application code is licensed under the <strong style="color:#cbd5e1;">MIT License</strong>.<br/>
          Third-party components retain their respective licenses (Vela: Apache-2.0, ws: MIT, esbuild: MIT).
        </div>
      </div>

      <div style="background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);border-radius:6px;padding:12px;font-size:11.5px;color:#fca5a5;line-height:1.5;">
        <strong style="color:#ef4444;display:block;margin-bottom:2px;">TRADING RISK DISCLAIMER</strong>
        Trading financial instruments carries substantial risk of loss. OmniTrading is open-source software provided "AS IS" without warranty of any kind. OmniTrading is not a broker, holds no user funds, and provides no financial advice. Users are solely responsible for all orders executed through their connected accounts.
      </div>
    </div>

    <div style="padding:12px 20px;background:#0d1117;border-top:1px solid #2a2e39;display:flex;justify-content:space-between;align-items:center;">
      <button id="omni-about-check-update" style="background:rgba(56,189,248,0.12);border:1px solid rgba(56,189,248,0.3);color:#38bdf8;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;">
        ⚡ Check for Updates
      </button>
      <button id="omni-about-ok" style="background:#2a2e39;border:1px solid #3b4252;color:#f8fafc;padding:6px 18px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Close</button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  modal.querySelector('#omni-about-close')?.addEventListener('click', close);
  modal.querySelector('#omni-about-ok')?.addEventListener('click', close);
  modal.querySelector('#omni-about-check-update')?.addEventListener('click', () => {
    close();
    openUpdateModal();
  });
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
      window.removeEventListener('keydown', onKey);
    }
  };
  window.addEventListener('keydown', onKey);
}
