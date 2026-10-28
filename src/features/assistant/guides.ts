/**
 * Offline guided help. Each guide is short, practical and safety-first. Keywords decide which guide
 * answers a question; the AssistantProvider interface lets an AI provider replace this matching
 * later without the screen changing.
 */

export interface GuideAction {
  label: string;
  /** In-app route, or a task to plan. */
  href?: string;
  task?: { name: string; kind: 'maintenance' | 'repair' | 'project' };
}

export interface Guide {
  id: string;
  title: string;
  keywords: string[];
  /** Shown first, in plain words. */
  summary: string;
  steps: string[];
  /** When to stop and call a professional or emergency services. */
  safety?: string;
  actions?: GuideAction[];
}

export const GUIDES: Guide[] = [
  {
    id: 'water-leak',
    title: 'Water leak',
    keywords: ['leak', 'leaking', 'water', 'drip', 'dripping', 'flood', 'flooding', 'burst', 'pipe', 'ceiling', 'wet'],
    summary: 'Stop the water first, then deal with the damage.',
    steps: [
      'Turn off the nearest valve: under the sink or toilet, or behind the appliance.',
      'If water keeps coming, shut the main water valve. It’s usually where the water line enters the home, often near the meter or water heater.',
      'If water is near outlets or the electrical panel, switch off power to that area at the breaker, only if you can reach it while standing somewhere dry.',
      'Move belongings, mop up, and run fans. Photograph the damage for insurance.',
      'For a dripping tap or running toilet, a worn washer or flapper is the usual cause and an easy fix.',
    ],
    safety: 'Water near electrics, a sagging ceiling, or water you can’t stop: call a plumber now, and stay out from under the ceiling.',
    actions: [
      { label: 'Plan the repair', task: { name: 'Fix the leak', kind: 'repair' } },
      { label: 'Note where the water shut-off is', href: '/property/details' },
    ],
  },
  {
    id: 'no-heat',
    title: 'No heat',
    keywords: ['heat', 'heating', 'furnace', 'cold', 'boiler', 'radiator', 'thermostat', 'pilot'],
    summary: 'Most no-heat calls come down to the thermostat, power or a clogged filter.',
    steps: [
      'Check the thermostat is set to Heat and a few degrees above room temperature. Replace its batteries if the screen is blank.',
      'Check the furnace power switch (it looks like a light switch, near the unit) and its breaker.',
      'Look at the air filter. A badly clogged filter can make the furnace shut itself off.',
      'If the furnace has a status light, its blink pattern is explained on the inside of the panel door.',
      'For a gas furnace with a pilot light, follow the relight steps on the unit’s label exactly.',
    ],
    safety: 'If you smell gas, don’t touch switches. Leave the home and call your gas company from outside.',
    actions: [
      { label: 'Plan a furnace service', task: { name: 'Service the furnace', kind: 'maintenance' } },
      { label: 'Add your heating system', href: '/property/systems' },
    ],
  },
  {
    id: 'no-hot-water',
    title: 'No hot water',
    keywords: ['hot water', 'water heater', 'shower', 'cold water', 'tank', 'tankless', 'lukewarm'],
    summary: 'Check power or gas to the water heater, then its settings.',
    steps: [
      'Electric heater: check its breaker. A tripped high-limit switch can be reset with the red button behind the upper panel, power off first.',
      'Gas heater: check the pilot light and relight it following the label on the tank.',
      'Check the temperature dial hasn’t been turned down; around 120°F (49°C) is typical.',
      'Lukewarm water that runs out fast often means sediment. Flushing the tank once a year helps.',
      'Tank water heaters usually last 8–12 years. If yours is older and leaking at the base, plan a replacement.',
    ],
    safety: 'Water pooling under the tank or a hissing relief valve: turn off its power or gas and the cold-water inlet, and call a plumber.',
    actions: [
      { label: 'Plan a yearly flush', task: { name: 'Flush the water heater', kind: 'maintenance' } },
      { label: 'Add your water heater', href: '/property/systems' },
    ],
  },
  {
    id: 'power-out',
    title: 'Power out in part of the home',
    keywords: ['breaker', 'power', 'outlet', 'electric', 'electricity', 'tripped', 'fuse', 'gfci', 'lights out', 'no power'],
    summary: 'A tripped breaker or GFCI outlet is the usual cause.',
    steps: [
      'Look for a breaker in the panel sitting in the middle or off position. Push it fully off, then back on.',
      'Check outlets with Test/Reset buttons in kitchens, bathrooms, garages and outdoors. One GFCI can power several other outlets.',
      'If it trips again straight away, unplug everything on that circuit and try again. The last thing plugged in is often the cause.',
      'If the whole home is out, check whether neighbours are too and report it to your utility.',
    ],
    safety: 'A breaker that trips repeatedly, a burning smell, or a warm outlet: stop resetting it and call an electrician.',
    actions: [{ label: 'Plan an electrician visit', task: { name: 'Have an electrician check the circuit', kind: 'repair' } }],
  },
  {
    id: 'smoke-alarm',
    title: 'Smoke or CO alarm chirping',
    keywords: ['smoke', 'alarm', 'chirp', 'chirping', 'beep', 'beeping', 'carbon monoxide', 'co detector', 'detector'],
    summary: 'A single chirp every minute or so almost always means a low battery.',
    steps: [
      'Find the chirping alarm (it can echo). Replace its battery, then press and hold Test.',
      'Alarms with sealed 10-year batteries chirp at end of life: replace the whole unit.',
      'Most alarms need replacing every 10 years. The date is printed on the back.',
      'Test every alarm monthly and swap batteries yearly.',
    ],
    safety: 'A CO alarm sounding continuously (not chirping) means get everyone outside and call emergency services.',
    actions: [{ label: 'Plan monthly alarm tests', task: { name: 'Test smoke and CO alarms', kind: 'maintenance' } }],
  },
  {
    id: 'frozen-pipes',
    title: 'Frozen pipes',
    keywords: ['frozen', 'freeze', 'freezing', 'ice', 'winter', 'no water'],
    summary: 'Thaw slowly, with the tap open, and never with an open flame.',
    steps: [
      'Open the tap the pipe feeds so melting water can flow out.',
      'Warm the pipe with a hair dryer, a heating pad or warm towels, starting nearest the tap.',
      'Open cabinet doors under sinks on outside walls to let warm air in.',
      'Once water flows, check along the pipe for leaks or bulges.',
      'To prevent it: keep the heat on, let at-risk taps drip on very cold nights, and insulate exposed pipes.',
    ],
    safety: 'If a pipe has split, shut the main water valve right away and call a plumber.',
    actions: [{ label: 'Plan pipe insulation', task: { name: 'Insulate exposed pipes', kind: 'project' } }],
  },
  {
    id: 'locked-out',
    title: 'Locked out or need a spare key',
    keywords: ['locked', 'lockout', 'key', 'keys', 'spare', 'copy', 'duplicate', 'lost key', 'lock'],
    summary: 'Homebase can tell you which saved key is which, and the blank you need to copy it.',
    steps: [
      'Check whether anyone in the household or a trusted neighbour has a spare.',
      'A licensed locksmith can open most home locks without damage. Ask for an estimate and ID before work starts.',
      'To copy a key, open it in Keys and locks: the code on its tag is what the key counter needs.',
      'Keys stamped “Do not duplicate” or with restricted keyways need the owner’s authorization.',
    ],
    actions: [
      { label: 'Open Keys and locks', href: '/property/keys' },
      { label: 'Identify a key', href: '/property/identify-key' },
    ],
  },
  {
    id: 'clogged-drain',
    title: 'Clogged drain or toilet',
    keywords: ['clog', 'clogged', 'drain', 'blocked', 'toilet', 'sink', 'slow drain', 'overflow', 'backup'],
    summary: 'A plunger and a drain snake fix most clogs.',
    steps: [
      'Toilet: if it might overflow, lift the tank lid and push the flapper down to stop the water.',
      'Use a flange plunger for toilets and a cup plunger for sinks, with enough water to cover the cup.',
      'For slow sinks and showers, pull hair out with a plastic drain strip or a small snake.',
      'Skip chemical drain cleaners; they damage pipes and make the next fix dangerous.',
    ],
    safety: 'Several drains backing up at once can mean a main sewer line problem: stop using water and call a plumber.',
    actions: [{ label: 'Plan the repair', task: { name: 'Clear the clogged drain', kind: 'repair' } }],
  },
  {
    id: 'ac-not-cooling',
    title: 'Air conditioning not cooling',
    keywords: ['ac', 'a/c', 'air conditioning', 'air conditioner', 'cooling', 'hot', 'not cold', 'heat pump'],
    summary: 'Start with the thermostat, the filter and the outdoor unit.',
    steps: [
      'Set the thermostat to Cool and below room temperature, with the fan on Auto.',
      'Replace a dirty filter. Restricted airflow can freeze the indoor coil.',
      'Check the outdoor unit is running and its breaker is on. Clear leaves and debris from around it.',
      'If the indoor lines are iced, turn the system off and run only the fan for a few hours to thaw.',
    ],
    safety: 'Ice that returns, a burning smell, or a unit that hums but won’t start: call an HVAC technician.',
    actions: [{ label: 'Plan an AC service', task: { name: 'Service the air conditioning', kind: 'maintenance' } }],
  },
  {
    id: 'project-estimate',
    title: 'Planning and estimating a project',
    keywords: ['estimate', 'budget', 'cost', 'project', 'renovate', 'renovation', 'remodel', 'quote', 'contractor', 'plan', 'paint', 'improve'],
    summary: 'A clear scope and three quotes make most projects go smoothly.',
    steps: [
      'Write down what “done” looks like: rooms, materials, and what stays the same.',
      'Get three written quotes that list labour, materials and timeline separately.',
      'Add 10–20% for surprises, more in older homes.',
      'Check whether a permit is needed. Keep permits and final inspections in Records.',
      'Keep the receipts and warranties for new work together in Records.',
    ],
    actions: [
      { label: 'Start a project', task: { name: 'New project', kind: 'project' } },
      { label: 'See upkeep costs', href: '/tasks?view=costs' },
    ],
  },
];

export const SUGGESTED_QUESTIONS = [
  'There’s water dripping under the sink',
  'My smoke alarm keeps chirping',
  'What’s due this week?',
  'Which warranties are ending soon?',
  'How do I plan a bathroom remodel?',
];
