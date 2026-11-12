import { isIOS, type DeviceEnv } from '../lib/dataSafety';

/**
 * Whether Google sign-in works in an installed iPhone app is untested: the Google page may open in a
 * separate browser context, and the sign-in then can't find its way back. Until it is tried on a real
 * iPhone, the button is hidden there and the email code is the way in. After testing, set this to false.
 */
export const HIDE_GOOGLE_IN_INSTALLED_IOS = true;

export function googleAvailable(env: DeviceEnv): boolean {
  return !(HIDE_GOOGLE_IN_INSTALLED_IOS && env.standalone && isIOS(env));
}

export const GOOGLE_FALLBACK_LINE = 'To use Google, open Homebase in Safari, or sign in with an email code.';
