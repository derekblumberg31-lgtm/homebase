import type { SystemKind } from '../../data/types';

/**
 * Offline guided help. Each guide separates what to do right now for safety, what a homeowner can
 * safely try, and what only a professional should do, and says plainly when to call one. Guides
 * for common emergencies also ask follow-up questions; the answers change the advice and are
 * saved with any task or note the homeowner creates from it.
 *
 * This is general guidance, not a diagnosis. Wording stays conditional ("if", "usually") and
 * anything involving gas, mains electricity, structure or refrigerant goes to a professional.
 */

export interface GuideAction {
  label: string;
  /** In-app route, or a task to plan. */
  href?: string;
  task?: { name: string; kind: 'maintenance' | 'repair' | 'project' };
  /** A phone number to call. */
  tel?: string;
}

export type Trade = 'plumber' | 'hvac' | 'electrician' | 'appliance' | 'locksmith' | 'general';

export const TRADE_LABEL: Record<Trade, string> = {
  plumber: 'Plumber',
  hvac: 'HVAC technician',
  electrician: 'Electrician',
  appliance: 'Appliance repair',
  locksmith: 'Locksmith',
  general: 'Handyman',
};

/** Words that find a saved contractor for a trade. */
export const TRADE_WORDS: Record<Trade, RegExp> = {
  plumber: /plumb|drain|sewer|water/i,
  hvac: /hvac|heat|cool|air|furnace|mechanical/i,
  electrician: /electric/i,
  appliance: /appliance|repair/i,
  locksmith: /lock/i,
  general: /handy|general|contractor/i,
};

export interface GuideOption {
  label: string;
  /** What this answer means, shown under the question once picked. */
  reply: string;
  /** emergency: act now and call for help; pro: book a professional; ok: homeowner steps are fine. */
  tone: 'emergency' | 'pro' | 'ok';
}

export interface GuideQuestion {
  id: string;
  text: string;
  options: GuideOption[];
}

export interface Guide {
  id: string;
  title: string;
  keywords: string[];
  /** Shown first, in plain words. */
  summary: string;
  /** Call 911, the gas company or the utility, now, if any of this is true. */
  emergency?: string;
  /** Immediate safety steps, before anything else. */
  now?: string[];
  /** Questions that change the advice. */
  questions?: GuideQuestion[];
  /** Safe homeowner steps. */
  steps: string[];
  /** Only a licensed professional should do these. */
  proOnly?: string[];
  /** When to stop and call a professional or emergency services. */
  safety?: string;
  trade?: Trade;
  /** Home systems this is about, used to pull in brand, age, warranty and contractor. */
  systemKinds?: SystemKind[];
  /** Name for the repair task it can create. */
  repairName?: string;
  /** Parts or supplies worth having, for a shopping list. */
  shopping?: string[];
  /** Offer to document damage for insurance. */
  damage?: boolean;
  /** Days until a sensible follow-up check. */
  followUpDays?: number;
  followUpName?: string;
  actions?: GuideAction[];
  /**
   * Questions that describe danger happening now, tested on the lowercased question. A match answers
   * with this guide before anything else is looked up, so a stray word like "next" can't bury it.
   * Err towards matching: an extra safety answer costs little, a missed one can cost a lot.
   */
  urgentWhen?: RegExp;
}

const CALL_911: GuideAction = { label: 'Call 911', tel: '911' };

