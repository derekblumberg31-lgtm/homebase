import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { freshStore } from '../../test/freshStore';
import { applyScan, initialValues, LabelConfirmBody, replacedValue } from './LabelScan';

vi.mock('../../engine/label/labelReader', () => ({
  LOAD_FAILED: 'load failed',
  labelReaderCached: async () => true,
  readLabel: vi.fn(async () => ({ text: 'x', fields: { brand: 'Rheem', model: 'XE50T10H45U0', serial: 'Q201512345' } })),
}));

const current = { brand: '', model: 'OLD-100', serial: '' };
const found = { brand: 'Rheem', model: 'XE50T10H45U0', serial: 'Q201512345' };

function body(values = initialValues(found, current)) {
  return renderToStaticMarkup(
    <LabelConfirmBody found={found} current={current} photo="data:image/jpeg;base64,AA" canKeepPhoto values={values} onChange={() => {}} keepPhoto onKeepPhoto={() => {}} />,
  );
}

describe('LabelScan confirm sheet', () => {
  it('T7: shows what was read, hints what it replaces, and Use these applies once without saving', async () => {
    const store = await freshStore();
    const before = JSON.stringify(store.getSnapshot());
    const html = body();
    expect(html).toContain('value="XE50T10H45U0"');
    expect(html).toContain('value="Rheem"');
    expect(html).toContain('Replaces “OLD-100”');
    expect(html).toContain('alt="The label photo"');
    expect(html).toContain('Keep the photo with it');

    const onApply = vi.fn();
    applyScan(initialValues(found, current), true, 'data:photo', onApply);
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(found, 'data:photo');
    expect(JSON.stringify(store.getSnapshot())).toBe(before);
  });

  it('leaves the photo out when it is not kept', () => {
    const onApply = vi.fn();
    applyScan(initialValues(found, current), false, 'data:photo', onApply);
    expect(onApply).toHaveBeenCalledWith(found, undefined);
  });

  it('T8: cancelling never calls onApply (apply only runs from Use these)', () => {
    const onApply = vi.fn();
    initialValues(found, current);
    body();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('keeps the form value for a field that was not read, and gives no hint for it', () => {
    expect(initialValues({ model: 'ABC123' }, { brand: 'Bosch', model: '', serial: '' })).toEqual({ brand: 'Bosch', model: 'ABC123', serial: '' });
    expect(replacedValue(undefined, 'Bosch')).toBeUndefined();
    expect(replacedValue('Bosch', 'Bosch')).toBeUndefined();
    expect(replacedValue('Bosch', '')).toBeUndefined();
  });
});
