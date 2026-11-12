import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '../../app/areas';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Member, Settings, ThemePreference } from '../../data/types';
import { downloadCalendar } from '../../lib/calendar';
import { formatRelativeTime } from '../../lib/dates';
import { deviceLabel, installMatters, isStandalone, readDeviceEnv, storageCopy, storageCopyOptions, storageStatus } from '../../lib/dataSafety';
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

// Remembered between visits, so the Storage row is already filled in when Settings opens again.
let lastPersisted: boolean | 'unsupported' | null = null;

/**
 * The Storage line. Every line it can become is laid in the same cell, hidden, so the row is already as
 * tall as its tallest answer on the first paint and nothing below it moves when the browser replies.
 */
function StorageLine({ persisted, installMatters: matters }: { persisted: boolean | 'unsupported' | null; installMatters: boolean }) {
  const label = deviceLabel(readDeviceEnv());
  const shown = persisted === null ? null : storageCopy(storageStatus({ persisted, installMatters: matters }), label);
  return (
    <span className="storage-line">
      {storageCopyOptions(matters, label).map((text) => (
        <span key={text} className="storage-line-option" aria-hidden={text === shown ? undefined : true} data-shown={text === shown || undefined}>
          {text}
        </span>
      ))}
    </span>
  );
}

export function SettingsPage() {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const { save: saveBackup, busy: savingBackup, dialog: backupDialog } = useSaveBackup();
  const [persisted, setPersisted] = useState<boolean | 'unsupported' | null>(lastPersisted);
  const tabMatters = useMemo(() => installMatters(readDeviceEnv()), []);
  useEffect(() => {
    let live = true;
    void storagePersisted().then((value) => {
      lastPersisted = value;
      if (live) setPersisted(value);
    });
    return () => {
      live = false;
    };
  }, []);
  const notificationsSupported = typeof Notification !== 'undefined';
  const household = data.household;
  const openTasks = data.tasks.filter((t) => t.status === 'open');
  // Links like /settings#data (from Home's backup reminder) land on that section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, []);

  function exportCalendar() {
    try {
      downloadCalendar(openTasks);
      toast('Calendar file saved. Open it to import.');
    } catch {
      toast('The calendar file couldn’t be saved. Try again.', { tone: 'error' });
    }
  }

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
        <p className="section-foot">Everyone shares this device’s Homebase. There’s no syncing between devices; to move to a new one, save a backup here and restore it there.</p>
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
                { value: 'system', label: 'Automatic' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </div>
        </Group>
      </Section>

      <Section title="Reminders and notifications" id="reminders">
        <div className="callout">
          <p>
            <b>How reminders work.</b> Homebase has no server, so it can only notify you while it’s open in a browser tab or as an installed app. It checks once a day when you open it. It
            can’t send anything while it’s closed.
          </p>
          <p className="form-gap">For reminders you can count on, add your tasks to the calendar you already use. Recurring tasks repeat there too.</p>
        </div>
        <div className="section">
          <Group>
            <div className="row">
              <span className="row-main">
                <span className="row-title is-wrap">Notify me while Homebase is open</span>
                <span className="row-sub is-wrap">{notificationsSupported ? 'Once a day: what’s due, overdue or ending soon' : 'Not available in this browser'}</span>
              </span>
              <Switch checked={data.settings.reminders} onChange={toggleReminders} label="Notify me while Homebase is open" />
            </div>
            <Row
              title="Add all tasks to my calendar"
              sub={openTasks.length ? `Downloads a calendar file with ${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}. Open it to add them to Apple, Google or Outlook Calendar.` : 'Add a task first'}
              tone="action"
              wrap
              onClick={openTasks.length ? exportCalendar : undefined}
            />
          </Group>
          <p className="section-foot">Calendar entries don’t update themselves, and they won’t move when you mark a job done. After you change a lot of dates, export again and remove the old ones.</p>
        </div>
      </Section>

      <Section title="Your data and privacy" id="data">
        <div className="group">
          <dl className="privacy-list">
            <div>
              <dt>Stored on this device</dt>
              <dd>Everything you add: your home, tasks, systems, inventory, records, attached photos and PDFs, and activity. It lives in this browser’s storage for this site.</dd>
            </div>
            <div>
              <dt>What leaves the device</dt>
              <dd>Nothing, unless you save a backup or calendar file yourself. There’s no account, no sync and no analytics. The Assistant runs on the device; questions aren’t sent anywhere.</dd>
            </div>
            <div>
              <dt>If browser data is cleared</dt>
              <dd>
                Clearing this site’s data, uninstalling the app, or some private-browsing modes delete everything here. Your other devices don’t have a copy. A backup file is the only way to get it back.
              </dd>
            </div>
          </dl>
        </div>
        <div className="section">
          <Group>
            {/* The row is always there; its line fills in when the browser answers, so nothing below jumps. */}
            <Row title="Storage" sub={<StorageLine persisted={persisted} installMatters={tabMatters} />} wrap />
            <Row title="Last backup" value={data.settings.lastBackupAt ? formatRelativeTime(data.settings.lastBackupAt) : 'Never'} />
            <Row title={savingBackup ? 'Saving…' : 'Save a backup'} tone="action" onClick={() => void saveBackup()} />
            <ImportButton label="Restore from a backup" />
            <Row title="Erase everything on this device" tone="danger" onClick={() => setEraseOpen(true)} />
          </Group>
          <p className="section-foot">Restoring shows what’s in the file and what it will replace before anything changes.</p>
        </div>
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
            try {
              await store.eraseAll();
            } catch {
              // The dialog stays up so the choice is still there to make again.
              toast('That wasn’t erased. Try again.', { tone: 'error' });
              return;
            }
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
          aria-disabled={saver.saving || undefined}
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
          <button type="button" className="button is-danger-quiet" aria-disabled={saver.saving || undefined} aria-busy={(saver.saving && action === 'remove') || undefined} onClick={() => { setAction('remove'); void saver.run(() => Promise.resolve(onRemove(member))); }}>
            Remove from household
          </button>
        </div>
      )}
    </Sheet>
  );
}
