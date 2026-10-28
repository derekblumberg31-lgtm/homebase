import { useEffect, useRef, type PointerEvent } from 'react';
import type { Candidate, Overlay } from '../../../engine/keys/engine';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DrawOptions {
  candidates?: Candidate[];
  overlay?: Overlay;
  box?: Box | null;
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** Draws a key photo with KeyFinder's overlays: candidate outlines, head/blade regions, a drag box. */
function drawPhoto(canvas: HTMLCanvasElement, photo: HTMLCanvasElement, o: DrawOptions) {
  const k = Math.min(1, 1000 / photo.width);
  canvas.width = Math.round(photo.width * k);
  canvas.height = Math.round(photo.height * k);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  const lw = Math.max(2, canvas.width / 300);
  const accent = css('--accent') || '#a8503c';
  const poly = (pts: [number, number][], stroke: string, dash?: number[], fill?: string) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * k, y * k) : ctx.moveTo(x * k, y * k)));
    ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.setLineDash(dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const label = (text: string, x: number, y: number) => {
    ctx.font = `600 ${Math.round(canvas.width / 34)}px -apple-system, system-ui, sans-serif`;
    const w = ctx.measureText(text).width + 14;
    const h = Math.round(canvas.width / 24);
    ctx.fillStyle = 'rgba(28,26,24,.72)';
    ctx.beginPath();
    ctx.roundRect(x - 2, y - h + 4, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 5, y - h / 2 + 4);
  };
  o.candidates?.forEach((c, i) => {
    const pts: [number, number][] = [];
    const step = Math.max(2, Math.floor(c.pts.length / 2 / 300) * 2);
    for (let j = 0; j < c.pts.length; j += step) pts.push([c.pts[j], c.pts[j + 1]]);
    poly(pts, '#ffffff', undefined, 'rgba(255,255,255,.22)');
    label(String(i + 1), c.bbox[0] * k, Math.max(c.bbox[1] * k, canvas.width / 24));
  });
  if (o.overlay) {
    const ov = o.overlay;
    poly(ov.blade, 'rgba(255,255,255,.9)', [8, 6], 'rgba(255,255,255,.08)');
    poly(ov.head, 'rgba(255,255,255,.9)', [8, 6], 'rgba(255,255,255,.08)');
    poly(ov.outline, accent);
    const topOf = (pts: [number, number][]) => Math.min(...pts.map((p) => p[1]));
    const leftOf = (pts: [number, number][]) => Math.min(...pts.map((p) => p[0]));
    label('Head · stamp', Math.max(4, leftOf(ov.head) * k), Math.max(canvas.width / 24, topOf(ov.head) * k - 4));
    label('Blade · cuts', Math.max(4, leftOf(ov.blade) * k), Math.min(canvas.height - 4, Math.max(...ov.blade.map((p) => p[1])) * k + canvas.width / 24 + 4));
  }
  if (o.box) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = '#fff';
    ctx.setLineDash([10, 7]);
    ctx.strokeRect(o.box.x * k, o.box.y * k, o.box.w * k, o.box.h * k);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    ctx.fillRect(o.box.x * k, o.box.y * k, o.box.w * k, o.box.h * k);
  }
}

function pointInPoly(x: number, y: number, pts: number[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 2; i < pts.length; j = i, i += 2) {
    const xi = pts[i];
    const yi = pts[i + 1];
    const xj = pts[j];
    const yj = pts[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

interface PhotoCanvasProps {
  photo: HTMLCanvasElement;
  candidates?: Candidate[];
  overlay?: Overlay;
  busy?: boolean;
  /** When set, the photo is interactive: tap a candidate or drag a box around the key. */
  onPick?: (selection: { candidate?: Candidate; box?: Box } | null) => void;
  label: string;
}

export function PhotoCanvas({ photo, candidates, overlay, busy = false, onPick, label }: PhotoCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const box = useRef<Box | null>(null);

  useEffect(() => {
    if (ref.current) drawPhoto(ref.current, photo, { candidates, overlay });
  }, [photo, candidates, overlay]);

  const toPhoto = (event: PointerEvent<HTMLCanvasElement>) => {
    const r = event.currentTarget.getBoundingClientRect();
    return { x: ((event.clientX - r.left) / r.width) * photo.width, y: ((event.clientY - r.top) / r.height) * photo.height };
  };

  const handlers = onPick
    ? {
        onPointerDown: (event: PointerEvent<HTMLCanvasElement>) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          start.current = toPhoto(event);
          box.current = null;
        },
        onPointerMove: (event: PointerEvent<HTMLCanvasElement>) => {
          if (!start.current) return;
          const p = toPhoto(event);
          if (Math.hypot(p.x - start.current.x, p.y - start.current.y) < photo.width * 0.02 && !box.current) return;
          box.current = { x: Math.min(start.current.x, p.x), y: Math.min(start.current.y, p.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) };
          if (ref.current) drawPhoto(ref.current, photo, { candidates, box: box.current });
        },
        onPointerUp: (event: PointerEvent<HTMLCanvasElement>) => {
          if (!start.current) return;
          const p = toPhoto(event);
          const b = box.current;
          start.current = null;
          box.current = null;
          if (b && b.w > photo.width * 0.08 && b.h > photo.height * 0.04) return onPick({ box: b });
          const hit = candidates?.find((c) => pointInPoly(p.x, p.y, c.pts));
          if (hit) return onPick({ candidate: hit });
          if (ref.current) drawPhoto(ref.current, photo, { candidates });
          onPick(null);
        },
      }
    : {};

  return (
    <div className={`key-photo ${busy ? 'is-busy' : ''} ${onPick ? 'is-interactive' : ''}`}>
      <canvas ref={ref} role="img" aria-label={label} {...handlers} />
    </div>
  );
}
