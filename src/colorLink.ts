import type { VelaWorkspace } from '@luxalgo/vela/workspace';

export interface ColorGroup {
  id: string;
  name: string;
  hex: string;
  borderHex: string;
  label: string;
}

export const COLOR_GROUPS: ColorGroup[] = [
  { id: 'none', name: 'Unlinked', label: 'Unlinked (Independent)', hex: '#64748b', borderHex: 'rgba(148, 163, 184, 0.4)' },
  { id: 'blue', name: 'Blue Group', label: 'Blue (Group 1)', hex: '#2563eb', borderHex: '#3b82f6' },
  { id: 'green', name: 'Green Group', label: 'Green (Group 2)', hex: '#16a34a', borderHex: '#22c55e' },
  { id: 'orange', name: 'Orange Group', label: 'Orange (Group 3)', hex: '#ea580c', borderHex: '#f97316' },
  { id: 'purple', name: 'Purple Group', label: 'Purple (Group 4)', hex: '#9333ea', borderHex: '#a855f7' },
  { id: 'red', name: 'Red Group', label: 'Red (Group 5)', hex: '#dc2626', borderHex: '#ef4444' },
  { id: 'yellow', name: 'Yellow Group', label: 'Yellow (Group 6)', hex: '#ca8a04', borderHex: '#eab308' },
];

const STORAGE_KEY = 'vela-cell-color-links';

