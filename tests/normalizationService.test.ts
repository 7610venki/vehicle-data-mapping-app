import { describe, it, expect } from 'vitest';
import { extractBaseModel } from '../services/normalizationService';

describe('extractBaseModel', () => {
  it('trims removed', () => {
    expect(extractBaseModel('Camry XLE V6')).toBe('camry');
  });

  it('numbers stripped', () => {
    expect(extractBaseModel('IS 300 F')).toBe('is');
  });

  it('keywords ignored', () => {
    expect(extractBaseModel('Patrol Pick Up')).toBe('patrol');
  });
});
