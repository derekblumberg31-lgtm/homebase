import type { ReactNode } from 'react';
import { CodeTag } from './CodeTag';

/** Answers "what do I ask for at the counter?": the code tag, the maker, and how sure we are. */
export function ReplacementCard({
  code,
  name,
  line,
  source,
  sourceTone = 'warn',
  evidence,
  notes,
  verify,
  match = false,
  children,
}: {
  code: string;
  name: string;
  line?: string;
  source?: string;
  sourceTone?: 'good' | 'warn';
  evidence?: string;
  notes?: string;
  verify?: boolean;
  match?: boolean;
  children?: ReactNode;
}) {
  const meta = [source, evidence].filter(Boolean);
  return (
    <div className="group replacement">
      <div className="replacement-head">
        <CodeTag code={code} large match={match} />
        <div className="replacement-copy">
          <p className="replacement-name">{name}</p>
          <p className="row-sub">{line || 'Needs a clearer stamp, or your correction.'}</p>
        </div>
      </div>
      {meta.length > 0 && (
        <p className={`replacement-meta ${sourceTone === 'good' ? 'is-good' : ''}`}>{meta.join(' · ')}</p>
      )}
      {notes && <p className="replacement-note">{notes}</p>}
      {verify && <p className="replacement-note">Confirm the blank with the shop before ordering.</p>}
      {children}
    </div>
  );
}
