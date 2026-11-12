import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '../../app/areas';
import { useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { PropertyType } from '../../data/types';
import { FormGroup, SelectField, TextField, Segmented } from '../../ui/controls';
import { deviceLabel, installMatters, mayOpenEmptyWhenInstalled, readDeviceEnv } from '../../lib/dataSafety';
import { ImportButton } from '../settings/ImportButton';
import { InstallSheet } from '../settings/InstallSheet';
import { SaveFailed, useSave } from '../../ui/save';

const ONBOARDING_FAILED = 'That wasn’t saved. Your answers are still here, so you can try again. If it keeps failing, the device may be out of space.';

type Step = 'welcome' | 'household' | 'property';
const STEPS: Step[] = ['welcome', 'household', 'property'];

/** First run: who you are and which home this is. Two short steps, then Home. */
export function Onboarding() {
  const store = useStore();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<PropertyType>('house');
  const [ownership, setOwnership] = useState<'own' | 'rent'>('own');
  const [gas, setGas] = useState<'yes' | 'no' | 'unsure'>('unsure');
  const [yearBuilt, setYearBuilt] = useState('');
  const [error, setError] = useState('');
  const [installOpen, setInstallOpen] = useState(false);
  const saver = useSave();
  const env = useMemo(readDeviceEnv, []);
  const tabMatters = installMatters(env);
  const fromSafari = mayOpenEmptyWhenInstalled(env);
  const label = deviceLabel(env);

  async function saveHousehold(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Add your first name so Homebase knows who you are.');
      return;
    }
    setError('');
    const ok = await saver.run(() =>
      store.saveHousehold({
        id: 'household',
        name: householdName.trim() || `${name.trim()}’s home`,
        members: [{ id: uid(), name: name.trim(), role: 'owner' }],
        createdAt: new Date().toISOString(),
      }),
    );
    if (ok) setStep('property');
  }

  async function saveProperty(event: FormEvent) {
    event.preventDefault();
    const year = Number(yearBuilt);
    if (yearBuilt && (!Number.isInteger(year) || year < 1700 || year > new Date().getFullYear() + 1)) {
      setError('Use a four-digit year, like 1998.');
      return;
    }
    setError('');
    const ok = await saver.run(async () => {
      await store.saveProperty({
        nickname: nickname.trim() || 'My home',
        address: address.trim() || undefined,
        type,
        ownership,
        yearBuilt: yearBuilt ? year : undefined,
      });
      // Gas decides whether the Health Check's gas-shutoff step applies; "Not sure" saves nothing.
      await store.updateSettings({ hasGas: gas === 'yes' ? true : gas === 'no' ? false : undefined });
      const household = store.getSnapshot().household;
      if (household) await store.saveHousehold({ ...household, onboardedAt: new Date().toISOString() });
    });
    if (ok) navigate('/home', { replace: true });
  }

  const index = STEPS.indexOf(step);

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="steps-dots" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <i key={s} className={i === index ? 'is-on' : ''} />
          ))}
        </div>

        {step === 'welcome' && (
          <>
            <h1>Welcome to {PRODUCT.name}</h1>
            <p className="lead">
              One place for your home: what needs doing, what you own, where the paperwork is, and help when something breaks.
            </p>
            <p className="lead">Everything stays on this device. No account, no sync. Save a backup file from Settings to keep a copy.</p>
            {tabMatters && (
              <>
                <p className="lead">
                  {label === 'Mac' ? 'Using Safari? Add Homebase to your Dock first, then set it up there.' : `On ${label}? Add Homebase to your Home Screen first, then set it up there.`}
                </p>
                <button type="button" className="text-button" onClick={() => setInstallOpen(true)}>
                  How to add it
                </button>
              </>
            )}
            <div className="button-stack">
              <button type="button" className="button is-primary is-block" onClick={() => setStep('household')}>
                Get started
              </button>
              <ImportButton label={fromSafari ? 'Started in Safari? Restore your backup' : 'Restore from a backup'} className="button is-quiet is-block" />
            </div>
            {fromSafari && <p className="section-foot">To make one, open Homebase in Safari, go to Settings and choose Save a backup.</p>}
          </>
        )}

        {step === 'household' && (
          <form onSubmit={saveHousehold} noValidate>
            <h1>Who’s using Homebase?</h1>
            <p className="lead">You can add other people in your household later.</p>
            <SaveFailed show={saver.failed}>{ONBOARDING_FAILED}</SaveFailed>
            <div className="section">
              <FormGroup>
                <TextField label="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" error={error} autoFocus />
                <TextField label="Household name" optional value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder={name ? `${name}’s home` : 'The Rivera household'} />
              </FormGroup>
            </div>
            <div className="section">
              <p className="field-label is-standalone" aria-hidden="true">Does it have gas service?</p>
              <Segmented
                label="Does it have gas service?"
                value={gas}
                onChange={setGas}
                options={[
                  { value: 'yes', label: 'Has gas' },
                  { value: 'no', label: 'No gas' },
                  { value: 'unsure', label: 'Not sure' },
                ]}
              />
              <p className="section-foot">A gas stove, furnace, water heater or dryer means yes. This decides whether your checklist includes the gas shutoff.</p>
            </div>
            <div className="button-stack">
              <button type="submit" className="button is-primary is-block" aria-disabled={saver.saving || undefined} aria-busy={saver.saving || undefined}>
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'property' && (
          <form onSubmit={saveProperty} noValidate>
            <h1>Tell us about your home</h1>
            <p className="lead">The basics help Homebase suggest the right upkeep. Skip anything you don’t know.</p>
            <SaveFailed show={saver.failed}>{ONBOARDING_FAILED}</SaveFailed>
            <div className="section">
              <FormGroup>
                <TextField label="What you call it" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="Maple Street" autoFocus />
                <TextField label="Address" optional value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
                <SelectField label="Type of home" value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
                  <option value="house">House</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="condo">Condo</option>
                  <option value="apartment">Apartment</option>
                  <option value="other">Something else</option>
                </SelectField>
                <TextField label="Year built" optional inputMode="numeric" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} placeholder="1998" error={error} />
              </FormGroup>
            </div>
            <div className="section">
              <p className="field-label is-standalone" aria-hidden="true">Own or rent</p>
              <Segmented
                label="Own or rent"
                value={ownership}
                onChange={setOwnership}
                options={[
                  { value: 'own', label: 'I own it' },
                  { value: 'rent', label: 'I rent it' },
                ]}
              />
            </div>
            <div className="section">
              <p className="field-label is-standalone" aria-hidden="true">Does it have gas service?</p>
              <Segmented
                label="Does it have gas service?"
                value={gas}
                onChange={setGas}
                options={[
                  { value: 'yes', label: 'Has gas' },
                  { value: 'no', label: 'No gas' },
                  { value: 'unsure', label: 'Not sure' },
                ]}
              />
              <p className="section-foot">A gas stove, furnace, water heater or dryer means yes. This decides whether your checklist includes the gas shutoff.</p>
            </div>
            <div className="button-stack">
              <button type="submit" className="button is-primary is-block" aria-disabled={saver.saving || undefined} aria-busy={saver.saving || undefined}>
                Go to Home
              </button>
            </div>
          </form>
        )}

        {installOpen && <InstallSheet onClose={() => setInstallOpen(false)} />}
      </div>
    </div>
  );
}
