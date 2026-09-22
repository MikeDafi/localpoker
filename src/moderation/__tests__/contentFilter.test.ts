import { describe, expect, it } from 'vitest';
import {
  containsObjectionableTerm,
  maskedPublicName,
  normalizeModerationText,
  publicNameIssue,
} from '../contentFilter';

describe('contentFilter', () => {
  it('normalizes separators and simple leet substitutions', () => {
    expect(normalizeModerationText('F.u-c_k')).toBe('fuck');
    expect(normalizeModerationText('sh!t')).toBe('shit');
  });

  it('detects obvious objectionable names', () => {
    expect(containsObjectionableTerm('nice player')).toBe(false);
    expect(containsObjectionableTerm('nazi_chip')).toBe(true);
  });

  it('returns a short user-facing validation issue', () => {
    expect(publicNameIssue('river_shark', 'handle')).toBeNull();
    expect(publicNameIssue('hitler_ace', 'handle')).toBe('Choose a different handle.');
  });

  it('masks blocked names for display', () => {
    expect(maskedPublicName('Lucky Ace')).toBe('Lucky Ace');
    expect(maskedPublicName('bad f.u-c_k')).toBe('Blocked player');
  });
});
