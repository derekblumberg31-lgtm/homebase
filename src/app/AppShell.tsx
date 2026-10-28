import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useData, useNow } from '../data/DataProvider';
import { EXPIRY_WARNING_DAYS } from '../features/records/labels';
import { getTaskInfo } from '../features/tasks/taskMath';
import { addDays, toDateInput } from '../lib/dates';
import { AREAS, PRODUCT, type Area } from './areas';
import { AssistantLauncher } from './AssistantLauncher';
import { QuickAdd } from './QuickAdd';

interface Badge {
  count: number;
  tone: 'overdue' | 'soon';
  label: string;
}

/** Overdue tasks on Tasks, warranties ending soon on Records. Nothing else gets a badge. */
function useBadges(): Partial<Record<Area['id'], Badge>> {
  const { tasks, records } = useData();
  const now = useNow();
  return useMemo(() => {
    const overdue = tasks.filter((t) => t.status === 'open' && getTaskInfo(t, now).status === 'overdue').length;
    const today = toDateInput(new Date(now));
    const soon = toDateInput(addDays(new Date(now), EXPIRY_WARNING_DAYS));
    const ending = records.filter((r) => r.expiresAt && r.expiresAt >= today && r.expiresAt <= soon).length;
    return {
      ...(overdue ? { tasks: { count: overdue, tone: 'overdue', label: `${overdue} overdue` } } : {}),
      ...(ending ? { records: { count: ending, tone: 'soon', label: `${ending} ending soon` } } : {}),
    };
  }, [tasks, records, now]);
}

/**
 * The frame around every screen. Phones: a bottom tab bar. Tablets (768px+): a slim icon rail.
 * Desktops (1100px+): the full sidebar. Settings sits apart at the bottom of both.
 */
export function AppShell() {
  const badges = useBadges();
  const main = AREAS.filter((a) => a.id !== 'settings');
  const settings = AREAS.find((a) => a.id === 'settings')!;

  const link = ({ id, label, path, icon: Icon }: Area) => {
    const badge = badges[id];
    return (
      <NavLink key={id} to={path} className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`} aria-label={badge ? `${label}, ${badge.label}` : undefined}>
        <span className="side-icon">
          <Icon size={20} />
          {badge && <span className={`side-dot is-${badge.tone}`} aria-hidden="true" />}
        </span>
        <span className="side-label">{label}</span>
        {badge && (
          <span className={`side-count is-${badge.tone}`} aria-hidden="true">
            {badge.count}
          </span>
        )}
      </NavLink>
    );
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}icons/icon-192.png`} alt="" />
          <div className="brand-text">
            <div className="brand-name">{PRODUCT.name}</div>
            <div className="brand-tagline">{PRODUCT.tagline}</div>
          </div>
        </div>
        <div className="side-add">
          <QuickAdd />
        </div>
        <div className="side-links">{main.map(link)}</div>
        <div className="side-spacer" />
        <div className="side-foot">{link(settings)}</div>
      </nav>

      <main className="main" id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <AssistantLauncher />

      <nav className="tab-bar" aria-label="Main">
        {AREAS.filter((area) => area.inTabBar).map(({ id, label, path, icon: Icon }) => {
          const badge = badges[id];
          return (
            <NavLink key={id} to={path} className={({ isActive }) => `tab-item ${isActive ? 'is-active' : ''}`} aria-label={badge ? `${label}, ${badge.label}` : undefined}>
              <span className="tab-icon">
                <Icon size={22} />
                {badge && (
                  <span className={`tab-badge is-${badge.tone}`} aria-hidden="true">
                    {badge.count > 9 ? '9+' : badge.count}
                  </span>
                )}
              </span>
              <span>{label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}
