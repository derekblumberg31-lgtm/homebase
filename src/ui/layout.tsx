import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft, ChevronRight, CircleCheck, Info, User } from './Icons';

interface PageProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
  wide?: boolean;
  /** Top-level areas show a profile button that opens Settings on phones (the sidebar has it otherwise). */
  profile?: boolean;
  children: ReactNode;
}

/** Every screen's frame: an optional back link, a large title, actions on the right. */
export function Page({ title, subtitle, actions, back, wide = false, profile = false, children }: PageProps) {
  if (profile) {
    actions = (
      <>
        {actions}
        <Link className="round-button profile-button" to="/settings" aria-label="Settings">
          <User size={19} />
        </Link>
      </>
    );
  }
  return (
    <div className={`page ${wide ? 'is-wide' : ''}`}>
      {back && (
        <Link className="back-link" to={back.to}>
          <ArrowLeft size={17} />
          {back.label}
        </Link>
      )}
      <header className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          {subtitle && <p className="page-sub">{subtitle}</p>}
        </div>
        {actions && <div className="page-actions">{actions}</div>}
      </header>
      {children}
    </div>
  );
}

interface SectionProps {
  title?: string;
  aside?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function Section({ title, aside, foot, children, id }: SectionProps) {
  return (
    <section className="section" aria-label={title} id={id}>
      {(title || aside) && (
        <div className="section-head">
          {title && <h2 className="section-title">{title}</h2>}
          {aside && <span className="section-aside">{aside}</span>}
        </div>
      )}
      {children}
      {foot && <p className="section-foot">{foot}</p>}
    </section>
  );
}

export function Group({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="group" role={label ? 'list' : undefined} aria-label={label}>
      {children}
    </div>
  );
}

interface RowProps {
  title: ReactNode;
  sub?: ReactNode;
  value?: ReactNode;
  lead?: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: 'action' | 'danger';
  chevron?: boolean;
  label?: string;
  /** Let the title and subtitle wrap instead of truncating. */
  wrap?: boolean;
}

/** One line in a grouped list: a link, a button, or a plain read-only row. */
export function Row({ title, sub, value, lead, to, onClick, tone, chevron, label, wrap = false }: RowProps) {
  const className = `row ${tone === 'action' ? 'is-action' : tone === 'danger' ? 'is-danger' : ''}`;
  const showChevron = chevron ?? Boolean(to);
  const body = (
    <>
      {lead && <span className="row-lead">{lead}</span>}
      <span className="row-main">
        <span className={`row-title ${wrap ? 'is-wrap' : ''}`}>{title}</span>
        {sub && <span className={`row-sub ${wrap ? 'is-wrap' : ''}`}>{sub}</span>}
      </span>
      {value !== undefined && <span className="row-value">{value}</span>}
      {showChevron && <ChevronRight size={17} className="row-chevron" />}
    </>
  );
  if (to) {
    return (
      <Link className={className} to={to} aria-label={label}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} aria-label={label}>
        {body}
      </button>
    );
  }
  return <div className={className}>{body}</div>;
}

interface EmptyStateProps {
  title: string;
  body: string;
  action?: { label: string; onClick?: () => void; to?: string };
  secondary?: { label: string; onClick?: () => void; to?: string };
  inline?: boolean;
}

export function EmptyState({ title, body, action, secondary, inline = false }: EmptyStateProps) {
  const renderAction = (item: NonNullable<EmptyStateProps['action']>, primary: boolean) =>
    item.to ? (
      <Link className={`button is-block ${primary ? 'is-primary' : 'is-quiet'}`} to={item.to}>
        {item.label}
      </Link>
    ) : (
      <button type="button" className={`button is-block ${primary ? 'is-primary' : 'is-quiet'}`} onClick={item.onClick}>
        {item.label}
      </button>
    );
  return (
    <div className={`empty ${inline ? 'is-inline' : ''}`}>
      <h2>{title}</h2>
      <p>{body}</p>
      {(action || secondary) && (
        <div className="button-stack">
          {action && renderAction(action, true)}
          {secondary && renderAction(secondary, false)}
        </div>
      )}
    </div>
  );
}

export function Skeleton({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div className="skeleton-row" key={i} />
      ))}
    </div>
  );
}

export function Notice({ tone = 'warn', children }: { tone?: 'warn' | 'error' | 'good'; children: ReactNode }) {
  const Icon = tone === 'good' ? CircleCheck : tone === 'error' ? AlertTriangle : Info;
  return (
    <div className={`notice ${tone === 'error' ? 'is-error' : tone === 'good' ? 'is-good' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      <Icon size={18} className="notice-icon" />
      <div>{children}</div>
    </div>
  );
}
