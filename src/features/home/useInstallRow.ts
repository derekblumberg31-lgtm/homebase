import { useCallback, useMemo, useState } from 'react';
import { installMatters, readDeviceEnv } from '../../lib/dataSafety';
import { clearFlag, readFlag, writeFlag } from '../../lib/deviceFlags';

const KEY = 'homebase:install-row-dismissed';

/**
 * The "add to Home Screen" row's state: whether this is a place where it matters (a Safari tab),
 * and whether this device has dismissed it for good. State lives in React too, so the row goes at
 * once even when the browser will not store the choice.
 */
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
