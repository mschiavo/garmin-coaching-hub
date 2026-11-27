import React from 'react';
import ReactDOM from 'react-dom/client';
import { Activity, Footprints } from 'lucide-react';
import { ChartPanel } from '../src/components/v4/ChartPanel';
import { DataState } from '../src/components/v4/DataState';
import { EvidenceTooltip } from '../src/components/v4/EvidenceTooltip';
import { MetricCard } from '../src/components/v4/MetricCard';
import { ProgressRing } from '../src/components/v4/ProgressRing';
import { ThemeProvider, ThemeToggle } from '../src/components/v4/ThemeProvider';
import '../src/style.css';
import '../src/v4-design-system.css';
import '../src/components/v4/v4-components.css';

function Fixture() {
  return <ThemeProvider><main className="content v4-fixture">
    <header className="v4-fixture__header"><div><p className="eyebrow">V4 · FIXTURE SINTETICA</p><h1>Componenti dimostrativi</h1></div><ThemeToggle/></header>
    <p className="v4-demo-label">Dati dimostrativi · nessun dato personale o servizio remoto</p>
    <div className="v4-metric-grid">
      <MetricCard label="Distanza sintetica" value={28} unit="km" window="Settimana demo" source="Fixture" status="available" detail="Valore sintetico" icon={Footprints}/>
      <MetricCard label="Metrica assente" value={null} unit="bpm" window="Periodo demo" source="Non disponibile" status="missing" icon={Activity}/>
      <MetricCard label="Serie incompleta" value={3} unit="giorni" window="Periodo demo" source="Fixture" status="partial" icon={Activity}/>
    </div>
    <div className="v4-preview-grid">
      <ProgressRing label="Target demo" actual={28} target={40} unit="km" period="Settimana dimostrativa"/>
      <ProgressRing label="Target superato" actual={45} target={40} unit="km" period="Settimana dimostrativa"/>
      <ProgressRing label="Target non valido" actual={28} target={0} unit="km" period="Settimana dimostrativa"/>
      <ProgressRing label="Dato mancante" actual={null} target={40} unit="km" period="Settimana dimostrativa" status="partial"/>
    </div>
    <DataState kind="denied" title="Accesso negato all’archivio">Stato sintetico per verifica del componente.</DataState>
    <ChartPanel title="Grafico dimostrativo" description="Descrizione sintetica e unità esplicita." unit="km" table={<table><caption>Campioni della fixture</caption><thead><tr><th>Periodo</th><th>Valore</th></tr></thead><tbody><tr><td>Demo</td><td>28 km</td></tr></tbody></table>}>
      <div role="img" aria-label="Grafico sintetico, 28 chilometri">28 km</div>
    </ChartPanel>
    <EvidenceTooltip source="Fixture sintetica" method="Valore statico del test" period="Settimana demo" samples="1 valore" limits="Non rappresenta dati atleta"/>
  </main></ThemeProvider>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Fixture/></React.StrictMode>);
