import { describe, it, expect } from 'vitest';
import {
  fromPercent,
  injuryFieldIds,
  isValidTimeZone,
  listTimeZones,
  toInjuryForm,
  toInjuryInput,
  toPercent,
  validateInjuryForm,
  type InjuryForm,
} from '../injuryConfigForm';
import { injuryTunablesFixture } from '../../../test/injuryTunablesFixture';
import type { InjuryTunablesInput } from '../../../types/injury';

function validForm(): InjuryForm {
  return toInjuryForm(injuryTunablesFixture());
}

describe('injury settings form', () => {
  it('round-trips the saved settings without float noise', () => {
    const settings = injuryTunablesFixture({ weeklyRecovery: 30 });
    const form = toInjuryForm(settings);
    expect(form.bands.map((band) => band.chancePercent)).toEqual([1, 3, 8, 15]);
    expect(form.enduranceReductionPercent).toBe(30);
    expect(form.recoveryMode).toBe('amount');

    const { version: _version, updatedAt: _updatedAt, updatedBy: _updatedBy, ...input } = settings;
    expect(toInjuryInput(form)).toEqual(input satisfies InjuryTunablesInput);
    expect(toPercent(0.07)).toBe(7);
    expect(fromPercent(7)).toBe(0.07);
  });

  it('sends "full" recovery and drops removed formats', () => {
    const form = validForm();
    form.formats = form.formats.filter((row) => row.key !== 'battleRoyal');
    const input = toInjuryInput(form);
    expect(input.weeklyRecovery).toBe('full');
    expect(Object.keys(input.formatMultiplier)).toEqual(['singles', 'tag', 'multiPerson']);
  });

  it('has no errors for the defaults', () => {
    expect(validateInjuryForm(validForm(), isValidTimeZone)).toEqual({});
  });

  it('flags bands out of order and a last band above 0', () => {
    const unsorted = validForm();
    unsorted.bands[1]!.minStamina = 80;
    expect(validateInjuryForm(unsorted, isValidTimeZone)[injuryFieldIds.bands]?.problem).toBe('bandsOrder');

    const noFloor = validForm();
    noFloor.bands[3]!.minStamina = 10;
    expect(validateInjuryForm(noFloor, isValidTimeZone)[injuryFieldIds.bands]?.problem).toBe('bandsLastZero');
  });

  it('flags chances over 100%, empty boxes and zero multipliers', () => {
    const form = validForm();
    const firstBand = form.bands[0]!;
    firstBand.chancePercent = 120;
    form.drainByCategory.cage = Number.NaN;
    form.categoryRisk.hardcore = 0;
    const errors = validateInjuryForm(form, isValidTimeZone);
    expect(errors[injuryFieldIds.bandChance(firstBand.rowId)]?.problem).toBe('percent');
    expect(errors[injuryFieldIds.drain('cage')]).toEqual({ problem: 'integer', values: { min: 0, max: 100 } });
    expect(errors[injuryFieldIds.risk('hardcore')]?.problem).toBe('multiplier');
  });

  it('flags min weeks above max weeks', () => {
    const form = validForm();
    form.severities[1]!.minWeeks = 4;
    expect(validateInjuryForm(form, isValidTimeZone)[injuryFieldIds.severity('moderate', 'maxWeeks')]?.problem).toBe('weeksOrder');
  });

  it('flags blank and repeated format keys', () => {
    const form = validForm();
    form.formats.push({ rowId: 'new-1', key: ' tag ', multiplier: 1 }, { rowId: 'new-2', key: '', multiplier: 1 });
    const errors = validateInjuryForm(form, isValidTimeZone);
    expect(errors[injuryFieldIds.formatKey('new-1')]?.problem).toBe('formatDuplicate');
    expect(errors[injuryFieldIds.formatKey('new-2')]?.problem).toBe('formatKey');
  });

  it('checks the recovery amount only when it is used, and the time zone', () => {
    const form = validForm();
    form.recoveryAmount = 0;
    expect(validateInjuryForm(form, isValidTimeZone)).toEqual({});
    form.recoveryMode = 'amount';
    form.timezone = 'Mars/Olympus';
    const errors = validateInjuryForm(form, isValidTimeZone);
    expect(errors[injuryFieldIds.recoveryAmount]?.problem).toBe('integer');
    expect(errors[injuryFieldIds.timezone]?.problem).toBe('timezone');
  });

  it('lists IANA zones and keeps the saved one', () => {
    const zones = listTimeZones('America/New_York');
    expect(zones).toContain('America/New_York');
    expect(zones).toContain('Europe/Berlin');
    expect(zones).toContain('UTC');
  });
});
