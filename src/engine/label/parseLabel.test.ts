import { describe, expect, it } from 'vitest';
import { parseLabel } from './parseLabel';

describe('parseLabel', () => {
  it('T1: reads brand, model and serial from a water heater label', () => {
    expect(parseLabel('RHEEM MFG CO MODEL: XE50T10H45U0 SERIAL NO. Q201512345')).toEqual({ brand: 'Rheem', model: 'XE50T10H45U0', serial: 'Q201512345' });
  });

  it('T2: reads M/N and S/N, with no brand', () => {
    expect(parseLabel('M/N 25HCB636A003 S/N 0815E12345')).toEqual({ model: '25HCB636A003', serial: '0815E12345' });
  });

  it('T3: finds nothing in text with no labels', () => {
    expect(parseLabel('Keep away from children. Read the manual.')).toEqual({});
  });

  it('T4: fixes O to 0 only inside the token, next to digits', () => {
    expect(parseLabel('MODEL NO XE5OT1O')).toEqual({ model: 'XE50T10' });
    expect(parseLabel('MODEL NO XE5OT1O ROOM TEMP').model).toBe('XE50T10');
  });

  it('T5: does not take a brand from "Made in USA"', () => {
    expect(parseLabel('Made in USA')).toEqual({});
  });

  it('T6: a model with no digit is not returned', () => {
    expect(parseLabel('MODEL: DELUXE')).toEqual({});
  });

  it('never guesses a brand from the model prefix', () => {
    expect(parseLabel('MODEL XE50T10H45U0').brand).toBeUndefined();
  });

  it('takes the brand that appears first, as a whole word', () => {
    expect(parseLabel('Navien Inc. LG MODEL NPE-240A2').brand).toBe('Navien');
    expect(parseLabel('Bosching MODEL ABC123').brand).toBeUndefined();
  });

  it('reads a lower-case serial and leaves plain words alone', () => {
    expect(parseLabel('serial # ab12cd34 Whirlpool').serial).toBe('AB12CD34');
  });
});
