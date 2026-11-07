import type { VelaWorkspace } from '@luxalgo/vela/workspace';
import { registerLayout } from '@luxalgo/vela/workspace';
import {
  getCellColorGroup,
  setCellColorGroupDirect,
  removeCellFromColorLink,
  updateWorkspaceColorSync,
  syncExistingDrawings,
} from './colorLink';
import {
  applyTheme,
  getSavedThemeId,
  getAllThemes,
  BUILTIN_THEMES,
} from './theme';

// Register custom 3-chart and 6-chart layouts so Vela natively handles 1, 2, 3, 4, 6, 8 charts
try {
  registerLayout({
    id: '3h',
    label: '3 side by side' as any,
    cols: [1, 1, 1],
    rows: [1],
    cells: Array.from({ length: 3 }, (_, i) => ({ id: `c${i + 1}` })),
  });
  registerLayout({
    id: '6',
    label: '6 grid' as any,
    cols: [1, 1, 1],
    rows: [1, 1],
    cells: Array.from({ length: 6 }, (_, i) => ({ id: `c${i + 1}` })),
  });
} catch (e) {
  console.warn('[vela] layout registration:', e);
}

const LAYOUTS_STORAGE_KEY = 'vela-saved-layouts';

export interface SavedLayoutEntry {
  name: string;
  type?: 'chart-style' | 'workspace-layout';
  createdAt: number;
  cellCount: number;
  state: any;
  activeChartState?: any;
}

