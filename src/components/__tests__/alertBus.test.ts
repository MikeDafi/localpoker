import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buttonVariant,
  currentAlert,
  dismissAlert,
  normaliseButtons,
  primaryButtonIndex,
  resetAlerts,
  showAlert,
  subscribeAlerts,
} from '../alertBus';

describe('alertBus', () => {
  beforeEach(() => resetAlerts());

  describe('normaliseButtons', () => {
    it('gives a bare acknowledgement a way out', () => {
      expect(normaliseButtons()).toEqual([{ text: 'OK' }]);
      expect(normaliseButtons([])).toEqual([{ text: 'OK' }]);
    });

    it('copies the caller\u2019s buttons rather than holding their array', () => {
      const given = [{ text: 'Stay', style: 'cancel' as const }];
      const got = normaliseButtons(given);
      expect(got).toEqual(given);
      expect(got[0]).not.toBe(given[0]);
    });
  });

  describe('primaryButtonIndex', () => {
    it('promotes the single ordinary choice', () => {
      expect(primaryButtonIndex([{ text: 'Back to menu' }])).toBe(0);
    });

    it('promotes the confirmation in a cancel-or-confirm pair', () => {
      expect(primaryButtonIndex([
        { text: 'Back to menu', style: 'cancel' },
        { text: 'Rebuy (free)' },
      ])).toBe(1);
    });

    it('promotes nothing in a menu of equals', () => {
      expect(primaryButtonIndex([
        { text: 'View stats' },
        { text: 'Report offensive content' },
        { text: 'Block and leave table', style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ])).toBe(-1);
    });

    it('promotes nothing when the only choices are leaving or not', () => {
      expect(primaryButtonIndex([
        { text: 'Stay', style: 'cancel' },
        { text: 'Leave', style: 'destructive' },
      ])).toBe(-1);
    });
  });

  describe('buttonVariant', () => {
    const buttons = [
      { text: 'Stay', style: 'cancel' as const },
      { text: 'Rebuy' },
      { text: 'Leave', style: 'destructive' as const },
    ];

    it('paints a destructive choice red whatever else is on offer', () => {
      expect(buttonVariant(buttons[2]!, 2, 1)).toBe('red');
      expect(buttonVariant(buttons[2]!, 2, -1)).toBe('red');
    });

    it('keeps cancel quiet', () => {
      expect(buttonVariant(buttons[0]!, 0, 1)).toBe('white');
    });

    it('golds only the promoted choice', () => {
      expect(buttonVariant(buttons[1]!, 1, 1)).toBe('gold');
      expect(buttonVariant(buttons[1]!, 1, -1)).toBe('blue');
    });
  });

  describe('the queue', () => {
    it('shows the first alert raised', () => {
      showAlert('Table over', 'You are out of chips.');
      expect(currentAlert()?.title).toBe('Table over');
    });

    it('queues a second alert behind the first rather than dropping it', () => {
      const first = showAlert('Out of chips');
      showAlert('Table over');
      expect(currentAlert()?.title).toBe('Out of chips');
      dismissAlert(first);
      expect(currentAlert()?.title).toBe('Table over');
    });

    it('ignores a dismissal for an alert that is no longer on top', () => {
      const first = showAlert('Out of chips');
      showAlert('Table over');
      dismissAlert(first);
      dismissAlert(first);
      expect(currentAlert()?.title).toBe('Table over');
    });

    it('tells a new subscriber what is already on screen', () => {
      showAlert('Report sent');
      const seen = vi.fn();
      subscribeAlerts(seen);
      expect(seen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Report sent' }));
    });

    it('stops telling an unsubscribed listener anything', () => {
      const seen = vi.fn();
      const off = subscribeAlerts(seen);
      seen.mockClear();
      off();
      showAlert('Report sent');
      expect(seen).not.toHaveBeenCalled();
    });

    it('empties out once everything raised has been answered', () => {
      const id = showAlert('Leave table?', undefined, [{ text: 'Stay', style: 'cancel' }]);
      dismissAlert(id);
      expect(currentAlert()).toBeNull();
    });
  });
});
