import { useMemo } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useData, useNow } from '../data/DataProvider';
import { getTaskInfo } from '../features/tasks/taskMath';
import { AREAS, PRODUCT } from './areas';

/** Sidebar on tablet and desktop, tab bar on phones; the page renders in between. */
export function AppShell() {
  const { tasks } = useData();
  const now = useNow();
  const overdue = useMemo(
    () => tasks.filter((task) => task.status === 'open' && getTaskInfo(task, now).status === 'overdue').length,
    [tasks, now],
  );

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <img src="/icons/icon-192.png" alt="" />
          <div>
            <div className="brand-name">{PRODUCT.name}</div>
            <div className="brand-tagline">{PRODUCT.tagline}</div>
          </div>
        </div>
        {AREAS.filter((area) => area.id !== 'settings').map(({ id, label, path, icon: Icon }) => (
          <NavLink key={id} to={path} className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}>
            <Icon size={19} />
            {label}
            {id === 'tasks' && overdue > 0 && (
              <span className="side-count" aria-label={`${overdue} overdue`}>
                {overdue}
              </span>
            )}
          </NavLink>
        ))}
        <div className="side-spacer" />
        {AREAS.filter((area) => area.id === 'settings').map(({ id, label, path, icon: Icon }) => (
          <NavLink key={id} to={path} className={({ isActive }) => `side-link ${isActive ? 'is-active' : ''}`}>
            <Icon size={19} />
            {label}
          </NavLink>
        ))}
      </nav>

      <main className="main" id="main" tabIndex={-1}>
        <Outlet />
      </main>

      <nav className="tab-bar" aria-label="Main">
        {AREAS.filter((area) => area.inTabBar).map(({ id, label, path, icon: Icon }) => (
          <NavLink
            key={id}
            to={path}
            className={({ isActive }) => `tab-item ${isActive ? 'is-active' : ''}`}
            aria-label={id === 'tasks' && overdue > 0 ? `${label}, ${overdue} overdue` : undefined}
          >
            <Icon size={23} />
            {id === 'tasks' && overdue > 0 && <span className="tab-dot" aria-hidden="true" />}
            {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
