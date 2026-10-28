import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useData, useStore } from '../../../data/DataProvider';
import { uid } from '../../../data/ids';
import type { Item, KeyCapture } from '../../../data/types';
import {
  fileToCanvas,
  loadEngine,
  makeCapture,
  mergeIdent,
  scaledCanvas,
  TARGET_CAPTURES,
  toEngineKey,
  WORK_MAX,
  type Candidate,
  type Identification,
  type KeywayEntry,
  type MatchResult,
  type Profile,
} from '../../../engine/keys/engine';
import { keyCode, keyFlags, keyKind, keywayEntry, SOURCE_LABEL, whereToCut } from '../../../engine/keys/keyInfo';
import { FormGroup, TextArea, TextField } from '../../../ui/controls';
import { Camera } from '../../../ui/Icons';
import { Group, Notice, Page, Row, Section } from '../../../ui/layout';
import { useToast } from '../../../ui/overlays';
import { useKeyways } from './CodeTag';
import { KeyDetailsSheet, type KeyDetailsValue } from './KeyDetailsSheet';
import { KeyFlagNotices } from './KeyFlagNotices';
import { PhotoCanvas, type Box } from './PhotoCanvas';
import { chartColor, ProfileChart } from './ProfileChart';
import { ReplacementCard } from './ReplacementCard';

type Engine = Awaited<ReturnType<typeof loadEngine>>;

interface Scan {
  photo: HTMLCanvasElement;
  prof: Profile;
  capture: KeyCapture;
  match: { best: MatchResult | null; runnerUp: MatchResult | null };
  ident: Identification;
  ocrPending: boolean;
  choice: (Partial<KeywayEntry> & { flags?: { dnd?: boolean; transponder?: boolean } }) | null;
  forceNew: boolean;
}

type Screen =
  | { kind: 'idle' }
  | { kind: 'working'; photo: HTMLCanvasElement; text: string }
  | { kind: 'pick'; photo: HTMLCanvasElement; candidates: Candidate[]; message?: string }
  | { kind: 'problem'; photo: HTMLCanvasElement; prof: Profile }
  | { kind: 'result' }
  | { kind: 'enrolled'; itemId: string; captureId: string; n: number; agree: number; done: boolean; upgraded: boolean; warnings: string[] }
  | { kind: 'done'; title: string; text: string; next: string; keyId: string }
  | { kind: 'error'; message: string };

