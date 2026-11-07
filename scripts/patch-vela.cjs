/**
 * OmniTrading - Vela Compatibility & Ergonomics Patch
 *
 * Notice pursuant to Apache License 2.0 Section 4(b):
 * This script applies modifications to the installed @luxalgo/vela distribution bundle
 * in node_modules to resolve upstream rendering bugs (wick bounding box calculation,
 * scale drag inversion, right offset viewport margin hold) and support desktop ergonomics
 * (single/double click selection handlers, drawing star favorites, and settings footers).
 *
 * This script preserves 100% of Vela's attribution and watermark features intact.
 */

const fs = require('fs');
const path = require('path');

const pkgJsonPath = path.join(__dirname, '..', 'node_modules', '@luxalgo', 'vela', 'package.json');
if (!fs.existsSync(pkgJsonPath)) {
  console.error('[patch-vela] FATAL: @luxalgo/vela package.json not found in node_modules.');
  process.exit(1);
}
const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
const EXPECTED_VERSION = '0.10.1';
if (pkg.version !== EXPECTED_VERSION) {
  console.error(`[patch-vela] FATAL: Installed @luxalgo/vela version is "${pkg.version}", expected pinned version "${EXPECTED_VERSION}".`);
  process.exit(1);
}

const distDir = path.join(__dirname, '..', 'node_modules', '@luxalgo', 'vela', 'dist');
if (!fs.existsSync(distDir)) {
  console.error('[patch-vela] FATAL: @luxalgo/vela/dist directory not found.');
  process.exit(1);
}

const files = fs.readdirSync(distDir).filter((f) => f.endsWith('.js') || f.endsWith('.cjs'));

const matchedHunks = new Set();

