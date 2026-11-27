import React from 'react';
import { ResponsiveContainer, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line, BarChart, Bar, AreaChart, Area, ReferenceLine, ScatterChart, Scatter, Legend, Rectangle, type BarShapeProps } from 'recharts';
export const color={blue:'var(--v4-c-62a9ffff)',mint:'var(--v4-c-50e4b4ff)',violet:'var(--v4-c-b5a0ffff)',rose:'var(--v4-c-ff789eff)',amber:'var(--v4-c-ffc66dff)',cyan:'var(--v4-c-5bdce7ff)'};
/* V3.1.2 CARTESIAN ALL CHARTS */
const chartMeta:Record<string,{x:string;y:string;unit:string;zero?:boolean}>={
 'Volume settimanale':{x:'Settimana (lunedì)',y:'Distanza (km)',unit:'km',zero:true},
 'Frequenza di allenamento':{x:'Settimana (lunedì)',y:'Corse (n.)',unit:'corse',zero:true},
 'Chilometri settimanali':{x:'Settimana (lunedì)',y:'Distanza (km)',unit:'km',zero:true},
 'Ore di corsa settimanali':{x:'Settimana (lunedì)',y:'Tempo (h)',unit:'h',zero:true},
 'Numero di corse':{x:'Settimana (lunedì)',y:'Corse (n.)',unit:'corse',zero:true},
 'Volume mensile':{x:'Mese',y:'Distanza (km)',unit:'km',zero:true},
 'Tipologia delle uscite':{x:'Fascia di distanza',y:'Corse (n.)',unit:'corse',zero:true},
 'HRV notturna':{x:'Data',y:'HRV (ms)',unit:'ms'},
 'Qualità del riposo · durata':{x:'Data',y:'Sonno (h)',unit:'h',zero:true},
 'HRV · trend':{x:'Data',y:'HRV (ms)',unit:'ms'},
 'Sonno · trend':{x:'Data',y:'Sonno (h)',unit:'h',zero:true},
 'Frequenza cardiaca a riposo':{x:'Data',y:'FC (bpm)',unit:'bpm'},
 'Stress giornaliero':{x:'Data',y:'Stress (indice)',unit:'indice',zero:true},
 'Body Battery · flussi':{x:'Data',y:'Body Battery (punti)',unit:'punti',zero:true},
 'Passi':{x:'Data',y:'Passi (n.)',unit:'passi',zero:true},
 'HRV media mensile':{x:'Mese',y:'HRV (ms)',unit:'ms'},
 'Sonno medio mensile':{x:'Mese',y:'Sonno (h)',unit:'h',zero:true},
 'Ritmo delle singole uscite':{x:'Data attività',y:'Ritmo (s/km)',unit:'s/km'},
 'FC media delle corse':{x:'Data attività',y:'FC (bpm)',unit:'bpm'},
 'Ritmo vs frequenza cardiaca':{x:'Ritmo (s/km)',y:'FC (bpm)',unit:'bpm'},
 'FC media settimanale':{x:'Settimana (lunedì)',y:'FC (bpm)',unit:'bpm'},
 'HRV mensile':{x:'Mese',y:'HRV (ms)',unit:'ms'},
 'FC a riposo mensile':{x:'Mese',y:'FC (bpm)',unit:'bpm'},
 'Sonno mensile':{x:'Mese',y:'Sonno (h)',unit:'h',zero:true}
};
const chartTick=(n:number,digits=1)=>n.toLocaleString('it-IT',{maximumFractionDigits:digits});
/* V3.1.3 EXPLICIT CARTESIAN TICKS */
// Recharts can omit ticks on small plots. Draw the requested values explicitly.
const touchQuery = '(hover: none) and (pointer: coarse)';
const subscribeTouch = (onChange:()=>void) => { const q=window.matchMedia(touchQuery); q.addEventListener('change',onChange); return ()=>q.removeEventListener('change',onChange); };
const getTouch = () => typeof window!=='undefined' && window.matchMedia(touchQuery).matches;
const useTooltipTrigger = (): 'click'|'hover' => React.useSyncExternalStore(subscribeTouch,getTouch,()=>false)?'click':'hover';
const axisText = { fill:'var(--v4-c-e2ecfbff)', fontSize:12, fontWeight:600 };
const cartesianAxisProps = {tick:axisText, axisLine:{stroke:'var(--v4-c-9db3cfff)'}, tickLine:{stroke:'var(--v4-c-9db3cfff)'}};
const shortAxisLabel = (v:unknown) => String(v ?? '').replace(/^\d{4}-(\d{2})-(\d{2})$/, '$2/$3');
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

