import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  ChevronDown, ChevronRight, HeartPulse, LogOut, MoreHorizontal, PanelLeftClose,
  PanelLeftOpen, RefreshCw, ShieldCheck, X,
} from 'lucide-react';
import { ThemeToggle } from './ThemeProvider';

export type AppNavItem = { id: string; label: string; icon: LucideIcon; preview?: boolean; primary?: boolean };
const collapseStorageKey = 'gch-v4-sidebar-collapsed';
const compactQuery = '(min-width: 651px) and (max-width: 1100px)';

function storedCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try { return window.localStorage.getItem(collapseStorageKey) === 'true'; }
  catch { return false; }
}

function useCompactViewport() {
  const [compact, setCompact] = useState(() => typeof window !== 'undefined' && window.matchMedia(compactQuery).matches);
  useEffect(() => {
    const media = window.matchMedia(compactQuery);
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return compact;
}

export function AppShell({ sectionTitle, items, active, onNavigate, onSignOut, status, onRefresh, refreshing, children,
  headerContent, headerControls, statusKind = 'live', showRefresh = true, showLogout = true, footerContent }: {
  sectionTitle: string; items: AppNavItem[]; active: string; onNavigate: (section: string) => void;
  onSignOut: () => void; status: string; onRefresh: () => void; refreshing: boolean; children: ReactNode;
  headerContent?: ReactNode; headerControls?: ReactNode; statusKind?: 'live' | 'demo'; showRefresh?: boolean;
  showLogout?: boolean; footerContent?: ReactNode;
}) {
  const compactViewport = useCompactViewport();
  const [desktopCollapsed, setDesktopCollapsed] = useState(storedCollapsed);
  const [tabletDrawerOpen, setTabletDrawerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(() => items.some(item => item.id === active && item.primary === false));
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const mobileMoreButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarToggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const secondaryPanelRef = useRef<HTMLDivElement>(null);
  const primaryItems = useMemo(() => {
    const explicitlyPrimary = items.filter(item => item.primary === true);
    if (explicitlyPrimary.length) return explicitlyPrimary;
    return items.slice(0, 4);
  }, [items]);
  const primaryIds = new Set(primaryItems.map(item => item.id));
  const secondaryItems = items.filter(item => !primaryIds.has(item.id));
  const collapsed = compactViewport ? !tabletDrawerOpen : desktopCollapsed;

  useEffect(() => {
    try { window.localStorage.setItem(collapseStorageKey, String(desktopCollapsed)); }
    catch { /* Navigation remains usable when storage is unavailable. */ }
  }, [desktopCollapsed]);

  useEffect(() => {
    if (!moreOpen && !mobileMenuOpen && !tabletDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        if (mobileMenuOpen) {
          setMobileMenuOpen(false);
          mobileMoreButtonRef.current?.focus();
        } else if (tabletDrawerOpen) {
          setTabletDrawerOpen(false);
          sidebarToggleRef.current?.focus();
        } else moreButtonRef.current?.focus();
      } else if (event.key === 'Tab' && mobileMenuOpen) {
        const focusable = mobileMenuRef.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      } else if (event.key === 'Tab' && tabletDrawerOpen) {
        const focusable = sidebarRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && (document.activeElement === first || !sidebarRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || !sidebarRef.current?.contains(document.activeElement))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [moreOpen, mobileMenuOpen, tabletDrawerOpen]);

  useEffect(() => {
    if (mobileMenuOpen) mobileMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, [mobileMenuOpen]);

  function navigate(id: string, fromMobile = false) {
    onNavigate(id);
    setMoreOpen(!fromMobile && secondaryItems.some(item => item.id === id));
    setMobileMenuOpen(false);
    setTabletDrawerOpen(false);
    if (secondaryItems.some(item => item.id === id)) mobileMoreButtonRef.current?.focus();
  }

  function toggleSidebar() {
    if (compactViewport) setTabletDrawerOpen(open => !open);
    else setDesktopCollapsed(value => !value);
  }

  function renderItem(item: AppNavItem, fromMobile = false) {
    const Icon = item.icon;
    return <button key={item.id} type="button" className={active === item.id ? 'active' : ''}
      onClick={() => navigate(item.id, fromMobile)} aria-current={active === item.id ? 'page' : undefined}
      aria-label={item.label} title={item.label} data-nav-id={item.id}>
      <Icon size={19} aria-hidden="true"/><span>{item.label}</span>
      {item.preview && <span className="v4-nav-badge">Anteprima</span>}
      {active === item.id && <span className="nav-indicator" aria-hidden="true"/>}
    </button>;
  }

  function renderSecondary(compact: boolean) {
    if (!moreOpen) return null;
    return <div ref={secondaryPanelRef} className={`v4-secondary-nav ${compact ? 'v4-secondary-nav--floating' : ''}`}
      role="group" aria-label="Altre sezioni">
      {secondaryItems.map(item => renderItem(item))}
    </div>;
  }

  return <div className={`app-shell v4-app-shell${collapsed ? ' v4-sidebar-is-collapsed' : ''}${tabletDrawerOpen ? ' v4-tablet-drawer-open' : ''}`}>
    {tabletDrawerOpen && <button type="button" className="v4-nav-backdrop" aria-label="Chiudi navigazione"
      onClick={() => { setTabletDrawerOpen(false); sidebarToggleRef.current?.focus(); }}/>}
    <aside ref={sidebarRef} className="sidebar v4-sidebar" aria-label="Navigazione applicazione">
      <div className="v4-sidebar-top">
        <a className="brand v4-brand" href="#main-content" aria-label="Garmin Coaching Hub, vai al contenuto">
          <span className="brand-icon"><HeartPulse size={22} aria-hidden="true"/></span>
          <span>GARMIN <b>COACHING HUB</b><small>V4 · VISUAL FOUNDATION</small></span>
        </a>
      </div>
      <div className="v4-sidebar-section">
        <div className="nav-label">WORKSPACE</div>
        <button ref={sidebarToggleRef} type="button" className="v4-sidebar-toggle" onClick={toggleSidebar}
          aria-label={collapsed ? 'Espandi navigazione' : 'Riduci navigazione'}
          aria-expanded={!collapsed} title={collapsed ? 'Espandi navigazione' : 'Riduci navigazione'}>
          {collapsed ? <PanelLeftOpen size={18} aria-hidden="true"/> : <PanelLeftClose size={18} aria-hidden="true"/>}
        </button>
      </div>
      <nav className="v4-sidebar-nav" aria-label="Navigazione principale">
        <div className="v4-primary-nav">{primaryItems.map(item => renderItem(item))}</div>
        {secondaryItems.length > 0 && <>
          <button ref={moreButtonRef} type="button" className={`v4-more-trigger${moreOpen ? ' active' : ''}`}
            onClick={() => setMoreOpen(open => !open)} aria-expanded={moreOpen} aria-controls="v4-secondary-navigation"
            aria-label={moreOpen ? 'Chiudi altre sezioni' : 'Apri altre sezioni'} title="Altre sezioni">
            <MoreHorizontal size={19} aria-hidden="true"/><span>Altro</span>
            <ChevronDown size={15} className="v4-more-chevron" aria-hidden="true"/>
          </button>
          <div id="v4-secondary-navigation" className="v4-secondary-container">{renderSecondary(collapsed)}</div>
        </>}
      </nav>
      <div className="sidebar-footer v4-sidebar-footer">
        {footerContent ?? <>
          <div className="privacy"><ShieldCheck size={16} aria-hidden="true"/> DATI PROTETTI</div>
          {showLogout && <button type="button" onClick={onSignOut} aria-label="Disconnetti"><LogOut size={18} aria-hidden="true"/><span>Disconnetti</span></button>}
          <small>Garmin Coaching Hub · V4.0</small>
        </>}
      </div>
    </aside>
    <main id="main-content" className="main v4-main" tabIndex={-1}>
      <header className="topbar v4-topbar">
        <div className="v4-mobile-heading">
          {headerContent ?? <div className="breadcrumb"><span>COACHING HUB</span><ChevronRight size={13} aria-hidden="true"/><span>{sectionTitle.toUpperCase()}</span></div>}
        </div>
        <div className="top-actions">
          {headerControls}
          <span className={`live ${statusKind === 'demo' ? 'v4-live-demo' : ''}`}><span aria-hidden="true"/> {status}</span>
          <ThemeToggle/>
          {showLogout && <button className="icon-button logout-mobile" type="button" aria-label="Disconnetti" onClick={onSignOut}><LogOut size={17} aria-hidden="true"/></button>}
          {showRefresh && <button className="icon-button" type="button" aria-label={refreshing ? 'Aggiornamento in corso' : 'Aggiorna'}
            onClick={onRefresh} disabled={refreshing}><RefreshCw size={17} className={refreshing ? 'spin' : ''} aria-hidden="true"/></button>}
        </div>
      </header>
      {children}
    </main>
    <nav className="v4-bottom-navigation" aria-label="Navigazione mobile">
      {primaryItems.map(item => renderItem(item))}
      {secondaryItems.length > 0 && <>
        <button ref={mobileMoreButtonRef} type="button" className={`v4-mobile-more${mobileMenuOpen || secondaryItems.some(item => item.id === active) ? ' active' : ''}`} aria-expanded={mobileMenuOpen}
          aria-controls="v4-mobile-secondary-navigation" aria-label={mobileMenuOpen ? 'Chiudi altre sezioni' : 'Apri altre sezioni'}
          aria-current={secondaryItems.some(item => item.id === active) ? 'page' : undefined}
          onClick={() => setMobileMenuOpen(open => !open)}>
          {mobileMenuOpen ? <X size={20} aria-hidden="true"/> : <MoreHorizontal size={20} aria-hidden="true"/>}<span>Altro</span>
        </button>
        {mobileMenuOpen && <>
          <button className="v4-mobile-menu-backdrop" type="button" aria-label="Chiudi menu sezioni" onClick={() => { setMobileMenuOpen(false); mobileMoreButtonRef.current?.focus(); }}/>
          <div ref={mobileMenuRef} id="v4-mobile-secondary-navigation" className="v4-mobile-secondary-menu" role="dialog" aria-modal="true" aria-label="Altre sezioni">
            {secondaryItems.map(item => renderItem(item, true))}
          </div>
        </>}
      </>}
    </nav>
  </div>;
}
