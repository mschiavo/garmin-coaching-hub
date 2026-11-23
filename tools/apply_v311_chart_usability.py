from pathlib import Path
import sys
ROOT=Path(__file__).resolve().parents[1]
MAIN=ROOT/'dashboard/src/main.tsx'
CSS=ROOT/'dashboard/src/style.css'
MARK='/* V3.1.1 CHART USABILITY */'
NEW=r'''/* V3.1.1 CHART USABILITY */
function LoadChart({title,subtitle,data,metric,reference=false,kind='line'}:{title:string;subtitle:string;data:LoadPoint[];metric:'km'|'hours'|'runs'|'ratio';reference?:boolean;kind?:'line'|'bar'}){
  const [selectedWeek,setSelectedWeek]=React.useState<string|null>(null);
  const chosen=data.find(d=>d.week===selectedWeek)??data[data.length-1];
  const unit=metric==='km'?'km':metric==='hours'?'ore':metric==='runs'?'corse':'×';
  const name=metric==='km'?'Chilometri':metric==='hours'?'Ore di corsa':metric==='runs'?'Numero di corse':'Rapporto';
  const seriesColor=metric==='km'?color.blue:metric==='hours'?color.mint:metric==='runs'?color.violet:color.cyan;
  const value=(n:number|null|undefined)=>loadNumber(n,metric==='runs'?0:metric==='ratio'?2:1);
  const axis={fill:'#b6c9e0',fontSize:11};
  const shared=<><CartesianGrid stroke="#2c405b" strokeDasharray="3 6" vertical={false}/><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={65}/><YAxis tick={axis} tickLine={false} axisLine={false} width={48} domain={[0,'auto']} tickFormatter={(n:number)=>`${n}`}/><Tooltip wrapperStyle={{zIndex:50,pointerEvents:'none'}} cursor={{stroke:'#91b9e8',strokeDasharray:'3 3'}} content={<LoadTooltip/>}/></>;
  return <section className="panel plot load-chart load-chart-v311"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div><span className="load-unit">{unit}</span></div><div className="load-chart-name">{name} per settimana · dal lunedì alla domenica</div><div style={{height:290,minWidth:0}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='bar'?<BarChart data={data} margin={{top:12,right:14,bottom:6,left:0}}>{shared}<Bar dataKey={metric} name={name} fill={seriesColor} radius={[4,4,0,0]} maxBarSize={32}>{data.map(d=><Cell key={d.week} fill={d.partial?'#71829d':seriesColor} fillOpacity={d.partial?.55:1}/>)}</Bar></BarChart>:<LineChart data={data} margin={{top:12,right:14,bottom:6,left:0}}>{shared}<Line type="linear" dataKey={metric} name={name} stroke={seriesColor} strokeWidth={2.4} dot={{r:3,fill:seriesColor}} activeDot={{r:7,stroke:'#fff',strokeWidth:2}} connectNulls={false}/>{reference&&<Line type="linear" dataKey="baselineKm" name="Media 4 settimane" stroke={color.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false}/>}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile</div>}</div><div className="load-chart-legend"><span><i className="load-key-main" style={{background:seriesColor}}/> {name} ({unit})</span>{reference&&<span><i className="load-key-ref"/> Media 4 settimane (km)</span>}<span><i className="load-key-partial"/> Settimana parziale</span></div>{chosen&&<div className="load-inspector"><label htmlFor={`load-week-${metric}`}>Dettaglio settimana</label><select id={`load-week-${metric}`} value={chosen.week} onChange={e=>setSelectedWeek(e.target.value)}>{data.map(d=><option key={d.week} value={d.week}>{loadWeekLabel(d.week)}{d.partial?' · parziale':''}</option>)}</select><div className="load-inspector-values"><span><b>{value(chosen[metric])} {unit}</b> {name.toLowerCase()}</span><span><b>{value(chosen.km)} km</b> distanza</span><span><b>{value(chosen.hours)} h</b> durata</span><span><b>{chosen.runs}</b> corse</span>{chosen.baselineKm!=null&&<span><b>{loadNumber(chosen.baselineKm)} km</b> media precedente</span>}</div><small>Puoi selezionare qualsiasi settimana anche senza utilizzare il mouse.</small></div>}</section>;
}
'''
CSS_ADD=r'''
/* V3.1.1 CHART USABILITY */
.load-chart-v311 .panel-head{margin-bottom:9px}.load-chart-v311 .panel-head h3{font-size:16px}.load-chart-v311 .panel-head p{font-size:12px;line-height:1.45;color:#a6bad5}
.load-unit{font-size:12px;font-weight:750;color:#d6e7fa;background:#203650;border:1px solid #3a5775;border-radius:8px;padding:5px 9px}
.load-chart-name{font-size:11px;color:#9db4d0;margin:5px 0 9px}
.load-chart-v311 .recharts-tooltip-wrapper{z-index:50!important}
.load-chart-v311 .load-chart-legend{padding:5px 0 12px;gap:12px;color:#c1d2e7;font-size:11px}
.load-key-main{width:11px;height:11px;border-radius:3px;display:inline-block}
.load-inspector{border-top:1px solid #30415a;padding-top:13px;margin-top:2px;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.load-inspector label{font-size:12px;font-weight:750;color:#d5e5f9}
.load-inspector select{padding:7px 9px;font-size:12px;max-width:100%}
.load-inspector-values{display:flex;flex-wrap:wrap;gap:8px;width:100%}
.load-inspector-values span{border:1px solid #2d4765;background:#152a43;padding:8px 10px;border-radius:8px;font-size:11px;color:#a9bfd9}
.load-inspector-values b{font-size:13px;color:#f2f7ff}
.load-inspector small{color:#8fa8c6;font-size:10px}
'''
def main():
    src=MAIN.read_text(encoding='utf-8');css=CSS.read_text(encoding='utf-8')
    if MARK in src and MARK in css:
        print('V3.1.1 già applicata');return
    if MARK in src or MARK in css:raise RuntimeError('Aggiornamento parziale: nessun file modificato')
    start=src.find('function LoadChart(')
    end=src.find('\nfunction App(){',start)
    if start<0 or end<0 or '/* V3.1 TRAINING LOAD REFINEMENT */' not in src:raise RuntimeError('Serve V3.1 installata: nessun file modificato')
    src=src[:start]+NEW+src[end:]
    MAIN.write_text(src,encoding='utf-8')
    CSS.write_text(css+'\n'+CSS_ADD,encoding='utf-8')
    print('V3.1.1 applicata. Esegui npm run build e npm run dev.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERRORE:',e,file=sys.stderr);sys.exit(1)
