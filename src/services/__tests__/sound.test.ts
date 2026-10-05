import { describe, expect, it } from 'vitest';
import { resolveChipSoundName } from '../sound';

describe('chip sound style resolution', () => {
  it.each([
    ['toss', 'chipCall-toss', 'chipRaise-toss'],
    ['splash', 'chipCall-splash', 'chipRaise-splash'],
    ['riffle', 'chipCall-riffle', 'chipRaise-riffle'],
  ])('maps %s to its call and raise cues', (style, callName, raiseName) => {
    expect(resolveChipSoundName('call', style)).toBe(callName);
    expect(resolveChipSoundName('raise', style)).toBe(raiseName);
  });

  it('falls back to toss for an unknown style', () => {
    expect(resolveChipSoundName('call', 'stack-drop')).toBe('chipCall-toss');
    expect(resolveChipSoundName('raise', 'stack-drop')).toBe('chipRaise-toss');
  });
});
