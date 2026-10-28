import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PRODUCT } from '../../app/areas';
import { useData, useStore } from '../../data/DataProvider';
import { uid } from '../../data/ids';
import type { PropertyType } from '../../data/types';
import { FormGroup, SelectField, TextField, Segmented } from '../../ui/controls';
import { ImportButton } from '../settings/ImportButton';

type Step = 'welcome' | 'household' | 'property' | 'bring-in';
const STEPS: Step[] = ['welcome', 'household', 'property', 'bring-in'];

/** First run: who you are, which home this is, and whether to bring in data from the older apps. */
export function Onboarding() {
  const store = useStore();
  const data = useData();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [type, setType] = useState<PropertyType>('house');
  const [ownership, setOwnership] = useState<'own' | 'rent'>('own');
  const [yearBuilt, setYearBuilt] = useState('');
  const [error, setError] = useState('');

  async function saveHousehold(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Add your first name so Homebase knows who you are.');
      return;
    }
    setError('');
    await store.saveHousehold({
      id: 'household',
      name: householdName.trim() || `${name.trim()}’s home`,
      members: [{ id: uid(), name: name.trim(), role: 'owner' }],
      createdAt: new Date().toISOString(),
    });
    setStep('property');
  }

  async function saveProperty(event: FormEvent) {
    event.preventDefault();
    const year = Number(yearBuilt);
    if (yearBuilt && (!Number.isInteger(year) || year < 1700 || year > new Date().getFullYear() + 1)) {
      setError('Use a four-digit year, like 1998.');
      return;
    }
    setError('');
    await store.saveProperty({
      nickname: nickname.trim() || 'My home',
      address: address.trim() || undefined,
      type,
      ownership,
      yearBuilt: yearBuilt ? year : undefined,
    });
    setStep('bring-in');
  }

  async function finish() {
    if (!data.household) return;
    await store.saveHousehold({ ...data.household, onboardedAt: new Date().toISOString() });
    navigate('/home', { replace: true });
  }

  const index = STEPS.indexOf(step);

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <img className="onboarding-mark" src="/icons/icon-192.png" alt="" />

        {step === 'welcome' && (
          <>
            <h1>Welcome to {PRODUCT.name}</h1>
            <p className="lead">
              One place for your home: what needs doing, what you own, where the paperwork is, and help when something breaks.
            </p>
            <p className="lead">Everything stays on this device. No account needed.</p>
            <div className="button-stack">
              <button type="button" className="button is-primary is-block" onClick={() => setStep('household')}>
                Get started
              </button>
            </div>
          </>
        )}

        {step === 'household' && (
          <form onSubmit={saveHousehold} noValidate>
            <h1>Who’s using Homebase?</h1>
            <p className="lead">You can add other people in your household later.</p>
            <div className="section">
              <FormGroup>
                <TextField label="Your first name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" error={error} autoFocus />
                <TextField label="Household name" optional value={householdName} onChange={(e) => setHouseholdName(e.target.value)} placeholder={name ? `${name}’s home` : 'The Rivera household'} />
              </FormGroup>
            </div>
            <div className="button-stack">
              <button type="submit" className="button is-primary is-block">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'property' && (
          <form onSubmit={saveProperty} noValidate>
            <h1>Tell us about your home</h1>
            <p className="lead">The basics help Homebase suggest the right upkeep. Skip anything you don’t know.</p>
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
            <div className="button-stack">
              <button type="submit" className="button is-primary is-block">
                Continue
              </button>
            </div>
          </form>
        )}

        {step === 'bring-in' && (
          <>
            <h1>Bring in your data</h1>
            <p className="lead">
              Used Replacely or KeyFinder? Export a backup there (Settings → Export backup in Replacely, Keys → Export in KeyFinder), then choose the file here. You can also do this later in Settings.
            </p>
            <div className="section">
              <div className="group">
                <ImportButton label="Choose a backup file" />
              </div>
            </div>
            <div className="button-stack">
              <button type="button" className="button is-primary is-block" onClick={finish}>
                {data.tasks.length || data.items.length ? 'Go to Home' : 'Start fresh'}
              </button>
            </div>
          </>
        )}

        <div className="steps-dots" aria-label={`Step ${index + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <i key={s} className={i === index ? 'is-on' : ''} />
          ))}
        </div>
      </div>
    </div>
  );
}
