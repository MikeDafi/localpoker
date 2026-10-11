import { describe, expect, it } from 'vitest';
import { canPlayInAppState, resolveChipSoundName } from '../sound';

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

describe('playing only in the foreground', () => {
  it('plays while the app is active', () => {
    expect(canPlayInAppState('active')).toBe(true);
  });

  it.each(['background', 'inactive'])('skips while the app is %s', (state) => {
    expect(canPlayInAppState(state)).toBe(false);
  });

  it('plays when the state is unknown rather than muting the table', () => {
    expect(canPlayInAppState(null)).toBe(true);
    expect(canPlayInAppState(undefined)).toBe(true);
  });
});
