import { describe, expect, it } from 'vitest';
import type { HomeSystem, Item, ServiceEvent, Task } from '../../data/types';
import { NOT_LINKED, spentBySystem, spentByYear } from './spent';

const event = (over: Partial<ServiceEvent>): ServiceEvent => ({ id: Math.random().toString(), date: '2026-03-01', title: 'Job', createdAt: '', ...over });
const system = (id: string, name: string) => ({ id, name, kind: 'heating', createdAt: '', updatedAt: '' }) as HomeSystem;
const task = (over: Partial<Task>) => ({ id: 't1', name: 'Task', kind: 'maintenance', status: 'open', ...over }) as Task;

describe('spentByYear', () => {
  it('T1: ignores events without a cost and counts them as unpriced, newest year first', () => {
    const rows = spentByYear([event({ cost: 100 }), event({ cost: 40.5 }), event({}), event({ date: '2025-05-02', cost: 90 })]);
    expect(rows).toEqual([
      { year: '2026', total: 140.5, count: 2, unpriced: 1 },
      { year: '2025', total: 90, count: 1, unpriced: 0 },
    ]);
  });

  it('T5: a zero cost is a cost and leaves the total unchanged', () => {
    expect(spentByYear([event({ cost: 0 }), event({ cost: 80 })])).toEqual([{ year: '2026', total: 80, count: 2, unpriced: 0 }]);
  });
});

describe('spentBySystem', () => {
  const systems = [system('s1', 'Furnace'), system('s2', 'Water heater')];
  const items = [{ id: 'i1', name: 'Dishwasher', kind: 'appliance' } as Item, { id: 'k1', name: 'Front door key', kind: 'key' } as Item];

  it('T2: groups by the event system, then the task system, then the item, then not linked', () => {
    const rows = spentBySystem(
      [
        event({ systemId: 's1', cost: 100 }),
        event({ taskId: 't1', cost: 50 }),
        event({ itemId: 'i1', cost: 30 }),
        event({ cost: 20 }),
        event({ itemId: 'k1', cost: 5 }),
        event({ systemId: 'gone', cost: 10 }),
        event({ systemId: 's2' }),
      ],
      systems,
      items,
      [task({ systemId: 's1' })],
    );
    expect(rows.map((r) => [r.label, r.total])).toEqual([
      ['Furnace', 150],
      ['Dishwasher', 30],
      [NOT_LINKED, 25],
      ['Removed system', 10],
    ]);
    expect(rows[0].href).toBe('/property/systems/s1');
    expect(rows.find((r) => r.label === 'Removed system')?.href).toBeUndefined();
  });

  it('limits to a year when given one', () => {
    const rows = spentBySystem([event({ systemId: 's1', cost: 100 }), event({ systemId: 's1', date: '2025-01-01', cost: 7 })], systems, items, [], '2025');
    expect(rows).toEqual([{ key: 's:s1', label: 'Furnace', total: 7, count: 1, href: '/property/systems/s1' }]);
  });
});
