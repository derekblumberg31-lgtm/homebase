import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '../../app/areas';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Member, Settings, ThemePreference } from '../../data/types';
import { formatRelativeTime } from '../../lib/dates';
import { deviceLabel, installMatters, isStandalone, readDeviceEnv, storageCopy, storageStatus } from '../../lib/dataSafety';
import { clearHomeFlags } from '../../lib/deviceFlags';
import { storagePersisted } from '../../lib/storage';
import { FormGroup, Segmented, Switch, TextField } from '../../ui/controls';
import { Group, Page, Row, Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { SaveFailed, useSave } from '../../ui/save';
import { ConfirmWithBackup } from './ConfirmWithBackup';
import { ImportButton } from './ImportButton';
import { InstallSheet } from './InstallSheet';
import { useSaveBackup } from './useSaveBackup';

export function SettingsPage() {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const { save: saveBackup, busy: savingBackup, dialog: backupDialog } = useSaveBackup();
  const [persisted, setPersisted] = useState<boolean | 'unsupported' | null>(null);
  const tabMatters = useMemo(() => installMatters(readDeviceEnv()), []);
  useEffect(() => {
    let live = true;
    void storagePersisted().then((value) => live && setPersisted(value));
    return () => {
      live = false;
    };
  }, []);
  const notificationsSupported = typeof Notification !== 'undefined';
  const household = data.household;

  // Instant settings have no sheet to hold a notice, so a failed write is a toast. The control reads the stored value, so it stays put.
  async function saveSetting(patch: Partial<Settings>): Promise<boolean> {
    try {
      await store.updateSettings(patch);
      return true;
    } catch {
      toast('That setting wasn’t saved. Try again.', { tone: 'error' });
      return false;
    }
  }

  async function toggleReminders(next: boolean) {
    if (!next) {
      await saveSetting({ reminders: false });
      return;
    }
    if (!notificationsSupported) {
      toast('This browser can’t show reminders. Due tasks still appear on Home.', { tone: 'error' });
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') {
      if (await saveSetting({ reminders: true })) toast('Reminders on');
    } else {
      toast('Notifications are blocked for this site. Allow them in your browser settings.', { tone: 'error' });
    }
  }

  async function share() {
    const url = new URL('/', location.href).href;
    try {
      if (navigator.share) await navigator.share({ title: PRODUCT.name, text: PRODUCT.tagline, url });
      else {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      }
    } catch {
      // Closing the share sheet isn't an error.
    }
  }

  return (
    <Page title="Settings" back={{ to: '/home', label: 'Home' }}>
      <Section title="Household">
        <Group>
          {household?.members.map((member) => (
            <Row key={member.id} title={member.name} sub={member.role === 'owner' ? 'You' : 'Household member'} onClick={() => setMemberSheet(member)} chevron />
          ))}
          <Row title="Add someone" tone="action" onClick={() => setMemberSheet('new')} />
        </Group>
        <p className="section-foot">Everyone shares this device’s Homebase. Sharing across devices will come with sign-in.</p>
      </Section>

      <Section title="Property">
        <Group>
          <Row title={data.property?.nickname ?? 'My home'} sub={data.property?.address ?? 'Address, type, year built'} to="/property/details" />
        </Group>
      </Section>

      <Section title="Appearance">
        <Group>
          <div className="row is-stacked">
            <span className="row-title">Theme</span>
            <Segmented<ThemePreference>
              label="Theme"
              value={data.settings.theme}
              onChange={(theme) => void saveSetting({ theme })}
              options={[
                { value: 'system', label: 'Match device' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </Group>
      </Section>

      <Section title="Notifications" foot="Homebase checks once a day while it’s open and lets you know about due and overdue tasks.">
        <Group>
          <div className="row">
            <span className="row-main">
              <span className="row-title">Task reminders</span>
              <span className="row-sub">{notificationsSupported ? 'A notification when something is due' : 'Not available in this browser'}</span>
            </span>
            <Switch checked={data.settings.reminders} onChange={toggleReminders} label="Task reminders" />
          </div>
        </Group>
      </Section>

      <Section title="Integrations" foot="Smart-home, calendar and utility connections will appear here. Homebase works fully on its own.">
        <Group>
          <Row title="Connected services" value="None" />
        </Group>
      </Section>

      <Section title="Data and privacy" foot="Everything you add stays on this device. A backup file is the only copy that leaves it, and only when you save one. If this device is lost or its browser data is cleared, a backup is how you get your home back.">
        <Group>
          {persisted !== null && <Row title="Storage" sub={storageCopy(storageStatus({ persisted, installMatters: tabMatters }), deviceLabel(readDeviceEnv()))} wrap />}
          <Row title="Last backup" value={data.settings.lastBackupAt ? formatRelativeTime(data.settings.lastBackupAt) : 'Never'} />
          <Row title={savingBackup ? 'Saving…' : 'Save a backup'} tone="action" onClick={() => void saveBackup()} />
          <ImportButton label="Restore from a backup" />
          <Row title="Erase everything on this device" tone="danger" onClick={() => setEraseOpen(true)} />
        </Group>
      </Section>

      <Section title="App">
        <Group>
          {!isStandalone() && <Row title="Add Homebase to your Home Screen" onClick={() => setInstallOpen(true)} chevron />}
          <Row title="Share Homebase" onClick={share} chevron />
          <Row title="Version" value="1.0" />
        </Group>
      </Section>

      <Section title="Advanced">
        <Group>
          <div className="row">
            <span className="row-main">
              <span className="row-title">Key photo debug view</span>
              <span className="row-sub">Shows each step of key detection</span>
            </span>
            <Switch checked={data.settings.keyDebug} onChange={(keyDebug) => void saveSetting({ keyDebug })} label="Key photo debug view" />
          </div>
        </Group>
      </Section>

      <p className="local-note">
        {PRODUCT.name} · {PRODUCT.tagline}
      </p>

      {memberSheet && household && (
        <MemberSheet
          member={memberSheet === 'new' ? null : memberSheet}
          onClose={() => setMemberSheet(null)}
          onSave={async (member) => {
            const members = household.members.some((m) => m.id === member.id)
              ? household.members.map((m) => (m.id === member.id ? member : m))
              : [...household.members, member];
            await store.saveHousehold({ ...household, members });
            setMemberSheet(null);
          }}
          onRemove={async (member) => {
            await store.saveHousehold({ ...household, members: household.members.filter((m) => m.id !== member.id) });
            setMemberSheet(null);
          }}
        />
      )}

      {eraseOpen && (
        <ConfirmWithBackup
          verb="erase"
          title="Erase everything?"
          message="Every task, item, key, record and file on this device will be removed. Save a backup first if you might want them back later."
          confirmLabel="Erase"
          destructive
          onCancel={() => setEraseOpen(false)}
          onConfirm={async () => {
            await store.eraseAll();
            clearHomeFlags();
            setEraseOpen(false);
            navigate('/welcome', { replace: true });
          }}
        />
      )}

      {installOpen && <InstallSheet onClose={() => setInstallOpen(false)} />}
      {backupDialog}
    </Page>
  );
}

function MemberSheet({ member, onClose, onSave, onRemove }: { member: Member | null; onClose: () => void; onSave: (m: Member) => void | Promise<void>; onRemove: (m: Member) => void | Promise<void> }) {
  const [name, setName] = useState(member?.name ?? '');
  const [error, setError] = useState('');
  const saver = useSave();
  const [action, setAction] = useState<'save' | 'remove'>('save');
  const isOwner = member?.role === 'owner';
  return (
    <Sheet
      title={member ? 'Household member' : 'Add someone'}
      onClose={onClose}
      trailing={
        <button
          type="button"
          className="sheet-action is-strong"
          disabled={saver.saving}
          aria-busy={saver.saving || undefined}
          onClick={() => {
            if (!name.trim()) return setError('Add a name.');
            setAction('save');
            const next: Member = { id: member?.id ?? uid(), name: name.trim(), role: member?.role ?? 'member' };
            void saver.run(() => Promise.resolve(onSave(next)));
          }}
        >
          Save
        </button>
      }
    >
      <SaveFailed show={saver.failed && action === 'save'} />
      <SaveFailed show={saver.failed && action === 'remove'}>That person wasn’t removed. Try again.</SaveFailed>
      <FormGroup>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
      </FormGroup>
      {member && !isOwner && (
        <div className="button-stack">
          <button type="button" className="button is-danger-quiet" disabled={saver.saving} aria-busy={(saver.saving && action === 'remove') || undefined} onClick={() => { setAction('remove'); void saver.run(() => Promise.resolve(onRemove(member))); }}>
            Remove from household
          </button>
        </div>
      )}
    </Sheet>
  );
}