/* V3.1.4 DIRECT RECHARTS CHILDREN */
export function Plot({title,subtitle,data,series,kind='line',height=300,reference,meta:customMeta}:{title:string;subtitle?:string;data:Record<string,unknown>[];series:{key:string;name:string;color:string}[];kind?:'line'|'area'|'bar'|'scatter';height?:number;reference?:number;meta?:{x:string;y:string;unit:string;zero?:boolean}}){
 const tooltipTrigger=useTooltipTrigger();
 const meta=customMeta??chartMeta[title]??{x:'Periodo / categoria',y:'Valore',unit:''};
 const axis=axisText;
 const allValues=series.flatMap(s=>data.map(d=>typeof d[s.key]==='number'?d[s.key] as number:null));
 const numericTicks=niceAxisTicks(allValues,Boolean(meta.zero),/Corse|Passi|indice|punti/.test(meta.y));
 const horizontalTicks=dateAxisTicks(data);
 const sampleLabels=customMeta ? new Map(data.map(row=>[row.label,row.count])) : null;
 const tooltipLabel=(label:unknown)=> {
   const count=sampleLabels?.get(label);
   return typeof count==="number" && kind==="line" ? `${String(label)} · ${count} misure` : String(label??"");
 };
 const domain: [number,number]=[numericTicks[0],numericTicks[numericTicks.length-1]];
 const scatterX=niceAxisTicks(data.map(d=>typeof d.pace==='number'?d.pace as number:null),false);
 const tickFormatter=meta.unit==="km/h per bpm"?(value:number)=>chartTick(value,4):axisUnitTick;
 const scatterY=niceAxisTicks(data.map(d=>typeof d.hr==='number'?d.hr as number:null),false);

 return <section className="panel plot chart-cartesian"><div className="panel-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div></div><div className="chart-y-label">Asse Y · {meta.y}</div><div style={{height,minWidth:0}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='scatter'?<ScatterChart margin={{top:12,right:18,bottom:8,left:2}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5"/><XAxis type="number" dataKey="pace" name="Ritmo" unit=" s/km" tick={axis} ticks={scatterX} stroke="var(--v4-c-9db3cfff)" tickFormatter={axisUnitTick} domain={[scatterX[0],scatterX[scatterX.length-1]]} tickMargin={10} height={52}/><YAxis type="number" dataKey="hr" name="FC" unit=" bpm" tick={axis} ticks={scatterY} stroke="var(--v4-c-9db3cfff)" width={68} tickFormatter={axisUnitTick} domain={[scatterY[0],scatterY[scatterY.length-1]]}/><Tooltip trigger={tooltipTrigger} cursor={{stroke:"var(--v4-c-91b9e8ff)",strokeDasharray:"3 4",strokeWidth:1}} isAnimationActive={false}  contentStyle={{background:'var(--v4-c-12223aff)',border:'1px solid var(--v4-c-5b7598ff)',color:'var(--v4-c-ffffffff)'}} formatter={(v:any,name:any)=>[typeof v==='number'?chartTick(v):v,name]}/><Legend verticalAlign="top" height={30}/><Scatter name="Corse · ritmo e FC" data={data} fill={series[0]?.color||color.blue}/></ScatterChart>:kind==='bar'?<BarChart data={data} margin={{top:8,right:12,bottom:4,left:0}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" type="category" ticks={horizontalTicks} interval="preserveStartEnd" minTickGap={10} {...cartesianAxisProps} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} allowDecimals={true} {...cartesianAxisProps} tickMargin={8} width={68} domain={domain} tickFormatter={tickFormatter}/><Tooltip trigger={tooltipTrigger} cursor={{stroke:"var(--v4-c-91b9e8ff)",strokeDasharray:"3 4",strokeWidth:1}} isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} contentStyle={{background:'var(--v4-c-12223aff)',border:'1px solid var(--v4-c-5b7598ff)',borderRadius:9,color:'var(--v4-c-f2f7ffff)'}} labelStyle={{color:'var(--v4-c-f2f7ffff)'}} labelFormatter={tooltipLabel} formatter={(v:any,name:any)=>[typeof v==='number'?`${chartTick(v,meta.unit==="km/h per bpm"?4:1)} ${meta.unit}`:v,name]}/><Legend verticalAlign="top" height={30} wrapperStyle={{fontSize:12,color:'var(--v4-c-dce8faff)'}}/>{reference!=null&&<ReferenceLine y={reference} stroke={color.amber} strokeDasharray="5 5"/>}{series.map(s=><Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3,3,0,0]} maxBarSize={28}/>)}</BarChart>:kind==='area'?<AreaChart data={data} margin={{top:8,right:12,bottom:4,left:0}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" type="category" ticks={horizontalTicks} interval="preserveStartEnd" minTickGap={10} {...cartesianAxisProps} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} allowDecimals={true} {...cartesianAxisProps} tickMargin={8} width={68} domain={domain} tickFormatter={tickFormatter}/><Tooltip trigger={tooltipTrigger} cursor={{stroke:"var(--v4-c-91b9e8ff)",strokeDasharray:"3 4",strokeWidth:1}} isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} contentStyle={{background:'var(--v4-c-12223aff)',border:'1px solid var(--v4-c-5b7598ff)',borderRadius:9,color:'var(--v4-c-f2f7ffff)'}} labelStyle={{color:'var(--v4-c-f2f7ffff)'}} labelFormatter={tooltipLabel} formatter={(v:any,name:any)=>[typeof v==='number'?`${chartTick(v,meta.unit==="km/h per bpm"?4:1)} ${meta.unit}`:v,name]}/><Legend verticalAlign="top" height={30} wrapperStyle={{fontSize:12,color:'var(--v4-c-dce8faff)'}}/>{reference!=null&&<ReferenceLine y={reference} stroke={color.amber} strokeDasharray="5 5"/>}{series.map(s=><Area key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={.10} strokeWidth={2} dot={false} activeDot={{r:5}} connectNulls={false}/>)}</AreaChart>:<LineChart data={data} margin={{top:8,right:12,bottom:4,left:0}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" type="category" ticks={horizontalTicks} interval="preserveStartEnd" minTickGap={10} {...cartesianAxisProps} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} allowDecimals={true} {...cartesianAxisProps} tickMargin={8} width={68} domain={domain} tickFormatter={tickFormatter}/><Tooltip trigger={tooltipTrigger} cursor={{stroke:"var(--v4-c-91b9e8ff)",strokeDasharray:"3 4",strokeWidth:1}} isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} contentStyle={{background:'var(--v4-c-12223aff)',border:'1px solid var(--v4-c-5b7598ff)',borderRadius:9,color:'var(--v4-c-f2f7ffff)'}} labelStyle={{color:'var(--v4-c-f2f7ffff)'}} labelFormatter={tooltipLabel} formatter={(v:any,name:any)=>[typeof v==='number'?`${chartTick(v,meta.unit==="km/h per bpm"?4:1)} ${meta.unit}`:v,name]}/><Legend verticalAlign="top" height={30} wrapperStyle={{fontSize:12,color:'var(--v4-c-dce8faff)'}}/>{reference!=null&&<ReferenceLine y={reference} stroke={color.amber} strokeDasharray="5 5"/>}{series.map(s=><Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2} dot={customMeta&&data.length<=120?{r:2}:false} activeDot={{r:5}} connectNulls={false}/>)}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile per questo periodo</div>}</div><div className="chart-x-label">Asse X · {meta.x}</div></section>;
}

