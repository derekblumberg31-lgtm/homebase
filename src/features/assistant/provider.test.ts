import { describe, expect, it } from 'vitest';
import { emptyData } from '../../data/store';
import { LocalGuideProvider } from './provider';

const NOW = new Date('2026-10-27T19:00:00').getTime();
const ask = (question: string) => LocalGuideProvider.answer(question, emptyData(), NOW);

const LIFE_SAFETY = ['If you smell gas', 'If your carbon monoxide alarm is going off', 'Fire, smoke or sparks'];

describe('emergencies come first', () => {
  it.each([
    ['I smell gas', 'If you smell gas'],
    ['I smell gas, what should I do next?', 'If you smell gas'],
    ['I smell gas near the furnace, who should I call? where is my plumber', 'If you smell gas'],
    ['I think there’s a gas leak', 'If you smell gas'],
    ['The gas line is hissing', 'If you smell gas'],
    ['It smells like rotten eggs in the kitchen', 'If you smell gas'],
    ['My CO alarm is going off', 'If your carbon monoxide alarm is going off'],
    ['The carbon monoxide detector won’t stop', 'If your carbon monoxide alarm is going off'],
    ['Smoke alarm is going off and I smell burning, what do I do next?', 'Fire, smoke or sparks'],
    ['There’s a fire in the kitchen', 'Fire, smoke or sparks'],
    ['My outlet is sparking', 'Fire, smoke or sparks'],
    ['Water is pouring through the ceiling, what do I do next?', 'Water leak'],
    ['A pipe burst, what do I do next?', 'Water leak'],
  ])('%s', async (question, title) => {
    const answer = await ask(question);
    expect(answer.title).toBe(title);
    expect(answer.steps?.length).toBeGreaterThan(0);
  });

  it('offers a 911 call on life-safety guides', async () => {
    expect((await ask('I smell gas')).actions).toContainEqual({ label: 'Call 911', tel: '911' });
  });
});

describe('everyday questions stay everyday', () => {
  it.each([
    'My smoke alarm keeps chirping',
    'My CO alarm is chirping',
    'When was the smoke alarm last tested?',
    'When was the gas furnace last serviced?',
    'How old is my gas water heater?',
    'Where do I keep the fire extinguisher?',
    'Does my warranty cover a flooded basement?',
    'What is due next?',
    'There’s water dripping under the sink',
    'When do the spark plugs need changing?',
  ])('%s', async (question) => {
    expect(LIFE_SAFETY).not.toContain((await ask(question)).title);
  });

  it('still lists due tasks for a plain question', async () => {
    expect((await ask('What is due next?')).source).toBe('Your tasks');
  });

  it('still explains a chirping alarm as a low battery', async () => {
    expect((await ask('My smoke alarm keeps chirping')).title).toBe('Smoke or CO alarm chirping');
  });

  it('points to 911 when no guide matches', async () => {
    expect((await ask('Tell me about wallpaper')).text).toContain('911');
  });
});
