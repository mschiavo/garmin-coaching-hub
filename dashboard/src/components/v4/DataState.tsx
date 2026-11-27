import type { ReactNode } from 'react';

export type DataStateKind = 'loading' | 'empty' | 'partial' | 'denied' | 'error' | 'stale' | 'available';

const labels: Record<DataStateKind, string> = {
  loading: 'Caricamento', empty: 'Nessun dato', partial: 'Dati parziali', denied: 'Accesso negato',
  error: 'Errore', stale: 'Dati da aggiornare', available: 'Dati disponibili',
};

export function DataState({ kind, title, children, action }: {
  kind: DataStateKind; title?: string; children: ReactNode; action?: ReactNode;
}) {
  return <section className={`v4-data-state v4-data-state--${kind}`} role={kind === 'loading' ? 'status' : kind === 'denied' || kind === 'error' ? 'alert' : undefined}
    aria-live={kind === 'loading' || kind === 'denied' || kind === 'error' ? 'polite' : undefined}>
    <span className="v4-data-state__label">{labels[kind]}</span>
    {title && <h2>{title}</h2>}
    <div className="v4-data-state__message">{children}</div>
    {action && <div className="v4-data-state__action">{action}</div>}
  </section>;
}