function loadStoredColorLinks(): Record<string, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveStoredColorLinks(map: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function getCellColorGroup(cellId: string): string {
  const map = loadStoredColorLinks();
  return map[cellId] || 'none';
}

export function setCellColorGroupDirect(cellId: string, groupId: string): void {
  const map = loadStoredColorLinks();
  map[cellId] = groupId;
  saveStoredColorLinks(map);
}

export function removeCellFromColorLink(cellId: string): void {
  const map = loadStoredColorLinks();
  delete map[cellId];
  saveStoredColorLinks(map);
}

/**
 * Update workspace sync configuration based on active color links:
 * - Sync symbol between charts in the same color group.
 * - Sync drawings between charts in the same color group.
 * - Timeframe is explicitly kept independent (false) so multi-timeframe view works.
 */
export function updateWorkspaceColorSync(workspace: VelaWorkspace): void {
  const map = loadStoredColorLinks();
  const groupMap: Record<string, string> = {};

  const cells = workspace.cells();
  for (const cell of cells) {
    const grp = map[cell.id];
    if (grp && grp !== 'none') {
      groupMap[cell.id] = grp;
    }
  }

  const hasGroups = Object.keys(groupMap).length > 0;
  // Set sync maps
  workspace.sync.set('symbol', hasGroups ? groupMap : false);
  workspace.sync.set('drawings', hasGroups ? groupMap : false);
  // Ensure timeframe stays false for multi-timeframe analysis
  workspace.sync.set('timeframe', false);
}

/**
 * Copy existing drawings from a source cell to target cell and link them in workspace.drawingLinks.
 */
export function syncExistingDrawings(
  ws: any,
  sourceCell: any,
  targetCell: any,
): void {
  if (!ws || !sourceCell || !targetCell) return;
  if (sourceCell.id === targetCell.id) return;
  if (!sourceCell.chart?.drawings || !targetCell.chart?.drawings) return;

  const sourceDrawings = sourceCell.chart.drawings.all?.() || [];
  if (sourceDrawings.length === 0) return;

  const targetDrawings = targetCell.chart.drawings;
  const existingTargetIds = new Set(targetDrawings.all().map((d: any) => d.id));

  ws.drawingSyncBusy = true;
  try {
    for (const doc of sourceDrawings) {
      const linkKey = `${sourceCell.id}\0${doc.id}`;
      const group = ws.drawingLinks?.get(linkKey) ?? new Map([[sourceCell.id, doc.id]]);
      const existingPeerId = group.get(targetCell.id);

      if (existingPeerId != null && existingTargetIds.has(existingPeerId)) {
        targetDrawings.update(existingPeerId, {
          anchors: doc.anchors,
          style: doc.style,
          text: doc.text,
          props: doc.props,
        });
        continue;
      }

      const copy = targetDrawings.add(doc.type, {
        paneId: doc.paneId,
        anchors: doc.anchors,
        style: doc.style,
        text: doc.text,
        props: doc.props,
        zIndex: doc.zIndex,
      });

      if (copy && ws.drawingLinks) {
        group.set(targetCell.id, copy.id);
        for (const [cellId, dId] of group) {
          ws.drawingLinks.set(`${cellId}\0${dId}`, group);
        }
      }
    }
  } catch (err) {
    console.error('[vela] Failed to sync existing drawings to peer', err);
  } finally {
    ws.drawingSyncBusy = false;
  }
}

/**
 * Assign a cell to a color group and synchronize with existing peers in that group.
 */
export function setCellColorGroup(
  workspace: VelaWorkspace,
  cellId: string,
  groupId: string,
  onToast?: (msg: string) => void,
): void {
  setCellColorGroupDirect(cellId, groupId);
  const targetCell = workspace.cell(cellId);

  if (targetCell && groupId !== 'none') {
    // Find an existing peer in the same group
    const peers = workspace.cells().filter((c) => c.id !== cellId && getCellColorGroup(c.id) === groupId);
    if (peers.length > 0) {
      const peer = peers[0];
      // Align symbol to the group peer if different
      if (peer.symbol && peer.symbol !== targetCell.symbol) {
        targetCell.setSymbol(peer.symbol);
      }
      // Replicate existing drawings to target cell
      syncExistingDrawings(workspace, peer, targetCell);
    }
  }

  updateWorkspaceColorSync(workspace);
  refreshAllColorBadges(workspace);

  const grp = COLOR_GROUPS.find((g) => g.id === groupId);
  if (onToast && grp) {
    if (groupId === 'none') {
      onToast(`Unlinked ${targetCell?.symbol || 'chart'} (Independent)`);
    } else {
      onToast(`Linked ${targetCell?.symbol || 'chart'} to ${grp.name} (Color Sync)`);
    }
  }
}

const LINK_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 10.5 4.5 12.5a2.828 2.828 0 1 1-4-4l2-2a2.828 2.828 0 0 1 4 0"/><path d="M9.5 5.5l2-2a2.828 2.828 0 1 1 4 4l-2 2a2.828 2.828 0 0 1-4 0"/><line x1="5.5" y1="10.5" x2="10.5" y2="5.5"/></svg>`;
const UNLINKED_ICON_SVG = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="2" x2="14" y2="14"/><path d="M6.5 10.5 4.5 12.5a2.828 2.828 0 1 1-4-4l2-2"/><path d="M9.5 5.5l2-2a2.828 2.828 0 1 1 4 4l-2 2"/></svg>`;

export function renderColorLinkBadge(
  cell: any,
  workspace: VelaWorkspace,
  context: 'statusline' | 'corner',
  onToast?: (msg: string) => void,
): HTMLElement {
  const currentGroup = getCellColorGroup(cell.id);
  const grp = COLOR_GROUPS.find((g) => g.id === currentGroup) || COLOR_GROUPS[0];

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `omni-link-badge omni-link-badge-${context}`;
  btn.dataset.cellId = cell.id;
  btn.title = `Color Link: ${grp.name} (Click to change sync group)`;

  updateBadgeElement(btn, grp);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    openColorPickerPopover(btn, cell.id, workspace, onToast);
  });

  return btn;
}

export function updateBadgeElement(btn: HTMLElement, grp: ColorGroup): void {
  const isNone = grp.id === 'none';
  btn.style.color = isNone ? '#e2e8f0' : grp.hex;
  btn.style.borderColor = isNone ? 'rgba(255, 255, 255, 0.16)' : grp.borderHex;
  btn.style.backgroundColor = isNone ? 'rgba(255, 255, 255, 0.08)' : `color-mix(in srgb, ${grp.hex} 22%, rgba(20, 24, 33, 0.95))`;

  btn.innerHTML = `
    <span class="omni-link-dot" style="background:${isNone ? '#94a3b8' : grp.hex}; ${isNone ? 'opacity:0.95;' : 'box-shadow: 0 0 6px ' + grp.hex + ';' }"></span>
    <span class="omni-link-svg" style="color:${isNone ? '#e2e8f0' : grp.hex};">${LINK_ICON_SVG}</span>
  `;
}

export function refreshAllColorBadges(workspace: VelaWorkspace): void {
  document.querySelectorAll<HTMLElement>('.omni-link-badge').forEach((btn) => {
    const cellId = btn.dataset.cellId;
    if (cellId) {
      const currentGroup = getCellColorGroup(cellId);
      const grp = COLOR_GROUPS.find((g) => g.id === currentGroup) || COLOR_GROUPS[0];
      updateBadgeElement(btn, grp);
      btn.title = `Color Link: ${grp.name} (Click to change sync group)`;
    }
  });
}

/**
 * Open Color Picker Popover
 */
export function openColorPickerPopover(
  anchorEl: HTMLElement,
  cellId: string,
  workspace: VelaWorkspace,
  onToast?: (msg: string) => void,
): void {
  // Remove any existing popover
  document.querySelectorAll('.omni-color-popover').forEach((el) => el.remove());

  const currentGroup = getCellColorGroup(cellId);
  const popover = document.createElement('div');
  popover.className = 'omni-color-popover';

  const rect = anchorEl.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${Math.max(10, Math.min(window.innerWidth - 190, rect.left - 20))}px`;

  popover.innerHTML = `
    <div class="omni-color-popover-title">Color Link Group</div>
    <div class="omni-color-popover-list">
      ${COLOR_GROUPS.map((g) => `
        <div class="omni-color-item ${g.id === currentGroup ? 'active' : ''}" data-group-id="${g.id}">
          <span class="omni-color-swatch" style="background: ${g.hex};"></span>
          <span class="omni-color-label">${g.label}</span>
          ${g.id === currentGroup ? '<span class="omni-color-check">✓</span>' : ''}
        </div>
      `).join('')}
    </div>
  `;

  popover.querySelectorAll('.omni-color-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const groupId = (item as HTMLElement).dataset.groupId;
      if (groupId) {
        setCellColorGroup(workspace, cellId, groupId, onToast);
      }
      popover.remove();
    });
  });

  document.body.appendChild(popover);

  const onDocClick = (e: MouseEvent) => {
    if (!popover.contains(e.target as Node) && !anchorEl.contains(e.target as Node)) {
      popover.remove();
      document.removeEventListener('pointerdown', onDocClick);
    }
  };

  setTimeout(() => {
    document.addEventListener('pointerdown', onDocClick);
  }, 50);
}
