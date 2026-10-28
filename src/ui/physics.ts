/**
 * Gesture physics, after Apple's "Designing Fluid Interfaces" (WWDC 2018): decide where a drag is
 * going from its release velocity, and resist progressively past an edge instead of stopping hard.
 */

/** How far momentum carries a release, in px. 0.998 feels like scrolling; 0.99 is snappier. */
export function project(velocity: number, decelerationRate = 0.99): number {
  return ((velocity / 1000) * decelerationRate) / (1 - decelerationRate);
}

/** Past a boundary, follow less and less the further the pointer goes. */
export function rubberband(overshoot: number, dimension: number, constant = 0.55): number {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

/** Keeps the last few pointer positions so the release velocity (px/s) is known. */
export function velocityTracker(windowMs = 90) {
  let samples: { v: number; t: number }[] = [];
  return {
    reset() {
      samples = [];
    },
    add(value: number, t = performance.now()) {
      samples.push({ v: value, t });
      while (samples.length > 2 && t - samples[0].t > windowMs) samples.shift();
    },
    velocity(): number {
      if (samples.length < 2) return 0;
      const first = samples[0];
      const last = samples[samples.length - 1];
      const dt = last.t - first.t;
      return dt > 0 ? ((last.v - first.v) / dt) * 1000 : 0;
    },
  };
}
