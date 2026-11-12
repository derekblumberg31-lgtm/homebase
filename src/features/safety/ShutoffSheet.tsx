import { useEffect, useRef, useState } from 'react';
import { useData, useStore } from '../../data/DataProvider';
import type { StoredFile } from '../../data/types';
import { photoForStorage } from '../../lib/images';
import { TextArea } from '../../ui/controls';
import { Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';
import { STARTER_STEPS, type StarterStepId } from '../home/starter';
import { saveLocation } from '../home/starterActions';
import { SHUTOFFS, shutoffLocation, shutoffRecord } from './safety';

const MAX_FILE = 15 * 1024 * 1024;

/** A saved photo, read from the files store. */
export function PhotoThumb({ fileId, alt, size = 56 }: { fileId: string; alt: string; size?: number }) {
  const store = useStore();
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    let made = '';
    void store.getFile(fileId).then((file: StoredFile | undefined) => {
      if (!live || !file) return;
      made = URL.createObjectURL(file.data);
      setUrl(made);
    });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [fileId, store]);
  return url ? <img className="safety-thumb" src={url} alt={alt} width={size} height={size} /> : <span className="safety-thumb" style={{ width: size, height: size }} aria-hidden="true" />;
}

/** Where a shutoff or the panel is: a short note, tips for finding it, and photos. Saved as a note in Records. */
export function ShutoffSheet({ id, onClose }: { id: StarterStepId; onClose: () => void }) {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const picker = useRef<HTMLInputElement>(null);
  const def = STARTER_STEPS.find((s) => s.id === id);
  const label = SHUTOFFS.find((s) => s.id === id)?.label ?? def?.title ?? '';
  const record = shutoffRecord(data, id);
  const [where, setWhere] = useState(shutoffLocation(data, id) ?? '');
  const [kept, setKept] = useState<string[]>(record?.fileIds ?? []);
  const [added, setAdded] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  if (def?.action.type !== 'locate') return null;
  const action = def.action;

  async function attach(list: FileList | null) {
    if (!list) return;
    for (const file of [...list]) {
      if (file.size > MAX_FILE) {
        toast(`${file.name} is over 15 MB. Try a smaller photo.`, { tone: 'error' });
        continue;
      }
      try {
        const stored = await store.saveFile(await photoForStorage(file));
        setAdded((a) => [...a, stored.id]);
      } catch {
        toast('That photo couldn’t be saved. The device may be out of space.', { tone: 'error' });
      }
    }
  }

  async function removeAdded(fileId: string) {
    await store.removeFile(fileId);
    setAdded((a) => a.filter((x) => x !== fileId));
  }

  async function cancel() {
    // Photos picked for a save that never happened shouldn't linger.
    for (const fileId of added) await store.removeFile(fileId);
    onClose();
  }

  async function save() {
    if (!where.trim()) return setError('Say where it is, even roughly. You can change it later.');
    setSaving(true);
    try {
      const fileIds = [...kept, ...added];
      const removed = (record?.fileIds ?? []).filter((fileId) => !kept.includes(fileId));
      const undo = await saveLocation(store, id, where.trim(), { fileIds });
      // A removed photo is deleted for good, so there is nothing for Undo to bring back.
      for (const fileId of removed) await store.removeFile(fileId);
      onClose();
      toast('Saved. The Assistant will show it when you need it.', removed.length ? undefined : { action: { label: 'Undo', run: () => void undo() } });
    } catch {
      setError('That wasn’t saved. Try again.');
      setSaving(false);
    }
  }

  const alt = `Photo of the ${label.toLowerCase()}`;
  const photos = [...kept, ...added];
  return (
    <Sheet
      title={label}
      onClose={cancel}
      leading={
        <button type="button" className="sheet-action" onClick={cancel}>
          Cancel
        </button>
      }
      trailing={
        <button type="button" className="sheet-action is-strong" onClick={save} disabled={saving}>
          Save
        </button>
      }
    >
      <h3 className="sheet-subhead">Where to look</h3>
      <ul className="plain-list">
        {action.tips.map((tip) => (
          <li key={tip}>{tip}</li>
        ))}
      </ul>
      <div className="form-group">
        <TextArea label={action.prompt} value={where} onChange={(e) => setWhere(e.target.value)} placeholder={action.placeholder} rows={3} error={error} />
      </div>
      <Section title="Photo">
        {photos.length > 0 && (
          <ul className="safety-photos">
            {photos.map((fileId) => (
              <li key={fileId}>
                <PhotoThumb fileId={fileId} alt={alt} />
                <button
                  type="button"
                  className="text-button"
                  onClick={() => (added.includes(fileId) ? void removeAdded(fileId) : setKept((k) => k.filter((x) => x !== fileId)))}
                >
                  Remove photo
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="button-stack">
          <button type="button" className="button is-secondary is-block" onClick={() => picker.current?.click()}>
            Add a photo
          </button>
        </div>
        <input
          ref={picker}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void attach(e.target.files);
            e.target.value = '';
          }}
        />
      </Section>
      <p className="section-foot">Saved as a note in Records, with the photo, so it’s in your backup.</p>
    </Sheet>
  );
}
