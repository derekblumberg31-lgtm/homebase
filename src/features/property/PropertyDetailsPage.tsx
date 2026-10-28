import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, useStore } from '../../data/DataProvider';
import type { PropertyType } from '../../data/types';
import { FormGroup, Segmented, SelectField, TextArea, TextField } from '../../ui/controls';
import { Page, Section } from '../../ui/layout';
import { useToast } from '../../ui/overlays';

const asNumber = (value: string) => (value.trim() ? Number(value) : undefined);

export function PropertyDetailsPage() {
  const { property } = useData();
  const store = useStore();
  const toast = useToast();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState(property?.nickname ?? '');
  const [address, setAddress] = useState(property?.address ?? '');
  const [type, setType] = useState<PropertyType>(property?.type ?? 'house');
  const [ownership, setOwnership] = useState<'own' | 'rent'>(property?.ownership ?? 'own');
  const [yearBuilt, setYearBuilt] = useState(property?.yearBuilt ? String(property.yearBuilt) : '');
  const [squareFeet, setSquareFeet] = useState(property?.squareFeet ? String(property.squareFeet) : '');
  const [bedrooms, setBedrooms] = useState(property?.bedrooms ? String(property.bedrooms) : '');
  const [bathrooms, setBathrooms] = useState(property?.bathrooms ? String(property.bathrooms) : '');
  const [notes, setNotes] = useState(property?.notes ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function save() {
    const next: Record<string, string> = {};
    const year = asNumber(yearBuilt);
    if (year !== undefined && !(Number.isInteger(year) && year >= 1700 && year <= new Date().getFullYear() + 1)) next.yearBuilt = 'Use a four-digit year, like 1998.';
    for (const [key, value] of Object.entries({ squareFeet, bedrooms, bathrooms })) {
      const n = asNumber(value);
      if (n !== undefined && !(n >= 0)) next[key] = 'Use a number.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    await store.saveProperty({
      nickname: nickname.trim() || 'My home',
      address: address.trim() || undefined,
      type,
      ownership,
      yearBuilt: year,
      squareFeet: asNumber(squareFeet),
      bedrooms: asNumber(bedrooms),
      bathrooms: asNumber(bathrooms),
      notes: notes.trim() || undefined,
    });
    await store.log('property-updated', 'Updated home details', '/property/details');
    toast('Saved');
    navigate('/property');
  }

  return (
    <Page title="Home details" back={{ to: '/property', label: 'Property' }} actions={<button type="button" className="button is-quiet" onClick={save}>Save</button>}>
      <Section title="The basics">
        <FormGroup>
          <TextField label="What you call it" value={nickname} onChange={(e) => setNickname(e.target.value)} />
          <TextField label="Address" optional value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="street-address" />
          <SelectField label="Type of home" value={type} onChange={(e) => setType(e.target.value as PropertyType)}>
            <option value="house">House</option>
            <option value="townhouse">Townhouse</option>
            <option value="condo">Condo</option>
            <option value="apartment">Apartment</option>
            <option value="other">Something else</option>
          </SelectField>
        </FormGroup>
        <div className="section-foot">
          <Segmented label="Own or rent" value={ownership} onChange={setOwnership} options={[{ value: 'own', label: 'I own it' }, { value: 'rent', label: 'I rent it' }]} />
        </div>
      </Section>

      <Section title="Size and age" foot="Year built helps Homebase suggest checks for older systems.">
        <FormGroup>
          <TextField label="Year built" optional inputMode="numeric" value={yearBuilt} onChange={(e) => setYearBuilt(e.target.value)} error={errors.yearBuilt} />
          <TextField label="Square feet" optional inputMode="numeric" value={squareFeet} onChange={(e) => setSquareFeet(e.target.value)} error={errors.squareFeet} />
          <TextField label="Bedrooms" optional inputMode="numeric" value={bedrooms} onChange={(e) => setBedrooms(e.target.value)} error={errors.bedrooms} />
          <TextField label="Bathrooms" optional inputMode="decimal" value={bathrooms} onChange={(e) => setBathrooms(e.target.value)} error={errors.bathrooms} />
        </FormGroup>
      </Section>

      <Section title="Notes">
        <FormGroup>
          <TextArea label="Anything to remember" optional value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Water shut-off is behind the laundry panel" />
        </FormGroup>
      </Section>

      <div className="button-stack">
        <button type="button" className="button is-primary is-block" onClick={save}>
          Save
        </button>
      </div>
    </Page>
  );
}
