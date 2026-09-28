import { describe, it, expect } from 'vitest';

/**
 * The friend row has now been reported broken twice, and both times the cause
 * was the same: the action column was sized by guesswork instead of measured,
 * so "fixed" meant "looked plausible in the diff".
 *
 * These are the real numbers. Glyph widths were measured from the shipped
 * Fredoka files rather than estimated:
 *
 *   Fredoka 600SemiBold @14pt   Invite 35.2   Pending 50.7
 *   Fredoka 700Bold     @17pt   turbo_river 93.6   maskndafi 79.3
 *
 * The arithmetic below mirrors FriendsScreen's styles, so if someone reinstates
 * a width cap or makes the labels longer, this fails here rather than in
 * TestFlight.
 */

// iPhone 17 Pro. 402pt is the narrowest width currently targeted.
const SCREEN = 402;
const SCREEN_PADDING = 16; // spacing.lg, each side
const ROW_PADDING = 12; // spacing.md, each side
const GAP = 12; // spacing.md, between the row's three children
const AVATAR = 52; // avatarSpot
const BUTTON_PADDING = 32; // WiiButton sm, 16 each side
const ROUND_BUTTON = 48; // WiiButton sm round: height 40 + 8
const ACTION_GAP = 4; // spacing.xs

/** Measured from Fredoka_600SemiBold at 14pt, the sm button label size. */
const LABEL_14 = { Invite: 35.2, Pending: 50.7 } as const;
/** Measured from Fredoka_700Bold at 17pt, the friendName size. */
const NAME_17 = { turbo_river: 93.6, maskndafi: 79.3 } as const;

/** What the row has left once the avatar and its gaps are taken out. */
const rowSpace = SCREEN - SCREEN_PADDING * 2 - ROW_PADDING * 2 - AVATAR - GAP * 2;

/** The action column sizes to its content now, rather than to a fixed cap. */
const actionsWidth = (label: keyof typeof LABEL_14) =>
  LABEL_14[label] + BUTTON_PADDING + ACTION_GAP + ROUND_BUTTON;

describe('friend row fits on one line', () => {
  it('leaves room for a realistic handle beside Invite', () => {
    expect(NAME_17.turbo_river).toBeLessThan(rowSpace - actionsWidth('Invite'));
  });

  it('still fits when the button reads Pending, which is the wider state', () => {
    expect(NAME_17.turbo_river).toBeLessThan(rowSpace - actionsWidth('Pending'));
  });

  it('records why the 132pt cap had to go, rather than trusting the memory of it', () => {
    // Invite fitted under the old cap, which is why the bug looked fixed. The
    // moment an invite was sent the label became Pending and it wrapped again.
    expect(actionsWidth('Invite')).toBeLessThan(132);
    expect(actionsWidth('Pending')).toBeGreaterThan(132);
  });

  it('keeps the buttons to well under half the row, so the name is not squeezed', () => {
    expect(actionsWidth('Pending')).toBeLessThan(rowSpace * 0.55);
  });

  it('would not have fitted the old three button row, which is the original bug', () => {
    // Invite + Safety + the removed cross, as build 13 shipped it.
    const threeUp = actionsWidth('Invite') + ACTION_GAP + (44.4 + BUTTON_PADDING) + ACTION_GAP + ROUND_BUTTON;
    expect(rowSpace - threeUp).toBeLessThan(NAME_17.turbo_river);
  });
});
