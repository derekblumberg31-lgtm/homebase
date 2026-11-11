import { useData } from '../../data/DataProvider';
import { entryCount } from '../../lib/dataSafety';
import { Download } from '../../ui/Icons';
import { Group, Row, Section } from '../../ui/layout';
import { Sheet } from '../../ui/overlays';
import { useSaveBackup } from './useSaveBackup';

/** How to add Homebase to the Home Screen, and how a backup carries data across. */
export function InstallSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const { save, busy, dialog } = useSaveBackup();
  return (
    <>
      <Sheet title="Add to Home Screen" onClose={onClose}>
        <p className="muted">
          Homebase then opens like an app and works without internet. In a Safari tab, Safari can clear a website’s data after a week without a visit. Apps on the Home Screen aren’t on that 7-day clock.
        </p>
        <div className="section">
          <Group>
            <Row title="On iPhone or iPad" sub="Open in Safari, tap Share, then Add to Home Screen" wrap />
            <Row title="On a Mac in Safari" sub="Choose File, then Add to Dock" wrap />
            <Row title="On Android" sub="Open the browser menu and choose Install app" wrap />
            <Row title="On a computer" sub="Use the install button in the address bar" wrap />
          </Group>
        </div>
        {entryCount(data) > 0 && (
          <Section title="Already added things here?" foot="The Home Screen app may open empty. Save a backup here first, then open the app and choose Restore your backup.">
            <Group>
              <Row title={busy ? 'Saving…' : 'Save a backup'} tone="action" lead={<Download size={18} />} onClick={() => void save()} />
            </Group>
          </Section>
        )}
      </Sheet>
      {dialog}
    </>
  );
}