export function getSavedLayouts(): SavedLayoutEntry[] {
  try {
    const raw = localStorage.getItem(LAYOUTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLayout(
  name: string,
  workspace: VelaWorkspace,
  type: 'chart-style' | 'workspace-layout' = 'workspace-layout',
): void {
  const layouts = getSavedLayouts().filter((l) => l.name !== name);
  const state = workspace.getState();
  const cellCount = workspace.cells().length;
  const activeCell = workspace.active;
  const activeChartState = activeCell ? (activeCell as any).dehydrate() : null;

  layouts.unshift({
    name,
    type,
    createdAt: Date.now(),
    cellCount,
    state,
    activeChartState,
  });
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

export function deleteLayout(name: string): void {
  const layouts = getSavedLayouts().filter((l) => l.name !== name);
  localStorage.setItem(LAYOUTS_STORAGE_KEY, JSON.stringify(layouts));
}

export function loadLayout(
  name: string,
  workspace: VelaWorkspace,
  preserveSymbols: boolean = true,
): boolean {
  const layouts = getSavedLayouts();
  const found = layouts.find((l) => l.name === name);
  if (!found) return false;

  try {
    const currentActiveId = workspace.active?.id;

    // If it's a chart-style template, apply it directly to the active chart
    if (found.type === 'chart-style' && found.activeChartState && workspace.active) {
      const { symbol, timeframe, ...rest } = found.activeChartState;
      (workspace.active as any)?.rehydrate?.(rest);
      if (rest.rendererConfig?.grid) {
        workspace.active.chart.renderer.applyConfig({ grid: rest.rendererConfig.grid });
      }
      return true;
    }

    const stateToApply = JSON.parse(JSON.stringify(found.state));

    // Never force focus to switch away
    if (currentActiveId && stateToApply.charts?.some((c: any) => c.id === currentActiveId)) {
      stateToApply.activeCellId = currentActiveId;
    }

    // Preserve each chart's existing symbol and timeframe
    if (preserveSymbols) {
      const currentCells = workspace.cells();
      const currentMap = new Map<number, { symbol?: string; timeframe?: string }>();
      currentCells.forEach((c, idx) => {
        currentMap.set(idx, { symbol: c.symbol, timeframe: c.timeframe });
      });

      if (stateToApply.charts && Array.isArray(stateToApply.charts)) {
        stateToApply.charts.forEach((chartState: any, idx: number) => {
          const cur = currentMap.get(idx);
          if (cur && cur.symbol) {
            chartState.symbol = cur.symbol;
            if (cur.timeframe) chartState.timeframe = cur.timeframe;
          }
        });
      }
    }

    workspace.applyState(stateToApply);

    if (currentActiveId && workspace.cell(currentActiveId)) {
      workspace.setActiveCell(currentActiveId);
    }

    try {
      (workspace as any).persistNow?.();
      if (typeof (window as any).__velaAutoSave === 'function') {
        (window as any).__velaAutoSave();
      }
    } catch {}

    return true;
  } catch (err) {
    console.error('[vela] Failed to load layout', err);
    return false;
  }
}

/**
 * Apply Clean View (No Grids, No Indicators, Clean Canvas) to chart(s).
 * Preserves the symbol and timeframe completely.
 */
export function applyCleanView(workspace: VelaWorkspace, target: 'active' | 'all' = 'active'): void {
  const targetCells = target === 'all' ? workspace.cells() : workspace.active ? [workspace.active] : [];

  targetCells.forEach((cell) => {
    try {
      const chart = cell.chart;
      // 1. Remove all drawings
      if (chart?.drawings) {
        const allDrawings = chart.drawings.all();
        if (allDrawings.length > 0) {
          chart.drawings.removeMany(allDrawings.map((d: any) => d.id));
        }
      }

      // 2. Clear all indicators
      (cell as any)?.rehydrate?.({
        indicators: { present: [], instanceEntries: [] },
      });

      // 3. Turn off gridlines in both renderer features and canvas config
      chart?.renderer?.set('gridlines', false);
      chart?.renderer?.applyConfig({
        grid: {
          vertLines: { visible: false },
          horzLines: { visible: false },
        },
      });

      // 4. Ensure Vela attribution mark stays permanently enabled
      chart?.renderer?.set('attribution', true);
    } catch (err) {
      console.error('[vela] Failed to apply clean view to cell', err);
    }
  });

  try {
    (workspace as any).persistNow?.();
    if (typeof (window as any).__velaAutoSave === 'function') {
      (window as any).__velaAutoSave();
    }
  } catch {}
}

/**
 * Toggle gridlines on the active chart.
 */
export function toggleGridlines(workspace: VelaWorkspace): boolean {
  const active = workspace.active;
  if (!active?.chart?.renderer) return false;
  try {
    const current = Boolean(active.chart.renderer.get('gridlines'));
    const next = !current;
    active.chart.renderer.set('gridlines', next);
    active.chart.renderer.applyConfig({
      grid: {
        vertLines: { visible: next },
        horzLines: { visible: next },
      },
    });
    try {
      (workspace as any).persistNow?.();
      if (typeof (window as any).__velaAutoSave === 'function') {
        (window as any).__velaAutoSave();
      }
    } catch {}
    return next;
  } catch {
    return false;
  }
}

/**
 * Pick a complementary timeframe for multi-timeframe analysis on the same pair.
 */
export function getComplimentaryTimeframe(currentTf: string): string {
  const norm = String(currentTf || '60').trim();
  switch (norm) {
    case '1':
      return '5';
    case '3':
      return '15';
    case '5':
      return '15';
    case '15':
      return '60';
    case '30':
      return '5';
    case '60':
      return '15';
    case '120':
    case '240':
      return '60';
    case '720':
    case '1440':
    case 'D':
      return '60';
    case 'W':
    case 'M':
      return '1440';
    default:
      return '15';
  }
}

/**
 * Add / Duplicate an individual chart cell into the layout with automatic grid readjustment.
 * Duplicates the active chart's exact theme, custom candle/canvas colors, price style,
 * and all active indicators, assigns a complementary timeframe for multi-timeframe view,
 * and links drawings and symbol sync via the color link group.
 */
export function addChartCell(
  workspace: VelaWorkspace,
  sourceCellId?: string,
  onToast?: (msg: string) => void,
): string | null {
  const ws = workspace as any;
  const currentCells = workspace.cells();
  const currentCount = currentCells.length;

  if (currentCount >= 8) {
    if (onToast) onToast('Maximum of 8 charts reached');
    return null;
  }

  try {
    // 1. Next layout progression
    let targetLayout = '2h';
    if (currentCount === 1) targetLayout = '2h';
    else if (currentCount === 2) targetLayout = '3h';
    else if (currentCount === 3) targetLayout = '4';
    else if (currentCount >= 4 && currentCount < 6) targetLayout = '6';
    else targetLayout = '8';

    // 2. Identify source cell
    const sourceCell =
      (sourceCellId ? ws.cell(sourceCellId) : null) || workspace.active || currentCells[0];
    const sourceSymbol = sourceCell?.symbol || 'EURUSD';
    const sourceTf = sourceCell?.timeframe || '60';
    const newTf = getComplimentaryTimeframe(sourceTf);

    // 3. Find unique new cell ID
    const usedIds = new Set([
      ...(ws.order || []),
      ...ws.cellsById.keys(),
      ...ws.pool.keys(),
    ]);
    let nextId = `c${currentCount + 1}`;
    let counter = currentCount + 1;
    while (usedIds.has(nextId)) {
      counter++;
      nextId = `c${counter}`;
    }

    // 4. Capture source chart's full state (theme, config, style, indicators)
    const activeState = (sourceCell as any)?.dehydrate?.();
    const sourceConfig = sourceCell?.chart?.renderer?.getConfig?.();
    const sourcePriceStyle = (sourceCell as any)?.priceStyle || sourceCell?.chart?.priceStyle || activeState?.priceStyle || 'candles';
    const sourceGridlines = sourceCell?.chart?.renderer?.get?.('gridlines');

    const seed = {
      symbol: sourceSymbol,
      timeframe: newTf,
      bars: 1500,
      chartStyle: sourcePriceStyle,
      priceStyle: sourcePriceStyle,
      rendererConfig: sourceConfig ?? activeState?.rendererConfig,
      indicators: activeState?.indicators ?? { present: [], instanceEntries: [] },
    };
    ws.pool.set(nextId, seed);

    // 5. Add to ws.order
    if (!ws.order.includes(nextId)) {
      ws.order.push(nextId);
    }

    // 6. Inherit or assign color link group (default to 'blue' so they sync immediately)
    let sourceGroup = getCellColorGroup(sourceCell?.id);
    if (!sourceGroup || sourceGroup === 'none') {
      sourceGroup = 'blue';
      setCellColorGroupDirect(sourceCell.id, 'blue');
    }
    setCellColorGroupDirect(nextId, sourceGroup);

    // 7. Update workspace sync for color groups
    updateWorkspaceColorSync(workspace);

    // 8. Apply layout
    ws.setLayout(targetLayout);

    // 9. Get the newly mounted cell and fully duplicate source chart's theme, colors, and indicators
    const newCell = ws.cell(nextId);
    if (newCell) {
      ws.setActiveCell(nextId);

      // A. Duplicate active theme to workspace and the new chart
      const currentThemeId = getSavedThemeId();
      applyTheme(workspace, currentThemeId);
      const allThemes = getAllThemes();
      const currentThemePreset = allThemes.find((t) => t.id === currentThemeId) || BUILTIN_THEMES[0];
      if (newCell.chart?.setTheme) {
        newCell.chart.setTheme(currentThemePreset);
      }

      // B. Transfer exact renderer configuration (custom candle up/down colors, wicks, borders, grid)
      if (sourceConfig && newCell.chart?.renderer?.applyConfig) {
        newCell.chart.renderer.applyConfig(sourceConfig);
      }
      if (typeof sourceGridlines === 'boolean' && newCell.chart?.renderer?.set) {
        newCell.chart.renderer.set('gridlines', sourceGridlines);
      }

      // C. Transfer price style (e.g. candles, bars, area, heikinashi, footprint)
      if (sourcePriceStyle && newCell.chart?.setPriceStyle) {
        newCell.chart.setPriceStyle(sourcePriceStyle);
      }

      // D. Duplicate all indicators from source chart onto new cell
      if (sourceCell?.chart && newCell.chart) {
        const sourceInds = sourceCell.chart.indicators?.() || [];
        const orch = (sourceCell.chart as any).orchestrator;
        for (const h of sourceInds) {
          // If native volume is already on new cell, skip re-adding
          if (h.nativeType === 'volume' && newCell.chart.indicators().some((x: any) => x.nativeType === 'volume')) {
            continue;
          }
          const rec = orch?.registry?.get?.(h.id);
          if (rec) {
            try {
              if (rec.native?.type) {
                newCell.chart.addNativeIndicator(rec.native.type, {
                  inputs: { ...(rec.inputValues ?? {}) },
                  props: { ...(rec.propValues ?? {}) },
                });
              } else if (rec.source) {
                // If this is a Pine script and Pine engine is not installed, skip cloning to avoid error toast
                if (rec.options?.language === 'pine' && !(window as any).PineWorkerEngine) {
                  continue;
                }
                newCell.chart.addIndicator(rec.source, {
                  ...(rec.options ?? {}),
                  inputs: { ...(rec.inputValues ?? {}) },
                  props: { ...(rec.propValues ?? {}) },
                });
              }
            } catch (err) {
              console.warn('[vela] Could not clone indicator to new cell:', err);
            }
          }
        }
      }

      // E. Transfer drawings from source cell
      if (sourceCell) {
        syncExistingDrawings(ws, sourceCell, newCell);
      }
    }

    // 10. Readjust and refresh
    ws.syncCellPresentation?.();
    ws.refreshCellControls?.();
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);

    try {
      ws.persistNow?.();
      if (typeof (window as any).__velaAutoSave === 'function') {
        (window as any).__velaAutoSave();
      }
    } catch {}

    if (onToast) {
      onToast(`Duplicated ${sourceSymbol} (${newTf}m) in ${sourceGroup.toUpperCase()} group — Multi-Time View Active`);
    }

    return nextId;
  } catch (err) {
    console.error('[vela] Failed to duplicate chart cell:', err);
    return null;
  }
}

/**
 * Duplicate an indicator on a chart cell (by ID, or the active/topmost indicator).
 */
export function duplicateIndicator(
  workspace: VelaWorkspace,
  indicatorId?: string,
  onToast?: (msg: string) => void,
): boolean {
  const ws = workspace as any;
  const cells = workspace.cells();
  let foundCell: any = null;
  let foundHandle: any = null;

  // 1. Find which cell contains the indicator
  if (indicatorId) {
    if (workspace.active) {
      foundHandle = workspace.active.chart?.indicators?.().find((h: any) => h.id === indicatorId);
      if (foundHandle) foundCell = workspace.active;
    }
    if (!foundCell) {
      for (const cell of cells) {
        foundHandle = cell.chart?.indicators?.().find((h: any) => h.id === indicatorId);
        if (foundHandle) {
          foundCell = cell;
          break;
        }
      }
    }
  } else {
    foundCell = workspace.active || cells[0];
    const inds = foundCell?.chart?.indicators?.() || [];
    if (inds.length > 0) {
      foundHandle = inds[inds.length - 1];
    }
  }

  if (!foundCell || !foundCell.chart || !foundHandle) {
    if (onToast) onToast('No indicator to duplicate');
    return false;
  }

  const orch = (foundCell.chart as any).orchestrator;
  const record = orch?.registry?.get?.(foundHandle.id);
  const title = record?.title || foundHandle?.title || 'Indicator';

  try {
    if (record?.native?.type) {
      foundCell.chart.addNativeIndicator(record.native.type, {
        inputs: { ...(record.inputValues ?? {}) },
        props: { ...(record.propValues ?? {}) },
      });
    } else if (record?.source) {
      if ((record.options?.language === 'pine' || foundHandle?.language === 'pine') && !(window as any).PineWorkerEngine) {
        if (onToast) onToast('Install optional Pine add-on to run Pine indicators');
        return false;
      }
      foundCell.chart.addIndicator(record.source, {
        ...(record.options ?? {}),
        inputs: { ...(record.inputValues ?? {}) },
        props: { ...(record.propValues ?? {}) },
      });
    } else {
      return false;
    }

    if (onToast) onToast(`Duplicated ${title}`);

    // Auto-save state
    try {
      ws.persistNow?.();
    } catch {}

    return true;
  } catch (err) {
    console.error('[vela] Failed to duplicate indicator:', err);
    return false;
  }
}

/**
 * Remove an individual cell from a multi-chart layout and cleanly rebalance remaining cells
 * without resetting any chart's symbol, indicators, timeframe, or drawings.
 */
export function closeCell(
  workspace: VelaWorkspace,
  cellId: string,
  onToast?: (msg: string) => void,
): void {
  const ws = workspace as any;
  const cells = workspace.cells();
  if (cells.length <= 1) {
    if (onToast) onToast('Cannot close the only open chart');
    return;
  }

  try {
    const targetCell = ws.cellsById.get(cellId);
    const targetSymbol = targetCell?.symbol || 'Chart';

    // 1. Remove from color links
    removeCellFromColorLink(cellId);

    // 2. Filter target out of ws.order
    ws.order = (ws.order || []).filter((id: string) => id !== cellId);

    // 3. Destroy target cell cleanly
    if (targetCell) {
      targetCell.destroy();
      ws.cellsById.delete(cellId);
      ws.pool?.delete(cellId);
      ws.events.emit('cell:destroyed', { id: cellId });
    }

    // 4. Calculate new layout for surviving count
    const survivingCount = ws.cellsById.size;
    let targetLayout = '1';
    if (survivingCount <= 1) targetLayout = '1';
    else if (survivingCount === 2) targetLayout = '2h';
    else if (survivingCount === 3) targetLayout = '3h';
    else if (survivingCount === 4) targetLayout = '4';
    else if (survivingCount <= 6) targetLayout = '6';
    else targetLayout = '8';

    // 5. Apply layout
    ws.setLayout(targetLayout);

    // 6. Ensure active cell points to a surviving chart
    const survivingCells = ws.cells();
    if (survivingCells.length > 0) {
      const activeAlive = ws.active && ws.cellsById.has(ws.active.id);
      if (!activeAlive) {
        ws.setActiveCell(survivingCells[0].id);
      }
    }

    // 7. Update workspace sync
    updateWorkspaceColorSync(workspace);

    // 8. Readjust and refresh
    ws.syncCellPresentation?.();
    ws.refreshCellControls?.();
    window.dispatchEvent(new Event('resize'));
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 50);

    try {
      ws.persistNow?.();
      if (typeof (window as any).__velaAutoSave === 'function') {
        (window as any).__velaAutoSave();
      }
    } catch {}

    if (onToast) {
      onToast(`Closed ${targetSymbol} — Charts Readjusted`);
    }
  } catch (err) {
    console.error('[vela] Failed to close cell cleanly:', err);
  }
}
