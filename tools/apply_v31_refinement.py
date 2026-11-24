from pathlib import Path
import sys

ROOT=Path(__file__).resolve().parents[1]
MAIN=ROOT/'dashboard/src/main.tsx'
CSS=ROOT/'dashboard/src/style.css'
START=" {section==='training-load'&&"
END=" {section==='recovery'&&"
MARK='/* V3.1 TRAINING LOAD REFINEMENT */'

COMPONENT='''
/* V3.1 TRAINING LOAD REFINEMENT */
type LoadPoint = {week:string;label:string;km:number;hours:number;runs:number;baselineKm:number|null;ratio:number|null;deltaPct:number|null;partial:boolean};
const loadNumber = (v:number|null|undefined, digits=1) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('it-IT',{minimumFractionDigits:digits,maximumFractionDigits:digits});
const loadWeekLabel = (s:string) => new Date(`${s}T12:00:00Z`).toLocaleDateString('it-IT',{day:'2-digit',month:'short',timeZone:'UTC'});
function LoadTooltip({active,payload}:{active?:boolean;payload?:Array<{payload:LoadPoint}>}) {
  const p=payload?.[0]?.payload;
  if(!active||!p)return null;
  return <div className="load-tooltip"><strong>Settimana del {loadWeekLabel(p.week)} {p.partial?'· in corso':''}</strong><span>Volume: {loadNumber(p.km)} km</span><span>Riferimento 4 sett.: {p.baselineKm==null?'—':`${loadNumber(p.baselineKm)} km`}</span><span>Tempo: {loadNumber(p.hours,2)} h · Corse: {p.runs}</span><span>Rapporto: {p.ratio==null?'—':`${loadNumber(p.ratio,2)}×`}</span><span>Variazione sett.: {p.deltaPct==null?'—':`${p.deltaPct>0?'+':''}${loadNumber(p.deltaPct)}%`}</span></div>;
}
function LoadChart({title,subtitle,data,metric,reference=false,kind='line'}:{title:string;subtitle:string;data:LoadPoint[];metric:'km'|'hours'|'runs'|'ratio';reference?:boolean;kind?:'line'|'bar'}){
  const axis={fill:'#9aacbf',fontSize:11};
  const shared=<><CartesianGrid stroke="#23324b" strokeDasharray="3 6" vertical={false}/><XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} minTickGap={18} interval="preserveStartEnd"/><YAxis tick={axis} tickLine={false} axisLine={false} width={48} domain={[0,'auto']}/><Tooltip content={<LoadTooltip/>}/></>;
  return <section className="panel plot load-chart"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div></div><div style={{height:310}}>{data.length?<ResponsiveContainer width="100%" height="100%">{kind==='bar'?<BarChart data={data}>{shared}<Bar dataKey={metric} name={metric==='hours'?'Ore':'Corse'} fill={metric==='hours'?color.mint:color.violet} radius={[4,4,0,0]} maxBarSize={32}>{data.map(d=><Cell key={d.week} fill={d.partial?'#71829d':metric==='hours'?color.mint:color.violet} fillOpacity={d.partial?.55:1}/>)}</Bar></BarChart>:<LineChart data={data}>{shared}<Line type="linear" dataKey={metric} name={metric==='ratio'?'Rapporto':'Volume km'} stroke={metric==='ratio'?color.cyan:color.blue} strokeWidth={2.4} dot={{r:3}} connectNulls={false}/>{reference&&<Line type="linear" dataKey="baselineKm" name="Media 4 sett." stroke={color.amber} strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls={false}/>}</LineChart>}</ResponsiveContainer>:<div className="empty">Nessun dato disponibile</div>}</div><div className="load-chart-legend">{reference&&<span><i className="load-key-ref"/> Media delle 4 settimane precedenti</span>}<span><i className="load-key-partial"/> Settimana in corso (parziale)</span></div></section>;
}
'''
SECTION=''' {section==='training-load'&&<><div className="load-intro"><div><p className="eyebrow">V3.1 / ADVANCED RUNNING ANALYTICS</p><h2>Il tuo carico, settimana dopo settimana.</h2><p>Volume misurato in chilometri. I confronti si riferiscono all'ultima settimana completata; la settimana corrente è parziale.</p></div></div><div className="load-kpis"><div className="load-kpi"><span>Volume nel periodo</span><strong>{num(loadTotal,1)} km</strong><small>{loadWeeks.length} settimane di calendario incluse</small></div><div className="load-kpi"><span>Ultima settimana completa</span><strong>{lastCompletedLoad?`${num(lastCompletedLoad.km,1)} km`:'—'}</strong><small>{lastCompletedLoad?`Settimana del ${dateLabel(lastCompletedLoad.week)}`:'Dati insufficienti'}</small></div><div className="load-kpi"><span>Media 4 settimane precedenti</span><strong>{loadAvg4==null?'—':`${num(loadAvg4,1)} km`}</strong><small>Include le settimane senza corse</small></div><div className="load-kpi"><span>Rapporto volume / media 4 sett.</span><strong>{loadRatio==null?'—':`${num(loadRatio,2)}×`}</strong><small>Indicatore descrittivo, non stima del rischio</small></div></div><div className="load-summary">{lastCompletedLoad&&loadAvg4!=null&&loadAvg4>0?<>Nell'ultima settimana completa hai corso <b>{num(lastCompletedLoad.km,1)} km</b>, rispetto a <b>{num(loadAvg4,1)} km</b> medi nelle quattro precedenti ({lastCompletedLoad.km>=loadAvg4?'+':''}{num((lastCompletedLoad.km/loadAvg4-1)*100,1)}%).</>:'Per un confronto servono almeno quattro settimane precedenti con un volume medio maggiore di zero.'} Il rapporto non misura affaticamento né rischio di infortunio.</div><div className="charts"><LoadChart title="Volume e riferimento a 4 settimane" subtitle="Chilometri settimanali e media delle quattro settimane precedenti" data={loadDisplay} metric="km" reference/><LoadChart title="Tempo di corsa" subtitle="Ore registrate per settimana" data={loadDisplay} metric="hours" kind="bar"/><LoadChart title="Frequenza settimanale" subtitle="Numero di corse per settimana" data={loadDisplay} metric="runs" kind="bar"/><LoadChart title="Rapporto rispetto alle 4 settimane precedenti" subtitle="Non disponibile senza quattro settimane di storico o con media zero" data={loadDisplay} metric="ratio"/></div><details className="load-method"><summary>Come vengono calcolati questi indicatori?</summary><p>Ogni settimana inizia il lunedì. Il volume è la somma delle distanze delle attività running e trail running. Le settimane senza corse valgono zero. Il riferimento è la media dei quattro volumi settimanali precedenti, esclusa la settimana osservata. Il rapporto è volume della settimana diviso riferimento; se il riferimento è zero o manca lo storico, il valore non viene calcolato.</p><p>Le settimane ai margini dell'intervallo selezionato possono essere incomplete: il primo lunedì può includere attività precedenti al filtro perché il calcolo aggrega settimane di calendario. Il volume totale rappresenta quindi le settimane visualizzate, non necessariamente i soli giorni del filtro. Le ultime settimane sono considerate complete solo se precedono quella che contiene la data dell'ultimo dato disponibile.</p><p>La dashboard legge al massimo 2.000 attività dalla RPC corrente: per archivi più grandi, la serie può essere parziale. Questi indicatori sono descrittivi e non rappresentano un punteggio di carico fisiologico.</p></details></>}
'''
CSS_ADD='''
/* V3.1 TRAINING LOAD REFINEMENT */
.load-tooltip{display:flex;flex-direction:column;gap:5px;background:#101d30;color:#eaf3ff;border:1px solid #405572;border-radius:12px;padding:12px 15px;font-size:12px;box-shadow:0 10px 28px #0007}
.load-tooltip strong{margin-bottom:4px;font-size:13px}.load-chart-legend{display:flex;flex-wrap:wrap;gap:15px;padding:0 16px 12px;color:#9eb1cc;font-size:11px}
.load-chart-legend span{display:inline-flex;align-items:center;gap:6px}.load-key-ref{width:20px;border-top:2px dashed #ffc66d}.load-key-partial{display:inline-block;width:12px;height:12px;background:#71829d;opacity:.55;border-radius:3px}
.load-summary{border:1px solid #30415a;border-radius:14px;padding:14px 18px;margin:0 0 20px;color:#b7c8df;line-height:1.6;background:#132238}
.load-summary b{color:#f3f7ff}.load-method{border:1px solid #30415a;border-radius:14px;padding:15px 18px;color:#b5c5dc;line-height:1.6;margin-top:18px}
.load-method summary{cursor:pointer;color:#e9f2ff;font-weight:650}.load-method p{margin:12px 0 0}
'''

