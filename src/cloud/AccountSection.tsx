import { useState } from 'react';
import { formatRelativeTime } from '../lib/dates';
import { Group, Row, Section } from '../ui/layout';
import { Confirm, useToast } from '../ui/overlays';
import { cloudConfig } from './config';
import { useCloud } from './cloudContext';
import { statusDetail, statusLabel } from './copy';
import { SignInSheet } from './SignInSheet';

export const SIGN_OUT_MESSAGE = 'Your home stays on this device. Changes made here won’t reach your account until you sign in again.';
export const DELETE_MESSAGE = 'This deletes your account and the copy of your home stored in it. Your home on this device isn’t touched. This can’t be undone.';

/** Settings › Account and sync. Renders nothing unless the build has a Supabase project. */
export function AccountSection() {
  const cloud = useCloud();
  const toast = useToast();
  const [signIn, setSignIn] = useState(false);
  const [confirm, setConfirm] = useState<'out' | 'delete' | null>(null);
  if (!cloud || !cloudConfig()) return null;

  if (cloud.phase !== 'signed-in' || !cloud.user) {
    return (
      <Section title="Account and sync" id="account">
        <Group>
          <Row
            title="Sign in to sync"
            sub={cloud.phase === 'loading' ? 'Checking your account…' : 'Optional. Keeps a copy of your home in your account, so you can use it on another device.'}
            onClick={() => setSignIn(true)}
            chevron
            wrap
          />
        </Group>
        <p className="section-foot">Without signing in, everything stays on this device, as it does now.</p>
        {signIn && <SignInSheet cloud={cloud} onClose={() => setSignIn(false)} />}
      </Section>
    );
  }

  const detail = statusDetail(cloud);
  const needsChoice = cloud.status === 'conflict' || cloud.status === 'needs-confirm' || cloud.status === 'cloud-reset';
  return (
    <Section title="Account and sync" id="account">
      <Group>
        <Row title="Signed in" value={cloud.user.email} />
        <Row title="Sync" sub={detail} value={statusLabel(cloud)} onClick={needsChoice ? cloud.openConflict : undefined} chevron={needsChoice} wrap />
        <Row title="Sync now" tone="action" onClick={cloud.syncNow} />
        <Row title="Calendar link" value={cloud.feed.phase === 'ready' ? 'Set up' : 'Not set up'} to="/settings/calendar#link" />
        <Row title="Sign out" onClick={() => setConfirm('out')} />
        <Row title="Delete my account and cloud copy" tone="danger" onClick={() => setConfirm('delete')} />
      </Group>
      {confirm === 'out' && (
        <Confirm
          title="Sign out?"
          message={SIGN_OUT_MESSAGE}
          confirmLabel="Sign out"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            try {
              await cloud.signOut();
            } catch {
              toast('That didn’t finish. Try again.', { tone: 'error' });
            }
          }}
        />
      )}
      {confirm === 'delete' && (
        <Confirm
          title="Delete your account?"
          message={DELETE_MESSAGE}
          confirmLabel="Delete"
          destructive
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            try {
              await cloud.deleteAccount();
              toast('Account deleted. Your home is still on this device.');
            } catch {
              toast('That didn’t finish. Try again.', { tone: 'error' });
            }
          }}
        />
      )}
    </Section>
  );
}

/** "Last synced", for Your data and privacy. Only while signed in. */
export function LastSyncedRow() {
  const cloud = useCloud();
  if (!cloud?.user) return null;
  return <Row title="Last synced" value={cloud.lastSyncedAt ? formatRelativeTime(cloud.lastSyncedAt) : 'Never'} />;
}
