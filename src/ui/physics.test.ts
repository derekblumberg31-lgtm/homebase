import { describe, expect, it } from 'vitest';
import { project, rubberband, velocityTracker } from './physics';

describe('gesture physics', () => {
  it('projects momentum forward the way scrolling decelerates', () => {
    expect(project(0)).toBe(0);
    expect(project(1000)).toBeCloseTo(99, 0);
    expect(project(-500)).toBeCloseTo(-49.5, 1);
  });

  it('resists more the further past an edge you drag', () => {
    const near = rubberband(20, 88);
    const far = rubberband(200, 88);
    expect(near).toBeLessThan(20);
    expect(far).toBeLessThan(88 * 0.55 + 1);
    expect(far / 200).toBeLessThan(near / 20);
    expect(rubberband(-40, 300)).toBeLessThan(0);
  });

  it('measures release velocity over the last few moves', () => {
    const t = velocityTracker(100);
    t.add(0, 0);
    t.add(10, 20);
    t.add(40, 50);
    expect(t.velocity()).toBeCloseTo(800, 0);
    t.reset();
    expect(t.velocity()).toBe(0);
  });
});