/* V3.1 TRAINING LOAD REFINEMENT */
export type LoadPoint = {week:string;label:string;km:number|null;hours:number|null;runs:number;distanceCount?:number;durationCount?:number;baselineKm:number|null;ratio:number|null;deltaPct:number|null;partial:boolean};
const loadNumber = (v:number|null|undefined, digits=1) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits});
export const loadWeekLabel = (s:string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('it-IT',{day:'2-digit',month:'short',timeZone:'UTC'});
function LoadTooltip({active,payload}:{active?:boolean;payload?:ReadonlyArray<{payload:LoadPoint}>}) {
  const p=payload?.[0]?.payload;
  if(!active||!p)return null;
  return <div className="load-tooltip"><strong>Settimana del {new Date(`${p.week}T12:00:00Z`).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'})} {p.partial?'· incompleta':''}</strong><span>Volume: {loadNumber(p.km)} km{p.distanceCount != null ? ` · ${p.distanceCount}/${p.runs} distanze` : ''}</span><span>Riferimento 4 sett.: {p.baselineKm==null?'—':`${loadNumber(p.baselineKm)} km`}</span><span>Tempo: {loadNumber(p.hours,2)} h{p.durationCount != null ? ` · ${p.durationCount}/${p.runs} durate` : ''} · Corse: {p.runs}</span><span>Rapporto: {p.ratio==null?'—':`${loadNumber(p.ratio,2)}×`}</span><span>Variazione sett.: {p.deltaPct==null?'—':`${p.deltaPct>0?'+':''}${loadNumber(p.deltaPct)}%`}</span></div>;
}
/* V3.1.1 CHART USABILITY */
/* V3.1.2 CARTESIAN LOAD CHART */
/* V3.1.4 DIRECT RECHARTS CHILDREN */
export function LoadChart({title,subtitle,data,metric,reference=false,kind='line'}:{title:string;subtitle:string;data:LoadPoint[];metric:'km'|'hours'|'runs'|'ratio';reference?:boolean;kind?:'line'|'bar'}){
 const tooltipTrigger=useTooltipTrigger();
 const [selectedWeek,setSelectedWeek]=React.useState<string|null>(null);
 const chosen=data.find(d=>d.week===selectedWeek)??data[data.length-1];
 const unit=metric==='km'?'km':metric==='hours'?'h':metric==='runs'?'corse':'×';
 const name=metric==='km'?'Volume':metric==='hours'?'Tempo di corsa':metric==='runs'?'Numero di corse':'Rapporto';
 const seriesColor=metric==='km'?color.blue:metric==='hours'?color.mint:metric==='runs'?color.violet:color.cyan;
 const format=(n:number|null|undefined)=>loadNumber(n,metric==='runs'?0:metric==='ratio'?2:1);
 const numericTicks=niceAxisTicks([...data.map(d=>d[metric]),...(reference?data.map(d=>d.baselineKm):[]),...(metric==='ratio'?[1]:[])],metric!=='ratio',metric==='runs');
 const horizontalTicks=dateAxisTicks(data as unknown as Record<string,unknown>[]);

 const partials=data.filter(d=>d.partial);
 return <section className="panel plot load-chart load-chart-v312"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="load-unit">{unit}</span></div><div className="chart-y-label">Asse Y · {name} ({unit})</div><div style={{height:300,minWidth:0}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='bar'?<BarChart data={data} margin={{top:8,right:12,bottom:4,left:0}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" type="category" ticks={horizontalTicks} interval="preserveStartEnd" minTickGap={10} {...cartesianAxisProps} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} {...cartesianAxisProps} tickMargin={8} width={68} domain={[numericTicks[0],numericTicks[numericTicks.length-1]]} tickFormatter={axisUnitTick}/><Tooltip trigger={tooltipTrigger} isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} cursor={{stroke:'var(--v4-c-91b9e8ff)',strokeDasharray:'3 3'}} content={<LoadTooltip/>}/><Bar dataKey={metric} name={`${name} (${unit})`} fill={seriesColor} radius={[3,3,0,0]} maxBarSize={32} shape={(p:BarShapeProps)=><Rectangle x={p.x} y={p.y} width={p.width} height={p.height} radius={[3,3,0,0]} fill={p.payload?.partial?'var(--v4-c-8493a9ff)':seriesColor} fillOpacity={p.payload?.partial ? 0.55 : 1} stroke={p.payload?.partial?'var(--v4-c-d7e6faff)':'none'} strokeDasharray={p.payload?.partial?'3 2':undefined}/>}/></BarChart>:<LineChart data={data} margin={{top:8,right:12,bottom:4,left:0}}><CartesianGrid stroke="var(--v4-c-31435bff)" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" type="category" ticks={horizontalTicks} interval="preserveStartEnd" minTickGap={10} {...cartesianAxisProps} tickMargin={12} height={56} tickFormatter={shortAxisLabel}/><YAxis type="number" ticks={numericTicks} {...cartesianAxisProps} tickMargin={8} width={68} domain={[numericTicks[0],numericTicks[numericTicks.length-1]]} tickFormatter={axisUnitTick}/><Tooltip trigger={tooltipTrigger} isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} cursor={{stroke:'var(--v4-c-91b9e8ff)',strokeDasharray:'3 3'}} content={<LoadTooltip/>}/>{metric==='ratio'&&<ReferenceLine y={1} stroke="var(--v4-c-ffc66dff)" strokeDasharray="4 4" ifOverflow="extendDomain"/>}<Line type="linear" dataKey={metric} name={`${name} (${unit})`} stroke={seriesColor} strokeWidth={2.4} dot={{r:3,fill:seriesColor}} activeDot={{r:7,stroke:'var(--v4-c-ffffffff)',strokeWidth:2}} connectNulls={false}/>{reference&&<Line type="linear" dataKey="baselineKm" name="Media 4 settimane (km)" stroke={color.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false}/>}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile</div>}</div><div className="chart-x-label">Asse X · Settimana (lunedì, gg/mm)</div><div className="load-chart-legend"><span><i className="load-key-main" style={{background:seriesColor}}/> {name} ({unit})</span>{reference&&<span><i className="load-key-ref"/> Media delle 4 settimane precedenti (km)</span>}{partials.length>0&&<span><i className="load-key-partial"/> {partials.length===1?'Settimana incompleta':'Settimane incomplete'}: {partials.map(p=>loadWeekLabel(p.week)).join(', ')}</span>}</div>{chosen&&<div className="load-inspector"><label htmlFor={`load-week-${metric}`}>Dettaglio settimana</label><select id={`load-week-${metric}`} value={chosen.week} onChange={e=>setSelectedWeek(e.target.value)}>{data.map(d=><option key={d.week} value={d.week}>{loadWeekLabel(d.week)}{d.partial?' · incompleta':''}</option>)}</select><div className="load-inspector-values"><span><b>{format(chosen[metric])} {unit}</b> {name.toLowerCase()}</span><span><b>{loadNumber(chosen.km)} km</b> distanza</span><span><b>{loadNumber(chosen.hours,2)} h</b> durata</span><span><b>{chosen.runs}</b> corse</span>{chosen.baselineKm!=null&&<span><b>{loadNumber(chosen.baselineKm)} km</b> media precedente</span>}</div><small>Le settimane incomplete sono identificate per data. Le linee mantengono il colore della serie: controlla l'etichetta e il dettaglio per riconoscerle.</small></div>}</section>;
}
