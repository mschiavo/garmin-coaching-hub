from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
MAIN = ROOT / "dashboard" / "src" / "main.tsx"
CSS = ROOT / "dashboard" / "src" / "style.css"


def replace_once(source, old, new, name):
    if new in source:
        return source
    count = source.count(old)
    if count != 1:
        raise RuntimeError(f"{name}: expected one insertion anchor, found {count}; no files changed")
    return source.replace(old, new, 1)


def main():
    main_source = MAIN.read_text(encoding="utf-8")
    css_source = CSS.read_text(encoding="utf-8")
    marker = "/* V3 TRAINING LOAD */"
    if "import { buildTrainingLoad } from './trainingLoad';" in main_source and marker in css_source:
        print("V3 already applied")
        return
    if "import { buildTrainingLoad } from './trainingLoad';" in main_source or marker in css_source:
        raise RuntimeError("Partial V3 installation detected; inspect files manually")
    main_source = replace_once(main_source, "import './style.css';", "import { buildTrainingLoad } from './trainingLoad';\nimport './style.css';", "import")
    main_source = replace_once(main_source, "|'training'|'recovery'", "|'training'|'training-load'|'recovery'", "Section type")
    main_source = replace_once(main_source, "['training','Allenamenti',Route],", "['training','Allenamenti',Route],['training-load','Training Load',BarChart3],", "navigation")
    anchor = " const sample=Math.max(1,Math.ceil(days.length/110));"
    calculation = """ const loadRuns=allActivities.filter(isRun);const loadStart=range==='all'?(loadRuns.length?loadRuns.reduce((min,a)=>a.date<min?a.date:min,loadRuns[0].date):maxDate):cutoff;const loadWeeks=buildTrainingLoad(loadRuns,loadStart,maxDate);const completedLoadWeeks=loadWeeks.filter(w=>w.week< monday(maxDate));const lastCompletedLoad=completedLoadWeeks[completedLoadWeeks.length-1];const loadAvg4=lastCompletedLoad?.baselineKm??null;const loadRatio=lastCompletedLoad?.ratio??null;const loadTotal=loadWeeks.reduce((s,w)=>s+w.km,0);\n"""
    main_source = replace_once(main_source, anchor, calculation+anchor, "load calculation")
    anchor = " {section==='recovery'&&"
    section = """ {section==='training-load'&&<><div className="load-intro"><div><p className="eyebrow">V3 / ADVANCED RUNNING ANALYTICS</p><h2>Il tuo carico, settimana dopo settimana.</h2><p>Volume di corsa misurato in chilometri. La settimana corrente è parziale; gli indicatori di confronto si riferiscono all'ultima settimana completata.</p></div></div><div className="load-kpis"><div className="load-kpi"><span>Volume nel periodo</span><strong>{num(loadTotal,1)} km</strong><small>Settimane incluse: {loadWeeks.length}</small></div><div className="load-kpi"><span>Ultima settimana completa</span><strong>{lastCompletedLoad?`${num(lastCompletedLoad.km,1)} km`:'—'}</strong><small>{lastCompletedLoad?`Settimana del ${dateLabel(lastCompletedLoad.week)}`:'Dati insufficienti'}</small></div><div className="load-kpi"><span>Media 4 settimane precedenti</span><strong>{loadAvg4==null?'—':`${num(loadAvg4,1)} km`}</strong><small>Media comprensiva delle settimane senza corse</small></div><div className="load-kpi"><span>Rapporto volume / media 4 sett.</span><strong>{loadRatio==null?'—':`${num(loadRatio,2)}×`}</strong><small>Indicatore descrittivo, non stima del rischio</small></div></div><div className="charts">{plot('Volume e riferimento a 4 settimane','La media è calcolata sulle quattro settimane precedenti; le prime quattro non hanno riferimento.',loadWeeks,[{key:'km',name:'Km settimanali',color:color.blue},{key:'baselineKm',name:'Media precedenti 4 sett.',color:color.amber}],'line',320)}{plot('Tempo di corsa','Ore registrate per settimana, incluse le settimane a zero',loadWeeks,[{key:'hours',name:'Ore',color:color.mint}],'bar',320)}{plot('Frequenza settimanale','Numero di corse, incluse le settimane a zero',loadWeeks,[{key:'runs',name:'Corse',color:color.violet}],'bar',280)}{plot('Rapporto rispetto alle 4 settimane precedenti','Non disponibile quando la media precedente è zero o manca lo storico',loadWeeks,[{key:'ratio',name:'Rapporto',color:color.cyan}],'line',280)}</div><div className="note"><Database size={18}/> Questa pagina usa distanza e durata delle attività Garmin già importate. Non è un punteggio di carico fisiologico, non interpreta le zone cardiache e non prevede infortuni. Le settimane senza corse valgono zero; le settimane precedenti all'inizio del periodo selezionato non vengono considerate per il riferimento.</div></>}\n"""
    main_source = replace_once(main_source, anchor, section+anchor, "page")
    css_source += """\n/* V3 TRAINING LOAD */\n.load-intro{padding:24px 28px;margin:0 0 20px;border:1px solid #30415a;border-radius:18px;background:linear-gradient(115deg,#152841,#121e31)}\n.load-intro h2{font-size:clamp(21px,2.3vw,30px);margin:5px 0 9px;color:#f1f7ff}\n.load-intro p:last-child{color:#9fb0c9;max-width:790px;line-height:1.6;margin:0}\n.load-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin:0 0 24px}\n.load-kpi{background:#152238;border:1px solid #2c3c55;border-radius:16px;padding:20px;min-width:0;display:flex;flex-direction:column;gap:9px}\n.load-kpi span{color:#aabbd2;font-size:12px}\n.load-kpi strong{color:#f2f7ff;font-size:clamp(20px,2.1vw,30px);font-weight:750}\n.load-kpi small{color:#8498b2;line-height:1.4}\n@media(max-width:1050px){.load-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}\n@media(max-width:580px){.load-kpis{grid-template-columns:1fr}.load-intro{padding:20px}}\n"""
    MAIN.write_text(main_source, encoding="utf-8")
    CSS.write_text(css_source, encoding="utf-8")
    print("V3 Training Load applied. Run npm build and review git diff.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Patch failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