/** Identify a Key: photo in, "which key is this, and what blank do I ask for" out. */
export default function IdentifyKeyPage() {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const rows = useKeyways();
  const [params, setParams] = useSearchParams();
  const enrollId = params.get('enroll');
  const enrollItem = data.items.find((i) => i.id === enrollId && i.kind === 'key');

  const [engine, setEngine] = useState<Engine | null>(null);
  const [engineError, setEngineError] = useState('');
  const [screen, setScreen] = useState<Screen>({ kind: 'idle' });
  const [scan, setScan] = useState<Scan | null>(null);
  const [liveCamera, setLiveCamera] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [nameError, setNameError] = useState('');
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const ocrDone = useRef<Promise<void> | null>(null);
  /** The stamp reading finishes after the result shows; saving waits for it and reads it here. */
  const latestIdent = useRef<Identification | null>(null);
  const busy = useRef(false);
  const keys = useMemo(() => data.items.filter((i) => i.kind === 'key'), [data.items]);

  useEffect(() => {
    let live = true;
    loadEngine()
      .then((e) => {
        if (!live) return;
        setEngine(e);
        void e.Vision.init().catch((err: Error) => live && setEngineError(err.message));
        void e.OCR.init().catch(() => {});
      })
      .catch((err: Error) => live && setEngineError(err.message));
    return () => {
      live = false;
    };
  }, []);

  // Live camera preview on the idle screen; falls back to the phone's camera app.
  useEffect(() => {
    if (screen.kind !== 'idle') return;
    let cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setLiveCamera(false);
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        if (video.current) {
          video.current.srcObject = s;
          await video.current.play().catch(() => {});
        }
        setLiveCamera(true);
      } catch {
        setLiveCamera(false);
      }
    })();
    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [screen.kind]);

  const engineKeys = () => keys.map(toEngineKey);

  async function analyze(photo: HTMLCanvasElement, sel: { candidate?: Candidate; box?: Box } | null = null) {
    if (busy.current) return;
    busy.current = true;
    try {
      setScreen({ kind: 'working', photo, text: engine?.Vision.ready ? 'Finding the key…' : 'Loading the photo tools…' });
      const e = engine ?? (await loadEngine());
      await e.Vision.init();
      setScreen({ kind: 'working', photo, text: 'Finding the key…' });
      await new Promise((r) => setTimeout(r, 40));
      const prof = e.Vision.process(photo, sel);
      if (prof.needsPick) return setScreen({ kind: 'pick', photo, candidates: prof.candidates ?? [], message: prof.error });
      if (!prof.ok) return setScreen({ kind: 'problem', photo, prof });

      const known = engineKeys();
      const identify = (ocr: unknown) => e.Identify.suggest({ ocr, headShape: prof.headShape, ratio: prof.ratio, keys: known });
      const runOcr = async (onStep: (t: string) => void) => {
        try {
          return await e.OCR.read(prof.headCanvas, (m) => {
            if (m?.status && typeof m.progress === 'number' && m.progress < 1 && !/recogniz/.test(m.status)) onStep(`Preparing the text reader… ${Math.round(m.progress * 100)}%`);
          }, {
            alt: prof.headGrayCanvas,
            stopWhen: (res) => {
              const t = e.Identify.readText({ results: res });
              return t.codes.length > 0 || (t.brands.length > 0 && (res as unknown[]).length >= 4);
            },
          });
        } catch (err) {
          return { error: (err as Error).message, results: [] };
        }
      };

      if (enrollItem?.key) {
        setScreen({ kind: 'working', photo, text: 'Reading the stamp…' });
        const ocr = await runOcr((t) => setScreen({ kind: 'working', photo, text: t }));
        const ident = identify(ocr);
        const capture = makeCapture(photo, prof, ident);
        const agree = Math.max(0, ...enrollItem.key.captures.map((c) => e.Matcher.compare(capture, c).score));
        const withCapture: Item = { ...enrollItem, key: { ...enrollItem.key, captures: [...enrollItem.key.captures, capture] } };
        const { item: merged, upgraded } = mergeIdent(withCapture, ident, e.SOURCE_RANK);
        await store.put('items', { ...merged, updatedAt: new Date().toISOString() });
        const n = merged.key!.captures.length;
        const target = Number(params.get('target')) || TARGET_CAPTURES;
        setScreen({ kind: 'enrolled', itemId: merged.id, captureId: capture.id, n, agree, done: n >= target, upgraded, warnings: prof.warnings ?? [] });
        return;
      }

      const capture = makeCapture(photo, prof, identify(null));
      const match = e.Matcher.best(capture, known);
      const next: Scan = { photo, prof, capture, match, ident: identify(null), ocrPending: true, choice: null, forceNew: false };
      latestIdent.current = next.ident;
      setScan(next);
      setName('');
      setNotes('');
      setScreen({ kind: 'result' });
      ocrDone.current = (async () => {
        const ocr = await runOcr(() => {});
        const ident = identify(ocr);
        capture.ocrText = ident.text.bestText || '';
        capture.ocrTokens = ident.tokens;
        latestIdent.current = ident;
        setScan((s) => (s && s.capture === capture ? { ...s, ident, ocrPending: false } : s));
      })();
    } catch (err) {
      setScreen({ kind: 'error', message: (err as Error).message || 'Something went wrong reading that photo.' });
    } finally {
      busy.current = false;
    }
  }

  function capture() {
    const v = video.current;
    if (!v?.videoWidth) return;
    void analyze(scaledCanvas(v, WORK_MAX, v.videoWidth, v.videoHeight));
  }

  async function fromFile(file: File | undefined) {
    if (!file) return;
    try {
      void analyze(await fileToCanvas(file));
    } catch {
      toast('That photo couldn’t be opened. Try a JPEG or PNG.', { tone: 'error' });
    }
  }

  const best = scan?.match.best ?? null;
  const threshold = engine?.MATCH_THRESHOLD ?? 72;
  const possibleAt = engine?.POSSIBLE_THRESHOLD ?? 55;
  const hit = scan && !scan.forceNew && best && best.score >= threshold ? best : null;
  const maybe = scan && !scan.forceNew && !hit && best && best.score >= possibleAt ? best : null;
  const matchedItem = (m: MatchResult | null) => (m ? keys.find((k) => k.id === m.key.id) ?? null : null);

  async function saveNewKey() {
    if (!scan) return;
    if (!name.trim()) return setNameError('Give the key a name, like Front door.');
    await ocrDone.current;
    const current = scan;
    const ident = latestIdent.current ?? scan.ident;
    const p = current.choice ?? ident.primary ?? {};
    const now = new Date().toISOString();
    const item: Item = {
      id: uid(),
      kind: 'key',
      name: name.trim(),
      notes: notes.trim() || undefined,
      brand: p.brand || undefined,
      photos: [],
      key: {
        keyway: p.keyway || undefined,
        type: p.type || undefined,
        blank: p.blank || undefined,
        flags: { dnd: Boolean(current.choice?.flags?.dnd || ident.flags.dnd), transponder: Boolean(current.choice?.flags?.transponder || ident.flags.transponder) },
        idSource: current.choice ? 'user' : p.brand || p.keyway || p.type ? ident.source : 'unknown',
        ocrTokens: current.capture.ocrTokens ?? [],
        captures: [current.capture],
      },
      createdAt: now,
      updatedAt: now,
    };
    await store.put('items', item);
    await store.log('key-added', `Saved key: ${item.name}`, `/property/keys/${item.id}`);
    setParams({ enroll: item.id }, { replace: true });
    setScreen({
      kind: 'done',
      title: `Saved “${item.name}”`,
      text: `Add ${TARGET_CAPTURES - 1} more photos of the same key. Keep the phone roughly above it; you can move or turn the key between shots.`,
      next: 'Take photo 2',
      keyId: item.id,
    });
  }

  async function addToKey(m: MatchResult) {
    if (!scan || !engine) return;
    await ocrDone.current;
    const item = matchedItem(m);
    if (!item?.key) return;
    const withCapture: Item = { ...item, key: { ...item.key, captures: [...item.key.captures, scan.capture] } };
    let { item: merged, upgraded } = mergeIdent(withCapture, latestIdent.current ?? scan.ident, engine.SOURCE_RANK);
    if (scan.choice) {
      merged = { ...merged, brand: scan.choice.brand, key: { ...merged.key!, keyway: scan.choice.keyway, type: scan.choice.type, blank: scan.choice.blank, idSource: 'user' } };
    }
    await store.put('items', { ...merged, updatedAt: new Date().toISOString() });
    setScreen({
      kind: 'done',
      title: `Added to “${item.name}”`,
      text: `It now has ${merged.key!.captures.length} photos.${upgraded ? ' Brand details were updated from the stamp.' : ''}`,
      next: 'Identify another key',
      keyId: item.id,
    });
  }

  async function undoEnrolled(itemId: string, captureId: string) {
    const item = data.items.find((i) => i.id === itemId);
    if (!item?.key) return;
    await store.put('items', { ...item, key: { ...item.key, captures: item.key.captures.filter((c) => c.id !== captureId) } });
    setScreen({ kind: 'idle' });
  }

  function restart(keepEnroll = true) {
    if (!keepEnroll && enrollId) setParams({}, { replace: true });
    setScan(null);
    setScreen({ kind: 'idle' });
  }

  // ---------- screens ----------

  const back = { to: enrollItem ? `/property/keys/${enrollItem.id}` : '/property/keys', label: enrollItem ? enrollItem.name : 'Keys and Locks' };

  if (screen.kind === 'idle') {
    const enrollCount = enrollItem?.key?.captures.length ?? 0;
    return (
      <Page title="Identify a key" back={back}>
        {enrollItem && (
          <div className="section">
            <Notice tone="good">
              Adding photos to <b>{enrollItem.name}</b>: photo {enrollCount + 1}. Move or turn the key a little between shots.{' '}
              <button type="button" className="link-button" onClick={() => restart(false)}>
                Stop adding
              </button>
            </Notice>
          </div>
        )}
        {engineError && (
          <div className="section">
            <Notice tone="error">{engineError}</Notice>
          </div>
        )}
        <div className="section">
          <div className={`viewfinder ${liveCamera ? '' : 'is-hidden'}`}>
            <video ref={video} playsInline muted autoPlay />
            <p className="viewfinder-hint">Any plain surface works. Fit the whole key in view.</p>
          </div>
          {!liveCamera && (
            <div className="empty">
              <Camera size={32} className="muted" />
              <h2>Photograph the key</h2>
              <p>Lay it flat on a plain surface, hold the phone above it, and fit the whole key in view.</p>
            </div>
          )}
        </div>
        <div className="button-stack">
          {liveCamera ? (
            <button type="button" className="shutter" aria-label="Take photo" onClick={capture} disabled={!liveCamera}>
              <span />
            </button>
          ) : (
            <label className="button is-primary is-block">
              Take photo
              <input type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          )}
          <label className="button is-quiet">
            Choose from library
            <input type="file" accept="image/*" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <Section title="Tips for a good photo">
          <Group>
            <Row title="Plain, contrasting surface" sub="White paper isn’t required; avoid busy patterns." />
            <Row title="Whole key in view" sub="Nothing else touching it. Any direction works." />
            <Row title="From above, in even light" sub="Moderate angles are corrected. Avoid glare." />
            <Row title="Three photos per key" sub="Matching gets much more reliable." />
          </Group>
        </Section>
      </Page>
    );
  }

  if (screen.kind === 'working') {
    return (
      <Page title="Identify a key" back={back}>
        <div className="section">
          <PhotoCanvas photo={screen.photo} busy label="Your photo, being checked" />
          <p className="key-step" role="status">
            {screen.text}
          </p>
        </div>
      </Page>
    );
  }

  if (screen.kind === 'pick') {
    return (
      <Page title={screen.candidates.length > 1 ? 'Which one is the key?' : 'Help find the key'} back={back}>
        <p className="page-sub">
          {screen.message} {screen.candidates.length ? 'Tap the key, or drag a box around it.' : 'Drag a box around the key.'}
        </p>
        <div className="section">
          <PhotoCanvas
            photo={screen.photo}
            candidates={screen.candidates}
            label="Tap the key or drag a box around it"
            onPick={(selection) => (selection ? void analyze(screen.photo, selection) : toast(screen.candidates.length ? 'Tap inside an outline, or drag a box.' : 'Drag a box around the whole key.'))}
          />
        </div>
        <div className="button-stack">
          <button type="button" className="button is-secondary is-block" onClick={() => restart()}>
            Retake photo
          </button>
        </div>
      </Page>
    );
  }

  if (screen.kind === 'problem') {
    return (
      <Page title="Let’s try that again" back={back}>
        <p className="page-sub">{screen.prof.error}</p>
        <div className="section">
          <PhotoCanvas photo={screen.photo} label="Your photo" />
        </div>
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => restart()}>
            Retake photo
          </button>
          {screen.prof.canSelect && (
            <button type="button" className="button is-quiet" onClick={() => setScreen({ kind: 'pick', photo: screen.photo, candidates: [] })}>
              Select the key myself
            </button>
          )}
        </div>
      </Page>
    );
  }

  if (screen.kind === 'error') {
    return (
      <Page title="Something went wrong" back={back}>
        <div className="section">
          <Notice tone="error">{screen.message}</Notice>
        </div>
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => restart()}>
            Try again
          </button>
        </div>
      </Page>
    );
  }

  if (screen.kind === 'enrolled') {
    const item = data.items.find((i) => i.id === screen.itemId);
    const low = screen.agree < possibleAt;
    const mid = !low && screen.agree < threshold;
    return (
      <Page title={item?.name ?? 'Key'} back={back}>
        <StatusLine tone={low ? 'possible' : 'match'} text={`Photo ${screen.n} saved`} />
        <p className="page-sub">
          Agreement with earlier photos: {Math.round(screen.agree)}%.{screen.upgraded ? ' Brand details updated from the stamp.' : ''}
        </p>
        <div className="section stack-16">
          {low && <Notice>This photo doesn’t line up with the earlier ones. If the camera was at a steep angle or the key was partly out of view, remove it and retake it from above.</Notice>}
          {mid && <p className="muted">A little different from the earlier photos, which is normal at an angle. Keeping it helps Homebase recognize this key from more angles.</p>}
          {screen.warnings.map((w) => (
            <Notice key={w}>{w}</Notice>
          ))}
        </div>
        <div className="button-stack">
          {screen.done ? (
            <button type="button" className="button is-primary is-block" onClick={() => navigate(`/property/keys/${screen.itemId}`, { replace: true })}>
              Done
            </button>
          ) : (
            <button type="button" className="button is-primary is-block" onClick={() => restart()}>
              Take photo {screen.n + 1}
            </button>
          )}
          <button type="button" className="button is-quiet" onClick={() => undoEnrolled(screen.itemId, screen.captureId)}>
            Remove this photo and retake
          </button>
        </div>
      </Page>
    );
  }

  if (screen.kind === 'done') {
    const adding = screen.next.startsWith('Take photo');
    return (
      <Page title={screen.title} back={{ to: '/property/keys', label: 'Keys and Locks' }}>
        <StatusLine tone="match" text="Done" />
        <p className="page-sub">{screen.text}</p>
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => restart(adding)}>
            {screen.next}
          </button>
          <Link className="button is-quiet" to={`/property/keys/${screen.keyId}`}>
            Open the key
          </Link>
        </div>
      </Page>
    );
  }

  // ---------- result ----------
  if (!scan) return null;
  const shown = hit ?? maybe;
  const shownItem = matchedItem(shown);
  const ident = scan.ident;
  const choices = ident.primary ? [ident.primary, ...ident.alternatives] : ident.suggestions ?? [];
  const info = scan.choice ?? ident.primary;
  const alts = ident.source === 'text' ? [] : choices;
  const title = hit ? hit.key.label : maybe ? `Is this “${maybe.key.label}”?` : 'New key';
  const entry = shownItem ? keywayEntry(shownItem, rows) : null;
  const flags = shownItem ? keyFlags(shownItem, entry) : ident.flags;
  const m = scan.prof.metrics ?? {};
  const corrections = [m.rotated180 && 'Upside down, corrected', scan.prof.flippedOver && 'Flipped over, corrected', m.perspective && 'Angled photo, corrected'].filter(Boolean) as string[];
  const closeCall = hit && hit.cutDiff > (engine?.CLOSE_CALL_CUT ?? 0.035);

  const series = best
    ? [
        { data: best.capture.top, color: chartColor('--ink-x'), width: 3 },
        { data: best.parts && (best.parts.stretch !== 1 || best.parts.shift) && engine ? engine.Matcher.warp(scan.capture.top ?? [], { s: best.parts.stretch ?? 1, off: best.parts.shift ?? 0 }) : scan.capture.top, color: chartColor('--accent'), width: 2.2 },
      ]
    : [];

  return (
    <Page title={title} back={back}>
      <div className="section">
        <PhotoCanvas photo={scan.photo} overlay={scan.prof.overlay} label="Your photo with the key outlined" />
      </div>
      <div className="section">
        <StatusLine
          tone={hit ? 'match' : maybe ? 'possible' : keys.length ? 'none' : 'first'}
          text={hit ? 'Match' : maybe ? 'Possible match' : keys.length ? 'No match' : 'First key'}
          score={shown ? Math.round(shown.score) : undefined}
        />
        {hit && shownItem?.notes && <p className="page-sub">{shownItem.notes}</p>}
        {maybe && <p className="page-sub">It looks close, but {scan.prof.metrics?.perspective ? 'the camera angle' : 'the photo'} makes it hard to be sure. Confirm, or retake from directly above.</p>}
        {!hit && !maybe && best && <p className="page-sub">Closest saved key: “{best.key.label}” ({Math.round(best.score)}%)</p>}
        {corrections.length > 0 && <p className="meta-line">{corrections.join(' · ')}</p>}
      </div>

      <div className="section stack-16">
        {closeCall && <Notice><b>Close call.</b> One cut is a little off from the saved key. It may be a worn copy or a different key on the same blank. Try it in the lock to be sure.</Notice>}
        {(scan.prof.warnings ?? []).map((w) => <Notice key={w}>{w}</Notice>)}
        {scan.prof.needsBetter && (
          <div className="inline-actions">
            <button type="button" className="button is-quiet" onClick={() => restart()}>Retake photo</button>
            <button type="button" className="button is-quiet" onClick={() => setScreen({ kind: 'pick', photo: scan.photo, candidates: [] })}>Select the key again</button>
          </div>
        )}
      </div>

      <Section>
        {shownItem ? (
          <ReplacementCard
            code={keyCode(shownItem, entry)}
            name={shownItem.brand || keyKind(shownItem)}
            line={[shownItem.brand ? keyKind(shownItem) : null, entry?.alt].filter(Boolean).join(' · ')}
            source={shownItem.key?.idSource && shownItem.key.idSource !== 'unknown' ? SOURCE_LABEL[shownItem.key.idSource] : undefined}
            sourceTone={shownItem.key?.idSource === 'user' || shownItem.key?.idSource === 'text' ? 'good' : 'warn'}
            notes={entry?.notes}
            verify={entry?.verify}
            match={Boolean(hit)}
          >
            <p className="replacement-note">{whereToCut(shownItem.key?.type)}</p>
          </ReplacementCard>
        ) : scan.ocrPending && !scan.choice ? (
          <div className="group replacement">
            <p className="key-step" role="status">Reading the stamp on the head…</p>
          </div>
        ) : (
          <ReplacementCard
            code={info?.keyway || info?.blank || ''}
            name={info ? info.brand || (info.type ? `${info.type[0].toUpperCase()}${info.type.slice(1)} key` : 'Key') : 'Not identified'}
            line={info ? [info.brand && info.type ? `${info.type[0].toUpperCase()}${info.type.slice(1)} key` : null, info.blank && info.blank !== info.keyway ? `Blank ${info.blank}` : null, info.alt].filter(Boolean).join(' · ') : undefined}
            source={scan.choice ? SOURCE_LABEL.user : ident.source !== 'unknown' ? SOURCE_LABEL[ident.source] : undefined}
            sourceTone={scan.choice || ident.source === 'text' ? 'good' : 'warn'}
            evidence={[`${scan.prof.headShape} head`, `blade ${scan.prof.ratio.toFixed(1)}:1`, ident.tokens.length ? `stamp ${ident.tokens.join(' ')}` : 'no stamp read'].join(' · ')}
            notes={info?.notes}
          >
            {alts.length > 0 && (
              <>
                <p className="replacement-note">{ident.primary ? 'Not right? Choose the closest:' : 'Is it one of these?'}</p>
                <div className="chips" role="group" aria-label="Possible keyways">
                  {alts.map((c, i) => (
                    <button key={`${c.brand}-${c.keyway}-${i}`} type="button" className="chip" aria-pressed={Boolean(scan.choice && scan.choice.keyway === c.keyway && scan.choice.brand === c.brand)} onClick={() => setScan({ ...scan, choice: { brand: c.brand, keyway: c.keyway, type: c.type, blank: c.blank } })}>
                      {[c.brand, c.keyway].filter(Boolean).join(' ')}
                    </button>
                  ))}
                  <button type="button" className="chip" onClick={() => setDetailsOpen(true)}>Other…</button>
                </div>
              </>
            )}
            {alts.length === 0 && (
              <div className="chips">
                <button type="button" className="chip" onClick={() => setDetailsOpen(true)}>{info ? 'Not right? Enter details' : 'Enter brand and keyway'}</button>
              </div>
            )}
          </ReplacementCard>
        )}
      </Section>

      <KeyFlagNotices flags={flags} />

      {maybe && (
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => addToKey(maybe)}>Yes, it’s “{maybe.key.label}”</button>
          <button type="button" className="button is-secondary is-block" onClick={() => restart()}>Retake from directly above</button>
          <button type="button" className="button is-quiet" onClick={() => setScan({ ...scan, forceNew: true })}>No, it’s a different key</button>
          <p className="section-foot">Confirming saves this photo to the key, so it recognizes it from this angle next time.</p>
        </div>
      )}
      {hit && (
        <div className="button-stack">
          <button type="button" className="button is-primary is-block" onClick={() => addToKey(hit)}>Add this photo to “{hit.key.label}”</button>
          <p className="section-foot">Each photo you add makes matching for this key more precise.</p>
          <button type="button" className="button is-quiet" onClick={() => setScan({ ...scan, forceNew: true })}>This is a different key</button>
        </div>
      )}
      {!hit && !maybe && (
        <Section title="Save this key">
          <FormGroup>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Front door" error={nameError} autoComplete="off" />
            <TextArea label="What it opens" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Which lock, who has copies" />
          </FormGroup>
          <div className="button-stack">
            <button type="button" className="button is-primary is-block" onClick={saveNewKey}>Save key</button>
          </div>
        </Section>
      )}

      {best && (
        <Section title={`Compared with “${best.key.label}”`}>
          <div className="group chart-card">
            <div className="silhouettes">
              <figure>
                <img src={scan.capture.silhouette} alt="" />
                <figcaption>This photo</figcaption>
              </figure>
              {(best.capture.silhouette || best.key.captures[0]?.silhouette) && (
                <figure>
                  <img src={best.capture.silhouette || best.key.captures[0]?.silhouette} alt="" />
                  <figcaption>Saved key</figcaption>
                </figure>
              )}
            </div>
            <ProfileChart series={series} highlightAt={closeCall ? best.cutAt : null} label="Cut profile of this photo against the saved key" />
            <p className="section-foot">Each dip is a cut. Matching keys have dips in the same places at the same depths.</p>
          </div>
        </Section>
      )}
      {scan.match.runnerUp && <p className="local-note">Next closest: “{scan.match.runnerUp.key.label}” {Math.round(scan.match.runnerUp.score)}%</p>}

      <div className="button-stack">
        <button type="button" className="button is-quiet" onClick={() => restart(false)}>Identify another key</button>
      </div>

      {detailsOpen && (
        <KeyDetailsSheet
          title="Key details"
          withName={false}
          rows={rows}
          value={{ ...(scan.choice ?? ident.primary ?? {}), dnd: ident.flags.dnd, transponder: ident.flags.transponder }}
          onClose={() => setDetailsOpen(false)}
          onSave={(v: KeyDetailsValue) => {
            setScan({ ...scan, choice: { brand: v.brand, keyway: v.keyway, type: v.type, blank: v.blank, flags: { dnd: v.dnd, transponder: v.transponder } } });
            setDetailsOpen(false);
          }}
        />
      )}
    </Page>
  );
}

function StatusLine({ tone, text, score }: { tone: 'match' | 'possible' | 'none' | 'first'; text: string; score?: number }) {
  return (
    <div className={`status-line is-${tone}`}>
      <span>{text}</span>
      {score !== undefined && <b>{score}%</b>}
    </div>
  );
}
