import React from 'react';
import ReactDOM from 'react-dom/client';
import { createClient } from '@supabase/supabase-js';
import { Activity, BarChart3, CalendarDays, ChevronRight, Clock3, Database, Download, Footprints, Gauge, Heart, HeartPulse, LayoutDashboard, LockKeyhole, LogOut, Moon, RefreshCw, Route, Search, ShieldCheck, Sparkles, TrendingUp, Zap } from 'lucide-react';
import { Plot, LoadChart, loadWeekLabel, color, type LoadPoint } from './charts';
import { buildTrainingLoad } from './trainingLoad';
import { AdvancedAnalytics } from './AdvancedAnalytics';
import { validDate, lastCompleteWeek, type ActivityRow, type Period } from './analytics/dates';
import { ArchiveError, readArchive, type Archive } from './dataApi';
import { QualityCenter } from './QualityCenter';
import { indexCoverage } from './analytics/coverage';
import { isPublishableKey } from './supabaseKey';
import './style.css';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/(?:rest|auth)\/v1\/?$/, '').replace(/\/$/, '');
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
const configured = /^https?:\/\/[^\s/]+\.[^\s/]+$/.test(rawUrl) && isPublishableKey(key);
const supabase = configured ? createClient(rawUrl, key) : null;
const garminToday = () => new Intl.DateTimeFormat('sv-SE', {
  timeZone: import.meta.env.VITE_GARMIN_TIMEZONE || 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
type Section = 'overview'|'training'|'training-load'|'recovery'|'performance'|'calendar'|'activities'|'insights'|'advanced'|'quality';
const isRun = (a:ActivityRow) => a.type==='running'||a.type==='trail_running';
const num=(v:number|null|undefined,d=1)=>v==null||!Number.isFinite(v)?'—':v.toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d});
const avg=(v:(number|null|undefined)[])=>{const n=v.filter((x):x is number=>x!=null&&Number.isFinite(x));return n.length?n.reduce((a,b)=>a+b,0)/n.length:null;};
const sum=(v:(number|null|undefined)[])=>v.reduce<number>((a,b)=>a+(b||0),0);
const km=(a:ActivityRow)=>(a.distance_m||0)/1000;
const paceSeconds=(a:ActivityRow)=>a.distance_m&&a.duration_s?Math.round(a.duration_s*1000/a.distance_m):null;
const paceText=(s:number|null)=>s==null?'—':`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
const dateLabel=(s:string)=>new Date(`${s}T12:00:00`).toLocaleDateString('it-IT',{day:'2-digit',month:'short',year:'numeric'});
const monday=(s:string)=>{const d=new Date(`${s}T12:00:00Z`);d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return d.toISOString().slice(0,10);};
const plusDays=(s:string,n:number)=>{const d=new Date(`${s}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
const navItems:[Section,string,typeof Activity][]=[['overview','Panoramica',LayoutDashboard],['training','Allenamenti',Route],['training-load','Training Load',BarChart3],['recovery','Recupero',HeartPulse],['performance','Prestazioni',Gauge],['calendar','Calendario',CalendarDays],['activities','Archivio attività',Footprints],['insights','Insights',Sparkles],['advanced','Advanced Analytics',TrendingUp],['quality','Qualità dei dati',Database]];
const csvCell=(v:unknown)=>`"${String(v??'').replace(/"/g,'""')}"`;
function exportCsv(rows:Record<string,unknown>[],name:string){const cols=Object.keys(rows[0]||{});const csv='\uFEFF'+[cols.map(csvCell).join(';'),...rows.map(r=>cols.map(k=>csvCell(r[k])).join(';'))].join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const href=URL.createObjectURL(blob);const a=document.createElement('a');a.href=href;a.download=name;a.click();URL.revokeObjectURL(href);}
function App(){
 const [session,setSession]=React.useState<string | false | null>(null);const [email,setEmail]=React.useState('');const [password,setPassword]=React.useState('');const [authError,setAuthError]=React.useState('');const [authLoading,setAuthLoading]=React.useState(false);const [result,setResult]=React.useState<{ session: string; range: string; today: string; archive: Archive } | null>(null);const [loading,setLoading]=React.useState(false);const [error,setError]=React.useState('');const [range,setRange]=React.useState('90');const [section,setSection]=React.useState<Section>('overview');const [search,setSearch]=React.useState('');const [sort,setSort]=React.useState('new');const [monthOffset,setMonthOffset]=React.useState(0);
 const [refresh, setRefresh] = React.useState(0);
 const [progress, setProgress] = React.useState<{ loaded: number; total: number } | null>(null);
 const active = React.useRef<AbortController | null>(null);
 const identity = React.useRef<string | false | null>(null);
 const signingOut = React.useRef(false);
 const [today, setToday] = React.useState(garminToday);
 React.useEffect(() => {
   const timer = window.setInterval(() => setToday(garminToday()), 30000);
   return () => window.clearInterval(timer);
 }, []);
 React.useEffect(() => {
   if (!supabase) return;
   const { data: listener } = supabase.auth.onAuthStateChange((event, authSession) => {
     if (signingOut.current && event !== 'SIGNED_OUT') return;
     let user: string | false = false;
     if (authSession) {
       const body = authSession.access_token.split('.')[1];
       try {
         const claims = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as { session_id?: string };
         user = JSON.stringify([authSession.user.id, claims.session_id ?? null]);
       } catch {
         user = JSON.stringify([authSession.user.id, null]);
       }
     }
     if (identity.current !== user || event === 'SIGNED_OUT') {
       active.current?.abort();
       identity.current = user;
       setResult(null);
       setSession(user);
       setSearch('');
       setMonthOffset(0);
       setError('');
       setProgress(null);
     }
   });
   return () => listener.subscription.unsubscribe();
 }, []);
 const load = () => setRefresh(value => value + 1);
 const signOut = () => {
   if (!supabase || signingOut.current) return;
   signingOut.current = true;
   active.current?.abort();
   identity.current = false;
   setSession(false);
   setResult(null);
   setLoading(false);
   setSearch('');
   setMonthOffset(0);
   setProgress(null);
   setAuthError('');
   setAuthLoading(true);
   void supabase.auth.signOut().then(({ error }) => {
     if (error) throw error;
   }).catch(() => setAuthError('Disconnessione remota non confermata. Accedi di nuovo per continuare.'))
     .finally(() => {
       signingOut.current = false;
       setAuthLoading(false);
     });
 };
 React.useEffect(() => {
   const client = supabase;
   if (!client || !session) return;
   const controller = new AbortController();
   active.current = controller;
   setLoading(true);
   setError('');
   setProgress(null);
   const current = () => !controller.signal.aborted && identity.current === session;
   void readArchive((name, args, signal) => client.rpc(name, args).abortSignal(AbortSignal.any([signal, AbortSignal.timeout(30000)])), range, today, controller.signal,
     (loaded, total) => { if (current()) setProgress({ loaded, total }); })
     .then(archive => { if (current()) setResult({ session, range, today, archive }); })
     .catch(reason => {
       if (current()) {
         setResult(null);
         setError(reason instanceof ArchiveError ? reason.message : 'Lettura dell’archivio non riuscita. Riprova.');
       }
     })
     .finally(() => { if (current()) setLoading(false); });
   return () => controller.abort();
 }, [session, range, refresh, today]);
 const payload = result && result.session === session &&
   (!result.archive.metadata || (result.range === range && result.today === today)) ? result.archive : null;
 const covered = React.useMemo(() => indexCoverage(payload, today), [payload, today]);
 const signIn = async (event: React.FormEvent) => {
   event.preventDefault();
   if (!supabase || authLoading) return;
   setAuthLoading(true);
   setAuthError('');
   try {
     const { error } = await supabase.auth.signInWithPassword({ email, password });
     if (error) throw error;
   } catch {
     setAuthError('Accesso non riuscito. Verifica le credenziali e riprova.');
   } finally {
     setPassword('');
     setAuthLoading(false);
   }
 };
 if(!configured)return <div className="center"><div className="login"><LockKeyhole size={32}/><h1>Configurazione necessaria</h1><p>Controlla le variabili GitHub VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY e ripubblica il sito.</p></div></div>;
 if(session===null)return <div className="center"><div className="loading-orb"/>Verifica sessione…</div>;
 if(!session)return <div className="center"><form className="login" onSubmit={signIn}><div className="brand"><div className="brand-icon"><HeartPulse size={22}/></div><span>GARMIN <b>COACHING HUB</b></span></div><div className="login-hero"><div className="login-orbit"><HeartPulse size={48}/></div></div><p className="eyebrow">IL TUO CENTRO DI CONTROLLO</p><h1>Bentornato.</h1><p>Allenamento, recupero e progressi. Tutto in un unico posto.</p><label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required/></label>{authError&&<p className="error" role="alert">{authError}</p>}<button className="primary" disabled={authLoading}>{authLoading?'Accesso in corso…':'Accedi alla dashboard'} <ChevronRight size={17}/></button><small><ShieldCheck size={14}/> Accesso riservato · Supabase Auth</small></form></div>;
 const allActivities=(payload?.activities||[]).filter(row=>validDate(row.date)&&row.date<=today);const allDaily=(payload?.daily||[]).filter(row=>validDate(row.date)&&row.date<=today);const maxDate=payload?.requested?.end??([...allActivities,...allDaily].map(row=>row.date).sort().at(-1)??today);const cutoff=payload?.requested?.start??(range==='all'?'0001-01-01':plusDays(maxDate,-Number(range)+1));const period:Period={start:cutoff,end:maxDate};const days=allDaily.filter(d=>d.date>=cutoff&&d.date<=maxDate);const runs=allActivities.filter(a=>isRun(a)&&a.date>=cutoff&&a.date<=maxDate).sort((a,b)=>b.date.localeCompare(a.date));const totalKm=sum(runs.map(km));const totalTime=sum(runs.map(a=>a.duration_s))/3600;const longRun=runs.reduce<number|null>((best,a)=>a.distance_m&&a.distance_m>0?Math.max(best??0,km(a)):best,null);const trainingDays=new Set(runs.map(a=>a.date)).size;
 const weekMap=new Map<string,{week:string;km:number;runs:number;hours:number;avgHr:number|null;hrs:number[]}>();runs.forEach(a=>{const w=monday(a.date),v=weekMap.get(w)||{week:w,km:0,runs:0,hours:0,avgHr:null,hrs:[]};v.km+=km(a);v.runs++;v.hours+=(a.duration_s||0)/3600;if(a.average_hr!=null)v.hrs.push(a.average_hr);v.avgHr=avg(v.hrs);weekMap.set(w,v);});const weekly=[...weekMap.values()].sort((a,b)=>a.week.localeCompare(b.week)).map(w=>({...w,label:w.week.slice(5)}));
 const loadRuns = allActivities.filter(isRun);
 const loadStart = payload?.requested?.start ?? (range === 'all'
   ? loadRuns.reduce((earliest, row) => row.date < earliest ? row.date : earliest, maxDate) : cutoff);
 const loadWeeks = buildTrainingLoad(loadRuns, loadStart, maxDate, covered);
 const lastWeek = lastCompleteWeek(maxDate, today);
 const lastCompletedLoad = loadWeeks.find(w => w.week === lastWeek && w.week >= loadStart);
 const lastCovered = !!lastCompletedLoad && covered({ start: lastWeek, end: plusDays(lastWeek, 6) });
 const loadAvg4 = lastCompletedLoad?.baselineKm ?? null;
 const loadRatio = lastCompletedLoad?.ratio ?? null;
 const loadTotal = loadWeeks.some(w => w.km !== null) ? loadWeeks.reduce((sum, w) => sum + (w.km ?? 0), 0) : null;
 const loadCounts = loadWeeks.reduce((sum, w) => ({ valid: sum.valid + w.distanceCount, total: sum.total + w.runs }), { valid: 0, total: 0 });
 const loadDisplay: LoadPoint[] = loadWeeks.map(w => ({ ...w, label: loadWeekLabel(w.week),
   partial: w.week < loadStart || w.week > lastWeek || !covered({ start: w.week, end: plusDays(w.week, 6) }) ||
     w.distanceCount < w.runs || w.durationCount < w.runs }));
 const loadReason = !lastCovered ? 'Copertura dell’ultima settimana conclusa insufficiente.'
   : lastCompletedLoad?.distanceCount !== lastCompletedLoad?.runs ? 'Distanze mancanti nell’ultima settimana conclusa.'
   : loadAvg4 === null ? 'Copertura o distanze insufficienti nelle quattro settimane precedenti.'
   : 'Riferimento pari a zero.';
 const sample=Math.max(1,Math.ceil(days.length/110));const trend=days.filter((_,i)=>i%sample===0||i===days.length-1).map(d=>({...d,label:d.date.slice(5)}));
 const monthlyMap=new Map<string,{label:string;km:number;runs:number;hrv:(number|null)[];sleep:(number|null)[];rest:(number|null)[]}>();for(const d of days){const k=d.date.slice(0,7),v=monthlyMap.get(k)||{label:k,km:0,runs:0,hrv:[],sleep:[],rest:[]};v.hrv.push(d.hrv);v.sleep.push(d.sleep_h);v.rest.push(d.resting_hr);monthlyMap.set(k,v);}for(const a of runs){const k=a.date.slice(0,7),v=monthlyMap.get(k)||{label:k,km:0,runs:0,hrv:[],sleep:[],rest:[]};v.km+=km(a);v.runs++;monthlyMap.set(k,v);}const monthly=[...monthlyMap.values()].sort((a,b)=>a.label.localeCompare(b.label)).map(m=>({...m,hrvAvg:avg(m.hrv),sleepAvg:avg(m.sleep),restAvg:avg(m.rest)}));
 const prevCutoff=range==='all'?null:plusDays(cutoff,-Number(range));const previous=prevCutoff?allActivities.filter(a=>isRun(a)&&a.date>=prevCutoff&&a.date<cutoff):[];const prevKm=sum(previous.map(km));const change=prevCutoff&&covered(period)&&covered({start:prevCutoff,end:plusDays(cutoff,-1)})&&[...runs,...previous].every(a=>a.distance_m!==null&&a.distance_m>0)&&prevKm>0?((totalKm-prevKm)/prevKm*100):null;
 const distribution=[{label:'< 5 km',count:0},{label:'5–10 km',count:0},{label:'10–15 km',count:0},{label:'15–20 km',count:0},{label:'20+ km',count:0}];runs.filter(a=>a.distance_m!==null&&a.distance_m>0).forEach(a=>{const k=km(a);distribution[k<5?0:k<10?1:k<15?2:k<20?3:4].count++;});
 const runPaces=runs.map(a=>({a,p:paceSeconds(a)})).filter((x):x is {a:ActivityRow;p:number}=>x.p!=null&&x.p>0&&x.p<1800);const pairedDistance=sum(runPaces.map(({a})=>a.distance_m));const weightedPace=pairedDistance>0?Math.round(sum(runPaces.map(({a})=>a.duration_s))*1000/pairedDistance):null;
 const best5=runPaces.filter(x=>km(x.a)>=4.8&&km(x.a)<=5.3).sort((a,b)=>a.p-b.p)[0];const best10=runPaces.filter(x=>km(x.a)>=9.7&&km(x.a)<=10.5).sort((a,b)=>a.p-b.p)[0];const longest=[...runs].sort((a,b)=>km(b)-km(a))[0];
 const scatter=runPaces.filter(x=>x.a.average_hr!=null).map(x=>({pace:x.p,hr:x.a.average_hr,label:x.a.date}));
 const activitiesFiltered=runs.filter(a=>(`${a.name||''} ${a.date} ${a.type}`).toLowerCase().includes(search.toLowerCase())).sort((a,b)=>sort==='old'?a.date.localeCompare(b.date):sort==='distance'?km(b)-km(a):sort==='pace'?(paceSeconds(a)??99999)-(paceSeconds(b)??99999):b.date.localeCompare(a.date));
 const metrics=[{title:'Distanza percorsa',value:`${num(totalKm,1)} km`,sub:`${runs.length} corse nel periodo`,icon:Route,tone:'blue'},{title:'Tempo di corsa',value:`${num(totalTime,1)} h`,sub:`${trainingDays} giorni con corsa`,icon:Clock3,tone:'mint'},{title:'HRV media',value:`${num(avg(days.map(d=>d.hrv)),1)} ms`,sub:`${days.filter(d=>d.hrv!=null).length} notti rilevate`,icon:HeartPulse,tone:'violet'},{title:'Sonno medio',value:`${num(avg(days.map(d=>d.sleep_h)),2)} h`,sub:`${days.filter(d=>d.sleep_h!=null).length} notti rilevate`,icon:Moon,tone:'amber'}];
 const plot=(title:string,subtitle:string,data:Record<string,unknown>[],series:{key:string;name:string;color:string}[],kind:'line'|'area'|'bar'|'scatter'='line',height?:number)=><Plot title={title} subtitle={subtitle} data={data} series={series} kind={kind} height={height}/>;
 const summary=<div className="metric-grid">{metrics.map(m=><div className={`metric ${m.tone}`} key={m.title}><div className="metric-top"><span>{m.title}</span><m.icon size={20}/></div><strong>{m.value}</strong><small>{m.sub}</small><div className="metric-glow"/></div>)}</div>;
 const sectionTitle=navItems.find(x=>x[0]===section)?.[1]||'Panoramica';
 const calendarBase=new Date(`${maxDate}T12:00:00Z`);calendarBase.setUTCDate(1);calendarBase.setUTCMonth(calendarBase.getUTCMonth()+monthOffset);const monthName=calendarBase.toLocaleDateString('it-IT',{month:'long',year:'numeric',timeZone:'UTC'});const monthStart=calendarBase.toISOString().slice(0,10);const monthDays=new Date(Date.UTC(calendarBase.getUTCFullYear(),calendarBase.getUTCMonth()+1,0)).getUTCDate();const offset=(calendarBase.getUTCDay()+6)%7;const calendarRuns=new Map<string,ActivityRow[]>();allActivities.filter(isRun).forEach(a=>{const v=calendarRuns.get(a.date)||[];v.push(a);calendarRuns.set(a.date,v);});const dailyMap=new Map(allDaily.map(d=>[d.date,d]));
 const insights=[{title:'Carico settimanale',value:`${num(weekly.length?avg(weekly.map(w=>w.km)):null,1)} km`,detail:'Media delle settimane con almeno una corsa nel periodo; non include settimane senza attività.',icon:BarChart3},{title:'Corsa più lunga',value:`${num(longRun,1)} km`,detail:longest?`${dateLabel(longest.date)} · ${longest.name||'Corsa'}`:'Nessuna corsa',icon:Route},{title:'Frequenza cardiaca a riposo',value:`${num(avg(days.map(d=>d.resting_hr)),1)} bpm`,detail:'Media delle giornate con misura disponibile.',icon:Heart},{title:'Stress medio',value:num(avg(days.map(d=>d.stress)),1),detail:'Indice Garmin medio giornaliero, non un valore clinico.',icon:Zap},{title:'Body Battery caricata',value:num(avg(days.map(d=>d.bb_charged)),1),detail:'Media delle variazioni positive giornaliere, non livello al risveglio.',icon:Activity},{title:'Volume vs periodo precedente',value:change==null?'—':`${change>0?'+':''}${num(change,1)}%`,detail:range==='all'?'Scegli un intervallo finito per confrontare i periodi.':'Confronto tra finestre consecutive della stessa durata.',icon:TrendingUp}];
 return <div className="app-shell"><aside className="sidebar"><div className="brand"><div className="brand-icon"><HeartPulse size={22}/></div><span>GARMIN <b>COACHING HUB</b><small>ATHLETE INTELLIGENCE</small></span></div><div className="nav-label">WORKSPACE</div><nav>{navItems.map(([id,label,Icon])=><button key={id} className={section===id?'active':''} onClick={()=>setSection(id)}><Icon size={19}/><span>{label}</span>{section===id&&<span className="nav-indicator"/>}</button>)}</nav><div className="sidebar-footer"><div className="privacy"><ShieldCheck size={16}/> DATI PROTETTI</div><button onClick={signOut}><LogOut size={18}/> Disconnetti</button><p>GARMIN COACHING HUB · V3.4.1</p></div></aside><main className="main"><header className="topbar"><div className="breadcrumb">COACHING HUB <ChevronRight size={13}/> {sectionTitle.toUpperCase()}</div><div className="top-actions"><button className="icon-button logout-mobile" aria-label="Disconnetti" onClick={signOut}><LogOut size={17}/></button><span className="live"><span/> {payload?.metadata ? 'API V2' : payload ? 'API LEGACY' : 'ARCHIVIO'}</span><button className="icon-button" title="Aggiorna dati" onClick={()=>void load()} disabled={loading}><RefreshCw size={17} className={loading?'spin':''}/></button></div></header><div className="content"><div className="page-head"><div><p className="eyebrow">PERFORMANCE LAB</p><h1>{section==='overview'?'La tua performance.':sectionTitle}<span className="dot">.</span></h1><p className="subheading">{section==='overview'?'Ogni chilometro racconta una storia. Qui trovi i numeri che contano.':section==='insights'?'Osservazioni descrittive basate esclusivamente sui dati disponibili.':'Dati Garmin aggiornati dal tuo archivio privato Supabase.'}</p></div><div className="filters"><select aria-label="Intervallo" value={range} onChange={e=>{active.current?.abort();setRange(e.target.value);setLoading(true);setError('');setProgress(null);}}><option value="30">Ultimi 30 giorni</option><option value="90">Ultimi 90 giorni</option><option value="180">Ultimi 180 giorni</option><option value="365">Ultimi 365 giorni</option><option value="all">Tutto lo storico</option></select><button className="outline" onClick={()=>void load()} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/>{loading?'Aggiornamento…':'Aggiorna'}</button></div></div>{error&&<div className="errorbox" role="alert">{error}</div>}{loading&&<div className="panel empty" role="status">{progress ? `Trasferimento archivio · ${progress.loaded}/${progress.total} righe` : 'Caricamento dei dati Garmin…'}</div>}{payload&&!error&&<>
 {!payload.metadata&&<p className="note">API legacy · massimo 2.000 righe per collezione. Copertura sconosciuta.</p>}
 {section==='quality'&&<QualityCenter archive={payload} period={period} today={today}/>}
 {section==='overview'&&<><div className="hero"><div className="hero-text"><div className="hero-tag"><Sparkles size={15}/> IL TUO TRAINING PULSE</div><h2>{num(totalKm,1)} <span>km</span></h2><p>percorsi nel periodo selezionato</p><div className="hero-mini"><span><Footprints size={15}/> {runs.length} corse</span><span><Clock3 size={15}/> {num(totalTime,1)} ore</span><span><Route size={15}/> {num(longRun,1)} km lungo max</span></div></div><div className="hero-decoration"><div className="orb one"/><div className="orb two"/><div className="pulse-ring"><HeartPulse size={68}/></div></div></div>{summary}<div className="section-caption"><h2>Training pulse</h2><span>Volume e frequenza</span></div><div className="charts">{plot('Volume settimanale','Chilometri per settimana',weekly,[{key:'km',name:'Km',color:color.blue}],'bar')}{plot('Frequenza di allenamento','Corse per settimana',weekly,[{key:'runs',name:'Corse',color:color.mint}],'area')}</div><div className="section-caption"><h2>Recovery signals</h2><span>Andamento giornaliero</span></div><div className="charts">{plot('HRV notturna','Millisecondi · misurazioni disponibili',trend,[{key:'hrv',name:'HRV',color:color.violet}],'area')}{plot('Qualità del riposo · durata','Ore di sonno registrate',trend,[{key:'sleep_h',name:'Sonno',color:color.cyan}],'line')}</div></>}
 {section==='training'&&<>{summary}<div className="section-caption"><h2>Volume & consistenza</h2><span>{runs.length} allenamenti</span></div><div className="charts">{plot('Chilometri settimanali','Somma delle corse per settimana',weekly,[{key:'km',name:'Km',color:color.blue}],'bar')}{plot('Ore di corsa settimanali','Tempo registrato nelle attività',weekly,[{key:'hours',name:'Ore',color:color.mint}],'area')}{plot('Numero di corse','Frequenza per settimana',weekly,[{key:'runs',name:'Corse',color:color.violet}],'bar')}{plot('Volume mensile','Km aggregati per mese',monthly,[{key:'km',name:'Km',color:color.cyan}],'bar')}</div><div className="section-caption"><h2>Distribuzione distanze</h2><span>Numero di attività per fascia</span></div>{plot('Tipologia delle uscite','Classificazione basata sulla distanza',distribution.map(d=>({...d})),[{key:'count',name:'Corse',color:color.amber}],'bar')}</>}
 {section==='training-load'&&<><div className="load-intro"><div><p className="eyebrow">TRAINING LOAD</p><h2>Il tuo carico, settimana dopo settimana.</h2><p>Volume misurato in chilometri. I confronti si riferiscono all'ultima settimana completata; la settimana corrente è parziale.</p></div></div><div className="load-kpis"><div className="load-kpi"><span>{loadDisplay.some(w => w.partial) ? 'Volume registrato · parziale' : 'Volume nel periodo'}</span><strong>{num(loadTotal,1)} km</strong><small>{loadCounts.valid}/{loadCounts.total} distanze valide · {loadWeeks.length} settimane</small></div><div className="load-kpi"><span>Ultima settimana completa</span><strong>{lastCovered&&lastCompletedLoad?.distanceCount===lastCompletedLoad?.runs?`${num(lastCompletedLoad?.km,1)} km`:'—'}</strong><small>{lastCompletedLoad?`Settimana del ${dateLabel(lastCompletedLoad.week)}`:'Dati insufficienti'}</small></div><div className="load-kpi"><span>Media 4 settimane precedenti</span><strong>{loadAvg4==null?'—':`${num(loadAvg4,1)} km`}</strong><small>Include le settimane senza corse</small></div><div className="load-kpi"><span>Rapporto volume / media 4 sett.</span><strong>{loadRatio==null?'—':`${num(loadRatio,2)}×`}</strong><small>Indicatore descrittivo, non stima del rischio</small></div></div><div className="load-summary">{lastCompletedLoad?.km!=null&&loadAvg4!=null&&loadAvg4>0?<>Nell'ultima settimana completa hai corso <b>{num(lastCompletedLoad.km,1)} km</b>, rispetto a <b>{num(loadAvg4,1)} km</b> medi nelle quattro precedenti ({lastCompletedLoad.km>=loadAvg4?'+':''}{num((lastCompletedLoad.km/loadAvg4-1)*100,1)}%).</>:loadReason} Il rapporto non misura affaticamento né rischio di infortunio.</div><div className="charts"><LoadChart title="Volume e riferimento a 4 settimane" subtitle="Chilometri settimanali e media delle quattro settimane precedenti" data={loadDisplay} metric="km" reference/><LoadChart title="Tempo di corsa" subtitle="Ore registrate per settimana" data={loadDisplay} metric="hours" kind="bar"/><LoadChart title="Frequenza settimanale" subtitle="Numero di corse per settimana" data={loadDisplay} metric="runs" kind="bar"/><LoadChart title="Rapporto rispetto alle 4 settimane precedenti" subtitle="Non disponibile senza quattro settimane di storico o con media zero" data={loadDisplay} metric="ratio"/></div><details className="load-method"><summary>Come vengono calcolati questi indicatori?</summary><p>Ogni settimana inizia il lunedì. Il volume è la somma delle distanze delle attività running e trail running. Lo zero richiede evidenza di copertura per tutti i giorni della settimana. Il riferimento è la media dei quattro volumi settimanali precedenti, esclusa la settimana osservata. Il rapporto è volume della settimana diviso riferimento; se il riferimento è zero o manca lo storico, il valore non viene calcolato.</p><p>Le settimane ai margini dell'intervallo selezionato possono essere incomplete: il volume registrato rispetta le date del filtro. Per i riferimenti storici vengono lette anche le giornate precedenti. Una settimana termina la domenica. Se l'ultima data osservata è una domenica già trascorsa, la sua settimana è conclusa.</p><p>Il riferimento richiede copertura delle attività in ogni giornata conclusa e distanze valide per tutte le corse. Questi indicatori sono descrittivi e non rappresentano un punteggio di carico fisiologico.</p></details></>}
 {section==='recovery'&&<><div className="mini-grid">{[{label:'HRV media',v:`${num(avg(days.map(d=>d.hrv)),1)} ms`,icon:HeartPulse},{label:'FC a riposo',v:`${num(avg(days.map(d=>d.resting_hr)),1)} bpm`,icon:Heart},{label:'Stress medio',v:num(avg(days.map(d=>d.stress)),1),icon:Zap},{label:'Sonno medio',v:`${num(avg(days.map(d=>d.sleep_h)),2)} h`,icon:Moon},{label:'BB caricata',v:num(avg(days.map(d=>d.bb_charged)),1),icon:Activity},{label:'BB consumata',v:num(avg(days.map(d=>d.bb_drained)),1),icon:Activity}].map(m=><div className="mini-card" key={m.label}><m.icon size={19}/><span>{m.label}</span><strong>{m.v}</strong></div>)}</div><div className="section-caption"><h2>Recovery intelligence</h2><span>Giorni senza misura esclusi dalle medie</span></div><div className="charts">{plot('HRV · trend','Variabilità della frequenza cardiaca (ms)',trend,[{key:'hrv',name:'HRV',color:color.violet}],'area')}{plot('Sonno · trend','Durata in ore',trend,[{key:'sleep_h',name:'Ore',color:color.cyan}],'area')}{plot('Frequenza cardiaca a riposo','Battiti per minuto',trend,[{key:'resting_hr',name:'FC riposo',color:color.rose}])}{plot('Stress giornaliero','Indice Garmin',trend,[{key:'stress',name:'Stress',color:color.amber}])}{plot('Body Battery · flussi','Caricata e consumata durante il giorno',trend,[{key:'bb_charged',name:'Caricata',color:color.mint},{key:'bb_drained',name:'Consumata',color:color.rose}])}{plot('Passi','Conteggio giornaliero',trend,[{key:'steps',name:'Passi',color:color.blue}],'bar')}{plot('HRV media mensile','Media delle notti disponibili',monthly,[{key:'hrvAvg',name:'HRV',color:color.violet}],'area')}{plot('Sonno medio mensile','Media delle notti disponibili',monthly,[{key:'sleepAvg',name:'Ore',color:color.cyan}],'area')}</div></>}
 {section==='performance'&&<><div className="mini-grid">{[{label:'Ritmo medio ponderato',v:`${paceText(weightedPace)} /km`,icon:Gauge},{label:'FC media in corsa',v:`${num(avg(runs.map(a=>a.average_hr)),0)} bpm`,icon:Heart},{label:'Corsa più lunga',v:`${num(longRun,2)} km`,icon:Route},{label:'Miglior ritmo ~5 km',v:`${paceText(best5?.p??null)} /km`,icon:TrendingUp},{label:'Miglior ritmo ~10 km',v:`${paceText(best10?.p??null)} /km`,icon:TrendingUp},{label:'Corse registrate',v:String(runs.length),icon:Footprints}].map(m=><div className="mini-card" key={m.label}><m.icon size={19}/><span>{m.label}</span><strong>{m.v}</strong></div>)}</div><div className="section-caption"><h2>Running dynamics</h2><span>Indicatori descrittivi, non stime di VO₂max</span></div><div className="charts">{plot('Ritmo delle singole uscite','Secondi/km · più basso = più veloce',runPaces.slice().reverse().map(x=>({label:x.a.date.slice(5),p:x.p})),[{key:'p',name:'s/km',color:color.mint}])}{plot('FC media delle corse','Battiti al minuto per attività',runs.slice().reverse().map(a=>({label:a.date.slice(5),hr:a.average_hr})),[{key:'hr',name:'FC',color:color.rose}])}{plot('Ritmo vs frequenza cardiaca','Ogni punto è una corsa · asse X in secondi/km',scatter,[{key:'hr',name:'FC',color:color.blue}],'scatter')}{plot('FC media settimanale','Media delle medie per attività',weekly,[{key:'avgHr',name:'FC',color:color.amber}],'line')}</div><div className="note"><ShieldCheck size={18}/> Il confronto tra ritmo e FC è descrittivo: percorso, dislivello, temperatura e tipo di seduta possono cambiare il risultato.</div></>}
 {section==='calendar'&&<><section className="panel calendar-panel"><div className="calendar-head"><div><h3>Diario di allenamento</h3><p>Corse, sonno e HRV giorno per giorno</p></div><div className="calendar-controls"><button onClick={()=>setMonthOffset(v=>v-1)}>‹</button><strong>{monthName}</strong><button onClick={()=>setMonthOffset(v=>Math.min(0,v+1))} disabled={monthOffset>=0}>›</button></div></div><div className="calendar-grid">{['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].map(d=><div className="weekday" key={d}>{d}</div>)}{Array.from({length:offset},(_,i)=><div className="calendar-empty" key={`e${i}`}/>)}{Array.from({length:monthDays},(_,i)=>{const date=`${monthStart.slice(0,8)}${String(i+1).padStart(2,'0')}`;const a=calendarRuns.get(date)||[];const d=dailyMap.get(date);return <div key={date} className={`calendar-cell ${a.length?'has-run':''} ${date===maxDate?'today':''}`} title={`${date}\n${a.length?`${a.length} corsa/e · ${num(sum(a.map(km)),1)} km`: 'Nessuna corsa'}\nHRV ${d?.hrv??'—'} ms\nSonno ${d?.sleep_h??'—'} h`}><b>{i+1}</b>{a.length>0&&<span className="cal-run">{num(sum(a.map(km)),1)} km</span>}{d?.hrv!=null&&<span className="cal-hrv">♥ {num(d.hrv,0)}</span>}</div>;})}</div><div className="calendar-legend"><span><i className="legend-run"/> Giorno con corsa</span><span><i className="legend-hrv"/> HRV disponibile</span></div></section></>}
 {section==='activities'&&<><section className="panel"><div className="panel-head"><div><h3>Archivio delle corse</h3><p>{activitiesFiltered.length} attività trovate · corse e trail</p></div><button className="outline" onClick={()=>exportCsv(activitiesFiltered.map(a=>({data:a.date,attivita:a.name,tipo:a.type,km:km(a),durata_secondi:a.duration_s,ritmo_sec_km:paceSeconds(a),fc_media:a.average_hr})),`garmin-corse-${maxDate}.csv`)} disabled={!activitiesFiltered.length}><Download size={16}/> Esporta CSV</button></div><div className="table-filters"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cerca nome, data, tipologia…"/></div><select value={sort} onChange={e=>setSort(e.target.value)}><option value="new">Più recenti</option><option value="old">Meno recenti</option><option value="distance">Distanza maggiore</option><option value="pace">Ritmo più veloce</option></select></div><div className="table-wrap"><table><thead><tr><th>Data</th><th>Attività</th><th>Distanza</th><th>Durata</th><th>Ritmo/km</th><th>FC media</th></tr></thead><tbody>{activitiesFiltered.map(a=><tr key={a.id}><td>{dateLabel(a.date)}</td><td><strong>{a.name||'Corsa'}</strong><small>{a.type==='trail_running'?'Trail running':'Running'}</small></td><td>{num(km(a),2)} km</td><td>{a.duration_s?`${Math.floor(a.duration_s/3600)>0?`${Math.floor(a.duration_s/3600)}h `:''}${Math.floor(a.duration_s%3600/60)}m`:'—'}</td><td><span className="pace-pill">{paceText(paceSeconds(a))}</span></td><td>{a.average_hr!=null?`${num(a.average_hr,0)} bpm`:'—'}</td></tr>)}</tbody></table>{!activitiesFiltered.length&&<div className="empty">Nessuna attività trovata</div>}</div></section></>}
 {section==='insights'&&<><div className="insight-intro"><Sparkles size={28}/><div><h2>I numeri, con il giusto contesto.</h2><p>Indicatori calcolati dal tuo archivio. Non sono diagnosi né suggerimenti automatici di carico.</p></div></div><div className="insight-grid">{insights.map(x=><div className="insight-card" key={x.title}><x.icon size={23}/><h3>{x.title}</h3><strong>{x.value}</strong><p>{x.detail}</p></div>)}</div><div className="charts">{plot('Volume mensile','Chilometri di corsa',monthly,[{key:'km',name:'Km',color:color.blue}],'bar')}{plot('HRV mensile','Media delle notti disponibili',monthly,[{key:'hrvAvg',name:'HRV',color:color.violet}],'area')}{plot('FC a riposo mensile','Media delle giornate disponibili',monthly,[{key:'restAvg',name:'BPM',color:color.rose}])}{plot('Sonno mensile','Media delle notti disponibili',monthly,[{key:'sleepAvg',name:'Ore',color:color.cyan}])}</div><div className="note"><Database size={18}/> Nessun dato viene inventato: le giornate senza misurazioni restano mancanti.</div></>}
 {section==="advanced"&&<AdvancedAnalytics activities={allActivities} daily={allDaily} range={range} today={today} requested={payload.requested} covered={covered}/>}
 <footer><span><Database size={14}/> Database aggiornato: {payload.updated_at?new Date(payload.updated_at).toLocaleString('it-IT'):'—'}</span><span><ShieldCheck size={14}/> Sessione privata · lettura autorizzata</span></footer></>}</div></main></div>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
