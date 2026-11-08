/**
 * OmniTrading - In-App Update Notification & 1-Click Auto-Updater
 *
 * Checks for updates from the official repository, notifies the user
 * with a sleek non-intrusive badge, and performs 1-click git pull and bundle recompilation.
 *
 * Copyright (c) 2026 777Business
 * Licensed under the MIT License.
 */

export interface UpdateStatus {
  updateAvailable: boolean;
  currentVersion: string;
  currentCommit: string;
  latestCommit: string;
  commitMessage: string;
  commitDate: string;
  isGitRepo: boolean;
  offline?: boolean;
}

export async function fetchUpdateStatus(): Promise<UpdateStatus> {
  try {
    const res = await fetch('/api/system/update-status');
    if (!res.ok) throw new Error('Status failed');
    return await res.json();
  } catch {
    return {
      updateAvailable: false,
      currentVersion: '0.1.0',
      currentCommit: 'local',
      latestCommit: 'local',
      commitMessage: '',
      commitDate: '',
      isGitRepo: false,
      offline: true,
    };
  }
}

export function openUpdateModal(preloadedStatus?: UpdateStatus): void {
  const existing = document.getElementById('omni-update-modal');
  if (existing) existing.remove();

  const backdrop = document.createElement('div');
  backdrop.id = 'omni-update-modal';
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 100000;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(5px);
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #e2e8f0;
  `;

  const modal = document.createElement('div');
  modal.style.cssText = `
    background: var(--vela-surface-elev, #131722);
    border: 1px solid var(--vela-border, #2a2e39);
    border-radius: 12px;
    width: 500px;
    max-width: 92vw;
    box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8);
    overflow: hidden;
  `;

  modal.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #2a2e39;background:var(--vela-surface,#0e1118);">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:28px;height:28px;border-radius:6px;background:linear-gradient(135deg,#38bdf8,#0284c7);display:flex;align-items:center;justify-content:center;font-size:15px;color:#fff;font-weight:bold;">
          ⚡
        </div>
        <div style="font-size:16px;font-weight:700;color:#f8fafc;letter-spacing:0.2px;">OmniTrading System Updates</div>
      </div>
      <button id="omni-update-close" style="background:none;border:none;color:#94a3b8;font-size:20px;cursor:pointer;padding:4px 8px;border-radius:4px;line-height:1;">&times;</button>
    </div>

    <div id="omni-update-body" style="padding:22px;display:flex;flex-direction:column;gap:16px;font-size:13px;line-height:1.5;color:#cbd5e1;">
      <div style="display:flex;align-items:center;gap:8px;color:#94a3b8;">
        <span style="display:inline-block;width:12px;height:12px;border:2px solid #38bdf8;border-top-color:transparent;border-radius:50%;animation:omni-spin 0.8s linear infinite;"></span>
        Checking for latest updates from GitHub...
      </div>
    </div>

    <div style="padding:12px 20px;background:#0d1117;border-top:1px solid #2a2e39;display:flex;justify-content:flex-end;gap:10px;">
      <button id="omni-update-cancel" style="background:#2a2e39;border:1px solid #3b4252;color:#cbd5e1;padding:7px 16px;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Cancel</button>
      <button id="omni-update-action" disabled style="background:#0284c7;border:none;color:#ffffff;padding:7px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:not-allowed;opacity:0.6;display:inline-flex;align-items:center;gap:6px;">
        Check for Updates
      </button>
    </div>
  `;

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  modal.querySelector('#omni-update-close')?.addEventListener('click', close);
  modal.querySelector('#omni-update-cancel')?.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  const renderStatus = (status: UpdateStatus) => {
    const bodyEl = modal.querySelector('#omni-update-body');
    const actionBtn = modal.querySelector('#omni-update-action') as HTMLButtonElement;
    if (!bodyEl || !actionBtn) return;

    if (status.offline) {
      bodyEl.innerHTML = `
        <div style="padding:12px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.25);border-radius:8px;color:#fca5a5;">
          Unable to connect to GitHub remote. Check your internet connection or try again later.
        </div>
      `;
      actionBtn.textContent = 'Retry';
      actionBtn.disabled = false;
      actionBtn.style.opacity = '1';
      actionBtn.style.cursor = 'pointer';
      actionBtn.onclick = () => doCheck();
      return;
    }

    if (!status.updateAvailable) {
      bodyEl.innerHTML = `
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:rgba(34,211,165,0.08);border:1px solid rgba(34,211,165,0.25);border-radius:8px;">
          <div style="font-size:24px;">✅</div>
          <div>
            <strong style="color:#22d3a5;display:block;margin-bottom:2px;">OmniTrading is Up to Date</strong>
            <span style="font-size:12px;color:#94a3b8;">You are running version <strong>v${status.currentVersion}</strong> (commit: <code>${status.currentCommit}</code>).</span>
          </div>
        </div>
      `;
      actionBtn.textContent = 'Up to Date';
      actionBtn.disabled = true;
      actionBtn.style.opacity = '0.5';
      actionBtn.style.cursor = 'default';
      return;
    }

    // Update Available!
    bodyEl.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);border-radius:8px;">
        <div style="font-size:24px;">🚀</div>
        <div>
          <strong style="color:#38bdf8;display:block;margin-bottom:4px;font-size:14px;">New Update Ready to Install!</strong>
          <div style="font-size:12px;color:#cbd5e1;line-height:1.4;">
            Current: <code>${status.currentCommit}</code> &nbsp;➔&nbsp; Latest: <strong style="color:#22d3a5;">${status.latestCommit}</strong>
          </div>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:12px 14px;">
        <div style="font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">What's New in This Update</div>
        <div style="font-size:13px;color:#f8fafc;font-weight:500;">
          ${status.commitMessage || 'Performance enhancements, platform bug fixes, and feature updates.'}
        </div>
        ${status.commitDate ? `<div style="font-size:11px;color:#64748b;margin-top:4px;">Published: ${new Date(status.commitDate).toLocaleString()}</div>` : ''}
      </div>

      <div style="font-size:12px;color:#94a3b8;line-height:1.4;">
        Clicking <strong>Install Update (1-Click)</strong> will automatically pull the newest improvements, rebuild the bundle, and refresh your workspace. Your saved settings and broker preferences are 100% preserved.
      </div>
    `;

    actionBtn.innerHTML = '⚡ Install Update (1-Click)';
    actionBtn.disabled = false;
    actionBtn.style.opacity = '1';
    actionBtn.style.cursor = 'pointer';
    actionBtn.style.background = 'linear-gradient(135deg, #22d3a5, #089981)';
    actionBtn.style.color = '#0b0e11';

    actionBtn.onclick = async () => {
      actionBtn.disabled = true;
      actionBtn.style.opacity = '0.7';
      actionBtn.style.cursor = 'wait';
      actionBtn.innerHTML = `
        <span style="display:inline-block;width:12px;height:12px;border:2px solid #0b0e11;border-top-color:transparent;border-radius:50%;animation:omni-spin 0.8s linear infinite;"></span>
        Updating...
      `;

      bodyEl.innerHTML = `
        <div style="padding:20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div style="width:36px;height:36px;border:3px solid #22d3a5;border-top-color:transparent;border-radius:50%;animation:omni-spin 0.8s linear infinite;"></div>
          <div style="font-size:14px;font-weight:600;color:#f8fafc;">Updating OmniTrading...</div>
          <div style="font-size:12px;color:#94a3b8;max-width:320px;">
            Fetching changes from GitHub repository, applying patches, and compiling application bundle. Please wait...
          </div>
        </div>
      `;

      try {
        const token = (window as any).__OMNI_SESSION_TOKEN || '';
        const res = await fetch('/api/system/perform-update', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-omni-session': token,
          },
        });
        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Update failed');
        }

        bodyEl.innerHTML = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:16px;text-align:center;">
            <div style="width:48px;height:48px;border-radius:50%;background:rgba(34,211,165,0.15);display:flex;align-items:center;justify-content:center;font-size:24px;color:#22d3a5;">
              ✓
            </div>
            <div style="font-size:15px;font-weight:700;color:#f8fafc;">Update Successfully Installed!</div>
            <div style="font-size:12px;color:#94a3b8;">
              OmniTrading has been updated to the latest version. Refreshing in 2 seconds...
            </div>
          </div>
        `;

        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } catch (err: any) {
        bodyEl.innerHTML = `
          <div style="padding:14px;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;color:#fca5a5;">
            <strong style="color:#ef4444;display:block;margin-bottom:4px;">Update Failed:</strong>
            ${err.message || 'Error occurred while updating.'}
          </div>
          <div style="font-size:12px;color:#94a3b8;margin-top:8px;">
            You can manually update from your terminal by running:
            <code style="display:block;background:#0d1117;padding:6px;border-radius:4px;margin-top:4px;">git pull && npm run build</code>
          </div>
        `;
        actionBtn.disabled = false;
        actionBtn.style.opacity = '1';
        actionBtn.style.cursor = 'pointer';
        actionBtn.innerHTML = 'Close';
        actionBtn.onclick = close;
      }
    };
  };

  const doCheck = async () => {
    const status = await fetchUpdateStatus();
    renderStatus(status);
  };

  if (preloadedStatus) {
    renderStatus(preloadedStatus);
  } else {
    doCheck();
  }
}

