#!/usr/bin/env python3
"""Patch Garmin Coaching Hub V3.1.2 -> V3.1.3, without overwriting unrelated files."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / 'dashboard/src/main.tsx'
CSS = ROOT / 'dashboard/src/style.css'
MARK = '/* V3.1.3 EXPLICIT CARTESIAN TICKS */'

def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise ValueError(f'{label}: expected one match, found {count}. No files changed.')
    return text.replace(old, new, 1)

def main():
    if not MAIN.is_file() or not CSS.is_file():
        sys.exit('Run from an extracted package inside the repository root (dashboard/src missing).')
    source = MAIN.read_text(encoding='utf-8')
    css = CSS.read_text(encoding='utf-8')
    if MARK in source:
        print('V3.1.3 already installed; no changes.')
        return
    if '/* V3.1.2 CARTESIAN ALL CHARTS */' not in source:
        sys.exit('Expected V3.1.2 not found. No files changed.')
    helper = '''/* V3.1.3 EXPLICIT CARTESIAN TICKS */
// Recharts can omit ticks on small plots. Draw the requested values explicitly.
const axisText = { fill:'#e2ecfb', fontSize:12, fontWeight:600 };
const shortAxisLabel = (v:unknown) => String(v ?? '').replace(/^\\d{4}-(\\d{2})-(\\d{2})$/, '$2/$3');
const dateAxisTicks = (data:Record<string,unknown>[], max=7):string[] => {
  const labels = data.map(d=>String(d.label??''));
  if(labels.length<=max)return labels;
  const indices = new Set(Array.from({length:max},(_,i)=>Math.round(i*(labels.length-1)/(max-1))));
  return labels.filter((_,i)=>indices.has(i));
};
const niceAxisTicks = (values:(number|null|undefined)[], includeZero:boolean, integer=false):number[] => {
  const valid=values.filter((v):v is number=>typeof v==='number'&&Number.isFinite(v));
  if(!valid.length)return [0,1,2,3,4];
  const min=includeZero?Math.min(0,...valid):Math.min(...valid);
  const max=Math.max(...valid);
  const span=Math.max(max-min,integer?1:Math.max(Math.abs(max)*0.1,0.1));
  const raw=span/4;
  const magnitude=Math.pow(10,Math.floor(Math.log10(raw)));
  const step=[1,2,2.5,5,10].map(v=>v*magnitude).find(v=>v>=raw)??10*magnitude;
  const increment=integer?Math.max(1,Math.ceil(step)):step;
  const start=includeZero?0:Math.floor(min/increment)*increment;
  const end=Math.max(start+increment,Math.ceil(max/increment)*increment);
  const count=Math.min(12,Math.round((end-start)/increment)+1);
  return Array.from({length:count},(_,i)=>Number((start+i*increment).toFixed(8)));
};
const axisUnitTick = (value:number) => value.toLocaleString('it-IT',{maximumFractionDigits:2});
'''
    source=replace_once(source, 'function Plot({title,subtitle,data,series,kind=', helper+'\nfunction Plot({title,subtitle,data,series,kind=', 'helpers')
    # generic chart: use explicit numeric ticks calculated from all visible series
    source=replace_once(source, " const axis={fill:'#c1d1e5',fontSize:11};\n const domain: [number|string,number|string]=meta.zero?[0,'auto']:['auto','auto'];", " const axis=axisText;\n const allValues=series.flatMap(s=>data.map(d=>typeof d[s.key]==='number'?d[s.key] as number:null));\n const numericTicks=niceAxisTicks(allValues,Boolean(meta.zero),/Corse|Passi|indice|punti/.test(meta.y));\n const horizontalTicks=dateAxisTicks(data);\n const domain: [number,number]=[numericTicks[0],numericTicks[numericTicks.length-1]];", 'generic domain')
    source=replace_once(source, '<XAxis dataKey="label" tick={axis} stroke="#7890af" tickLine tickMargin={9} minTickGap={14} interval="preserveStartEnd" height={42}/><YAxis tick={axis} stroke="#7890af" tickLine tickMargin={6} width={55} domain={domain} tickFormatter={chartTick}/>', '<XAxis dataKey="label" type="category" ticks={horizontalTicks} interval={0} tick={axis} axisLine={{stroke:"#9db3cf"}} tickLine={{stroke:"#9db3cf"}} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} allowDecimals={true} tick={axis} axisLine={{stroke:"#9db3cf"}} tickLine={{stroke:"#9db3cf"}} tickMargin={8} width={68} domain={domain} tickFormatter={axisUnitTick}/>', 'generic axes')
    # scatter uses numeric x and y: dedicated tick sets
    source=source.replace(" const common=<><CartesianGrid", " const scatterX=niceAxisTicks(data.map(d=>typeof d.pace==='number'?d.pace as number:null),false);\n const scatterY=niceAxisTicks(data.map(d=>typeof d.hr==='number'?d.hr as number:null),false);\n const common=<><CartesianGrid", 1)
    source=replace_once(source, '<XAxis type="number" dataKey="pace" name="Ritmo" tick={axis} stroke="#7890af" tickFormatter={chartTick} domain={[\'auto\',\'auto\']} tickMargin={8}/><YAxis type="number" dataKey="hr" name="FC" tick={axis} stroke="#7890af" width={52} tickFormatter={chartTick} domain={[\'auto\',\'auto\']}/>', '<XAxis type="number" dataKey="pace" name="Ritmo" tick={axis} ticks={scatterX} stroke="#9db3cf" tickFormatter={axisUnitTick} domain={[scatterX[0],scatterX[scatterX.length-1]]} tickMargin={10} height={52}/><YAxis type="number" dataKey="hr" name="FC" tick={axis} ticks={scatterY} stroke="#9db3cf" width={68} tickFormatter={axisUnitTick} domain={[scatterY[0],scatterY[scatterY.length-1]]}/>', 'scatter axes')
    # training load: explicit ticks with reference line included
    source=replace_once(source, " const axis={fill:'#c1d1e5',fontSize:11};\n const common=", " const axis=axisText;\n const numericTicks=niceAxisTicks([...data.map(d=>d[metric]),...(reference?data.map(d=>d.baselineKm):[])],metric!=='ratio',metric==='runs');\n const horizontalTicks=dateAxisTicks(data as unknown as Record<string,unknown>[]);\n const common=", 'load ticks')
    source=replace_once(source, '<XAxis dataKey="label" tick={axis} stroke="#7890af" tickLine tickMargin={9} interval="preserveStartEnd" minTickGap={12} height={42}/><YAxis tick={axis} stroke="#7890af" tickLine tickMargin={7} width={55} domain={[0,\'auto\']} tickFormatter={chartTick}/>', '<XAxis dataKey="label" type="category" ticks={horizontalTicks} interval={0} tick={axis} axisLine={{stroke:"#9db3cf"}} tickLine={{stroke:"#9db3cf"}} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} tick={axis} axisLine={{stroke:"#9db3cf"}} tickLine={{stroke:"#9db3cf"}} tickMargin={8} width={68} domain={[numericTicks[0],numericTicks[numericTicks.length-1]]} tickFormatter={axisUnitTick}/>', 'load axes')
    css += '''\n/* V3.1.3: high-contrast Cartesian axis ticks for every dashboard plot */\n.chart-cartesian .recharts-cartesian-axis-tick-value,\n.load-chart-v312 .recharts-cartesian-axis-tick-value {\n  fill:#e2ecfb !important; font-size:12px !important; font-weight:600 !important;\n}\n.chart-cartesian .recharts-cartesian-axis-line,\n.load-chart-v312 .recharts-cartesian-axis-line { stroke:#9db3cf !important; }\n.chart-cartesian .recharts-cartesian-grid-horizontal line,\n.load-chart-v312 .recharts-cartesian-grid-horizontal line { stroke:#344b67; }\n.chart-cartesian .recharts-wrapper,\n.load-chart-v312 .recharts-wrapper { overflow:visible; }\n@media(max-width:650px){\n .chart-cartesian .recharts-cartesian-axis-tick-value,\n .load-chart-v312 .recharts-cartesian-axis-tick-value {font-size:11px !important;}\n}\n'''
    MAIN.write_text(source,encoding='utf-8')
    CSS.write_text(css,encoding='utf-8')
    print('V3.1.3 installed. Next: cd dashboard && npm run build && npm run dev')

if __name__=='__main__':
    try: main()
    except ValueError as exc: sys.exit(str(exc))