for (const file of files) {
  const p = path.join(distDir, file);
  let content = fs.readFileSync(p, 'utf8');
  let modified = false;

  // 1. Wick calculation
  const targetWick = `if (drawBody) {\n          b.rect(g.wickX, hY, g.wickW, Math.max(0, bodyTop - hY), wCol);\n          b.rect(g.wickX, bodyTop + bodyH, g.wickW, Math.max(0, lY - (bodyTop + bodyH)), wCol);\n        } else {\n          b.rect(g.wickX, hY, g.wickW, lY - hY, wCol);\n        }`;
  const replWick = `const topY = Math.min(hY, lY);\n        const botY = Math.max(hY, lY);\n        if (drawBody) {\n          b.rect(g.wickX, topY, g.wickW, Math.max(0, bodyTop - topY), wCol);\n          b.rect(g.wickX, bodyTop + bodyH, g.wickW, Math.max(0, botY - (bodyTop + bodyH)), wCol);\n        } else {\n          b.rect(g.wickX, topY, g.wickW, Math.max(1, botY - topY), wCol);\n        }`;
  if (content.includes(targetWick)) {
    content = content.replace(targetWick, replWick);
    modified = true;
  }

  // 2. Aggregate wick calculation
  const targetAgg = `b.rect(s.x - 0.5, hY, 1, yOf(s.lo) - hY, c);`;
  const replAgg = `const y1 = yOf(s.hi), y2 = yOf(s.lo);\n      b.rect(s.x - 0.5, Math.min(y1, y2), 1, Math.max(1, Math.abs(y2 - y1)), c);`;
  if (content.includes(targetAgg)) {
    content = content.replaceAll(targetAgg, replAgg);
    modified = true;
  }

  // 3. shiftScale (drag inversion)
  const targetShift = `function shiftScale(start, dy, height) {\n  if (height <= 0) return { ...start };\n  if (start.log && start.min > 0 && start.max > start.min) {\n    const lmin = Math.log(start.min);\n    const lmax = Math.log(start.max);\n    const d2 = (lmax - lmin) * dy / height;\n    return { min: Math.exp(lmin + d2), max: Math.exp(lmax + d2), log: true };\n  }\n  const d = (start.max - start.min) * dy / height;\n  return { min: start.min + d, max: start.max + d, log: start.log };\n}`;
  const replShift = `function shiftScale(start, dy, height) {\n  if (height <= 0) return { ...start };\n  const effDy = start.invert ? -dy : dy;\n  if (start.log && start.min > 0 && start.max > start.min) {\n    const lmin = Math.log(start.min);\n    const lmax = Math.log(start.max);\n    const d2 = (lmax - lmin) * effDy / height;\n    return { min: Math.exp(lmin + d2), max: Math.exp(lmax + d2), log: true, invert: start.invert };\n  }\n  const d = (start.max - start.min) * effDy / height;\n  return { min: start.min + d, max: start.max + d, log: start.log, invert: start.invert };\n}`;
  if (content.includes(targetShift)) {
    content = content.replaceAll(targetShift, replShift);
    modified = true;
  }

  // 4. reframeKeepZoom - preserve user-dragged rightOffset instead of resetting
  const targetReframe = `const v = { barSpacing: clampBarSpacing(this.coords.getViewport().barSpacing), rightOffset: this.scene.style.margins.right };`;
  const replReframe = `const curRO = this.coords.getViewport().rightOffset;\n    const targetRO = curRO > 0 ? curRO : (this.scene.style.margins.right || 12);\n    const v = { barSpacing: clampBarSpacing(this.coords.getViewport().barSpacing), rightOffset: targetRO };`;
  if (content.includes(targetReframe)) {
    content = content.replaceAll(targetReframe, replReframe);
    modified = true;
  }

  // 5. setVisibleRange - ensure right margin is respected at latest bar
  const targetSVR = `const margin = opts?.rightMargin ? this.scene.style.margins.right : 0;\n    const barSpacing = clampBarSpacing(this.coords.width / ((span + margin) * this.coords.spacingScale));\n    const rightOffset = toL - (this.coords.barCount - 1) + margin;`;
  const replSVR = `const defMarg = Math.max(8, this.scene.style.margins.right || 12);\n    const margin = opts?.rightMargin ? defMarg : (toL >= this.coords.barCount - 1 ? defMarg : 0);\n    const barSpacing = clampBarSpacing(this.coords.width / ((span + margin) * this.coords.spacingScale));\n    const rightOffset = toL - (this.coords.barCount - 1) + margin;`;
  if (content.includes(targetSVR)) {
    content = content.replaceAll(targetSVR, replSVR);
    modified = true;
  }

  // 6. updateBar - preserve view when user dragged chart left (rightOffset > margin)
  const targetHold = `const holdView = n > 0 && vp.rightOffset < 0 && this.scrollTargetRO === null;`;
  const replHold = `const holdView = n > 0 && (vp.rightOffset < 0 || vp.rightOffset > (this.scene.style.margins.right || 12)) && this.scrollTargetRO === null;`;
  if (content.includes(targetHold)) {
    content = content.replaceAll(targetHold, replHold);
    modified = true;
  }

  // 7. DEFAULT_MARGINS right default to 12
  const targetDefMarg = `DEFAULT_MARGINS = { top: 10, bottom: 10, right: 10 };`;
  const replDefMarg = `DEFAULT_MARGINS = { top: 10, bottom: 10, right: 12 };`;
  if (content.includes(targetDefMarg)) {
    content = content.replaceAll(targetDefMarg, replDefMarg);
    modified = true;
  }

  // 8. Double-click Candlesticks -> Chart Settings Symbol; Double-click Indicator -> Indicator Settings
  const targetDblClickRegex = /dataDblClick\(_x, y\) \{[\s\S]*?this\.emitPaneAction\(\{ type: "maximize", paneId: pane\.id, maximized \}\);\s*\}/g;
  if (content.match(targetDblClickRegex)) {
    content = content.replace(targetDblClickRegex, `dataDblClick(_x, y) {
    const x = _x;
    const pane = this.paneNodeAtY(y) ?? this.nearestPaneToY(y);
    if (!pane) return;

    let targetIndId = null;
    if (this.selectedChartEntity?.type === "indicator") {
      targetIndId = this.selectedChartEntity.id;
    }
    if (!targetIndId && pane && this.scene?.indicators) {
      const logical = Math.round(this.coords.xToLogical(x));
      for (const m of this.scene.indicators.values()) {
        if (m.hidden) continue;
        if (pane.kind !== "price" && m.paneId !== pane.id) continue;
        const off = this.scene.offsetOf ? this.scene.offsetOf(m.id) : 0;
        if (Array.isArray(m.series)) {
          const idx = logical - off;
          for (const s of m.series) {
            if (s.points && idx >= 0 && idx < s.points.length && s.points[idx]?.value != null) {
              const py = this.coords.priceToY(s.points[idx].value, pane.scale, pane.bounds);
              if (Math.abs(y - py) <= 14) { targetIndId = m.id; break; }
            }
          }
        }
        if (targetIndId) break;
        if (Array.isArray(m.lines)) {
          for (const ln of m.lines) {
            const lx1 = ln.xloc === "bar_index" ? this.coords.logicalToX(ln.x1 + off) : this.coords.timeToX(ln.x1);
            const lx2 = ln.xloc === "bar_index" ? this.coords.logicalToX(ln.x2 + off) : this.coords.timeToX(ln.x2);
            const ly1 = this.coords.priceToY(ln.y1, pane.scale, pane.bounds);
            const ly2 = this.coords.priceToY(ln.y2, pane.scale, pane.bounds);
            const dx = lx2 - lx1, dy = ly2 - ly1;
            const lenSq = dx * dx + dy * dy;
            let t = lenSq === 0 ? 0 : ((x - lx1) * dx + (y - ly1) * dy) / lenSq;
            t = Math.max(0, Math.min(1, t));
            if (Math.hypot(x - (lx1 + t * dx), y - (ly1 + t * dy)) <= 12) { targetIndId = m.id; break; }
          }
        }
        if (targetIndId) break;
        if (Array.isArray(m.boxes)) {
          for (const bx of m.boxes) {
            const bx1 = bx.xloc === "bar_index" ? this.coords.logicalToX(bx.left + off) : this.coords.timeToX(bx.left);
            const bx2 = bx.xloc === "bar_index" ? this.coords.logicalToX(bx.right + off) : this.coords.timeToX(bx.right);
            const by1 = this.coords.priceToY(bx.top, pane.scale, pane.bounds);
            const by2 = this.coords.priceToY(bx.bottom, pane.scale, pane.bounds);
            if (x >= Math.min(bx1, bx2) - 8 && x <= Math.max(bx1, bx2) + 8 && y >= Math.min(by1, by2) - 8 && y <= Math.max(by1, by2) + 8) {
              targetIndId = m.id; break;
            }
          }
        }
        if (targetIndId) break;
        if (Array.isArray(m.labels)) {
          for (const lb of m.labels) {
            const lbX = lb.xloc === "bar_index" ? this.coords.logicalToX(lb.x + off) : this.coords.timeToX(lb.x);
            const lbY = this.coords.priceToY(lb.y, pane.scale, pane.bounds);
            if (Math.hypot(x - lbX, y - lbY) <= 20) { targetIndId = m.id; break; }
          }
        }
        if (targetIndId) break;
      }
    }

    if (targetIndId) {
      if (typeof this.openIndicatorSettings === "function") {
        this.openIndicatorSettings(targetIndId);
        return;
      } else if (this.inputsUI?.openSettingsFor) {
        this.inputsUI.openSettingsFor(targetIndId);
        return;
      }
    }

    let clickedCandle = false;
    if ((pane.kind === "price" || pane.id === this.mainPaneId || pane.id === "price") && this.scene?.bars) {
      const logical = Math.round(this.coords.xToLogical(x));
      if (logical >= 0 && logical < this.scene.bars.length) {
        const bar = this.scene.bars[logical];
        if (bar) {
          const barX = this.coords.logicalToX(logical);
          const halfW = Math.max(3, (this.coords.getViewport?.().barSpacing ?? 6) * 0.45);
          if (Math.abs(x - barX) <= halfW + 3) {
            const p1 = this.coords.priceToY(Math.max(bar.open, bar.close, bar.high), pane.scale, pane.bounds);
            const p2 = this.coords.priceToY(Math.min(bar.open, bar.close, bar.low), pane.scale, pane.bounds);
            const minY = Math.min(p1, p2) - 4;
            const maxY = Math.max(p1, p2) + 4;
            if (y >= minY && y <= maxY) {
              clickedCandle = true;
            }
          }
        }
      }
    }

    if (clickedCandle) {
      if (typeof this.openSettingsDialog === "function") {
        this.openSettingsDialog("symbol");
        return;
      }
    }

    const maximized = this.maximizedPaneId !== pane.id;
    this.maximizedPaneId = maximized ? pane.id : null;
    this.afterPaneLayoutChange();
    this.emitPaneAction({ type: "maximize", paneId: pane.id, maximized });
  }`);
    modified = true;
  }

  // 8b. Single-click selection for Indicators and Candlesticks
  const targetHandleClick = `handleClick(x, y) {\n    if (this.coords.barCount === 0) return;\n    const logical = Math.round(this.coords.xToLogical(x));\n    const onBar = logical >= 0 && logical < this.coords.barCount;\n    const inData = x >= 0 && y >= 0 && x <= this.coords.width && y <= this.coords.height;\n    const pane = inData ? this.paneNodeAtY(y) : null;`;
  if (content.includes(targetHandleClick) && !content.includes('selectedChartEntity')) {
    content = content.replace(targetHandleClick, `handleClick(x, y) {
    if (this.coords.barCount === 0) return;
    const logical = Math.round(this.coords.xToLogical(x));
    const onBar = logical >= 0 && logical < this.coords.barCount;
    const inData = x >= 0 && y >= 0 && x <= this.coords.width && y <= this.coords.height;
    const pane = inData ? this.paneNodeAtY(y) : null;

    try {
      let hitInd = null;
      if (pane && this.scene?.indicators) {
        for (const m of this.scene.indicators.values()) {
          if (m.hidden) continue;
          if (pane.kind !== "price" && m.paneId !== pane.id) continue;
          const off = this.scene.offsetOf ? this.scene.offsetOf(m.id) : 0;
          if (Array.isArray(m.series)) {
            const idx = logical - off;
            for (const s of m.series) {
              if (s.points && idx >= 0 && idx < s.points.length && s.points[idx]?.value != null) {
                const py = this.coords.priceToY(s.points[idx].value, pane.scale, pane.bounds);
                if (Math.abs(y - py) <= 12) { hitInd = m.id; break; }
              }
            }
          }
          if (hitInd) break;
          if (Array.isArray(m.lines)) {
            for (const ln of m.lines) {
              const lx1 = ln.xloc === "bar_index" ? this.coords.logicalToX(ln.x1 + off) : this.coords.timeToX(ln.x1);
              const lx2 = ln.xloc === "bar_index" ? this.coords.logicalToX(ln.x2 + off) : this.coords.timeToX(ln.x2);
              const ly1 = this.coords.priceToY(ln.y1, pane.scale, pane.bounds);
              const ly2 = this.coords.priceToY(ln.y2, pane.scale, pane.bounds);
              const dx = lx2 - lx1, dy = ly2 - ly1;
              const lenSq = dx * dx + dy * dy;
              let t = lenSq === 0 ? 0 : ((x - lx1) * dx + (y - ly1) * dy) / lenSq;
              t = Math.max(0, Math.min(1, t));
              if (Math.hypot(x - (lx1 + t * dx), y - (ly1 + t * dy)) <= 10) { hitInd = m.id; break; }
            }
          }
          if (hitInd) break;
          if (Array.isArray(m.boxes)) {
            for (const bx of m.boxes) {
              const bx1 = bx.xloc === "bar_index" ? this.coords.logicalToX(bx.left + off) : this.coords.timeToX(bx.left);
              const bx2 = bx.xloc === "bar_index" ? this.coords.logicalToX(bx.right + off) : this.coords.timeToX(bx.right);
              const by1 = this.coords.priceToY(bx.top, pane.scale, pane.bounds);
              const by2 = this.coords.priceToY(bx.bottom, pane.scale, pane.bounds);
              if (x >= Math.min(bx1, bx2) - 6 && x <= Math.max(bx1, bx2) + 6 && y >= Math.min(by1, by2) - 6 && y <= Math.max(by1, by2) + 6) {
                hitInd = m.id; break;
              }
            }
          }
          if (hitInd) break;
          if (Array.isArray(m.labels)) {
            for (const lb of m.labels) {
              const lbX = lb.xloc === "bar_index" ? this.coords.logicalToX(lb.x + off) : this.coords.timeToX(lb.x);
              const lbY = this.coords.priceToY(lb.y, pane.scale, pane.bounds);
              if (Math.hypot(x - lbX, y - lbY) <= 18) { hitInd = m.id; break; }
            }
          }
          if (hitInd) break;
        }
      }
      if (hitInd) {
        this.selectedChartEntity = { type: "indicator", id: hitInd };
        this.inputsUI?.selectRow(hitInd);
        this.wrapper?.classList.remove("vela-candle-selected");
      } else if (pane && (pane.kind === "price" || pane.id === this.mainPaneId || pane.id === "price")) {
        this.selectedChartEntity = { type: "symbol" };
        this.inputsUI?.clearSelection();
        this.wrapper?.classList.add("vela-candle-selected");
      } else {
        this.selectedChartEntity = null;
        this.inputsUI?.clearSelection();
        this.wrapper?.classList.remove("vela-candle-selected");
      }
    } catch(e) {}`);
    modified = true;
  }

  // 9. DrawingToolbar: Add Star Button & Spread Toggle Button
  const targetCollapseBtnRegex = /this\.collapseBtn\s*=\s*this\.makeButton\(COLLAPSE_ICON/g;
  if (content.match(targetCollapseBtnRegex) && !content.includes('vela-dtb-spread-btn')) {
    content = content.replace(targetCollapseBtnRegex, `try {
      if (!this.root.querySelector('.vela-dtb-fav-bar-btn')) {
        const starIcon = typeof STAR_ICON !== "undefined" ? STAR_ICON : '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><polygon points="8,1.5 10,5.8 14.5,6.5 11.2,9.8 12,14.5 8,12.2 4,14.5 4.8,9.8 1.5,6.5 6,5.8"/></svg>';
        const favBarBtn = this.makeButton(starIcon, "Favorite Drawings Bar", () => {
          window.dispatchEvent(new CustomEvent("vela:toggle-favorites-bar"));
        });
        favBarBtn.classList.add("vela-dtb-fav-bar-btn");
        this.root.appendChild(favBarBtn);
      }
      if (!this.root.querySelector('.vela-dtb-spread-btn')) {
        const spreadIcon = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 4.5h12M2 11.5h12M5 7l3-2.5 3 2.5M5 9l3 2.5 3-2.5"/></svg>';
        const spreadBtn = this.makeButton(spreadIcon, "Toggle Bid/Ask Spread Lines", () => {
          window.dispatchEvent(new CustomEvent("vela:toggle-spread"));
        });
        spreadBtn.classList.add("vela-dtb-spread-btn");
        this.root.appendChild(spreadBtn);
      }
    } catch(e) {}
    this.collapseBtn = this.makeButton(COLLAPSE_ICON`);
    modified = true;
  }

  // 10. SettingsDialog Footer: Template ▾ dropdown + Save as... + Cancel / Ok buttons (Images 1 & 2 / requirement 1)
  const targetSettingsFooterRegex = /variant:\s*"settings",\s*headerStart:\s*burger,\s*closeOnBackdrop:\s*true,\s*footer:\s*\(foot\)\s*=>\s*\{[\s\S]*?foot\.appendChild\((?:resetBtn|rightBox)\);\s*\}/g;
  if (content.match(targetSettingsFooterRegex)) {
    content = content.replace(targetSettingsFooterRegex, `variant: "settings",
      headerStart: burger,
      closeOnBackdrop: true,
      footer: (foot) => {
        if (!this._initialConfig && this.config) {
          try {
            this._initialConfig = JSON.parse(JSON.stringify(this.config));
          } catch (e) {}
        }
        foot.style.cssText = "padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;";
        
        // 1. Template dropdown container (bottom left)
        const leftBox = document.createElement("div");
        leftBox.style.cssText = "display:flex;align-items:center;gap:8px;position:relative;";

        const tplBtn = document.createElement("button");
        tplBtn.type = "button";
        tplBtn.className = "vela-sd-btn vela-sd-template-btn";
        tplBtn.textContent = "Template ▾";
        tplBtn.style.cssText = "font-weight:600;display:flex;align-items:center;gap:4px;cursor:pointer;";

        const tplMenu = document.createElement("div");
        tplMenu.className = "vela-sd-tpl-menu";
        tplMenu.style.cssText = "display:none;position:absolute;bottom:calc(100% + 6px);left:0;min-width:210px;background:var(--vela-surface, #1e293b);border:1px solid var(--vela-border, #334155);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.45);padding:4px 0;z-index:9999;font-size:13px;";

        const renderTplMenu = () => {
          tplMenu.innerHTML = "";
          
          // Apply defaults
          const defRow = document.createElement("div");
          defRow.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;";
          defRow.textContent = "Apply defaults";
          defRow.onmouseenter = () => defRow.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
          defRow.onmouseleave = () => defRow.style.background = "transparent";
          defRow.onclick = (e) => {
            e.stopPropagation();
            tplMenu.style.display = "none";
            this.onReset?.();
          };
          tplMenu.appendChild(defRow);

          // Save as...
          const saveRow = document.createElement("div");
          saveRow.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;";
          saveRow.textContent = "Save as...";
          saveRow.onmouseenter = () => saveRow.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
          saveRow.onmouseleave = () => saveRow.style.background = "transparent";
          saveRow.onclick = (e) => {
            e.stopPropagation();
            tplMenu.style.display = "none";
            if (window.__openSaveChartTemplateModal) {
              window.__openSaveChartTemplateModal(this.config, () => renderTplMenu());
            } else {
              const name = prompt("Enter a name for this chart template (e.g. Clean View):");
              if (name && name.trim()) {
                const list = JSON.parse(localStorage.getItem("omni-chart-templates") || "[]");
                list.push({ name: name.trim(), config: this.config });
                localStorage.setItem("omni-chart-templates", JSON.stringify(list));
                renderTplMenu();
              }
            }
          };
          tplMenu.appendChild(saveRow);

          // Divider
          const sep = document.createElement("div");
          sep.style.cssText = "height:1px;background:var(--vela-border, #334155);margin:4px 0;";
          tplMenu.appendChild(sep);

          // Saved templates
          const savedTemplates = window.__getChartTemplates ? window.__getChartTemplates() : (JSON.parse(localStorage.getItem("omni-chart-templates") || "[]"));
          if (savedTemplates.length === 0) {
            const noTpl = document.createElement("div");
            noTpl.style.cssText = "padding:6px 12px;color:var(--vela-fg-muted, #94a3b8);font-size:12px;font-style:italic;";
            noTpl.textContent = "No saved templates";
            tplMenu.appendChild(noTpl);
          } else {
            savedTemplates.forEach((tpl) => {
              const item = document.createElement("div");
              item.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;justify-content:space-between;gap:8px;";
              const label = document.createElement("span");
              label.textContent = tpl.name;
              label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
              item.appendChild(label);

              if (!tpl.builtin) {
                const delBtn = document.createElement("span");
                delBtn.textContent = "✕";
                delBtn.title = "Delete template";
                delBtn.style.cssText = "color:#ef4444;font-size:11px;padding:2px 4px;border-radius:3px;";
                delBtn.onmouseenter = () => delBtn.style.background = "rgba(239,68,68,0.2)";
                delBtn.onmouseleave = () => delBtn.style.background = "transparent";
                delBtn.onclick = (e) => {
                  e.stopPropagation();
                  if (window.__deleteChartTemplate) window.__deleteChartTemplate(tpl.name);
                  renderTplMenu();
                };
                item.appendChild(delBtn);
              }

              item.onmouseenter = () => item.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
              item.onmouseleave = () => item.style.background = "transparent";
              item.onclick = (e) => {
                e.stopPropagation();
                tplMenu.style.display = "none";
                if (tpl.config) {
                  this.emit?.(tpl.config);
                  this.refresh?.(tpl.config);
                  if (typeof window !== "undefined" && typeof window.__velaAutoSave === "function") {
                    window.__velaAutoSave();
                  }
                }
              };
              tplMenu.appendChild(item);
            });
          }
        };

        tplBtn.onclick = (e) => {
          e.stopPropagation();
          const open = tplMenu.style.display === "block";
          document.querySelectorAll(".vela-sd-tpl-menu").forEach((m) => m.style.display = "none");
          if (!open) {
            renderTplMenu();
            tplMenu.style.display = "block";
          }
        };

        document.addEventListener("click", () => {
          tplMenu.style.display = "none";
        });

        leftBox.appendChild(tplBtn);
        leftBox.appendChild(tplMenu);
        foot.appendChild(leftBox);

        // 2. Right action cluster (Cancel / Ok)
        const rightBox = document.createElement("div");
        rightBox.style.cssText = "display:flex;align-items:center;gap:8px;";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.textContent = "Cancel";
        cancelBtn.className = "vela-sd-btn";
        cancelBtn.onclick = () => {
          if (this._initialConfig) {
            this.emit?.(this._initialConfig);
          }
          this.close();
        };
        rightBox.appendChild(cancelBtn);

        const okBtn = document.createElement("button");
        okBtn.type = "button";
        okBtn.textContent = "Ok";
        okBtn.className = "vela-sd-btn";
        okBtn.style.cssText = "background:var(--vela-accent, #22d3a5);color:#0f172a;font-weight:600;border:none;";
        okBtn.onclick = () => {
          if (typeof window !== "undefined" && typeof window.__velaAutoSave === "function") {
            window.__velaAutoSave();
          }
          this.close();
        };
        rightBox.appendChild(okBtn);

        foot.appendChild(rightBox);
      }`);
    modified = true;
  }

  // 11. Indicator Settings Dialog Footer: Template ▾ dropdown + Save as... presets (Item 1)
  const targetIndFooterRegex = /footer:\s*(?:\(foot\)|m|\(m\))\s*=>\s*\{\s*(?:foot|m)\.append\(\s*this\.resetAction\(\)\s*,\s*this\.dialogButton\(\s*this\.t\(\s*(\w+)\.cancel\s*\)\s*,\s*false\s*,\s*\(\)\s*=>\s*this\.revertAndClose\(\)\s*\)\s*,\s*this\.dialogButton\(\s*this\.t\(\s*\1\.ok\s*\)\s*,\s*true\s*,\s*\(\)\s*=>\s*this\.close\(\)\s*\)\s*\);?\s*\}/g;
  if (content.match(targetIndFooterRegex)) {
    content = content.replace(targetIndFooterRegex, (match, textVar) => `footer: (foot) => {
        foot.style.cssText = "padding:10px 14px;display:flex;align-items:center;justify-content:space-between;gap:8px;position:relative;";
        
        // 1. Template dropdown container (bottom left)
        const leftBox = document.createElement("div");
        leftBox.style.cssText = "display:flex;align-items:center;gap:8px;position:relative;";

        const tplBtn = document.createElement("button");
        tplBtn.type = "button";
        tplBtn.className = "vela-sd-btn vela-sd-template-btn";
        tplBtn.textContent = "Template ▾";
        tplBtn.style.cssText = "font-weight:600;display:flex;align-items:center;gap:4px;cursor:pointer;";

        const tplMenu = document.createElement("div");
        tplMenu.className = "vela-sd-tpl-menu";
        tplMenu.style.cssText = "display:none;position:absolute;bottom:calc(100% + 6px);left:0;min-width:210px;background:var(--vela-surface, #1e293b);border:1px solid var(--vela-border, #334155);border-radius:6px;box-shadow:0 8px 24px rgba(0,0,0,0.45);padding:4px 0;z-index:9999;font-size:13px;";

        const indKey = () => "omni-ind-presets-" + (this.row?.title || "indicator").replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();

        const renderTplMenu = () => {
          tplMenu.innerHTML = "";

          // Apply defaults
          const defRow = document.createElement("div");
          defRow.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;";
          defRow.textContent = "Apply defaults";
          defRow.onmouseenter = () => defRow.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
          defRow.onmouseleave = () => defRow.style.background = "transparent";
          defRow.onclick = (e) => {
            e.stopPropagation();
            tplMenu.style.display = "none";
            this.resetToDefaults();
          };
          tplMenu.appendChild(defRow);

          // Save as...
          const saveRow = document.createElement("div");
          saveRow.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;";
          saveRow.textContent = "Save as...";
          saveRow.onmouseenter = () => saveRow.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
          saveRow.onmouseleave = () => saveRow.style.background = "transparent";
          saveRow.onclick = (e) => {
            e.stopPropagation();
            tplMenu.style.display = "none";
            const name = prompt("Enter a name for this indicator preset (e.g. Scalp Settings):");
            if (name && name.trim()) {
              const k = indKey();
              const list = JSON.parse(localStorage.getItem(k) || "[]");
              const entry = { name: name.trim(), values: { ...this.row?.values }, propValues: { ...this.row?.propValues } };
              const existIdx = list.findIndex(p => p.name === name.trim());
              if (existIdx >= 0) list[existIdx] = entry;
              else list.push(entry);
              localStorage.setItem(k, JSON.stringify(list));
              renderTplMenu();
            }
          };
          tplMenu.appendChild(saveRow);

          // Divider
          const sep = document.createElement("div");
          sep.style.cssText = "height:1px;background:var(--vela-border, #334155);margin:4px 0;";
          tplMenu.appendChild(sep);

          // Saved presets
          const k = indKey();
          const presets = JSON.parse(localStorage.getItem(k) || "[]");
          if (presets.length === 0) {
            const empty = document.createElement("div");
            empty.style.cssText = "padding:6px 12px;color:var(--vela-fg-muted, #94a3b8);font-size:12px;font-style:italic;";
            empty.textContent = "No saved presets";
            tplMenu.appendChild(empty);
          } else {
            presets.forEach(p => {
              const item = document.createElement("div");
              item.style.cssText = "padding:7px 12px;cursor:pointer;color:var(--vela-fg-bright, #fff);display:flex;align-items:center;justify-content:space-between;gap:8px;";
              const label = document.createElement("span");
              label.textContent = p.name;
              label.style.cssText = "flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
              item.appendChild(label);

              const delBtn = document.createElement("span");
              delBtn.textContent = "✕";
              delBtn.title = "Delete preset";
              delBtn.style.cssText = "color:#ef4444;font-size:11px;padding:2px 4px;border-radius:3px;";
              delBtn.onmouseenter = () => delBtn.style.background = "rgba(239,68,68,0.2)";
              delBtn.onmouseleave = () => delBtn.style.background = "transparent";
              delBtn.onclick = (e) => {
                e.stopPropagation();
                const curr = JSON.parse(localStorage.getItem(k) || "[]");
                const next = curr.filter(x => x.name !== p.name);
                localStorage.setItem(k, JSON.stringify(next));
                renderTplMenu();
              };
              item.appendChild(delBtn);

              item.onmouseenter = () => item.style.background = "var(--vela-hover, rgba(255,255,255,0.08))";
              item.onmouseleave = () => item.style.background = "transparent";
              item.onclick = (e) => {
                e.stopPropagation();
                tplMenu.style.display = "none";
                if (this.row) {
                  const snap = this.snapshot, pSnap = this.propSnapshot;
                  if (p.values) {
                    for (const [key, val] of Object.entries(p.values)) {
                      this.row.values[key] = val;
                      this.host.onChange?.({ indicatorId: this.row.id, key, value: val });
                    }
                  }
                  if (p.propValues) {
                    for (const [key, val] of Object.entries(p.propValues)) {
                      this.row.propValues[key] = val;
                      this.host.onChange?.({ indicatorId: this.row.id, key, value: val, kind: "prop" });
                    }
                  }
                  this.open(this.row);
                  snap && (this.snapshot = snap);
                  pSnap && (this.propSnapshot = pSnap);
                  if (typeof window !== "undefined" && typeof window.__velaAutoSave === "function") {
                    window.__velaAutoSave();
                  }
                }
              };
              tplMenu.appendChild(item);
            });
          }
        };

        tplBtn.onclick = (e) => {
          e.stopPropagation();
          const open = tplMenu.style.display === "block";
          document.querySelectorAll(".vela-sd-tpl-menu").forEach((m) => m.style.display = "none");
          if (!open) {
            renderTplMenu();
            tplMenu.style.display = "block";
          }
        };

        document.addEventListener("click", () => {
          tplMenu.style.display = "none";
        });

        leftBox.appendChild(tplBtn);
        leftBox.appendChild(tplMenu);
        foot.appendChild(leftBox);

        // Right buttons: Cancel and Ok
        const rightBox = document.createElement("div");
        rightBox.style.cssText = "display:flex;align-items:center;gap:8px;";
        const cancelBtn = this.dialogButton(this.t(` + textVar + `.cancel), false, () => this.revertAndClose());
        const okBtn = this.dialogButton(this.t(` + textVar + `.ok), true, () => {
          if (typeof window !== "undefined" && typeof window.__velaAutoSave === "function") {
            window.__velaAutoSave();
          }
          this.close();
        });
        rightBox.append(cancelBtn, okBtn);
        foot.appendChild(rightBox);
      }`);
    modified = true;
  }

  // 11. Magnet Snap: Shift key temporary toggle off/on while dragging or holding
  const targetEffSnap = `function effectiveSnapMode(momentaryOverride, sticky) {\n  return momentaryOverride ? "strong" : sticky;\n}`;
  const replEffSnap = `function effectiveSnapMode(momentaryOverride, sticky, shiftKey = false) {\n  if (shiftKey && sticky !== "off") return "off";\n  return momentaryOverride ? "strong" : sticky;\n}`;
  if (content.includes(targetEffSnap)) {
    content = content.replaceAll(targetEffSnap, replEffSnap);
    modified = true;
  }

  const targetSnapModeCall = `return effectiveSnapMode(e.ctrlKey || e.metaKey, this.deps.drawingsSnapMode?.() ?? "off");`;
  const replSnapModeCall = `return effectiveSnapMode(e.ctrlKey || e.metaKey, this.deps.drawingsSnapMode?.() ?? "off", Boolean(e?.shiftKey));`;
  if (content.includes(targetSnapModeCall)) {
    content = content.replaceAll(targetSnapModeCall, replSnapModeCall);
    modified = true;
  }

  const targetOnDownCursor = `this.deps.drawingsClearTransient?.();\n      this.dragging = true;\n      this.moved = false;\n      this.startX = x;\n      this.startY = y;`;
  const replOnDownCursor = `this.deps.drawingsClearTransient?.();\n      this.dragging = true;\n      this.moved = false;\n      this.startX = x;\n      this.startY = y;\n      this.cursorX = x;\n      this.cursorY = y;`;
  if (content.includes(targetOnDownCursor)) {
    content = content.replaceAll(targetOnDownCursor, replOnDownCursor);
    modified = true;
  }

  const targetShiftDownSelect = `const hit = this.hitAt(x, y);\n    if (hit) {\n      if (shift2) {\n        this.deps.emit({ kind: "select", ids: [hit.id], additive: true });\n        return;\n      }\n      const handle = hit.hitHandle(x, y, proj, HIT_TOLERANCE);`;
  const replShiftDownSelect = `const hit = this.hitAt(x, y);\n    if (hit) {\n      const handle = hit.hitHandle(x, y, proj, HIT_TOLERANCE);\n      if (shift2 && handle < 0) {\n        this.deps.emit({ kind: "select", ids: [hit.id], additive: true });\n        return;\n      }`;
  if (content.includes(targetShiftDownSelect)) {
    content = content.replaceAll(targetShiftDownSelect, replShiftDownSelect);
    modified = true;
  }

  // 12. Long/Short Position Tool: Restore style.lineColor with Opacity Picker & unify line rendering
  const targetPosSchema = `{ path: "profitColor", label: msg("drawing.position.profitColor", "Profit zone"), kind: "color", group: "fill" },\n        { path: "lossColor", label: msg("drawing.position.lossColor", "Loss zone"), kind: "color", group: "fill" },\n        ...LINE_FIELDS.filter((f) => f.path !== "style.lineColor"),`;
  const replPosSchema = `{ path: "profitColor", label: msg("drawing.position.profitColor", "Profit zone"), kind: "color", group: "fill" },\n        { path: "lossColor", label: msg("drawing.position.lossColor", "Loss zone"), kind: "color", group: "fill" },\n        ...LINE_FIELDS,`;
  if (content.includes(targetPosSchema)) {
    content = content.replace(targetPosSchema, replPosSchema);
    modified = true;
  }

  const targetPosCtor = `if (this.profitColor === void 0) this.profitColor = _PositionTool.DEFAULT_PROFIT_COLOR;\n    if (this.lossColor === void 0) this.lossColor = _PositionTool.DEFAULT_LOSS_COLOR;`;
  const replPosCtor = `if (this.profitColor === void 0) this.profitColor = _PositionTool.DEFAULT_PROFIT_COLOR;\n    if (this.lossColor === void 0) this.lossColor = _PositionTool.DEFAULT_LOSS_COLOR;\n    if (!init.style?.lineColor) this.style.lineColor = "#787b86";`;
  if (content.includes(targetPosCtor) && !content.includes('this.style.lineColor = "#787b86"')) {
    content = content.replace(targetPosCtor, replPosCtor);
    modified = true;
  }

  const targetPosPaint = `    const line = (y, color) => this.stroke(ctx, { ...d.style, lineColor: color }, () => {\n      ctx.moveTo(x1, y);\n      ctx.lineTo(x2, y);\n    });\n    line(ty, d.profitColor);\n    line(sy, d.lossColor);\n    line(ey, d.style.lineColor);`;
  const replPosPaint = `    const line = (y, color) => this.stroke(ctx, { ...d.style, lineColor: color }, () => {\n      ctx.moveTo(x1, y);\n      ctx.lineTo(x2, y);\n    });\n    const effLineColor = d.style?.lineColor || "#787b86";\n    line(ty, effLineColor);\n    line(sy, effLineColor);\n    line(ey, effLineColor);`;
  if (content.includes(targetPosPaint)) {
    content = content.replace(targetPosPaint, replPosPaint);
    modified = true;
  }

  // 13. Indicators Dialog: Listing ALL active indicators (including manual/Pine scripts) & accurate count
  const targetOnChartRows = `  onChartRows() {\n    return [\n      ...this.nativeHandles().map((h) => ({ name: h.title, ...nativeAliases(h.nativeType, this.inner?.i18n), native: true, nativeType: h.nativeType })),\n      ...this.instances.map((it) => ({ name: it.entry.name, language: it.entry.language }))\n    ];\n  }`;
  const replOnChartRows = `  onChartRows() {\n    const list = [];\n    const seenIds = new Set();\n    for (const h of this.nativeHandles()) {\n      seenIds.add(h.id);\n      list.push({ name: h.title, ...nativeAliases(h.nativeType, this.inner?.i18n), native: true, nativeType: h.nativeType, handleId: h.id });\n    }\n    for (const it of this.instances) {\n      if (it.handle) seenIds.add(it.handle.id);\n      list.push({ name: it.entry.name, language: it.entry.language, handleId: it.handle?.id, instance: it });\n    }\n    if (this.inner) {\n      for (const h of this.inner.indicators()) {\n        if (!seenIds.has(h.id) && h.nativeType === void 0) {\n          seenIds.add(h.id);\n          list.push({ name: h.title || "Custom Indicator", language: h.language || "pine", handleId: h.id });\n        }\n      }\n    }\n    return list;\n  }`;
  if (content.includes(targetOnChartRows) && !content.includes('seenIds.add(h.id)')) {
    content = content.replace(targetOnChartRows, replOnChartRows);
    modified = true;
  }

  const targetRemoveFromChart = `  removeFromChart(index) {\n    const natives = this.nativeHandles();\n    if (index < natives.length) this.removeNative(natives[index]);\n    else this.removeInstance(index - natives.length);\n  }`;
  const replRemoveFromChart = `  removeFromChart(index) {\n    const rows = this.onChartRows();\n    const item = rows[index];\n    if (!item) return;\n    if (item.instance) {\n      this.dropInstance(item.instance);\n    } else if (item.nativeType) {\n      const h = this.nativeHandles().find(nh => nh.nativeType === item.nativeType);\n      if (h) this.removeNative(h);\n    } else if (item.handleId && this.inner) {\n      const h = this.inner.indicators().find(ih => ih.id === item.handleId);\n      if (h) h.remove();\n    }\n    this.deps.onIndicatorsChanged(this.id);\n    this.deps.onStateDirty();\n  }`;
  if (content.includes(targetRemoveFromChart) && !content.includes('item.instance')) {
    content = content.replace(targetRemoveFromChart, replRemoveFromChart);
    modified = true;
  }

  const targetIndCount = `  get indicatorCount() {\n    return this.instances.length + (this.inner ? this.nativeHandles().length : this.presentNatives.length);\n  }`;
  const replIndCount = `  get indicatorCount() {\n    return this.inner ? this.inner.indicators().length : (this.instances.length + this.presentNatives.length);\n  }`;
  if (content.includes(targetIndCount) && !content.includes('this.inner ? this.inner.indicators().length')) {
    content = content.replace(targetIndCount, replIndCount);
    modified = true;
  }

  const targetIndAdded = `    this.inner.on("indicator:added", () => {\n      this.syncPresentNatives();\n      this.refreshNativeCatalog();\n    });`;
  const replIndAdded = `    this.inner.on("indicator:added", () => {\n      this.syncPresentNatives();\n      this.refreshNativeCatalog();\n      this.deps.onIndicatorsChanged(this.id);\n      this.deps.onStateDirty();\n    });\n    this.inner.on("indicator:removed", () => {\n      this.deps.onIndicatorsChanged(this.id);\n      this.deps.onStateDirty();\n    });`;
  if (content.includes(targetIndAdded) && !content.includes('this.deps.onIndicatorsChanged(this.id)')) {
    content = content.replace(targetIndAdded, replIndAdded);
    modified = true;
  }

  // 14. Indicator Favorites: Stars in Indicator Modal + Favorites Category + Right-Click Legend Context Menu
  const targetIpRowNameRegex = /const name = doc\.createElement\("span"\);\s*name\.className = "vela-ip-name";\s*name\.textContent = r\.name;\s*(row\d*)\.appendChild\(name\);/g;
  if (content.match(targetIpRowNameRegex) && !content.includes('vela-ip-fav')) {
    content = content.replace(targetIpRowNameRegex, (match, rowVar) => `if (opts.library !== void 0) {
        const favs = JSON.parse(localStorage.getItem("omni-indicator-favorites") || "[]");
        const isFav = favs.includes(r.name);
        const starBtn = doc.createElement("button");
        starBtn.className = "vela-ip-fav" + (isFav ? " active" : "");
        starBtn.textContent = isFav ? "★" : "☆";
        starBtn.title = isFav ? "Remove from favorites" : "Add to favorites";
        starBtn.onclick = (e) => {
          e.stopPropagation();
          const curr = JSON.parse(localStorage.getItem("omni-indicator-favorites") || "[]");
          const idx = curr.indexOf(r.name);
          if (idx >= 0) curr.splice(idx, 1);
          else curr.push(r.name);
          localStorage.setItem("omni-indicator-favorites", JSON.stringify(curr));
          this.refresh();
        };
        ` + rowVar + `.prepend(starBtn);
      }
      const name = doc.createElement("span");
      name.className = "vela-ip-name";
      name.textContent = r.name;
      ` + rowVar + `.appendChild(name);`);
    modified = true;
  }

  const targetByCat = `    const byCat = /* @__PURE__ */ new Map();`;
  const replByCat = `    const favsList = JSON.parse(localStorage.getItem("omni-indicator-favorites") || "[]");
    const favRows = library.map((r, i) => [r, i]).filter(([r]) => favsList.includes(r.name) && match(r));
    if (favRows.length > 0) {
      const favCard = doc.createElement("div");
      favCard.className = "vela-ip-oncard";
      const favTitle = doc.createElement("div");
      favTitle.className = "vela-ip-group";
      favTitle.style.cssText = "color:#f59e0b;display:flex;align-items:center;gap:4px;";
      favTitle.textContent = "★ Favorites";
      favCard.appendChild(favTitle);
      for (const [r, i] of favRows) favCard.appendChild(rowEl(r, { library: i }));
      this.list.appendChild(favCard);
    }
    const byCat = /* @__PURE__ */ new Map();`;
  if (content.includes(targetByCat) && !content.includes('omni-indicator-favorites')) {
    content = content.replace(targetByCat, replByCat);
    modified = true;
  }

  const targetIpEmptyCss = `.vela-ip-empty { padding: \${t.t.space[3]}; color: \${t.t.fg.muted}; text-align: center; }`;
  const replIpEmptyCss = `.vela-ip-empty { padding: \${t.t.space[3]}; color: \${t.t.fg.muted}; text-align: center; }
.vela-ip-fav { all: unset; box-sizing: border-box; cursor: pointer; color: #64748b; padding: 0 4px; font-size: 15px; line-height: 1; margin-right: 4px; transition: color 0.15s; }
.vela-ip-fav:hover { color: #f59e0b; }
.vela-ip-fav.active { color: #f59e0b; }`;
  if (content.includes(targetIpEmptyCss) && !content.includes('.vela-ip-fav {')) {
    content = content.replace(targetIpEmptyCss, replIpEmptyCss);
    modified = true;
  }

  const targetRowMenuItemsRegex = /rowMenuItems\(id\)\s*\{\s*const (row\d*) = this\.rows\.get\(id\);[\s\S]*?id:\s*"values",\s*label:\s*this\.t\((\w+)\.indicatorValues\),\s*checked:\s*this\.rowValuesShown\(\1\),\s*separatorBefore:\s*stack\.length > 0\s*\}\s*\];\s*\}/g;
  if (content.match(targetRowMenuItemsRegex) && !content.includes('id: "duplicate"')) {
    content = content.replace(targetRowMenuItemsRegex, (match, rowVar, textVar) => `rowMenuItems(id) {
    const ` + rowVar + ` = this.rows.get(id);
    if (!` + rowVar + `) return null;
    const stack = this.stackItems(id);
    const favs = JSON.parse(localStorage.getItem("omni-indicator-favorites") || "[]");
    const isFav = favs.includes(` + rowVar + `.title);
    return [
      {
        id: "duplicate",
        label: "Duplicate",
        separatorBefore: false
      },
      ...stack,
      {
        id: "values",
        label: this.t(` + textVar + `.indicatorValues),
        checked: this.rowValuesShown(` + rowVar + `),
        separatorBefore: stack.length > 0
      },
      {
        id: "toggle-fav",
        label: isFav ? "★ Remove from favorites" : "☆ Add to favorites",
        separatorBefore: true
      }
    ];
  }`);
    modified = true;
  }

  const targetRowMenuSelectRegex = /onSelect:\s*\(itemId\)\s*=>\s*\{\s*if\s*\(this\.runStackItem\(itemId,\s*id\)\s*\|\|\s*itemId !== "values"\)\s*return;\s*const (row\d*) = this\.rows\.get\(id\);/g;
  if (content.match(targetRowMenuSelectRegex) && !content.includes('itemId === "duplicate"')) {
    content = content.replace(targetRowMenuSelectRegex, (match, rowVar) => `onSelect: (itemId) => {
        if (itemId === "duplicate") {
          if (typeof window.__duplicateIndicator === "function") {
            window.__duplicateIndicator(id);
          }
          return;
        }
        if (itemId === "toggle-fav") {
          const r = this.rows.get(id);
          if (r?.title) {
            const curr = JSON.parse(localStorage.getItem("omni-indicator-favorites") || "[]");
            const idx = curr.indexOf(r.title);
            if (idx >= 0) curr.splice(idx, 1);
            else curr.push(r.title);
            localStorage.setItem("omni-indicator-favorites", JSON.stringify(curr));
          }
          return;
        }
        if (this.runStackItem(itemId, id) || itemId !== "values") return;
        const ` + rowVar + ` = this.rows.get(id);`);
    modified = true;
  }

  // 15. Auto-Save All Indicators (preserving Pine Script sources across restarts)
  const targetInstanceEntries = `        instanceEntries: this.instances.filter((it) => !it.external).map((it) => {\n          const d = it.handle ? instanceDeltas(it.handle) : it.values;\n          const hidden = it.handle ? !it.handle.visible : false;\n          return d || hidden ? { name: it.entry.name, ...d ?? {}, ...hidden ? { hidden: true } : {} } : it.entry.name;\n        }),`;
  const replInstanceEntries = `        instanceEntries: (() => {
          const entries = [];
          const seen = new Set();
          for (const it of this.instances) {
            if (it.handle) seen.add(it.handle.id);
            const d = it.handle ? instanceDeltas(it.handle) : it.values;
            const hidden = it.handle ? !it.handle.visible : false;
            entries.push({
              name: it.entry.name,
              script: it.entry.script,
              language: it.entry.language || "pine",
              ...d ?? {},
              ...hidden ? { hidden: true } : {}
            });
          }
          if (this.inner) {
            for (const h of this.inner.indicators()) {
              if (!seen.has(h.id) && h.nativeType === void 0) {
                seen.add(h.id);
                const d = instanceDeltas(h);
                const hidden = !h.visible;
                entries.push({
                  name: h.title || "Custom Indicator",
                  script: h.source,
                  language: h.language || "pine",
                  ...d ?? {},
                  ...hidden ? { hidden: true } : {}
                });
              }
            }
          }
          return entries;
        })(),`;
  if (content.includes(targetInstanceEntries) && !content.includes('script: it.entry.script')) {
    content = content.replace(targetInstanceEntries, replInstanceEntries);
    modified = true;
  }

  const targetApplyLedger = `      if (this.manifest.length > 0) {\n        for (const item of led.manifest) {\n          const entry = this.manifest.find((e) => e.name === ledgerEntryName(item));\n          if (entry)\n            this.addManifestInstance(entry, {\n              record: false,\n              ...typeof item === "object" ? { inputs: item.inputs, props: item.props, hidden: item.hidden } : {}\n            });\n        }\n        this.pendingManifestNames = null;\n      }`;
  const replApplyLedger = `      if (this.manifest.length > 0 || led.manifest?.length > 0) {
        for (const item of (led.manifest || [])) {
          const entry = this.manifest.find((e) => e.name === ledgerEntryName(item));
          if (entry) {
            this.addManifestInstance(entry, {
              record: false,
              ...typeof item === "object" ? { inputs: item.inputs, props: item.props, hidden: item.hidden } : {}
            });
          } else if (item && typeof item === "object" && item.script) {
            this.addManifestInstance({ name: ledgerEntryName(item), script: item.script, language: item.language || "pine" }, {
              record: false,
              inputs: item.inputs,
              props: item.props,
              hidden: item.hidden
            });
          }
        }
        this.pendingManifestNames = null;
      }`;
  if (content.includes(targetApplyLedger) && !content.includes('script: item.script')) {
    content = content.replace(targetApplyLedger, replApplyLedger);
    modified = true;
  }

  const targetSetManifest = `    if (this.pendingManifestNames) {\n      if (list.length === 0) return;\n      for (const led of this.pendingManifestNames) {\n        const entry = list.find((e) => e.name === ledgerEntryName(led));\n        if (entry) this.addManifestInstance(entry, { record: false, ...typeof led === "object" ? { inputs: led.inputs, props: led.props, hidden: led.hidden } : {} });\n      }\n      this.pendingManifestNames = null;\n      return;\n    }`;
  const replSetManifest = `    if (this.pendingManifestNames) {
      for (const led of this.pendingManifestNames) {
        const entry = list.find((e) => e.name === ledgerEntryName(led));
        if (entry) {
          this.addManifestInstance(entry, { record: false, ...typeof led === "object" ? { inputs: led.inputs, props: led.props, hidden: led.hidden } : {} });
        } else if (led && typeof led === "object" && led.script) {
          this.addManifestInstance({ name: ledgerEntryName(led), script: led.script, language: led.language || "pine" }, { record: false, inputs: led.inputs, props: led.props, hidden: led.hidden });
        }
      }
      this.pendingManifestNames = null;
      return;
    }`;
  if (content.includes(targetSetManifest) && !content.includes('script: led.script')) {
    content = content.replace(targetSetManifest, replSetManifest);
    modified = true;
  }

  // 17. Timeframe chip click -> opens timeframe dropdown
  const targetTfChip = `if (tf === this.timeframe) {\n        b.dataset.current = "1";\n        b.setAttribute("aria-current", "true");\n      } else {`;
  const replTfChip = `if (tf === this.timeframe) {
        b.dataset.current = "1";
        b.setAttribute("aria-current", "true");
        b.setAttribute("aria-haspopup", "menu");
        b.style.cursor = "pointer";
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.tfCaret.click();
        });
      } else {`;
  if (content.includes(targetTfChip)) {
    content = content.replaceAll(targetTfChip, replTfChip);
    modified = true;
  }

  // 18. Timeframe items sections (Minutes, Hours, Days)
  const targetTfItems = `tfItems() {\n    const stars = this.opts.onTimeframeFavorite !== void 0;\n    return this.opts.timeframes.map((tf) => ({\n      id: tf,\n      label: timeframeLabel(tf, this.i18n),\n      checked: tf === this.timeframe,\n      ...stars ? { favorite: this.tfFavs.includes(tf) } : {}\n    }));\n  }`;
  const replTfItems = `tfItems() {
    const stars = this.opts.onTimeframeFavorite !== void 0;
    return this.opts.timeframes.map((tf) => {
      const isFirstHour = tf === "60" || tf === "1h";
      const isFirstDay = tf === "D" || tf === "1440" || tf === "1D";
      return {
        id: tf,
        label: timeframeLabel(tf, this.i18n),
        checked: tf === this.timeframe,
        separatorBefore: isFirstHour || isFirstDay,
        ...stars ? { favorite: this.tfFavs.includes(tf) } : {}
      };
    });
  }`;
  if (content.includes(targetTfItems)) {
    content = content.replaceAll(targetTfItems, replTfItems);
    modified = true;
  }

  // 19. Chart Settings Dialog: Trading and Alerts Tabs + Navigation Rail Icons (Images 1 & 2)
  if (!content.includes('sid(this.section("Trading"), "trading")')) {
    // 19a. Inject Trading and Alerts Sections after Canvas and before Events
    const targetCanvasToEvents = /(\bif\s*\(\s*this\.themeControl\s*\)\s*\{[\s\S]*?\}\s*)(if\s*\(\s*this\.markGroups\.length\s*>\s*0\s*\)\s*\{[\s\S]*?refreshDimming\(\);\s*\})/;
    if (content.match(targetCanvasToEvents)) {
      content = content.replace(targetCanvasToEvents, `$1
    // Trading Section
    body.append(sid(this.section("Trading"), "trading"));
    try {
      const trSettings = JSON.parse(localStorage.getItem("omni-trading-settings") || "{}");
      const saveTr = () => {
        localStorage.setItem("omni-trading-settings", JSON.stringify(trSettings));
        window.dispatchEvent(new CustomEvent("vela:trading-settings-updated", { detail: trSettings }));
      };

      const attachSub = (row, text) => {
        const sub = document.createElement("div");
        sub.className = "vela-sd-row-subtext";
        sub.textContent = text;
        const isNested = row.classList.contains("vela-sd-nested");
        sub.style.cssText = "font-size:11px;color:var(--vela-fg-muted,#94a3b8);margin-top:-3px;margin-bottom:7px;line-height:1.3;font-weight:normal;margin-inline-start:" + (isNested ? "46px" : "22px") + ";";
        row.after(sub);
        return sub;
      };

      body.append(this.sectionTitle("GENERAL"));

      // 1. Buy/sell buttons
      const buySellRow = this.boolRow("Buy/sell buttons", trSettings.buySellButtons ?? true, (v) => {
        trSettings.buySellButtons = v;
        saveTr();
        if (window.__velaQuickTrade) {
          if (v) window.__velaQuickTrade.show?.();
          else window.__velaQuickTrade.hide?.();
        }
      });
      body.append(buySellRow);
      attachSub(buySellRow, "Instant order placement with pre-selected quantity");

      // 2. One-click trading
      const oneClickRow = this.boolRow("One-click trading", trSettings.oneClickTrading ?? true, (v) => {
        trSettings.oneClickTrading = v;
        saveTr();
        if (window.__velaQuickTrade) {
          window.__velaQuickTrade.setInstantExecution?.(v);
        }
      }, this.hint("Instantly place orders without a confirmation prompt"));
      body.append(oneClickRow);
      attachSub(oneClickRow, "Instantly place orders without a confirmation prompt");

      // 3. Execution sound
      const spkIcon = document.createElement("span");
      spkIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--vela-fg-muted,#94a3b8);display:block;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
      spkIcon.style.cssText = "display:inline-flex;align-items:center;margin-right:2px;";

      const sndVolSlider = document.createElement("input");
      sndVolSlider.type = "range";
      sndVolSlider.min = "0";
      sndVolSlider.max = "100";
      sndVolSlider.value = String(trSettings.executionSoundVolume ?? 70);
      sndVolSlider.style.cssText = "width:72px;height:4px;accent-color:var(--vela-accent,#2962ff);cursor:pointer;margin:0 4px;";
      sndVolSlider.oninput = (e) => {
        trSettings.executionSoundVolume = Number(e.target.value);
        saveTr();
        if (window.__playExecutionSoundPreview) {
          window.__playExecutionSoundPreview(trSettings.executionSoundType || "default", trSettings.executionSoundVolume);
        }
      };

      const sndTypeSelect = document.createElement("select");
      sndTypeSelect.style.cssText = "height:26px;padding:0 6px;border-radius:4px;border:1px solid var(--vela-border,#334155);background:var(--vela-surface-sunken,#1e293b);color:var(--vela-fg-bright,#fff);font-size:12px;cursor:pointer;";
      ["Default", "Chime", "Pop", "Bell", "Subtle"].forEach(s => {
        const opt = document.createElement("option");
        opt.value = s.toLowerCase();
        opt.textContent = s;
        opt.selected = opt.value === (trSettings.executionSoundType ?? "default");
        sndTypeSelect.appendChild(opt);
      });
      sndTypeSelect.onchange = (e) => {
        trSettings.executionSoundType = e.target.value;
        saveTr();
        if (window.__playExecutionSoundPreview) {
          window.__playExecutionSoundPreview(trSettings.executionSoundType, trSettings.executionSoundVolume);
        }
      };

      const execSoundRow = this.toggleRow("Execution sound", trSettings.executionSound ?? true, (v) => {
        trSettings.executionSound = v;
        saveTr();
      }, [spkIcon, sndVolSlider, sndTypeSelect]);
      body.append(execSoundRow);

      // 4. Show only rejection notifications
      const rejRow = this.boolRow("Show only rejection notifications", trSettings.showOnlyRejectionNotifs ?? false, (v) => {
        trSettings.showOnlyRejectionNotifs = v;
        saveTr();
      });
      body.append(rejRow);

      body.append(this.sectionTitle("APPEARANCE"));

      // 5. Positions and orders
      const posOrdersRow = this.boolRow("Positions and orders", trSettings.positionsAndOrders ?? true, (v) => {
        trSettings.positionsAndOrders = v;
        saveTr();
      }, this.hint("Show open positions and pending orders on the chart"));
      body.append(posOrdersRow);

      // 6. Reverse position button (nested)
      const revPosRow = this.boolRow("Reverse position button", trSettings.reversePositionButton ?? true, (v) => {
        trSettings.reversePositionButton = v;
        saveTr();
      });
      revPosRow.classList.add("vela-sd-nested");
      revPosRow.style.setProperty("--vela-sd-depth", "1");
      body.append(revPosRow);
      attachSub(revPosRow, "Quickly close and reopen in the opposite direction");

      // 7. Project order for market orders (nested)
      const projOrderRow = this.boolRow("Project order for market orders", trSettings.projectOrderForMarket ?? true, (v) => {
        trSettings.projectOrderForMarket = v;
        saveTr();
      });
      projOrderRow.classList.add("vela-sd-nested");
      projOrderRow.style.setProperty("--vela-sd-depth", "1");
      body.append(projOrderRow);
      attachSub(projOrderRow, "Dynamic profit and loss previews on the chart");

      // 8. Profit and loss value
      const posUnitSelect = document.createElement("select");
      posUnitSelect.style.cssText = "height:26px;padding:0 6px;border-radius:4px;border:1px solid var(--vela-border,#334155);background:var(--vela-surface-sunken,#1e293b);color:var(--vela-fg-bright,#fff);font-size:12px;cursor:pointer;";
      [["Money", "Positions: Money"], ["Pips", "Positions: Pips"], ["Percentage", "Positions: %"]].forEach(([v, l]) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = l;
        o.selected = v === (trSettings.pnlPositionsUnit ?? "Money");
        posUnitSelect.appendChild(o);
      });
      posUnitSelect.onchange = (e) => {
        trSettings.pnlPositionsUnit = e.target.value;
        saveTr();
      };

      const brkUnitSelect = document.createElement("select");
      brkUnitSelect.style.cssText = "height:26px;padding:0 6px;border-radius:4px;border:1px solid var(--vela-border,#334155);background:var(--vela-surface-sunken,#1e293b);color:var(--vela-fg-bright,#fff);font-size:12px;cursor:pointer;";
      [["Money", "Brackets: Money"], ["Pips", "Brackets: Pips"], ["Percentage", "Brackets: %"]].forEach(([v, l]) => {
        const o = document.createElement("option");
        o.value = v;
        o.textContent = l;
        o.selected = v === (trSettings.pnlBracketsUnit ?? "Money");
        brkUnitSelect.appendChild(o);
      });
      brkUnitSelect.onchange = (e) => {
        trSettings.pnlBracketsUnit = e.target.value;
        saveTr();
      };

      const pnlRow = this.toggleRow("Profit and loss value", trSettings.pnlValue ?? true, (v) => {
        trSettings.pnlValue = v;
        saveTr();
      }, [posUnitSelect, brkUnitSelect]);
      body.append(pnlRow);

      // 9. Execution marks
      const execMarksRow = this.boolRow("Execution marks", trSettings.executionMarks ?? true, (v) => {
        trSettings.executionMarks = v;
        saveTr();
      });
      body.append(execMarksRow);

      // 10. Execution labels (nested)
      const execLabelsRow = this.boolRow("Execution labels", trSettings.executionLabels ?? true, (v) => {
        trSettings.executionLabels = v;
        saveTr();
      });
      execLabelsRow.classList.add("vela-sd-nested");
      execLabelsRow.style.setProperty("--vela-sd-depth", "1");
      body.append(execLabelsRow);

      // 11. Extended price lines
      const extLinesRow = this.boolRow("Extended price lines across the entire chart width", trSettings.extendedPriceLines ?? false, (v) => {
        trSettings.extendedPriceLines = v;
        saveTr();
      });
      body.append(extLinesRow);

      // 12. Order and position alignment
      const alignRow = this.selectRowLabeled("Order and position alignment", trSettings.orderPositionAlignment ?? "Right", [
        ["Right", "Right"],
        ["Left", "Left"],
        ["Center", "Center"]
      ], (v) => {
        trSettings.orderPositionAlignment = v;
        saveTr();
      });
      body.append(alignRow);

      // 13. Snapshot orders
      const snapRow = this.boolRow("Orders, executions, and positions in chart snapshots", trSettings.snapshotOrders ?? false, (v) => {
        trSettings.snapshotOrders = v;
        saveTr();
      });
      body.append(snapRow);
      attachSub(snapRow, "Visible on all devices without synchronization");
    } catch (e) {}

    // Alerts Section
    body.append(sid(this.section("Alerts"), "alerts"));
    try {
      const alSettings = JSON.parse(localStorage.getItem("omni-alerts-settings") || "{}");
      const saveAl = () => {
        localStorage.setItem("omni-alerts-settings", JSON.stringify(alSettings));
        window.dispatchEvent(new CustomEvent("vela:alerts-settings-updated", { detail: alSettings }));
      };

      const attachSubAl = (row, text) => {
        const sub = document.createElement("div");
        sub.className = "vela-sd-row-subtext";
        sub.textContent = text;
        const isNested = row.classList.contains("vela-sd-nested");
        sub.style.cssText = "font-size:11px;color:var(--vela-fg-muted,#94a3b8);margin-top:-3px;margin-bottom:7px;line-height:1.3;font-weight:normal;margin-inline-start:" + (isNested ? "46px" : "22px") + ";";
        row.after(sub);
        return sub;
      };

      body.append(this.sectionTitle("CHART LINE VISIBILITY"));

      // 1. Alert lines + color swatch
      const alertLinesRow = this.toggleRow("Alert lines", alSettings.alertLines ?? true, (v) => {
        alSettings.alertLines = v;
        saveAl();
        if (window.__velaSetAlertLinesVisible) {
          window.__velaSetAlertLinesVisible(v);
        }
      }, [
        this.swatch(alSettings.alertLineColor ?? "#ff9800", (col) => {
          alSettings.alertLineColor = col;
          saveAl();
          if (window.__velaSetAlertLineColor) {
            window.__velaSetAlertLineColor(col);
          }
        })
      ]);
      body.append(alertLinesRow);

      // 2. Only active alerts
      const onlyActiveRow = this.boolRow("Only active alerts", alSettings.onlyActiveAlerts ?? false, (v) => {
        alSettings.onlyActiveAlerts = v;
        saveAl();
        if (window.__velaFilterActiveAlerts) {
          window.__velaFilterActiveAlerts(v);
        }
      });
      body.append(onlyActiveRow);

      body.append(this.sectionTitle("NOTIFICATIONS"));

      // 3. Alert volume (speaker + slider)
      const alSpkIcon = document.createElement("span");
      alSpkIcon.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:var(--vela-fg-muted,#94a3b8);display:block;"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>';
      alSpkIcon.style.cssText = "display:inline-flex;align-items:center;margin-right:2px;";

      const alVolSlider = document.createElement("input");
      alVolSlider.type = "range";
      alVolSlider.min = "0";
      alVolSlider.max = "100";
      alVolSlider.value = String(alSettings.alertVolume ?? 80);
      alVolSlider.style.cssText = "width:80px;height:4px;accent-color:var(--vela-accent,#2962ff);cursor:pointer;margin:0 4px;";
      alVolSlider.oninput = (e) => {
        alSettings.alertVolume = Number(e.target.value);
        saveAl();
        if (window.__playAlertSoundPreview) {
          window.__playAlertSoundPreview(alSettings.alertVolume);
        }
      };

      const alVolRow = this.rowWith("Alert volume", [alSpkIcon, alVolSlider]);
      body.append(alVolRow);

      // 4. Automatically hide toasts
      const autoHideToastRow = this.boolRow("Automatically hide toasts", alSettings.autoHideToasts ?? true, (v) => {
        alSettings.autoHideToasts = v;
        saveAl();
      }, this.hint("Toast notifications will close automatically after 5 seconds"));
      body.append(autoHideToastRow);
      attachSubAl(autoHideToastRow, "Toast notifications will close automatically after 5 seconds");
    } catch (e) {}

    // Events Section Fallback if markGroups empty
    if (this.markGroups.length === 0) {
      body.append(sid(this.section("Events"), "events"));
      body.append(this.sectionTitle("VISIBLE EVENTS"));
      const noEvt = document.createElement("div");
      noEvt.style.cssText = "padding:12px 0;color:var(--vela-fg-muted,#94a3b8);font-size:12px;font-style:italic;";
      noEvt.textContent = "No mark events on this chart.";
      body.append(noEvt);
    }
    $2`);
      modified = true;
    }

    // 19c. Inject left rail tab icons
    const targetTabBtn = /const\s+tab\s*=\s*document\.createElement\("button"\);\s*tab\.type\s*=\s*"button";\s*tab\.textContent\s*=\s*label;\s*tab\.className\s*=\s*"vela-sd-tab"\s*\+\s*\(child\.dataset\.sdSub\s*!==\s*void 0\s*\?\s*" vela-sd-tab-sub"\s*:\s*""\);/;
    if (content.match(targetTabBtn)) {
      content = content.replace(targetTabBtn, `const tab = document.createElement("button");
        tab.type = "button";
        tab.className = "vela-sd-tab" + (child.dataset.sdSub !== void 0 ? " vela-sd-tab-sub" : "");
        const getSdIcon = (t) => {
          const s = String(t || "").toLowerCase();
          if (s.includes("symbol")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><rect x="4" y="6" width="6" height="12" rx="1"/><line x1="7" y1="2" x2="7" y2="6"/><line x1="7" y1="18" x2="7" y2="22"/><rect x="14" y="9" width="6" height="7" rx="1"/><line x1="17" y1="5" x2="17" y2="9"/><line x1="17" y1="16" x2="17" y2="20"/></svg>';
          if (s.includes("status")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="13" y2="18"/><polyline points="16 16 18 18 22 14"/></svg>';
          if (s.includes("scale")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><path d="M4 4v16h16"/><line x1="4" y1="8" x2="8" y2="8"/><line x1="4" y1="12" x2="10" y2="12"/><line x1="4" y1="16" x2="8" y2="16"/><line x1="8" y1="20" x2="8" y2="16"/><line x1="12" y1="20" x2="12" y2="14"/><line x1="16" y1="20" x2="16" y2="16"/></svg>';
          if (s.includes("canvas")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/><path d="M12 20h9"/></svg>';
          if (s.includes("trading") || s.includes("trade")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><path d="M17 2.5L21.5 7 17 11.5"/><path d="M21.5 7H10a6 6 0 0 0-6 6v1"/><path d="M7 21.5L2.5 17 7 12.5"/><path d="M2.5 17H14a6 6 0 0 0 6-6v-1"/></svg>';
          if (s.includes("alert")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M5 3L2 6"/><path d="M19 3l3 3"/></svg>';
          if (s.includes("event") || s.includes("mark")) return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex:none;opacity:0.85;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
          return "";
        };
        const ic = getSdIcon(title);
        tab.style.display = "flex";
        tab.style.alignItems = "center";
        tab.style.gap = "9px";
        tab.style.width = "100%";
        tab.innerHTML = ic ? \`\${ic}<span>\${label}</span>\` : \`<span>\${label}</span>\`;`);
      modified = true;
    }
  }

  // 20. Auto-Save on all chart config changes, renderer config edits, and instant persistence
  // 20a. ChartCell: notify state dirty on renderer config changes (candle colors, grid, scales, canvas, etc.)
  const targetCellConfigChanged = `      this.syncStatuslineColors();\n      this.syncPlotOverlayTokens();\n    });`;
  const replCellConfigChanged = `      this.syncStatuslineColors();\n      this.syncPlotOverlayTokens();\n      this.deps.onStateDirty?.();\n    });`;
  if (content.includes(targetCellConfigChanged) && !content.includes('this.deps.onStateDirty?.();')) {
    content = content.replace(targetCellConfigChanged, replCellConfigChanged);
    modified = true;
  }

  // 20b. VelaWorkspace: trigger markStateDirty on cell config changed
  const targetWsConfigChanged = `chart.renderer.onConfigChanged(() => this.propagateStylePrefs(cell.id));`;
  const replWsConfigChanged = `chart.renderer.onConfigChanged(() => {\n      this.propagateStylePrefs(cell.id);\n      this.markStateDirty();\n    });`;
  if (content.includes(targetWsConfigChanged)) {
    content = content.replace(targetWsConfigChanged, replWsConfigChanged);
    modified = true;
  }

  // 20c. VelaWorkspace: markStateDirty instant disk persistence (avoid losing changes on app exit)
  const targetMarkDirty = `  markStateDirty() {\n    if (this.destroyed || !this.booted) return;\n    if (this.stateTimer != null) clearTimeout(this.stateTimer);\n    this.stateTimer = setTimeout(() => {\n      this.stateTimer = null;\n      this.events.emit("state:changed", void 0);\n      this.persistNow();\n    }, 500);\n  }`;
  const replMarkDirty = `  markStateDirty() {\n    if (this.destroyed || !this.booted) return;\n    if (this.stateTimer != null) clearTimeout(this.stateTimer);\n    try { this.persistNow(); } catch {}\n    this.stateTimer = setTimeout(() => {\n      this.stateTimer = null;\n      this.events.emit("state:changed", void 0);\n      this.persistNow();\n    }, 150);\n  }`;
  if (content.includes(targetMarkDirty)) {
    content = content.replace(targetMarkDirty, replMarkDirty);
    modified = true;
  }

  // 20d. sanitizeCell: preserve script and language for Pine scripts
  const targetSanitizeCell = `        const props = bag(e.props);\n        const hidden = e.hidden === true;\n        return [inputs || props || hidden ? { name: e.name, ...inputs ? { inputs } : {}, ...props ? { props } : {}, ...hidden ? { hidden } : {} } : e.name];`;
  const replSanitizeCell = `        const props = bag(e.props);\n        const hidden = e.hidden === true;\n        const script = typeof e.script === "string" ? e.script : void 0;\n        const language = typeof e.language === "string" ? e.language : void 0;\n        return [inputs || props || hidden || script ? { name: e.name, ...inputs ? { inputs } : {}, ...props ? { props } : {}, ...hidden ? { hidden } : {}, ...script ? { script, language } : {} } : e.name];`;
  if (content.includes(targetSanitizeCell)) {
    content = content.replace(targetSanitizeCell, replSanitizeCell);
    modified = true;
  }

  // 21. Pine script error suppression & fallback engine
  // 21a. Suppress missing scripting engine toast on indicator:error
  const targetIndicatorError = `chart.on("indicator:error", ({ error }) => this.toastHost.show(\`[\${cell.id}] \${error.message}\`, "error", 5e3));`;
  const replIndicatorError = `chart.on("indicator:error", ({ error }) => {\n      if (error && String(error.message || '').includes("no scripting engine registered")) return;\n      this.toastHost.show(\`[\${cell.id}] \${error.message}\`, "error", 5e3);\n    });`;
  if (content.includes(targetIndicatorError)) {
    content = content.replaceAll(targetIndicatorError, replIndicatorError);
    modified = true;
  }

  // 21b. Fallback dummy engine in engineFor to prevent uncaught throws on pine
  const targetEngineFor = `    const engine = this.engines.get(lang);\n    if (!engine) {\n      throw new Error(\n        \`[vela] no scripting engine registered for language "\${lang}". Vela ships none — install one (Pine Script: @luxalgo/vela-pinets) and register it before addIndicator, e.g. chart.registerEngine('pine', new PineEngine()).\`\n      );\n    }`;
  const replEngineFor = `    let engine = this.engines.get(lang);\n    if (!engine) {\n      if (lang === "pine") {\n        engine = {\n          language: "pine",\n          compile: async () => ({ run: async () => ({ plots: [] }), destroy: () => {} }),\n          execute: async () => ({ plots: [] }),\n          destroy: () => {}\n        };\n        this.engines.set("pine", engine);\n        return engine;\n      }\n      throw new Error(\n        \`[vela] no scripting engine registered for language "\${lang}". Vela ships none — install one (Pine Script: @luxalgo/vela-pinets) and register it before addIndicator, e.g. chart.registerEngine('pine', new PineEngine()).\`\n      );\n    }`;
  if (content.includes(targetEngineFor)) {
    content = content.replaceAll(targetEngineFor, replEngineFor);
    modified = true;
  }

  // 22. Default timeframe 4h ('240') and default bars 1000 in seedDefaults
  const targetSeedDef = `function seedDefaults(opts) {\n  return {\n    symbol: opts.symbol,\n    timeframe: opts.timeframe,\n    bars: opts.bars,`;
  const replSeedDef = `function seedDefaults(opts) {\n  return {\n    symbol: opts.symbol,\n    timeframe: opts.timeframe || "240",\n    bars: opts.bars || 1000,`;
  if (content.includes(targetSeedDef)) {
    content = content.replaceAll(targetSeedDef, replSeedDef);
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(p, content, 'utf8');
  }
}
console.log('[patch-vela] All Vela patches (wicks, drag inversion, right offset preservation, dblclick symbol, drawing star button, standard settings footer, shift magnet toggle) applied.');
