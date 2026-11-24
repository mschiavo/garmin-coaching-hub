# V3.1.4 — Direct Recharts Children & Interactive Tooltips

## Why the previous patch did not work

The browser DOM showed `<Line>` and `<Scatter>` series, but not `<XAxis>`, `<YAxis>`, `<CartesianGrid>`, or `<Tooltip>`. In Recharts 2.x, chart primitives need to be direct JSX children. The previous `const common=<>...</>` pattern prevented discovery of these elements.

## Changes

- Expands the `common` fragment **inside each** LineChart, BarChart, and AreaChart for both `Plot` and `LoadChart`.
- Preserves all V3.1.3 tick intervals, units, grid and existing tooltip configuration.
- Adds a vertical hover cursor to the generic plots.
- Adds a reference line at ratio `1×` in the Training Load ratio chart.
- Leaves the Training Load weekly selector and all calculation functions untouched.
- No changes to production V2, SQL, sync or credentials.

## Install (PowerShell)

```powershell
cd D:\Repository\garmin-coaching-hub
# Extract this ZIP into the repo root, preserving the tools/ folder.
python tools/apply_v314_interactive_charts.py
cd dashboard
npm run build
npm run dev
```

Open Training Load, refresh with Ctrl+F5 and verify the SVG now contains `recharts-cartesian-axis` and `recharts-cartesian-grid`, and hovering shows a tooltip. Repeat for other sections.

If the script reports an unexpected pattern, it changes **no files**. Do not commit before verifying build and browser output.
