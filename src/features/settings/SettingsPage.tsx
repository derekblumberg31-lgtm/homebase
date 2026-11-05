import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '../../app/areas';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { Member, ThemePreference } from '../../data/types';
import { FormGroup, Segmented, Switch, TextField } from '../../ui/controls';
import { Group, Page, Row, Section } from '../../ui/layout';
import { Confirm, Sheet, useToast } from '../../ui/overlays';
import { ImportButton } from './ImportButton';
import { downloadBackup } from './importing';
import { downloadCalendar } from '../../lib/calendar';
import { formatRelativeTime } from '../../lib/dates';

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function SettingsPage() {
  const store = useStore();
  const data = useData();
  const toast = useToast();
  const navigate = useNavigate();
  const [memberSheet, setMemberSheet] = useState<Member | 'new' | null>(null);
  const [eraseOpen, setEraseOpen] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const notificationsSupported = typeof Notification !== 'undefined';
  const household = data.household;
  const storage = useStorageStatus();
  // Links like /settings#data (from Home's backup reminder) land on that section.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }), 50);
  }, []);
  const openTasks = data.tasks.filter((t) => t.status === 'open');

  async function toggleReminders(next: boolean) {
    if (!next) {
      await store.updateSettings({ reminders: false });
      return;
    }
    if (!notificationsSupported) {
      toast('This browser can’t show reminders. Due tasks still appear on Home.', { tone: 'error' });
      return;
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission === 'granted') {
      await store.updateSettings({ reminders: true });
      toast('Reminders on');
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
              onChange={(theme) => store.updateSettings({ theme })}
              options={[
                { value: 'system', label: 'Match device' },
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
                <span className="row-title">Notify me while Homebase is open</span>
                <span className="row-sub">{notificationsSupported ? 'Once a day: what’s due, overdue or ending soon' : 'Not available in this browser'}</span>
              </span>
              <Switch checked={data.settings.reminders} onChange={toggleReminders} label="Notify me while Homebase is open" />
            </div>
            <Row
              title="Add all tasks to my calendar"
              sub={openTasks.length ? `Downloads a calendar file with ${openTasks.length} open ${openTasks.length === 1 ? 'task' : 'tasks'}. Open it to add them to Apple, Google or Outlook Calendar.` : 'Add a task first'}
              tone="action"
              wrap
              onClick={openTasks.length ? () => { downloadCalendar(openTasks); toast('Calendar file saved. Open it to import.'); } : undefined}
            />
          </Group>
          <p className="section-foot">Calendar entries don’t update themselves. After you change a lot of dates, export again and remove the old ones.</p>
        </div>
      </Section>

      <Section title="Integrations" foot="There are no connected services. Homebase works fully on its own and doesn’t connect to smart-home devices or accounts.">
        <Group>
          <Row title="Connected services" value="None" />
        </Group>
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
            <div>
              <dt>Browser storage</dt>
              <dd>{storage}</dd>
            </div>
          </dl>
        </div>
        <div className="section">
          <Group>
            <Row
              title="Save a backup"
              sub={data.settings.lastBackupAt ? `Last saved ${formatRelativeTime(data.settings.lastBackupAt)} on this device` : 'Never saved from this device. One file includes attachments.'}
              tone="action"
              wrap
              onClick={() => downloadBackup(store).then(() => toast('Backup saved. Keep it somewhere safe, like iCloud Drive or Google Drive.'))}
            />
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
            <Switch checked={data.settings.keyDebug} onChange={(keyDebug) => store.updateSettings({ keyDebug })} label="Key photo debug view" />
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
        <Confirm
          title="Erase everything?"
          message="Every task, item, key, record and file on this device will be removed. Save a backup first if you might want them back."
          confirmLabel="Erase"
          destructive
          onCancel={() => setEraseOpen(false)}
          onConfirm={async () => {
            await store.eraseAll();
            setEraseOpen(false);
            navigate('/welcome', { replace: true });
          }}
        />
      )}

      {installOpen && (
        <Sheet title="Add to Home Screen" onClose={() => setInstallOpen(false)}>
          <p className="muted">Homebase then opens like an app and works without internet.</p>
          <div className="section">
            <Group>
              <Row title="On iPhone or iPad" sub="Open in Safari, tap Share, then Add to Home Screen" />
              <Row title="On Android" sub="Open the browser menu and choose Install app" />
              <Row title="On a computer" sub="Use the install button in the address bar" />
            </Group>
          </div>
        </Sheet>
      )}
    </Page>
  );
}

function MemberSheet({ member, onClose, onSave, onRemove }: { member: Member | null; onClose: () => void; onSave: (m: Member) => void; onRemove: (m: Member) => void }) {
  const [name, setName] = useState(member?.name ?? '');
  const [error, setError] = useState('');
  const isOwner = member?.role === 'owner';
  return (
    <Sheet
      title={member ? 'Household member' : 'Add someone'}
      onClose={onClose}
      trailing={
        <button
          type="button"
          className="sheet-action is-strong"
          onClick={() => {
            if (!name.trim()) return setError('Add a name.');
            onSave({ id: member?.id ?? uid(), name: name.trim(), role: member?.role ?? 'member' });
          }}
        >
          Save
        </button>
      }
    >
      <FormGroup>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={error} autoFocus />
      </FormGroup>
      {member && !isOwner && (
        <div className="button-stack">
          <button type="button" className="button is-danger-quiet" onClick={() => onRemove(member)}>
            Remove from household
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Whether the browser has agreed to keep Homebase's storage instead of clearing it under pressure. */
function useStorageStatus() {
  const [status, setStatus] = useState('Checking…');
  useEffect(() => {
    let live = true;
    (async () => {
      const storage = navigator.storage;
      if (!storage?.persisted) return live && setStatus('This browser doesn’t say whether it might clear Homebase’s storage. Keep a recent backup.');
      let persisted = await storage.persisted();
      // Asking is harmless: the browser decides, often silently.
      if (!persisted && storage.persist) persisted = await storage.persist().catch(() => false);
      const estimate = await storage.estimate?.().catch(() => undefined);
      const used = estimate?.usage ? ` Using about ${Math.max(1, Math.round(estimate.usage / 1024 / 1024))} MB.` : '';
      if (live)
        setStatus(
          persisted
            ? `Protected: the browser won’t clear it to free up space.${used}`
            : `Not protected: the browser may clear it if the device runs low on space, or after weeks without a visit (Safari).${used} Keep a recent backup.`,
        );
    })().catch(() => live && setStatus('Couldn’t check. Keep a recent backup.'));
    return () => {
      live = false;
    };
  }, []);
  return status;
}
