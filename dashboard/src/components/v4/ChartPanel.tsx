import type { ReactNode } from 'react';
import { DataState, type DataStateKind } from './DataState';

export function ChartPanel({ title, description, unit, children, state, table }: {
  title: string; description: string; unit: string; children?: ReactNode;
  state?: { kind: DataStateKind; message: string }; table?: ReactNode;
}) {
  return <section className="v4-chart-panel" aria-labelledby={`chart-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>
    <header><div><h2 id={`chart-${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}>{title}</h2><p>{description}</p></div>
      <span className="v4-chart-panel__unit">{unit}</span></header>
    {state ? <DataState kind={state.kind}>{state.message}</DataState> : children}
    {table && <details className="v4-chart-panel__table"><summary>Visualizza i valori in tabella</summary>{table}</details>}
  </section>;
}
