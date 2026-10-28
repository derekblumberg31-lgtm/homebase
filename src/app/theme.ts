import { useEffect, useState } from 'react';
import type { ThemePreference } from '../data/types';

const GROUND = { light: '#faf9f5', dark: '#262624' } as const;

function systemTheme(): 'light' | 'dark' {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Applies the theme to the page and browser chrome, following the system when asked to. */
export function useApplyTheme(preference: ThemePreference) {
  const [system, setSystem] = useState(systemTheme);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystem(event.matches ? 'dark' : 'light');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolved = preference === 'system' ? system : preference;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.style.colorScheme = resolved;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', GROUND[resolved]);
    try {
      localStorage.setItem('homebase:theme', preference);
    } catch {
      // The theme still applies for this visit.
    }
  }, [resolved, preference]);
}
