#!/usr/bin/env python3
"""V3.1.4: make Recharts chart primitives direct children, safely and atomically."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'dashboard/src/main.tsx'
CSS = ROOT / 'dashboard/src/style.css'
MARK = '/* V3.1.4 DIRECT RECHARTS CHILDREN */'


def patch_component(text, start, end, label):
    a = text.find(start)
    b = text.find(end, a + len(start))
    if a < 0 or b < 0:
        raise ValueError(f'{label}: component boundaries not found; no files changed')
    component = text[a:b]
    # Recharts 2.x discovers axes, grid and tooltip by inspecting direct children.
    # A React.Fragment wrapped in a variable is not traversed by that discovery.
    match = re.search(r' const common=<>(.*?)</>;', component, re.DOTALL)
    if not match:
        raise ValueError(f'{label}: common fragment not found; no files changed')
    content = match.group(1)
    if not all(tag in content for tag in ('<CartesianGrid', '<XAxis', '<YAxis', '<Tooltip')):
        raise ValueError(f'{label}: incomplete chart primitives; no files changed')
    count = component.count('{common}')
    if count != (3 if label == 'Plot' else 2):
        raise ValueError(f'{label}: expected {3 if label == "Plot" else 2} fragment usages, found {count}; no files changed')
    component = component[:match.start()] + component[match.end():]
    component = component.replace('{common}', content)
    # The line plot already has a tooltip in the fragment. Add an axis cursor
    # to guide the eye while hovering, without duplicating tooltip components.
    component = component.replace('<Tooltip isAnimationActive={false}', '<Tooltip cursor={{stroke:"#91b9e8",strokeDasharray:"3 4",strokeWidth:1}} isAnimationActive={false}') if label == 'Plot' else component
    if label == 'LoadChart':
        # For the workload ratio, 1x is the meaningful baseline.
        component = component.replace('<Line type="linear" dataKey={metric}', '{metric===\'ratio\'&&<ReferenceLine y={1} stroke="#ffc66d" strokeDasharray="4 4" ifOverflow="extendDomain"/>}<Line type="linear" dataKey={metric}', 1)
        component = component.replace('content={<LoadTooltip/>}', 'content={<LoadTooltip/>}')
    return text[:a] + MARK + '\n' + component + text[b:]


def main():
    if not MAIN.is_file() or not CSS.is_file():
        raise ValueError('dashboard/src/main.tsx or style.css missing; extract at repository root')
    source = MAIN.read_text(encoding='utf-8')
    if MARK in source:
        print('V3.1.4 already installed; no changes')
        return
    if 'function Plot(' not in source or 'function LoadChart(' not in source:
        raise ValueError('Expected V3 chart components missing; no files changed')
    source = patch_component(source, 'function Plot(', '/* V3.1 TRAINING LOAD REFINEMENT */', 'Plot')
    source = patch_component(source, 'function LoadChart(', '\nfunction App()', 'LoadChart')
    # Ensure all chart primitives now occur as direct children, not a fragment.
    if '{common}' in source:
        raise ValueError('Unexpected remaining chart fragment; no files changed')
    MAIN.write_text(source, encoding='utf-8')
    print('V3.1.4 applied: Recharts axes/grid/tooltips are direct chart children.')
    print('Next: cd dashboard && npm run build && npm run dev')


if __name__ == '__main__':
    try:
        main()
    except ValueError as exc:
        sys.exit(str(exc))
