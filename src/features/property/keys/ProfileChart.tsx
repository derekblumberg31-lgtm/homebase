import { useEffect, useRef } from 'react';

export interface ProfileSeries {
  data?: number[];
  color: string;
  width?: number;
  dash?: number[];
}

const css = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** A key's cut profile: each line is one photo; lower means a deeper cut. Ported from KeyFinder. */
export function ProfileChart({ series, highlightAt = null, label }: { series: ProfileSeries[]; highlightAt?: number | null; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 320;
    const h = canvas.clientHeight || 150;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    ctx.fillStyle = css('--surface-2');
    ctx.fillRect(0, 0, w, h);
    const pad = 18;
    const maxD = 0.8;
    const X = (i: number, n: number) => pad + (i / (n - 1)) * (w - 2 * pad);
    const Y = (v: number) => pad + (Math.min(v, maxD) / maxD) * (h - 2 * pad);
    ctx.strokeStyle = css('--line');
    ctx.lineWidth = 1;
    for (let d = 0; d <= maxD + 1e-9; d += 0.2) {
      ctx.beginPath();
      ctx.moveTo(pad, Y(d));
      ctx.lineTo(w - pad, Y(d));
      ctx.stroke();
    }
    ctx.fillStyle = css('--text-2');
    ctx.font = '12px -apple-system, system-ui, sans-serif';
    ctx.fillText('shoulder', pad, h - 4);
    ctx.fillText('tip', w - pad - 16, h - 4);
    ctx.fillText('deeper cuts lower', pad, 13);
    const first = series[0]?.data;
    if (highlightAt != null && first) {
      const n = first.length;
      const half = n * 0.03;
      const x0 = X(Math.max(0, highlightAt - half), n);
      const x1 = X(Math.min(n - 1, highlightAt + half), n);
      ctx.fillStyle = css('--accent-soft');
      ctx.fillRect(x0, pad - 6, x1 - x0, h - 2 * pad + 12);
    }
    for (const s of series) {
      if (!s.data) continue;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width ?? 2.2;
      ctx.setLineDash(s.dash ?? []);
      ctx.beginPath();
      s.data.forEach((v, i) => (i ? ctx.lineTo(X(i, s.data!.length), Y(v)) : ctx.moveTo(X(i, s.data!.length), Y(v))));
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }, [series, highlightAt]);

  return <canvas ref={ref} className="profile-chart" role="img" aria-label={label} />;
}

export const chartColor = css;