/**
 * Initializes automatic background update checks.
 * When a new update is found, displays a topbar notification badge.
 */
export function initUpdateChecker(toast: (msg: string) => void): void {
  const check = async () => {
    const status = await fetchUpdateStatus();
    if (status.updateAvailable) {
      showUpdateBadge(status, toast);
    }
  };

  // Check 5 seconds after load
  setTimeout(check, 5000);

  // Check every 30 minutes
  setInterval(check, 30 * 60 * 1000);
}

function showUpdateBadge(status: UpdateStatus, toast: (msg: string) => void): void {
  const existing = document.getElementById('omni-update-badge');
  if (existing) return;

  const badge = document.createElement('div');
  badge.id = 'omni-update-badge';
  badge.style.cssText = `
    position: fixed;
    top: 8px;
    right: 180px;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    background: linear-gradient(135deg, rgba(34, 211, 165, 0.2), rgba(56, 189, 248, 0.25));
    border: 1px solid #22d3a5;
    border-radius: 20px;
    color: #f8fafc;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 15px rgba(34, 211, 165, 0.3);
    animation: omni-pulse 2s infinite;
    user-select: none;
    transition: all 0.2s ease;
  `;

  badge.innerHTML = `
    <span style="font-size: 12px;">⚡</span>
    <span>Update Available</span>
    <span style="background: #22d3a5; color: #0b0e11; padding: 1px 6px; border-radius: 10px; font-size: 10px; font-weight: 800;">NEW</span>
  `;

  badge.addEventListener('click', () => {
    openUpdateModal(status);
  });

  document.body.appendChild(badge);
  toast(`⚡ OmniTrading update available (${status.latestCommit}). Click topbar badge to install!`);
}
