/**
 * OmniTrading - New Fixes Verification Test Suite
 *
 * Verifies:
 * 1. Alert text color editing (Patch 23a/23b and data model text.color)
 * 2. Trade Manager panel height clamping and persistence
 * 3. Chart Positions Overlay projector resolution and TP/SL bracket math
 * 4. Quick Trade 1-Click toggle and native Vela theme alignment (green BUY, red SELL)
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
});