def main():
    src=MAIN.read_text(encoding='utf-8');css=CSS.read_text(encoding='utf-8')
    if MARK in src and MARK in css:
        print('V3.1 already applied');return
    if MARK in src or MARK in css:raise RuntimeError('Installazione parziale V3.1: nessun file modificato')
    if src.count(START)!=1 or src.count(END)!=1 or src.count('function App(){')!=1:raise RuntimeError('La versione V3 non corrisponde: nessun file modificato')
    if "import { buildTrainingLoad } from './trainingLoad';" not in src:raise RuntimeError('Manca la V3 originale')
    if "Scatter, Legend }" not in src:raise RuntimeError('Import Recharts inatteso')
    src=src.replace('Scatter, Legend }','Scatter, Legend, Cell }',1)
    src=src.replace('function App(){',COMPONENT+'\nfunction App(){',1)
    a=src.index(START);b=src.index(END,a)
    src=src[:a]+SECTION+src[b:]
    needle=' const sample=Math.max(1,Math.ceil(days.length/110));'
    if src.count(needle)!=1:raise RuntimeError('Punto dati non trovato')
    src=src.replace(needle,' const loadDisplay:LoadPoint[]=loadWeeks.map(w=>({...w,label:loadWeekLabel(w.week),partial:w.week===monday(maxDate)}));\n'+needle,1)
    MAIN.write_text(src,encoding='utf-8');CSS.write_text(css+'\n'+CSS_ADD,encoding='utf-8')
    print('V3.1 applicata. Esegui npm run build e controlla la schermata Training Load.')
if __name__=='__main__':
    try:main()
    except Exception as e:print('ERRORE:',e,file=sys.stderr);sys.exit(1)
