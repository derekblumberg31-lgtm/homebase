import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../ui/overlays';
import { useCloud } from './cloudContext';

export const SIGN_IN_FAILED_MESSAGE = 'We couldn’t finish signing you in. You’re still signed out, and your home is unchanged. Try again from Settings.';

/**
 * Coming back from Google, whatever address the browser returned to, the person ends on Settings: signed in
 * with the account section showing it (and the choice sheet opening by itself when one is needed), or signed
 * out with a message saying why. Runs once per page load. Renders nothing, and does nothing in a build with no project.
 */
export function SignInLanding() {
  const cloud = useCloud();
  const navigate = useNavigate();
  const toast = useToast();
  const outcome = cloud?.signInReturn ?? null;
  const handled = useRef(false);
  useEffect(() => {
    if (!outcome || handled.current) return;
    handled.current = true;
    navigate('/settings', { replace: true });
    if (outcome === 'failed') toast(SIGN_IN_FAILED_MESSAGE, { tone: 'error' });
  }, [outcome, navigate, toast]);
  return null;
}
