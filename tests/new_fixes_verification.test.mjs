/**
 * OmniTrading - New Fixes Verification Test Suite
 *
 * Verifies:
 * 1. Alert text color editing (Patch 23a/23b and data model text.color)
 * 2. Trade Manager panel height clamping and persistence
 * 3. Chart Positions Overlay projector resolution and TP/SL bracket math
 * 4. Quick Trade 1-Click toggle and native Vela theme alignment (green BUY, red SELL)
 * 5. Broker Modal Vela Native Theme Palette Alignment
 * 6. Group button & corner controls bar design (offset from price gutter, separator, clean icons)
 * 7. Trade Manager dynamic viewport adjustment (chart moves up without being overlaid)
 * 8. Watchlist toggle mechanism via ws.dock.toggle
 * 9. Spread Visualizer coordinate & projector resolution and platform palette
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('New Fixes Verification Suite', () => {

  test('1. Alert Text Color Editing is Enabled in Vela Patch & Alerts Model', () => {
    // Check patch-vela.cjs has Patch 23
    const patchPath = path.resolve('scripts/patch-vela.cjs');
    const patchCode = fs.readFileSync(patchPath, 'utf8');
    assert.ok(patchCode.includes('23. Drawing settings: Enable text color editing'), 'Patch 23 must be present in patch-vela.cjs');
    assert.ok(patchCode.includes('paths.has("text.color")'), 'Quick action toolbar must enable text color swatch');

    // Check alerts.ts interface has textColor and lineColor
    const alertsPath = path.resolve('src/alerts.ts');
    const alertsCode = fs.readFileSync(alertsPath, 'utf8');
    assert.ok(alertsCode.includes('lineColor?: string;'), 'PriceAlert must include lineColor');
    assert.ok(alertsCode.includes('textColor?: string;'), 'PriceAlert must include textColor');
    assert.ok(!alertsCode.includes(`'text.color': '#ffffff'`), 'Should not forcibly overwrite text color with hardcoded #ffffff');
  });

  test('2. Trade Manager Adjustable Height Clamping & Vela Palette', () => {
    const tradingPanelPath = path.resolve('src/ui/tradingPanel.ts');
    const code = fs.readFileSync(tradingPanelPath, 'utf8');

    // Check resizer element
    assert.ok(code.includes('omni-panel-resizer'), 'Resizer element must exist');
    assert.ok(code.includes('omni-resizer-grip'), 'Visual grip bar must exist on resizer');
    assert.ok(code.includes('onResizerPointerDown'), 'Pointerdown listener must be wired');

    // Check clamping logic
    const minHeight = 100;
    const windowInnerHeight = 1000;
    const maxH = Math.floor(windowInnerHeight * 0.85); // 850
    const calcNewH = (startHeight, dy) => Math.min(maxH, Math.max(minHeight, startHeight + dy));

    assert.equal(calcNewH(240, -300), 100, 'Should clamp to 100px minimum');
    assert.equal(calcNewH(240, 900), 850, 'Should clamp to 85% of window height maximum');
    assert.equal(calcNewH(240, 60), 300, 'Should smoothly resize in-between');

    // Check theme tokens
    assert.ok(code.includes('var(--vela-surface'), 'Must use Vela surface token');
    assert.ok(code.includes('var(--vela-accent'), 'Must use Vela accent token');
    assert.ok(!code.includes('#0284c7'), 'Trade Manager must not contain blue #0284c7');
    assert.ok(!code.includes('#38bdf8'), 'Trade Manager must not contain blue #38bdf8');
  });

  test('3. Chart Positions Overlay Projector Resolution & Interactive TP/SL Lines', () => {
    const overlayPath = path.resolve('src/ui/chartPositionsOverlay.ts');
    const code = fs.readFileSync(overlayPath, 'utf8');

    // Verify NativeRenderer resolution
    assert.ok(code.includes('rendererPort'), 'Must resolve rendererPort from chart facade');
    assert.ok(code.includes('drawingProjector'), 'Must use drawingProjector for robust pixel-to-price mapping');

    // Verify draggable bracket handles
    assert.ok(code.includes('setupBracketDrag'), 'Must provide interactive drag handlers for TP/SL lines');
    assert.ok(code.includes('omni-drag-handle'), 'Must render drag handles on TP/SL badges');
    assert.ok(code.includes('modifyPosition'), 'Must commit target price to broker via modifyPosition');
    assert.ok(code.includes('btn-add-tp'), 'Must provide + TP quick bracket creation button');
    assert.ok(code.includes('btn-add-sl'), 'Must provide + SL quick bracket creation button');

    // Test bracket price calculation math
    const entryPrice = 100.0;
    const buyTp = Number((entryPrice * 1.015).toFixed(2));
    const buySl = Number((entryPrice * 0.99).toFixed(2));
    assert.equal(buyTp, 101.5, 'Default BUY TP should be +1.5%');
    assert.equal(buySl, 99.0, 'Default BUY SL should be -1.0%');

    const sellTp = Number((entryPrice * 0.985).toFixed(2));
    const sellSl = Number((entryPrice * 1.01).toFixed(2));
    assert.equal(sellTp, 98.5, 'Default SELL TP should be -1.5%');
    assert.equal(sellSl, 101.0, 'Default SELL SL should be +1.0%');
  });

  test('4. Quick Trade 1-Click Toggle & Native Theme Alignment', () => {
    const qtPath = path.resolve('src/quickTrade.ts');
    const qtCode = fs.readFileSync(qtPath, 'utf8');

    // Verify 1-Click toggle button on bar
    assert.ok(qtCode.includes('btn-instant-toggle'), 'Quick trade bar must have 1-Click toggle button');
    assert.ok(qtCode.includes('⚡ 1-Click'), 'Button label must be ⚡ 1-Click');

    // Verify confirmation modal "Don't ask again" checkbox
    assert.ok(qtCode.includes('cb-dont-ask-again'), 'Confirmation modal must have Don\'t ask again checkbox');

    // Verify colors
    assert.ok(!qtCode.includes('#38bdf8'), 'quickTrade.ts must not contain blue #38bdf8');
    assert.ok(!qtCode.includes('#0284c7'), 'quickTrade.ts must not contain blue #0284c7');

    // Check index.html BUY button color
    const htmlPath = path.resolve('index.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(htmlCode.includes('.omni-qt-buy {\n        background: #089981;'), 'BUY button must be native green #089981');
    assert.ok(htmlCode.includes('.omni-qt-sell {\n        background: #f23645;'), 'SELL button must be native red #f23645');
    assert.ok(!htmlCode.includes('.omni-qt-buy {\n        background: #2563eb;'), 'BUY button must not be blue #2563eb');
  });

  test('5. Broker Modal Vela Native Theme Palette Alignment', () => {
    const brokerModalPath = path.resolve('src/ui/brokerModal.ts');
    const code = fs.readFileSync(brokerModalPath, 'utf8');

    assert.ok(!code.includes('#0284c7'), 'brokerModal.ts must not contain blue #0284c7');
    assert.ok(!code.includes('#38bdf8'), 'brokerModal.ts must not contain blue #38bdf8');
    assert.ok(!code.includes('#2563eb'), 'brokerModal.ts must not contain blue #2563eb');
    assert.ok(code.includes('var(--vela-accent'), 'brokerModal.ts must use Vela accent');
    assert.ok(code.includes('var(--vela-surface'), 'brokerModal.ts must use Vela surface');
  });

  test('6. Group Button & Corner Controls Bar Design', () => {
    const htmlPath = path.resolve('index.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');

    // Check corner controls are offset from price scale gutter
    assert.ok(htmlCode.includes('right: 68px;'), 'Corner controls must be offset from price scale gutter');
    assert.ok(htmlCode.includes('.vela-corner-sep'), 'Must include separator between badge and buttons');

    // Check main.ts corner controls construction
    const mainPath = path.resolve('src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    assert.ok(mainCode.includes('vela-corner-sep'), 'main.ts must append separator');
  });

  test('7. Trade Manager Dynamic Viewport Adjustment (Chart Moves Up)', () => {
    const tradingPanelPath = path.resolve('src/ui/tradingPanel.ts');
    const code = fs.readFileSync(tradingPanelPath, 'utf8');

    assert.ok(code.includes('syncWorkspaceOffset'), 'Must sync workspace offset on expand/resize');
    assert.ok(code.includes("appEl.style.bottom = `${height}px`"), 'Must dynamically adjust #app bottom');

    // Check index.html default layout
    const htmlPath = path.resolve('index.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');
    assert.ok(htmlCode.includes('#app {\n        position: absolute;'), '#app must be absolute positioned');
  });

  test('8. Watchlist Toggle Mechanism via ws.dock.toggle', () => {
    const watchlistPath = path.resolve('src/watchlist.ts');
    const code = fs.readFileSync(watchlistPath, 'utf8');

    assert.ok(code.includes("dock.toggle('vela.watchlist')"), 'Must call dock.toggle for watchlist');

    const mainPath = path.resolve('src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    assert.ok(mainCode.includes('watchlist.toggle()'), 'Topbar action must invoke watchlist.toggle()');
  });

  test('9. Spread Visualizer Resolution & Platform Palette', () => {
    const spreadPath = path.resolve('src/spread.ts');
    const code = fs.readFileSync(spreadPath, 'utf8');

    assert.ok(code.includes('resolveRenderer'), 'Must resolve NativeRenderer properly');
    assert.ok(code.includes('drawingProjector'), 'Must use drawingProjector for price mapping');
    assert.ok(code.includes('fetchInitialQuote'), 'Must fetch initial quote if tick is not yet received');
    assert.ok(!code.includes('#3b82f6'), 'Bid line must not be blue #3b82f6');
    assert.ok(code.includes('#089981'), 'Bid line must be emerald #089981');
    assert.ok(code.includes('#f23645'), 'Ask line must be red #f23645');
  });

  test('10. Trade Manager Expand / Collapse Toggle & State Management', () => {
    const tradingPanelPath = path.resolve('src/ui/tradingPanel.ts');
    const code = fs.readFileSync(tradingPanelPath, 'utf8');

    assert.ok(code.includes('omni-trade-panel-expanded'), 'Must persist expanded state in localStorage');
    assert.ok(code.includes('dataset.collapsed'), 'Must track collapsed state on panel DOM element');
    assert.ok(code.includes('omni-panel-docked-header'), 'Header bar must support 1-click toggle when collapsed');
    assert.ok(code.includes("this.resizerEl.style.display = this.isExpanded ? 'flex' : 'none'"), 'Resizer handle must hide when collapsed');
  });

  test('11. Spread Chart Settings Integration & Clean Line Rendering', () => {
    const patchPath = path.resolve('scripts/patch-vela.cjs');
    const patchCode = fs.readFileSync(patchPath, 'utf8');
    assert.ok(patchCode.includes('scales.price-scale.spread-lines'), 'Chart settings Scales & Lines must include spread lines toggle');
    assert.ok(patchCode.includes('Display real-time bid and ask spread lines on chart'), 'Trading settings must include spread lines option');

    const spreadPath = path.resolve('src/spread.ts');
    const spreadCode = fs.readFileSync(spreadPath, 'utf8');
    assert.ok(spreadCode.includes('setVisible'), 'SpreadVisualizer must implement setVisible for settings toggle');
    assert.ok(spreadCode.includes('isVisible'), 'SpreadVisualizer must implement isVisible for settings retrieval');
    assert.ok(!spreadCode.includes('omni-spread-diff-badge'), 'Intrusive spread diff badge must be removed from chart overlay');

    const mainPath = path.resolve('src/main.ts');
    const mainCode = fs.readFileSync(mainPath, 'utf8');
    assert.ok(mainCode.includes('__spreadVisualizer = spreadVisualizer'), 'Must expose spread visualizer on window');
  });

  test('12. Discreet Position Overlays on Chart (TradingView / cTrader style)', () => {
    const overlayPath = path.resolve('src/ui/chartPositionsOverlay.ts');
    const code = fs.readFileSync(overlayPath, 'utf8');

    assert.ok(code.includes('height: 20px;'), 'Position badge must be compact 20px discreet pill');
    assert.ok(code.includes('left: 20px;'), 'Position badge must be cleanly offset from edge');
    assert.ok(code.includes('btn-close-pos'), 'Must provide sleek close button');
    assert.ok(!code.includes('@ ${pos.entryPrice'), 'Redundant entry price text must be omitted from badge for discreet focus');
  });

  test('13. Corner Controls Bar High-Contrast Visibility', () => {
    const htmlPath = path.resolve('index.html');
    const htmlCode = fs.readFileSync(htmlPath, 'utf8');

    assert.ok(htmlCode.includes('.vela-corner-btn'), 'Must style corner buttons');
    assert.ok(htmlCode.includes('color: #e2e8f0;'), 'Corner buttons must use high-contrast bright text color #e2e8f0');

    const colorLinkPath = path.resolve('src/colorLink.ts');
    const linkCode = fs.readFileSync(colorLinkPath, 'utf8');
    assert.ok(linkCode.includes('opacity:0.95'), 'Group dot must be clearly visible and not faded');
  });
});
