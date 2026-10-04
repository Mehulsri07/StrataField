import { describe, it, expect } from 'vitest';
import { splitPump } from './pump';

describe('splitPump', () => {
  it('finds the maker wherever it is written, in any case', () => {
    expect(splitPump('KSB 12C/17')).toEqual({ make: 'KSB', model: '12C/17' });
    expect(splitPump('12C/17 ksb')).toEqual({ make: 'KSB', model: '12C/17' });
    expect(splitPump('PLUGA')).toEqual({ make: 'Pluga', model: '' });
    expect(splitPump('CRI 15 stage')).toEqual({ make: 'CRI', model: '15 stage' });
  });

  it('leaves a maker it does not know in the model', () => {
    expect(splitPump('Texmo 14 Stage')).toEqual({ make: '', model: 'Texmo 14 Stage' });
    expect(splitPump('Texmo 14 Stage', ['Texmo'])).toEqual({ make: 'Texmo', model: '14 Stage' });
    expect(splitPump('  ')).toEqual({ make: '', model: '' });
  });
});
