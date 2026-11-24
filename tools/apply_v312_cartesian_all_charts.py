from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
MAIN=ROOT/'dashboard/src/main.tsx'
CSS=ROOT/'dashboard/src/style.css'
MARK='/* V3.1.2 CARTESIAN ALL CHARTS */'
PLOT=r'''/* V3.1.2 CARTESIAN ALL CHARTS */
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
const chartTick=(n:number)=>n.toLocaleString('it-IT',{maximumFractionDigits:1});
function Plot({title,subtitle,data,series,kind='line',height=300,reference}:{title:string;subtitle?:string;data:Record<string,unknown>[];series:{key:string;name:string;color:string}[];kind?:'line'|'area'|'bar'|'scatter';height?:number;reference?:number}){
 const meta=chartMeta[title]??{x:'Periodo / categoria',y:'Valore',unit:''};
 const axis={fill:'#c1d1e5',fontSize:11};
 const domain: [number|string,number|string]=meta.zero?[0,'auto']:['auto','auto'];
 const common=<><CartesianGrid stroke="#31435b" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tick={axis} stroke="#7890af" tickLine tickMargin={9} minTickGap={14} interval="preserveStartEnd" height={42}/><YAxis tick={axis} stroke="#7890af" tickLine tickMargin={6} width={55} domain={domain} tickFormatter={chartTick}/><Tooltip isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} contentStyle={{background:'#12223a',border:'1px solid #5b7598',borderRadius:9,color:'#f2f7ff'}} labelStyle={{color:'#f2f7ff'}} formatter={(v:any,name:any)=>[typeof v==='number'?`${chartTick(v)} ${meta.unit}`:v,name]}/><Legend verticalAlign="top" height={30} wrapperStyle={{fontSize:12,color:'#dce8fa'}}/>{reference!=null&&<ReferenceLine y={reference} stroke={color.amber} strokeDasharray="5 5"/>}</>;
 return <section className="panel plot chart-cartesian"><div className="panel-head"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div></div><div className="chart-y-label">Asse Y · {meta.y}</div><div style={{height,minWidth:0}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='scatter'?<ScatterChart margin={{top:12,right:18,bottom:8,left:2}}><CartesianGrid stroke="#31435b" strokeDasharray="3 5"/><XAxis type="number" dataKey="pace" name="Ritmo" tick={axis} stroke="#7890af" tickFormatter={chartTick} domain={['auto','auto']} tickMargin={8}/><YAxis type="number" dataKey="hr" name="FC" tick={axis} stroke="#7890af" width={52} tickFormatter={chartTick} domain={['auto','auto']}/><Tooltip isAnimationActive={false} cursor={{strokeDasharray:'3 3'}} contentStyle={{background:'#12223a',border:'1px solid #5b7598',color:'#fff'}} formatter={(v:any,name:any)=>[typeof v==='number'?chartTick(v):v,name]}/><Legend verticalAlign="top" height={30}/><Scatter name="Corse · ritmo e FC" data={data} fill={series[0]?.color||color.blue}/></ScatterChart>:kind==='bar'?<BarChart data={data} margin={{top:8,right:12,bottom:4,left:0}}>{common}{series.map(s=><Bar key={s.key} dataKey={s.key} name={s.name} fill={s.color} radius={[3,3,0,0]} maxBarSize={28}/>)}</BarChart>:kind==='area'?<AreaChart data={data} margin={{top:8,right:12,bottom:4,left:0}}>{common}{series.map(s=><Area key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} fill={s.color} fillOpacity={.10} strokeWidth={2} dot={false} activeDot={{r:5}} connectNulls={false}/>)}</AreaChart>:<LineChart data={data} margin={{top:8,right:12,bottom:4,left:0}}>{common}{series.map(s=><Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2.2} dot={false} activeDot={{r:5}} connectNulls={false}/>)}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile per questo periodo</div>}</div><div className="chart-x-label">Asse X · {meta.x}</div></section>;
}
'''
LOAD=r'''/* V3.1.2 CARTESIAN LOAD CHART */
function LoadChart({title,subtitle,data,metric,reference=false,kind='line'}:{title:string;subtitle:string;data:LoadPoint[];metric:'km'|'hours'|'runs'|'ratio';reference?:boolean;kind?:'line'|'bar'}){
 const [selectedWeek,setSelectedWeek]=React.useState<string|null>(null);
 const chosen=data.find(d=>d.week===selectedWeek)??data[data.length-1];
 const unit=metric==='km'?'km':metric==='hours'?'h':metric==='runs'?'corse':'×';
 const name=metric==='km'?'Volume':metric==='hours'?'Tempo di corsa':metric==='runs'?'Numero di corse':'Rapporto';
 const seriesColor=metric==='km'?color.blue:metric==='hours'?color.mint:metric==='runs'?color.violet:color.cyan;
 const format=(n:number|null|undefined)=>loadNumber(n,metric==='runs'?0:metric==='ratio'?2:1);
 const axis={fill:'#c1d1e5',fontSize:11};
 const common=<><CartesianGrid stroke="#31435b" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="label" tick={axis} stroke="#7890af" tickLine tickMargin={9} interval="preserveStartEnd" minTickGap={12} height={42}/><YAxis tick={axis} stroke="#7890af" tickLine tickMargin={7} width={55} domain={[0,'auto']} tickFormatter={chartTick}/><Tooltip isAnimationActive={false} wrapperStyle={{zIndex:1000,pointerEvents:'none'}} cursor={{stroke:'#91b9e8',strokeDasharray:'3 3'}} content={<LoadTooltip/>}/></>;
 const partials=data.filter(d=>d.partial);
 return <section className="panel plot load-chart load-chart-v312"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="load-unit">{unit}</span></div><div className="chart-y-label">Asse Y · {name} ({unit})</div><div style={{height:300,minWidth:0}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='bar'?<BarChart data={data} margin={{top:8,right:12,bottom:4,left:0}}>{common}<Bar dataKey={metric} name={`${name} (${unit})`} fill={seriesColor} radius={[3,3,0,0]} maxBarSize={32}>{data.map(d=><Cell key={d.week} fill={d.partial?'#8493a9':seriesColor} fillOpacity={d.partial?.55:1} stroke={d.partial?'#d7e6fa':'none'} strokeDasharray={d.partial?'3 2':undefined}/>)}</Bar></BarChart>:<LineChart data={data} margin={{top:8,right:12,bottom:4,left:0}}>{common}<Line type="linear" dataKey={metric} name={`${name} (${unit})`} stroke={seriesColor} strokeWidth={2.4} dot={{r:3,fill:seriesColor}} activeDot={{r:7,stroke:'#fff',strokeWidth:2}} connectNulls={false}/>{reference&&<Line type="linear" dataKey="baselineKm" name="Media 4 settimane (km)" stroke={color.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false}/>}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile</div>}</div><div className="chart-x-label">Asse X · Settimana (lunedì, gg/mm)</div><div className="load-chart-legend"><span><i className="load-key-main" style={{background:seriesColor}}/> {name} ({unit})</span>{reference&&<span><i className="load-key-ref"/> Media delle 4 settimane precedenti (km)</span>}{partials.length>0&&<span><i className="load-key-partial"/> {partials.length===1?'Settimana incompleta':'Settimane incomplete'}: {partials.map(p=>loadWeekLabel(p.week)).join(', ')}</span>}</div>{chosen&&<div className="load-inspector"><label htmlFor={`load-week-${metric}`}>Dettaglio settimana</label><select id={`load-week-${metric}`} value={chosen.week} onChange={e=>setSelectedWeek(e.target.value)}>{data.map(d=><option key={d.week} value={d.week}>{loadWeekLabel(d.week)}{d.partial?' · incompleta':''}</option>)}</select><div className="load-inspector-values"><span><b>{format(chosen[metric])} {unit}</b> {name.toLowerCase()}</span><span><b>{loadNumber(chosen.km)} km</b> distanza</span><span><b>{loadNumber(chosen.hours,2)} h</b> durata</span><span><b>{chosen.runs}</b> corse</span>{chosen.baselineKm!=null&&<span><b>{loadNumber(chosen.baselineKm)} km</b> media precedente</span>}</div><small>Le settimane incomplete sono identificate per data. Le linee mantengono il colore della serie: controlla l'etichetta e il dettaglio per riconoscerle.</small></div>}</section>;
}
'''
CSS_ADD=r'''
/* V3.1.2 CARTESIAN ALL CHARTS */
.chart-cartesian .panel-head,.load-chart-v312 .panel-head{margin-bottom:10px}
.chart-y-label,.chart-x-label{font-size:12px;color:#c7d7ec;font-weight:700;letter-spacing:.01em}
.chart-y-label{margin:8px 0 6px}.chart-x-label{margin:7px 0 4px;text-align:center}
.chart-cartesian .recharts-tooltip-wrapper,.load-chart-v312 .recharts-tooltip-wrapper{z-index:1000!important}
.chart-cartesian .recharts-cartesian-axis-tick-value,.load-chart-v312 .recharts-cartesian-axis-tick-value{font-size:11px}
.load-chart-v312 .load-chart-legend{padding:10px 0 12px;font-size:12px;color:#cbdaf0}
.load-chart-v312 .load-key-partial{background:#8493a9;border:1px dashed #e5efff;opacity:1}
@media(max-width:650px){.chart-y-label,.chart-x-label{font-size:11px}.chart-cartesian .recharts-cartesian-axis-tick-value,.load-chart-v312 .recharts-cartesian-axis-tick-value{font-size:10px}}
'''
def main():
 if not MAIN.exists() or not CSS.exists():raise RuntimeError('Esegui dalla radice del repository, con dashboard/src/main.tsx presente')
 src=MAIN.read_text(encoding='utf-8');css=CSS.read_text(encoding='utf-8')
 if MARK in src and MARK in css:
  print('V3.1.2 già installata, nessuna modifica');return
 if MARK in src or MARK in css:raise RuntimeError('Stato parziale rilevato, nessun file modificato')
 if '/* V3.1.1 CHART USABILITY */' not in src or 'function LoadChart(' not in src:raise RuntimeError('Serve V3.1.1: nessun file modificato')
 start=src.index('function Plot(');end=src.index('\n/* V3.1 TRAINING LOAD REFINEMENT */',start)
 src=src[:start]+PLOT+src[end:]
 start=src.index('function LoadChart(');end=src.index('\nfunction App(){',start)
 src=src[:start]+LOAD+src[end:]
 # La settimana è incompleta quando l'ultima data disponibile precede la domenica;
 # La prima settimana mantiene il calcolo preesistente, da correggere separatamente.
 old="partial:w.week===monday(maxDate)"
 new="partial:w.week===monday(maxDate)&&plusDays(w.week,6)>maxDate"
 if old not in src:raise RuntimeError('Forma inattesa del calcolo settimane; nessun file modificato')
 src=src.replace(old,new,1)
 # Scrittura atomica per file, con backup espliciti nella cartella locale.
 backups=[(MAIN,src),(CSS,css+'\n'+MARK+'\n'+CSS_ADD)]
 for path,content in backups:
  backup=path.with_suffix(path.suffix+'.pre-v312.bak')
  if not backup.exists():backup.write_text(path.read_text(encoding='utf-8'),encoding='utf-8')
  path.write_text(content,encoding='utf-8')
 print('V3.1.2 installata: grafici cartesiani in tutte le sezioni. Esegui npm run build.')
if __name__=='__main__':
 try:main()
 except Exception as e:print('ERRORE:',e,file=sys.stderr);sys.exit(1)
