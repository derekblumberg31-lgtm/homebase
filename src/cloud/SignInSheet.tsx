import { useState, type FormEvent } from 'react';
import { readDeviceEnv } from '../lib/dataSafety';
import { FormGroup, TextField } from '../ui/controls';
import { Sheet } from '../ui/overlays';
import type { CloudApi } from './cloudContext';
import { GoogleMark } from './GoogleMark';
import { GOOGLE_FALLBACK_LINE, googleAvailable } from './platform';

export const SEND_FAILED = 'Couldn’t send the code. Check the address and your connection.';
export const CODE_FAILED = 'That code didn’t work. Check it, or send a new one.';
const GOOGLE_FAILED = 'Couldn’t reach Google. Try again, or use an email code.';

type CloudSignIn = Pick<CloudApi, 'sendCode' | 'verifyCode' | 'signInWithGoogle'>;

/** Email by 6-digit code (it works in the installed iPhone app, where a link would open Safari instead), or Google. */
export function SignInSheet({ cloud, onClose, showGoogle = googleAvailable(readDeviceEnv()) }: { cloud: CloudSignIn; onClose: () => void; showGoogle?: boolean }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const address = email.trim();
    if (!address || busy) return;
    setBusy(true);
    setError('');
    try {
      await cloud.sendCode(address);
      setSentTo(address);
      setCode('');
    } catch {
      setError(SEND_FAILED);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!sentTo || !code.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      await cloud.verifyCode(sentTo, code);
      onClose();
    } catch {
      setError(CODE_FAILED);
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError('');
    try {
      await cloud.signInWithGoogle();
    } catch {
      setError(GOOGLE_FAILED);
      setBusy(false);
    }
  }

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void (sentTo ? verify() : send());
  };

  return (
    <Sheet
      title="Sign in"
      onClose={onClose}
      trailing={
        <button type="button" className="sheet-action is-strong" aria-disabled={busy || undefined} aria-busy={busy || undefined} onClick={() => void (sentTo ? verify() : send())}>
          {sentTo ? 'Sign in' : 'Send code'}
        </button>
      }
    >
      <p className="sheet-lead">Your home is copied to your account after you sign in. You can delete that copy at any time.</p>
      <form onSubmit={submit} noValidate>
        {sentTo ? (
          <>
            <p className="sheet-subhead" role="status">
              Enter the 6-digit code sent to {sentTo}
            </p>
            <FormGroup>
              <TextField label="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} error={error} autoFocus />
            </FormGroup>
            <div className="button-stack">
              <button type="button" className="button is-quiet is-block" onClick={() => void send()} disabled={busy}>
                Send a new code
              </button>
            </div>
          </>
        ) : (
          <FormGroup>
            <TextField label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" error={error} autoFocus />
          </FormGroup>
        )}
        {/* Enter submits from the field even though the visible action sits in the sheet bar. */}
        <button type="submit" hidden />
      </form>
      {!sentTo &&
        (showGoogle ? (
          <div className="button-stack">
            <button type="button" className="button is-secondary is-block" onClick={() => void google()} disabled={busy}>
              <GoogleMark />
              Continue with Google
            </button>
          </div>
        ) : (
          <p className="section-foot">{GOOGLE_FALLBACK_LINE}</p>
        ))}
    </Sheet>
  );
}
