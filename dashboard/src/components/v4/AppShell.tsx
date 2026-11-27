import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronRight, HeartPulse, LogOut, RefreshCw, ShieldCheck } from 'lucide-react';
import { ThemeToggle } from './ThemeProvider';

export type AppNavItem = { id: string; label: string; icon: LucideIcon; preview?: boolean };

export function AppShell({ sectionTitle, items, active, onNavigate, onSignOut, status, onRefresh, refreshing, children }: {
  sectionTitle: string; items: AppNavItem[]; active: string; onNavigate: (section: string) => void;
  onSignOut: () => void; status: string; onRefresh: () => void; refreshing: boolean; children: ReactNode;
}) {
  return <div className="app-shell v4-app-shell">
    <aside className="sidebar v4-sidebar">
      <a className="brand v4-brand" href="#main-content" aria-label="Garmin Coaching Hub, vai al contenuto">
        <span className="brand-icon"><HeartPulse size={22} aria-hidden="true"/></span>
        <span>GARMIN <b>COACHING HUB</b><small>V4 · VISUAL FOUNDATION</small></span>
      </a>
      <div className="nav-label">WORKSPACE</div>
      <nav aria-label="Navigazione principale">
        {items.map(({ id, label, icon: Icon, preview }) => <button key={id} type="button"
          className={active === id ? 'active' : ''} onClick={() => onNavigate(id)}
          aria-current={active === id ? 'page' : undefined} aria-label={label} title={label}>
          <Icon size={19} aria-hidden="true"/><span>{label}</span>
          {preview && <span className="v4-nav-badge">Anteprima</span>}
        </button>)}
      </nav>
      <div className="sidebar-footer v4-sidebar-footer">
        <div className="privacy"><ShieldCheck size={16} aria-hidden="true"/> DATI PROTETTI</div>
        <button type="button" onClick={onSignOut}><LogOut size={18} aria-hidden="true"/> Disconnetti</button>
        <small>Garmin Coaching Hub · V4.0</small>
      </div>
    </aside>
    <main id="main-content" className="main v4-main">
      <header className="topbar v4-topbar">
        <div className="breadcrumb"><span>COACHING HUB</span><ChevronRight size={13} aria-hidden="true"/><span>{sectionTitle.toUpperCase()}</span></div>
        <div className="top-actions">
          <span className="live"><span aria-hidden="true"/> {status}</span>
          <ThemeToggle/>
          <button className="icon-button logout-mobile" type="button" aria-label="Disconnetti" onClick={onSignOut}><LogOut size={17} aria-hidden="true"/></button>
          <button className="icon-button" type="button" aria-label={refreshing ? 'Aggiornamento in corso' : 'Aggiorna'}
            onClick={onRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''} aria-hidden="true"/></button>
        </div>
      </header>
      {children}
    </main>
  </div>;
}
