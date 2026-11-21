import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, HeartPulse, LogOut, Moon, RefreshCw, ShieldCheck, Zap } from 'lucide-react';
import { ResponsiveContainer, CartesianGrid, Tooltip, XAxis, YAxis, LineChart, Line, BarChart, Bar, Legend } from 'recharts';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const configured = Boolean(url && key);
const supabase = configured ? createClient(url!, key!) : null;

type ActivityRow = { id: number; date: string; type: string; name: string; distance_m: number | null; duration_s: number | null; average_hr: number | null };
type DailyRow = { date: string; sleep_h: number | null; hrv: number | null; resting_hr: number | null; stress: number | null; bb_charged: number | null; bb_drained: number | null; steps: number | null };
type Payload = { activities: ActivityRow[]; daily: DailyRow[]; updated_at: string | null };
const isRun = (a: ActivityRow) => a.type === 'running' || a.type === 'trail_running';
const fmt = (v: number | null | undefined, digits = 1) => v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('it-IT', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const pace = (a: ActivityRow) => a.distance_m && a.duration_s ? `${Math.floor(a.duration_s * 1000 / a.distance_m / 60)}:${String(Math.round(a.duration_s * 1000 / a.distance_m) % 60).padStart(2,'0')}` : '—';
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString('it-IT', { day:'2-digit', month:'short', year:'numeric' });
const monday = (s: string) => { const d = new Date(`${s}T12:00:00Z`); const weekday = d.getUTCDay(); d.setUTCDate(d.getUTCDate() - ((weekday + 6) % 7)); return d.toISOString().slice(0,10); };
const avg = (values: Array<number | null>) => { const valid = values.filter((v): v is number => v != null && Number.isFinite(v)); return valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : null; };

function App() {
  const [session, setSession] = React.useState<boolean | null>(null);
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [authError, setAuthError] = React.useState('');
  const [loadingAuth, setLoadingAuth] = React.useState(false);
  const [payload, setPayload] = React.useState<Payload | null>(null);
  const [error, setError] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [range, setRange] = React.useState('90');
  const [section, setSection] = React.useState<'overview'|'training'|'recovery'|'activities'>('overview');

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, current) => { setSession(Boolean(current)); if (!current) setPayload(null); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setLoading(true); setError('');
    const { data, error: e } = await supabase.rpc('dashboard_data');
    if (e) setError(`Lettura non riuscita: ${e.message}. Verifica che l'utente sia autorizzato nella allowlist.`);
    else setPayload(data as Payload);
    setLoading(false);
  }, []);
  React.useEffect(() => { if (session) void load(); }, [session, load]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault(); if (!supabase) return;
    setLoadingAuth(true); setAuthError('');
    const { error: e2 } = await supabase.auth.signInWithPassword({ email, password });
    if (e2) setAuthError('Accesso non riuscito. Verifica credenziali e conferma email.');
    setLoadingAuth(false);
  };

  if (!configured) return <div className="center"><div className="login"><ShieldCheck size={30}/><h1>Configurazione necessaria</h1><p>Imposta VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY. Consulta README.md.</p></div></div>;
  if (session === null) return <div className="center">Verifica sessione…</div>;
  if (!session) return <div className="center"><form className="login" onSubmit={signIn}><div className="brand"><HeartPulse/> GARMIN COACHING HUB</div><h1>Bentornato</h1><p>Accedi alla tua dashboard privata.</p><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{authError && <p className="error" role="alert">{authError}</p>}<button disabled={loadingAuth}>{loadingAuth?'Accesso…':'Accedi'}</button><small>Registrazione pubblica disabilitata. Account creato dall'amministratore.</small></form></div>;

  const activities = payload?.activities || [];
  const daily = payload?.daily || [];
  const maxDate = daily.length ? daily[daily.length-1].date : new Date().toISOString().slice(0,10);
  const cutoff = range === 'all' ? '0000-01-01' : (()=> { const d = new Date(`${maxDate}T12:00:00Z`); d.setUTCDate(d.getUTCDate()-Number(range)+1); return d.toISOString().slice(0,10); })();
  const runs = activities.filter(a=>isRun(a) && a.date>=cutoff && a.date<=maxDate).sort((a,b)=>b.date.localeCompare(a.date));
  const days = daily.filter(d=>d.date>=cutoff && d.date<=maxDate);
  const km = runs.reduce((s,a)=>s+(a.distance_m||0)/1000,0);
  const weeks = new Map<string, { week:string; km:number; runs:number }>();
  [...runs].reverse().forEach(a=>{const w=monday(a.date);const x=weeks.get(w)||{week:w,km:0,runs:0};x.km+=(a.distance_m||0)/1000;x.runs++;weeks.set(w,x);});
  const weekly = [...weeks.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(w=>({...w,label:w.week.slice(5)}));
  const trends = days.filter((_,i)=>i%Math.max(1,Math.floor(days.length/90))===0).map(d=>({...d,label:d.date.slice(5)}));
  const card = (label:string,value:string,sub:string,Icon:typeof Activity) => <div className="metric"><div className="metric-head"><span>{label}</span><Icon size={18}/></div><strong>{value}</strong><small>{sub}</small></div>;
  const chart = (title:string, data:Record<string,unknown>[], keys:Array<{key:string;color:string;name:string}>, kind:'line'|'bar'='line') => <section className="panel"><h3>{title}</h3><div className="chart">{data.length ? <ResponsiveContainer width="100%" height="100%">{kind==='line' ? <LineChart data={data}><CartesianGrid stroke="#263247" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fill:'#91a1b9',fontSize:11}} minTickGap={24}/><YAxis tick={{fill:'#91a1b9',fontSize:11}} width={36} domain={['auto','auto']}/><Tooltip contentStyle={{background:'#192338',border:'1px solid #34415a',borderRadius:10}}/><Legend/>{keys.map(k=><Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={k.color} strokeWidth={2} dot={false} connectNulls={false}/>)}</LineChart> : <BarChart data={data}><CartesianGrid stroke="#263247" strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label" tick={{fill:'#91a1b9',fontSize:11}} minTickGap={18}/><YAxis tick={{fill:'#91a1b9',fontSize:11}} width={36}/><Tooltip contentStyle={{background:'#192338',border:'1px solid #34415a',borderRadius:10}}/><Legend/>{keys.map(k=><Bar key={k.key} dataKey={k.key} name={k.name} fill={k.color} radius={[4,4,0,0]}/>)}</BarChart>}</ResponsiveContainer> : <div className="empty">Nessun dato nel periodo selezionato</div>}</div></section>;

  return <div className="shell"><aside className="sidebar"><div className="brand"><HeartPulse/> <span>GARMIN<br/>COACHING HUB</span></div><nav>{([['overview','Panoramica',Activity],['training','Allenamenti',ArrowUpRight],['recovery','Recupero',Moon],['activities','Attività',CalendarDays]] as const).map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon size={18}/>{label}</button>)}</nav><div className="sidebar-bottom"><div className="private"><ShieldCheck size={16}/> Accesso privato</div><button onClick={()=>void supabase?.auth.signOut()}><LogOut size={17}/> Esci</button></div></aside><main><header><div><p className="eyebrow">ANALISI PERSONALE</p><h1>{({overview:'Panoramica',training:'Allenamenti',recovery:'Recupero',activities:'Storico attività'})[section]}</h1><p className="muted">Dati Garmin sincronizzati su Supabase</p></div><div className="toolbar"><select aria-label="Periodo" value={range} onChange={e=>setRange(e.target.value)}><option value="30">Ultimi 30 giorni</option><option value="90">Ultimi 90 giorni</option><option value="180">Ultimi 180 giorni</option><option value="365">Ultimi 365 giorni</option><option value="all">Tutto lo storico</option></select><button className="refresh" onClick={()=>void load()} disabled={loading}><RefreshCw size={16}/>{loading?'Caricamento…':'Aggiorna'}</button></div></header>{error&&<div className="errorbox" role="alert">{error}</div>}{!payload&&!error?<div className="panel">Caricamento dei dati…</div>:payload&&<><div className="summary">{card('Chilometri di corsa',`${fmt(km)} km`,`${runs.length} corse nel periodo`,Activity)}{card('Sonno medio',`${fmt(avg(days.map(d=>d.sleep_h)),2)} h`,'Notti con dati disponibili',Moon)}{card('HRV media',`${fmt(avg(days.map(d=>d.hrv)))} ms`,'Media notturna',HeartPulse)}{card('FC a riposo',`${fmt(avg(days.map(d=>d.resting_hr)))} bpm`,'Media giornaliera',Zap)}</div>{(section==='overview'||section==='training')&&<div className="charts">{chart('Chilometri per settimana',weekly,[{key:'km',name:'Km',color:'#60a5fa'}],'bar')}{chart('Numero corse per settimana',weekly,[{key:'runs',name:'Corse',color:'#34d399'}],'bar')}</div>}{(section==='overview'||section==='recovery')&&<div className="charts">{chart('HRV notturna (ms)',trends,[{key:'hrv',name:'HRV',color:'#a78bfa'}])}{chart('Sonno (ore)',trends,[{key:'sleep_h',name:'Sonno',color:'#60a5fa'}])}{chart('Frequenza cardiaca a riposo (bpm)',trends,[{key:'resting_hr',name:'FC riposo',color:'#fb7185'}])}{chart('Stress medio giornaliero',trends,[{key:'stress',name:'Stress',color:'#fbbf24'}])}{chart('Body Battery: carica e consumo',trends,[{key:'bb_charged',name:'Caricata',color:'#34d399'},{key:'bb_drained',name:'Consumata',color:'#fb7185'}])}{chart('Passi giornalieri',trends,[{key:'steps',name:'Passi',color:'#60a5fa'}],'bar')}</div>}{(section==='overview'||section==='activities')&&<section className="panel"><div className="section-heading"><h3>Ultime attività di corsa</h3><span className="muted">{runs.length} nel periodo</span></div><div className="table-scroll"><table><thead><tr><th>Data</th><th>Attività</th><th>Km</th><th>Durata</th><th>Ritmo /km</th><th>FC media</th></tr></thead><tbody>{runs.slice(0,section==='activities'?500:12).map(a=><tr key={a.id}><td>{day(a.date)}</td><td>{a.name||a.type}</td><td>{fmt((a.distance_m||0)/1000,2)}</td><td>{a.duration_s?`${Math.floor(a.duration_s/3600)>0?`${Math.floor(a.duration_s/3600)}h `:''}${Math.floor(a.duration_s%3600/60)}m`:'—'}</td><td>{pace(a)}</td><td>{a.average_hr?`${fmt(a.average_hr,0)} bpm`:'—'}</td></tr>)}</tbody></table></div></section>}<footer><span>Ultimo aggiornamento database: {payload.updated_at?new Date(payload.updated_at).toLocaleString('it-IT'):'—'}</span><span><ArrowDownRight size={14}/> Valori mancanti esclusi dalle medie</span></footer></>}</main></div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