// Order matters: the first guide whose urgentWhen matches answers, so the most dangerous come first.
export const GUIDES: Guide[] = [
  {
    id: 'gas-smell',
    title: 'If you smell gas',
    keywords: [],
    urgentWhen: /\bsmell.*\bgas\b|\bgas (line |pipe |meter |stove |oven )?(is |might be |may be |could be )?(smell|odou?r|leak|hiss)|\b(leak|leaking) (of )?gas\b|rotten eggs?/,
    summary: 'Leave now. Don’t stop to look for the source.',
    steps: [
      'Get everyone out of the home, including pets.',
      'On your way out, don’t touch light switches, appliances or anything that could spark, and don’t light anything.',
      'Once you’re well away from the home, call your gas company’s emergency line or 911.',
      'Stay out until the gas company or fire department says it’s safe to go back.',
    ],
    safety: 'Don’t use your phone until you’re outside and away from the home.',
    actions: [CALL_911],
  },
  {
    id: 'co-alarm',
    title: 'If your carbon monoxide alarm is going off',
    keywords: [],
    urgentWhen: /^(?!.*chirp).*((carbon monoxide|\bco\b).*(going off|goes off|gone off|sounding|beeping|ringing|won[’']?t stop|leak|poison)|(going off|sounding).*(carbon monoxide|\bco\b))/,
    summary: 'Treat it as real. Get everyone outside into fresh air now.',
    steps: [
      'Get everyone out of the home, including pets. Don’t stop to open windows or look for the source.',
      'Once you’re outside, call 911.',
      'Stay out until responders say it’s safe to go back.',
      'A single chirp every minute or so is different: that usually means a low battery.',
    ],
    safety: 'Headache, dizziness or nausea can be signs of carbon monoxide poisoning. Tell the 911 operator if anyone has them.',
    actions: [CALL_911],
  },
  {
    id: 'fire-smoke',
    title: 'Fire, smoke or sparks',
    keywords: [],
    urgentWhen: /\bfire\b(?! (extinguisher|insurance|pit|blanket|door|escape))|\bflames\b|burning smell|smell(s|ing)?( of| like)? (something )?(burning|smoke)|smoke (is )?(coming|pouring|filling)|smoke from|smoke (alarm|detector).*(going off|goes off|sounding|won[’']?t stop)|\bspark(s|ing)?\b(?! plug)/,
    summary: 'If you can see or smell smoke or fire, get out first and call 911 from outside.',
    steps: [
      'Get everyone out and close doors behind you if you can. Don’t go back for belongings.',
      'Call 911 once you’re outside.',
      'Sparks or a burning smell from an outlet or appliance, with no flames or smoke: switch that circuit off at the breaker if you can reach it safely, then call an electrician.',
      'If you’re certain an alarm was set off by cooking, clear the air and check there’s no smoke anywhere else.',
    ],
    safety: 'Never use water on an electrical or grease fire. If in doubt, leave and call 911.',
    actions: [CALL_911],
  },
  {
    id: 'water-leak',
    title: 'Water leak',
    keywords: ['leak', 'leaking', 'drip', 'dripping', 'flood', 'flooding', 'burst', 'pipe', 'ceiling', 'wet', 'puddle', 'water on', 'water under', 'water coming'],
    urgentWhen: /^(?!.*(insur|warrant)).*(\b(pouring|gushing|burst)\b|\bflood(ed|ing)?\b|\bwater\b.*\b(ceiling|outlets?|panel|electric\w*)\b|\bceiling\b.*\b(water|leak\w*|sag\w*)\b)/,
    summary: 'Stop the water first, keep away from electricity, then deal with the damage.',
    emergency: 'Water near outlets, cords or the electrical panel that you can’t reach from a dry spot, or a ceiling that’s sagging or bulging: get everyone out of that area and call 911 or your utility. Don’t walk through standing water near electricity.',
    now: [
      'Close the nearest valve: under the sink or toilet, or behind the appliance. Turn it clockwise.',
      'If water keeps coming or you can’t find the source, close the main water shutoff.',
      'Only switch off a breaker if you can reach the panel standing somewhere dry.',
    ],
    questions: [
      {
        id: 'flow',
        text: 'Is water still coming out?',
        options: [
          { label: 'Yes, and I can’t stop it', reply: 'Close the main water shutoff now, then call a plumber. This is an emergency call, not a booking for next week.', tone: 'emergency' },
          { label: 'Stopped after closing a valve', reply: 'Good. Leave that valve closed until it’s repaired. You can use the rest of the home normally.', tone: 'pro' },
          { label: 'It’s a slow drip', reply: 'Put a bowl under it and check the fitting. Slow drips are often a loose connection or worn washer.', tone: 'ok' },
        ],
      },
      {
        id: 'where',
        text: 'Where is it coming from?',
        options: [
          { label: 'Under a sink or toilet', reply: 'Usually a supply line, compression nut or wax ring. Supply lines are a common homeowner fix with the water off.', tone: 'ok' },
          { label: 'Ceiling or wall', reply: 'Hidden pipes or a roof leak. Don’t cut into the wall. Poke a small hole in a bulging ceiling to drain it only if it’s safe to stand under, with a bucket ready.', tone: 'pro' },
          { label: 'Water heater', reply: 'Turn off its power or set the gas valve to Off, then close the cold-water inlet on top. A leaking tank usually means replacement.', tone: 'pro' },
          { label: 'Appliance or outside', reply: 'Close the valve behind the appliance or the outdoor spigot’s inside valve, and check the hose.', tone: 'ok' },
        ],
      },
      {
        id: 'electric',
        text: 'Is water near outlets, cords or the electrical panel?',
        options: [
          { label: 'Yes', reply: 'Stay out of the water. Switch off that circuit only if the panel is somewhere dry; otherwise call your utility or 911.', tone: 'emergency' },
          { label: 'No', reply: 'Good. Keep it that way: move cords and power strips off the floor.', tone: 'ok' },
        ],
      },
    ],
    steps: [
      'Tighten a loose compression nut a quarter turn with the water off. Don’t overtighten.',
      'Replace a cracked braided supply line. Take the old one to the store to match the size.',
      'For a dripping tap or running toilet, a worn washer or flapper is the usual cause.',
      'Move belongings, mop up, and run fans and a dehumidifier. Wet drywall and carpet start growing mold in 24 to 48 hours.',
      'Take photos before you clean up, for insurance.',
    ],
    proOnly: ['Cutting into walls or ceilings to reach pipes', 'Soldering or replacing pipe', 'Replacing a water heater', 'Repairing a main line or a stuck main shutoff'],
    safety: 'Call a plumber when the leak is inside a wall or ceiling, at the water heater, on the main line, or comes back after a fix.',
    trade: 'plumber',
    systemKinds: ['plumbing', 'water-heater'],
    repairName: 'Fix the water leak',
    shopping: ['Bucket and towels', 'Braided supply line (match the size)', 'Plumber’s tape', 'Adjustable wrench', 'Fan or dehumidifier'],
    damage: true,
    followUpDays: 3,
    followUpName: 'Check the leak area is dry and not coming back',
  },
  {
    id: 'no-heat',
    title: 'No heat',
    keywords: ['heat', 'heating', 'furnace', 'cold', 'boiler', 'radiator', 'thermostat', 'pilot', 'no heat'],
    summary: 'Most no-heat calls come down to the thermostat, power or a clogged filter.',
    emergency: 'If you smell gas (rotten eggs), don’t touch switches or the thermostat. Leave the home now and call the gas company or 911 from outside. If a CO alarm is sounding, get everyone outside and call 911.',
    now: ['If it’s very cold, keep everyone in one warm room and open cabinet doors under sinks on outside walls so pipes don’t freeze.', 'Use space heaters only if they’re plugged straight into the wall and kept a meter from anything that burns. Never use an oven, grill or generator for heat indoors.'],
    questions: [
      {
        id: 'gas',
        text: 'Do you smell gas, or is a CO alarm going off?',
        options: [
          { label: 'Yes', reply: 'Leave now, and call from outside. Don’t restart anything.', tone: 'emergency' },
          { label: 'No', reply: 'Good. You can safely work through the checks below.', tone: 'ok' },
        ],
      },
      {
        id: 'fuel',
        text: 'What kind of heat do you have?',
        options: [
          { label: 'Gas furnace', reply: 'Check the thermostat, power switch and filter first. Relight a pilot only by following the label on the unit exactly; never if you smell gas.', tone: 'ok' },
          { label: 'Electric or heat pump', reply: 'Check the thermostat mode and both breakers (indoor and outdoor units). A heat pump in defrost mode can blow cool air for a few minutes; that’s normal.', tone: 'ok' },
          { label: 'Boiler or radiators', reply: 'Check the thermostat and power, and that the pressure gauge reads about 12–15 psi when cold. Anything else on a boiler is for a technician.', tone: 'pro' },
          { label: 'Not sure', reply: 'Look for a label on the unit, or add your heating system in Homebase so it’s on hand next time.', tone: 'ok' },
        ],
      },
      {
        id: 'blower',
        text: 'Does anything come on when you turn the heat up?',
        options: [
          { label: 'Nothing at all', reply: 'Usually power: the thermostat batteries, the furnace switch, or its breaker.', tone: 'ok' },
          { label: 'Fan runs, air is cold', reply: 'Often a dirty filter or a burner that won’t light. Swap the filter; if it still blows cold, call a technician.', tone: 'pro' },
          { label: 'Starts then stops', reply: 'Often an overheating furnace from a clogged filter, or a dirty flame sensor. Swap the filter first.', tone: 'pro' },
        ],
      },
    ],
    steps: [
      'Set the thermostat to Heat, a few degrees above room temperature. Replace its batteries if the screen is blank.',
      'Check the furnace power switch (it looks like a light switch, near the unit) and its breaker.',
      'Replace the air filter. A badly clogged filter can make the furnace shut itself off.',
      'If the furnace has a status light, the blink code is explained on the inside of the panel door.',
    ],
    proOnly: ['Any work on gas lines, burners or the gas valve', 'Replacing igniters, flame sensors or control boards', 'Boiler pressure, valves and pumps'],
    safety: 'Call an HVAC technician if the heat doesn’t return after the thermostat, power and filter checks, or if the furnace cycles on and off.',
    trade: 'hvac',
    systemKinds: ['heating'],
    repairName: 'Get the heating fixed',
    shopping: ['Furnace filter (size is on the frame)', 'Thermostat batteries (usually AA or AAA)'],
    followUpDays: 2,
    followUpName: 'Check the heat is still working',
  },
  {
    id: 'no-hot-water',
    title: 'No hot water',
    keywords: ['hot water', 'water heater', 'shower', 'cold water', 'tank', 'tankless', 'lukewarm'],
    summary: 'Check power or gas to the water heater, then its settings.',
    emergency: 'If you smell gas near the water heater, leave and call the gas company from outside.',
    steps: [
      'Electric heater: check its breaker. A tripped reset button behind the upper panel is for after the power is off, and only if you’re comfortable; otherwise call a pro.',
      'Gas heater: check the pilot light and relight it following the label on the tank.',
      'Check the temperature dial hasn’t been turned down. Around 120°F (49°C) is typical.',
      'Lukewarm water that runs out fast often means sediment. Flushing the tank once a year helps.',
      'Tank water heaters usually last 8–12 years. If yours is older and leaking at the base, plan a replacement.',
    ],
    proOnly: ['Replacing elements, thermostats or gas valves', 'Replacing the water heater'],
    safety: 'Water pooling under the tank or a hissing relief valve: turn off its power or gas and the cold-water inlet, and call a plumber.',
    trade: 'plumber',
    systemKinds: ['water-heater'],
    repairName: 'Get the water heater checked',
    actions: [
      { label: 'Plan a yearly flush', task: { name: 'Flush the water heater', kind: 'maintenance' } },
      { label: 'Add your water heater', href: '/property/systems?new=water-heater' },
    ],
  },
  {
    id: 'power-out',
    title: 'Power outage',
    keywords: ['breaker', 'power', 'outlet', 'electric', 'electricity', 'tripped', 'fuse', 'gfci', 'lights out', 'no power', 'outage', 'blackout'],
    summary: 'First work out whether it’s your home or the whole street.',
    emergency: 'Downed power lines: stay at least 10 meters (35 feet) away and call 911 and your utility. Sparks, smoke or a burning smell from an outlet or the panel: leave the area and call 911.',
    now: ['Unplug sensitive electronics so a power surge doesn’t damage them when it comes back.', 'Use flashlights, not candles.', 'Keep the fridge and freezer closed. Food stays cold about 4 hours in a fridge, 24–48 in a full freezer.'],
    questions: [
      {
        id: 'scope',
        text: 'How much is out?',
        options: [
          { label: 'The whole street', reply: 'It’s the utility. Report it on their outage line or app; there’s nothing to fix at home.', tone: 'ok' },
          { label: 'The whole home only', reply: 'Check the main breaker at the top of the panel. If it’s on and still nothing, call the utility; the problem may be at the meter.', tone: 'pro' },
          { label: 'One room or a few outlets', reply: 'Almost always a tripped breaker or a GFCI outlet. The steps below fix most of these.', tone: 'ok' },
        ],
      },
      {
        id: 'smell',
        text: 'Any burning smell, buzzing, or a warm outlet?',
        options: [
          { label: 'Yes', reply: 'Don’t reset anything. Switch that breaker off if the panel is safe to reach, and call an electrician.', tone: 'emergency' },
          { label: 'No', reply: 'Good. It’s safe to try resetting.', tone: 'ok' },
        ],
      },
    ],
    steps: [
      'Look for a breaker sitting in the middle or off position. Push it fully off, then back on.',
      'Press Reset on GFCI outlets (the ones with Test and Reset buttons) in kitchens, bathrooms, garages and outdoors. One GFCI can power several other outlets.',
      'If it trips again straight away, unplug everything on that circuit and try again. The last thing plugged in is often the cause.',
    ],
    proOnly: ['Opening the panel’s inner cover', 'Replacing breakers, outlets or wiring', 'Anything at the meter: that’s the utility'],
    safety: 'A breaker that trips repeatedly, a burning smell, or a warm outlet: stop resetting it and call an electrician.',
    trade: 'electrician',
    systemKinds: ['electrical'],
    repairName: 'Have an electrician check the circuit',
    shopping: ['Flashlights and batteries', 'Surge protector'],
    followUpDays: 7,
    followUpName: 'Check the circuit hasn’t tripped again',
  },
  {
    id: 'smoke-alarm',
    title: 'Smoke or CO alarm chirping',
    keywords: ['smoke', 'alarm', 'chirp', 'chirping', 'beep', 'beeping', 'carbon monoxide', 'co detector', 'detector'],
    summary: 'A single chirp every minute or so almost always means a low battery or an alarm at the end of its life.',
    emergency: 'A continuous alarm (not a chirp) means get everyone outside now. For a CO alarm, call 911 from outside and don’t go back in until responders say it’s safe.',
    questions: [
      {
        id: 'sound',
        text: 'What is it doing?',
        options: [
          { label: 'Chirps once a minute', reply: 'Low battery or end of life. Follow the steps below.', tone: 'ok' },
          { label: 'Sounding non-stop', reply: 'Treat it as real. Get everyone outside. For CO, call 911 from outside.', tone: 'emergency' },
          { label: 'Went off from cooking', reply: 'Open windows and fan the alarm. Never remove the battery to stop it; move the alarm or use one with a hush button.', tone: 'ok' },
        ],
      },
      {
        id: 'age',
        text: 'How old is the alarm? (The date is on the back.)',
        options: [
          { label: 'Under 10 years', reply: 'Replace the battery, then press and hold Test.', tone: 'ok' },
          { label: 'Over 10 years, or no idea', reply: 'Replace the whole alarm. Sensors wear out, even with new batteries.', tone: 'ok' },
        ],
      },
    ],
    steps: [
      'Find the chirping alarm (it can echo). Stand on a step stool, not a chair.',
      'Replace its battery, then press and hold Test until it sounds.',
      'Alarms with sealed 10-year batteries chirp at end of life: replace the whole unit.',
      'Hardwired alarms have a backup battery too. After replacing it, hold Test for 15 seconds to clear the chirp.',
    ],
    proOnly: ['Replacing hardwired alarms if you’re not comfortable switching off the circuit'],
    safety: 'If a hardwired alarm keeps chirping after a new battery, or several alarms go off together for no reason, call an electrician.',
    trade: 'electrician',
    repairName: 'Replace the chirping alarm',
    shopping: ['9V or AA batteries (check the alarm)', 'Replacement smoke alarm', 'Combination smoke and CO alarm'],
    actions: [{ label: 'Plan monthly alarm tests', task: { name: 'Test smoke and CO alarms', kind: 'maintenance' } }],
  },
  {
    id: 'appliance',
    title: 'Appliance not working',
    keywords: ['fridge', 'refrigerator', 'freezer', 'dishwasher', 'washer', 'washing', 'dryer', 'oven', 'stove', 'range', 'microwave', 'disposal', 'appliance', 'broken', 'stopped', 'not working', 'won’t start', 'wont start'],
    summary: 'Check power and the simple stuff first, then whether it’s still under warranty before paying for a repair.',
    emergency: 'Smoke, sparks or a burning smell: unplug it if you can do so safely, or switch off its breaker. A gas range or dryer that smells of gas: leave and call the gas company from outside.',
    now: ['Unplug it, or switch off its breaker, before you look inside or move it.'],
    questions: [
      {
        id: 'symptom',
        text: 'What’s happening?',
        options: [
          { label: 'No power at all', reply: 'Check the plug, the outlet with a lamp, the breaker and any GFCI outlet nearby.', tone: 'ok' },
          { label: 'Runs but doesn’t work', reply: 'Look up the error code in the manual. Filters, door switches and drains are common causes you can check.', tone: 'ok' },
          { label: 'Leaking water', reply: 'Turn off the water valve behind it, then check the hoses and door seal.', tone: 'ok' },
          { label: 'Smoke, sparks or smell', reply: 'Leave it unplugged and don’t use it until a technician has checked it.', tone: 'emergency' },
        ],
      },
      {
        id: 'warranty',
        text: 'Is it under warranty?',
        options: [
          { label: 'Yes, or not sure', reply: 'Check before you open it up. Repairs you do yourself can void a warranty.', tone: 'pro' },
          { label: 'No', reply: 'Simple fixes are fair game. Compare the repair quote with the cost of a new one if it’s over about 8 years old.', tone: 'ok' },
        ],
      },
    ],
    steps: [
      'Check the plug, the breaker and any GFCI outlet nearby.',
      'Look up the error code or blinking light in the manual.',
      'Clean the filters: dishwasher filter, dryer lint screen, washer drain-pump filter, fridge coils.',
      'Reset it by unplugging it for a minute, then plugging it back in.',
    ],
    proOnly: ['Anything behind the back panel or inside the control board', 'Gas appliance connections', 'Refrigerant (sealed system) repairs'],
    safety: 'Call appliance repair if a reset and the simple checks don’t fix it, and always for gas appliances or refrigerant.',
    trade: 'appliance',
    repairName: 'Get the appliance repaired',
    damage: false,
    followUpDays: 7,
    followUpName: 'Check the appliance is working after the fix',
  },
  {
    id: 'frozen-pipes',
    title: 'Frozen pipes',
    keywords: ['frozen', 'freeze', 'freezing', 'ice', 'winter', 'no water'],
    summary: 'Thaw slowly, with the tap open, and never with an open flame.',
    now: ['Open the tap the pipe feeds so melting water can flow out.'],
    steps: [
      'Warm the pipe with a hair dryer, a heating pad or warm towels, starting nearest the tap.',
      'Open cabinet doors under sinks on outside walls to let warm air in.',
      'Once water flows, check along the pipe for leaks or bulges.',
      'To prevent it: keep the heat on, let at-risk taps drip on very cold nights, and insulate exposed pipes.',
    ],
    proOnly: ['Thawing pipes inside walls', 'Repairing split pipe'],
    safety: 'If a pipe has split, shut the main water valve right away and call a plumber. Never use a torch or open flame.',
    trade: 'plumber',
    systemKinds: ['plumbing'],
    repairName: 'Repair the frozen pipe',
    damage: true,
    actions: [{ label: 'Plan pipe insulation', task: { name: 'Insulate exposed pipes', kind: 'project' } }],
  },
  {
    id: 'locked-out',
    title: 'Locked out or need a spare key',
    keywords: ['locked', 'lockout', 'key', 'keys', 'spare', 'copy', 'duplicate', 'lost key', 'lock'],
    summary: 'Homebase can tell you which saved key is which, and the blank you need to copy it.',
    steps: [
      'Check whether anyone in the household or a trusted neighbor has a spare.',
      'A licensed locksmith can open most home locks without damage. Ask for an estimate and ID before work starts.',
      'To copy a key, open it in Keys and Locks: the code on its tag is what the key counter needs.',
      'Keys stamped “Do not duplicate” or with restricted keyways need the owner’s authorization.',
    ],
    trade: 'locksmith',
    actions: [
      { label: 'Open Keys and Locks', href: '/property/keys' },
      { label: 'Identify a key', href: '/property/identify-key' },
    ],
  },
  {
    id: 'clogged-drain',
    title: 'Clogged drain or toilet',
    keywords: ['clog', 'clogged', 'drain', 'blocked', 'toilet', 'sink', 'slow drain', 'overflow', 'backup'],
    summary: 'A plunger and a drain snake fix most clogs.',
    now: ['Toilet about to overflow: lift the tank lid and push the flapper down to stop the water, then close the valve behind the toilet.'],
    steps: [
      'Use a flange plunger for toilets and a cup plunger for sinks, with enough water to cover the cup.',
      'For slow sinks and showers, pull hair out with a plastic drain strip or a small snake.',
      'Skip chemical drain cleaners. They damage pipes and make the next fix dangerous.',
    ],
    proOnly: ['Main sewer line clogs', 'Removing a toilet to clear it, unless you’re confident'],
    safety: 'Several drains backing up at once can mean a main sewer line problem: stop using water and call a plumber.',
    trade: 'plumber',
    systemKinds: ['plumbing'],
    repairName: 'Clear the clogged drain',
    shopping: ['Flange plunger', 'Plastic drain snake'],
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
    proOnly: ['Refrigerant, capacitors and electrical parts in the outdoor unit'],
    safety: 'Ice that returns, a burning smell, or a unit that hums but won’t start: call an HVAC technician. In extreme heat, go somewhere cool while you wait.',
    trade: 'hvac',
    systemKinds: ['cooling'],
    repairName: 'Get the AC repaired',
    shopping: ['HVAC filter (size is on the frame)'],
    actions: [{ label: 'Plan an AC service', task: { name: 'Service the air conditioning', kind: 'maintenance' } }],
  },
  {
    id: 'project-estimate',
    title: 'Planning and estimating a project',
    keywords: ['estimate', 'budget', 'cost', 'project', 'renovate', 'renovation', 'remodel', 'quote', 'plan', 'paint', 'improve'],
    summary: 'A clear scope and three quotes make most projects go smoothly.',
    steps: [
      'Write down what “done” looks like: rooms, materials, and what stays the same.',
      'Get three written quotes that list labor, materials and timeline separately.',
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
  'There’s water leaking under the sink',
  'The heat isn’t working',
  'My smoke alarm keeps chirping',
  'The power is out in part of the house',
  'My dishwasher stopped working',
  'What should I maintain this month?',
  'Find the warranty for my water heater',
  'Which warranties are ending soon?',
];
