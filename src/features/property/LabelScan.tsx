import { useEffect, useRef, useState } from 'react';
import { labelReaderCached, readLabel, type LabelReading } from '../../engine/label/labelReader';
import type { LabelFields } from '../../engine/label/parseLabel';
import { compressPhoto } from '../../lib/images';
import { FormGroup, Switch, TextField } from '../../ui/controls';
import { Section } from '../../ui/layout';
import { Sheet, useToast } from '../../ui/overlays';

export interface LabelValues {
  brand: string;
  model: string;
  serial: string;
}

const NOTHING_FOUND = 'Couldn’t read a model or serial number. Try again closer, with less glare, or type them in.';
const FIRST_USE = 'The first scan downloads the text reader (about 7 MB). After that it works offline.';

/** What the confirm sheet opens with: what was read, and the form's own value where nothing was read. */
export function initialValues(found: LabelFields, current: LabelValues): LabelValues {
  return { brand: found.brand ?? current.brand, model: found.model ?? current.model, serial: found.serial ?? current.serial };
}

/** The value a found field would replace, or undefined when it wouldn't replace anything. */
export function replacedValue(found: string | undefined, current: string): string | undefined {
  const old = current.trim();
  return found && old && old !== found ? old : undefined;
}

/** "Use these": hands the checked values to the form. It never saves anything itself. */
export function applyScan(values: LabelValues, keepPhoto: boolean, photo: string | undefined, onApply: (values: LabelValues, photo?: string) => void) {
  onApply({ brand: values.brand.trim(), model: values.model.trim(), serial: values.serial.trim() }, keepPhoto ? photo : undefined);
}

interface BodyProps {
  found: LabelFields;
  current: LabelValues;
  photo?: string;
  canKeepPhoto: boolean;
  values: LabelValues;
  onChange: (values: LabelValues) => void;
  keepPhoto: boolean;
  onKeepPhoto: (keep: boolean) => void;
}

/** The contents of the confirm sheet, apart from the sheet itself. */
export function LabelConfirmBody({ found, current, photo, canKeepPhoto, values, onChange, keepPhoto, onKeepPhoto }: BodyProps) {
  const hint = (key: keyof LabelValues) => {
    const old = replacedValue(found[key], current[key]);
    return old ? `Replaces “${old}”` : undefined;
  };
  return (
    <>
      <p className="sheet-lead">Check these against the label. Text read from a photo can be wrong.</p>
      {photo && <img className="label-scan-photo" src={photo} alt="The label photo" />}
      <FormGroup>
        <TextField label="Brand" value={values.brand} onChange={(e) => onChange({ ...values, brand: e.target.value })} hint={hint('brand')} />
        <TextField label="Model number" value={values.model} onChange={(e) => onChange({ ...values, model: e.target.value })} hint={hint('model')} />
        <TextField label="Serial number" value={values.serial} onChange={(e) => onChange({ ...values, serial: e.target.value })} hint={hint('serial')} />
      </FormGroup>
      {photo && canKeepPhoto && (
        <Section>
          <div className="group">
            <div className="row">
              <span className="row-main">
                <span className="row-title">Keep the photo with it</span>
              </span>
              <Switch checked={keepPhoto} onChange={onKeepPhoto} label="Keep the photo with it" />
            </div>
          </div>
        </Section>
      )}
    </>
  );
}

interface Props {
  current: LabelValues;
  onApply: (values: LabelValues, photo?: string) => void;
  /** False when the form already holds as many photos as it can. */
  canKeepPhoto?: boolean;
}

/** "Scan the label": reads brand, model and serial from a photo into a confirm sheet. Nothing is saved until the form's own Save. */
export function LabelScanButton({ current, onApply, canKeepPhoto = true }: Props) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [firstUse, setFirstUse] = useState(false);
  const [result, setResult] = useState<{ reading: LabelReading; photo?: string } | null>(null);
  const [values, setValues] = useState<LabelValues>(current);
  const [keepPhoto, setKeepPhoto] = useState(true);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  async function scan(file: File) {
    setBusy(true);
    setFirstUse(!(await labelReaderCached()));
    try {
      const reading = await readLabel(file);
      if (!live.current) return;
      if (!reading.fields.model && !reading.fields.serial) {
        toast(NOTHING_FOUND, { tone: 'error' });
        return;
      }
      const photo = await compressPhoto(file).catch(() => undefined);
      if (!live.current) return;
      setValues(initialValues(reading.fields, current));
      setKeepPhoto(true);
      setResult({ reading, photo });
    } catch (error) {
      if (live.current) toast(error instanceof Error && error.message ? error.message : NOTHING_FOUND, { tone: 'error' });
    } finally {
      if (live.current) {
        setBusy(false);
        setFirstUse(false);
      }
    }
  }

  return (
    <>
      <div className="button-stack">
        <button type="button" className="button is-secondary is-block" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
          {busy ? 'Reading the label…' : 'Scan the label'}
        </button>
        {busy && firstUse && (
          <p className="section-foot" aria-live="polite">
            {FIRST_USE}
          </p>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void scan(file);
        }}
      />
      {result && (
        <Sheet
          title="From the label"
          onClose={() => setResult(null)}
          leading={
            <button type="button" className="sheet-action" onClick={() => setResult(null)}>
              Cancel
            </button>
          }
          trailing={
            <button
              type="button"
              className="sheet-action is-strong"
              onClick={() => {
                applyScan(values, keepPhoto, result.photo, onApply);
                setResult(null);
              }}
            >
              Use these
            </button>
          }
        >
          <LabelConfirmBody found={result.reading.fields} current={current} photo={result.photo} canKeepPhoto={canKeepPhoto} values={values} onChange={setValues} keepPhoto={keepPhoto} onKeepPhoto={setKeepPhoto} />
        </Sheet>
      )}
    </>
  );
}
