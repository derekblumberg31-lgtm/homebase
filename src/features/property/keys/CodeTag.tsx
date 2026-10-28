import { useEffect, useState } from 'react';
import { loadKeyways, type KeywayRow } from '../../../engine/keys/keyInfo';

/** The round tag from the hardware-store key wall: the code a clerk needs, or "?" until known. */
export function CodeTag({ code, large = false, match = false }: { code: string; large?: boolean; match?: boolean }) {
  const text = code || '?';
  const className = ['code-tag', large && 'is-large', text.length > 3 && 'is-wide', code ? 'is-known' : 'is-unknown', match && 'is-match']
    .filter(Boolean)
    .join(' ');
  return (
    <span className={className} aria-hidden="true">
      {text}
    </span>
  );
}

/** The keyway reference table, loaded once. */
export function useKeyways(): KeywayRow[] | null {
  const [rows, setRows] = useState<KeywayRow[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadKeyways().then((r) => live && setRows(r));
    return () => {
      live = false;
    };
  }, []);
  return rows;
}
