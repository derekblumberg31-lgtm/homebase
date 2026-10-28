import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { Search, X } from './Icons';

interface FieldShellProps {
  label: string;
  optional?: boolean;
  error?: string;
  hint?: ReactNode;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}

function FieldShell({ label, optional, error, hint, children }: FieldShellProps) {
  const id = useId();
  const noteId = `${id}-note`;
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label}
        {optional && <span className="field-optional">Optional</span>}
      </label>
      {children(id, error || hint ? noteId : undefined)}
      {error ? (
        <p className="field-error" id={noteId}>
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint" id={noteId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type Common = { label: string; optional?: boolean; error?: string; hint?: ReactNode };

export function TextField({ label, optional, error, hint, prefix, suffix, ...rest }: Common & InputHTMLAttributes<HTMLInputElement> & { prefix?: string; suffix?: string }) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {(id, describedBy) =>
        prefix || suffix ? (
          <span className="input-affix">
            {prefix && <span>{prefix}</span>}
            <input id={id} className="input" aria-invalid={Boolean(error)} aria-describedby={describedBy} {...rest} />
            {suffix && <span>{suffix}</span>}
          </span>
        ) : (
          <input id={id} className="input" aria-invalid={Boolean(error)} aria-describedby={describedBy} {...rest} />
        )
      }
    </FieldShell>
  );
}

export function TextArea({ label, optional, error, hint, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {(id, describedBy) => <textarea id={id} className="input" aria-describedby={describedBy} {...rest} />}
    </FieldShell>
  );
}

export function SelectField({ label, optional, error, hint, children, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <FieldShell label={label} optional={optional} error={error} hint={hint}>
      {(id, describedBy) => (
        <select id={id} className="input" aria-describedby={describedBy} {...rest}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}

export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <div className="search-field">
      <Search size={17} />
      <input type="search" aria-label={label} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

export function FormGroup({ children }: { children: ReactNode }) {
  return <div className="form-group">{children}</div>;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Chips<T extends string | number>({ value, options, onChange, label }: { value: T | undefined; options: { value: T; label: string }[]; onChange: (value: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={String(option.value)} type="button" className="chip" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}
