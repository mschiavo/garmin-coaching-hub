import { Activity, BarChart3, CalendarDays, Gauge, HeartPulse, LayoutDashboard, Moon, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import type { ActivityRow, DailyRow, Period } from '../../analytics/dates';
import type { LoadPoint } from '../../charts';
import { DataState } from './DataState';
import { AppShell } from './AppShell';
import { DashboardHome } from './DashboardHome';
import { GoalCenterPreview, PerformanceLabPreview, WeeklyProgressPreview } from './AdvancedVisualizations';

const period: Period = { start: '2025-01-06', end: '2025-01-12' };
const activities: ActivityRow[] = [
  { id: 'demo-1', date: '2025-01-12', type: 'running', name: 'Corsa progressiva', distance_m: 10400, duration_s: 3330, average_hr: 148 },
  { id: 'demo-2', date: '2025-01-10', type: 'running', name: 'Corsa facile', distance_m: 7200, duration_s: 2520, average_hr: 137 },
  { id: 'demo-3', date: '2025-01-08', type: 'trail_running', name: 'Trail collinare', distance_m: 12600, duration_s: 4680, average_hr: 154 },
  { id: 'demo-4', date: '2025-01-06', type: 'running', name: 'Rigenerante', distance_m: 6100, duration_s: 2280, average_hr: 132 },
];
const daily: DailyRow[] = [
  [6, 52, 7.3, 51, 24], [7, 55, 7.8, 50, 21], [8, 49, 6.9, 52, 29],
  [9, 57, 8.1, 49, 19], [10, 54, 7.6, 50, 23], [11, 58, 8.2, 48, 17], [12, 56, 7.9, 49, 20],
].map(([day, hrv, sleep, resting, stress]) => ({ date: `2025-01-${String(day).padStart(2, '0')}`, hrv, sleep_h: sleep, resting_hr: resting, stress, bb_charged: null, bb_drained: null, steps: null }));
const weeklyLoad: LoadPoint[] = [
  { week: '2024-12-16', label: '16 dic', km: 24.8, runs: 3, hours: 2.9, partial: false, distanceCount: 3, durationCount: 3, baselineKm: null, ratio: null, deltaPct: null },
  { week: '2024-12-23', label: '23 dic', km: 31.2, runs: 4, hours: 3.7, partial: false, distanceCount: 4, durationCount: 4, baselineKm: null, ratio: null, deltaPct: null },
  { week: '2024-12-30', label: '30 dic', km: 27.6, runs: 3, hours: 3.3, partial: false, distanceCount: 3, durationCount: 3, baselineKm: null, ratio: null, deltaPct: null },
  { week: '2025-01-06', label: '06 gen', km: 36.3, runs: 4, hours: 3.6, partial: false, distanceCount: 4, durationCount: 4, baselineKm: null, ratio: null, deltaPct: null },
];
const items = [
  { id: 'home', label: 'Dashboard', icon: LayoutDashboard }, { id: 'planning', label: 'Planning', icon: CalendarDays, preview: true },
  { id: 'performance', label: 'Performance', icon: Gauge, preview: true }, { id: 'recovery', label: 'Recovery', icon: HeartPulse, preview: true },
  { id: 'goals', label: 'Obiettivi', icon: Target, preview: true },
  { id: 'goal-center', label: 'Goal Center', icon: Target, preview: true },
  { id: 'weekly-progress', label: 'Progresso settimanale', icon: BarChart3, preview: true },
  { id: 'performance-lab', label: 'Performance Lab', icon: TrendingUp, preview: true },
  { id: 'activities', label: 'Attività', icon: Activity },
  { id: 'load', label: 'Training Load', icon: BarChart3 }, { id: 'sleep', label: 'Sonno', icon: Moon },
];

export function DashboardPreview() {
  const [active, setActive] = useState('home');
  return <AppShell sectionTitle="Dashboard" items={items} active={active} onNavigate={setActive}
    onSignOut={() => undefined} status="DATI DEMO" statusKind="demo" showRefresh={false} showLogout={false} refreshing={false}
    onRefresh={() => undefined} headerContent={<div className="v4-preview-header"><span className="v4-preview-eyebrow">GARMIN COACHING HUB · V4</span><h1>{active === 'home' ? 'Dashboard' : items.find(item => item.id === active)?.label}</h1>{active === 'home' && <small>Allenamento, performance e recupero · tutti i valori sono sintetici · preview offline</small>}</div>}
    headerControls={<><span className="v4-preview-period">6–12 gen 2025</span><span className="v4-athlete-badge"><span>AD</span><b>Atleta demo</b></span></>}
    footerContent={<div className="v4-preview-footer">PREVIEW LOCALE <span>·</span> OFFLINE</div>}>
    <div className="v4-preview-content">
    {active === 'home' ? <DashboardHome activities={activities} daily={daily} weeklyLoad={weeklyLoad} period={period}
      coverageKind="available" coverageMessage="Fixture sintetica completa per il periodo visualizzato." isDayCovered={() => true}
      updatedAt="2025-01-12T18:30:00.000Z" source="Fixture sintetica" goal={{ actual: 36.3, target: 42, unit: 'km', label: 'Volume settimanale', period: 'Obiettivo demo · 6–12 gen' }} demo/>
      : active === 'goal-center' ? <GoalCenterPreview/>
      : active === 'weekly-progress' ? <WeeklyProgressPreview/>
      : active === 'performance-lab' ? <PerformanceLabPreview/>
      : <section className="v4-preview-placeholder"><DataState kind="empty" title={`${items.find(item => item.id === active)?.label} · anteprima`}>Sezione dimostrativa non collegata a servizi o account. Le serie sintetiche sono disponibili nelle sezioni Goal Center, Progresso settimanale e Performance Lab.</DataState><button type="button" onClick={() => setActive('home')}>Torna alla Home</button></section>}
    </div>
  </AppShell>;
}
