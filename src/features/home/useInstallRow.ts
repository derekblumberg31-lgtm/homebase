import { useCallback, useMemo, useState } from 'react';
import { installMatters, readDeviceEnv } from '../../lib/dataSafety';
import { clearFlag, readFlag, writeFlag } from '../../lib/deviceFlags';

const KEY = 'homebase:install-row-dismissed';

/** The install row's state: whether it matters here (a Safari tab) and whether it was dismissed. Kept in React too. */
export function useInstallRow() {
  const matters = useMemo(() => installMatters(readDeviceEnv()), []);
  const [dismissed, setDismissed] = useState(() => readFlag(KEY) !== null);
  const dismiss = useCallback(() => {
    setDismissed(true);
    writeFlag(KEY, new Date().toISOString());
  }, []);
  const restore = useCallback(() => {
    setDismissed(false);
    clearFlag(KEY);
  }, []);
  return { matters, dismissed, dismiss, restore };
}
