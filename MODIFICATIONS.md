# Notice of Modifications to Vela

**Pursuant to Section 4(b) of the Apache License, Version 2.0:**

This document gives prominent notice that OmniTrading applies automated modifications to the installed `@luxalgo/vela` library distribution files (`node_modules/@luxalgo/vela/dist/*`) via `scripts/patch-vela.cjs` during installation (`npm run postinstall`) and build (`npm run build`).

All modifications preserve 100% of Vela's attribution mark (`.vela-attribution`), logomark SVGs (`VELA_MARK_SVG`), attribution link target (`https://velacharts.dev/?utm_source=vela&utm_medium=attribution`), and chart watermarks intact and unmodified.

---

## Detailed Inventory of Applied Modifications

1. **Hunk 1: Candlestick Wick Math**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs` (specifically `chunk-OXLXBPKM.js`, `index.cjs`, `workspace.cjs`)
   - **Purpose**: Fixes high/low wick calculation to prevent inverted negative box heights when prices are near the candle body top/bottom.
   - **Implementation**: Replaces `lY - hY` with `Math.min(hY, lY)` and `Math.max(hY, lY)`.

2. **Hunk 2: Aggregate Bar Wick Math**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Ensures aggregate bar wicks render with positive heights under all viewport scaling transforms.

3. **Hunk 3: Inverted Price Scale Dragging (`shiftScale`)**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Supports price axis scale dragging when price scale inversion is active (`effDy = start.invert ? -dy : dy`).

4. **Hunk 4: Right-Offset Margin Hold (`reframeKeepZoom`)**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Preserves user-dragged right offset margin instead of resetting to default zero when zooming.

5. **Hunk 5: Right Margin Hold on Set Visible Range (`setVisibleRange`)**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Ensures right margin is preserved when navigating or panning to the latest bar.

6. **Hunk 6: Panning Margin Hold (`updateBar`)**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Prevents viewport snapping when incoming tick bars arrive while the user has manually panned past the margin.

7. **Hunk 7: Default Right Margin (`DEFAULT_MARGINS`)**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Sets default right margin to 12 bars for comfortable candle breathing room on first load.

8. **Hunk 8: Double-Click Chart Gesture Routing**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Routes double-click events on candlesticks directly to Chart Settings, and double-clicks on indicators to the clicked indicator's settings dialog.

9. **Hunk 8b: Single-Click Selection for Indicators and Candlesticks**
   - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
   - **Purpose**: Adds single-click selection highlight on indicator series lines, boxes, and candles.

10. **Hunk 9: Drawing Toolbar Favorite Stars & Spread Button**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Adds star icons to drawing flyout tools to add them to the floating favorites toolbar, and adds the spread visualizer button.

11. **Hunk 10: Settings Dialog Action Footer**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Adds standard "Template", "Apply Defaults", "Reset", and "OK" / "Cancel" footer actions to chart settings modal.

12. **Hunk 11: Indicator Settings Dialog Action Footer**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Adds standard template preset save/load dropdown and OK / Cancel buttons to indicator settings.

13. **Hunk 11b: Magnet Snap Shift Key Toggle**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Allows holding the Shift key while drawing or dragging anchors to temporarily toggle magnet snapping on/off.

14. **Hunk 12: Long/Short Position Tool Line Color & Opacity**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Preserves user-configured line colors and fill opacity for risk/reward ratio position tools.

15. **Hunk 13: Indicators Dialog Complete Listing**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Lists all active indicators and custom scripts on the chart with accurate active counts.

16. **Hunk 14: Indicator Favorites Category & Legend Context Menu**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Adds a Favorites section in the Indicator modal dialog and adds right-click legend context menu actions.

17. **Hunk 15: Auto-Save Custom Indicator Scripts**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Preserves custom script sources and parameters across application restarts.

18. **Hunk 17: Timeframe Chip Dropdown Trigger**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Clicking the timeframe chip in top bar opens the interval selection dropdown.

19. **Hunk 18: Timeframe Menu Grouping**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Organizes timeframes into clear sections (Minutes, Hours, Days, Weeks, Months).

20. **Hunk 19: Chart Settings Trading & Alerts Tabs**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Injects Trading and Alerts preference sections with left navigation rail icons in chart settings.

21. **Hunks 20a-20d: Immediate Auto-Save Persistence**
    - **Target Files**: `node_modules/@luxalgo/vela/dist/*.js`, `*.cjs`
    - **Purpose**: Triggers state persistence immediately when chart styles, colors, scales, or indicators change to prevent loss of settings on exit.

---

## Attribution & Watermark Invariant

None of the modifications listed above touch, modify, override, conceal, hide, or disable Vela's attribution mark (`.vela-attribution`), logo SVGs (`VELA_MARK_SVG`), link target (`https://velacharts.dev/?utm_source=vela&utm_medium=attribution`), or the chart watermark. All attribution mechanisms operate exactly as authored by LuxAlgo.
