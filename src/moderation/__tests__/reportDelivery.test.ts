import { describe, expect, it, vi } from 'vitest';
import {
  REPORT_EMAIL,
  buildReportEmail,
  reportMailtoUrl,
  withTimeout,
} from '../reportDelivery';

describe('withTimeout', () => {
  /*
   * The actual bug. A Firebase write that never settles used to leave the
   * report flow awaiting forever, which the player saw as a frozen screen.
   */
  it('resolves with the fallback when the promise never settles', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise<string>(() => {});
      const result = withTimeout(never, 1000, 'timed-out');
      await vi.advanceTimersByTimeAsync(1000);
      await expect(result).resolves.toBe('timed-out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('passes a value straight through when it arrives in time', async () => {
    await expect(withTimeout(Promise.resolve('sent'), 1000, 'timed-out')).resolves.toBe('sent');
  });

  it('turns a rejection into the fallback rather than throwing', async () => {
    await expect(withTimeout(Promise.reject(new Error('nope')), 1000, 'fallback')).resolves.toBe('fallback');
  });

  it('ignores a late settle once the timeout has fired', async () => {
    vi.useFakeTimers();
    try {
      let release: (v: string) => void = () => {};
      const slow = new Promise<string>((resolve) => { release = resolve; });
      const result = withTimeout(slow, 500, 'timed-out');
      await vi.advanceTimersByTimeAsync(500);
      release('late');
      await expect(result).resolves.toBe('timed-out');
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears its timer when the promise wins, so nothing is left pending', async () => {
    vi.useFakeTimers();
    try {
      await expect(withTimeout(Promise.resolve('fast'), 5000, 'timed-out')).resolves.toBe('fast');
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('buildReportEmail', () => {
  const base = {
    reportedName: 'rude_player',
    context: 'table' as const,
    at: new Date('2026-10-04T12:00:00.000Z'),
  };

  it('goes to the published support address', () => {
    expect(buildReportEmail(base).to).toBe(REPORT_EMAIL);
  });

  it('names the player in the subject so reports trail by player', () => {
    expect(buildReportEmail(base).subject).toContain('rude_player');
  });

  it('includes the identifiers needed to act on it', () => {
    const email = buildReportEmail({
      ...base,
      roomCode: 'XL4U',
      reportedUid: 'uid-them',
      reporterUid: 'uid-me',
      reporterHandle: 'maskndafi',
      appVersion: '1.0.1',
    });
    for (const needle of ['XL4U', 'uid-them', 'uid-me', 'maskndafi', '1.0.1']) {
      expect(email.body).toContain(needle);
    }
  });

  it('omits optional lines rather than printing undefined', () => {
    const body = buildReportEmail(base).body;
    expect(body).not.toContain('undefined');
    expect(body).not.toContain('Room:');
  });

  /*
   * A report is not a licence to ship the device's data. If this ever needs
   * to carry more, that is a privacy decision, not a convenience one.
   */
  it('carries no content beyond the report itself', () => {
    const body = buildReportEmail({ ...base, roomCode: 'XL4U' }).body;
    expect(body.length).toBeLessThan(600);
  });

  it('survives an empty or whitespace name', () => {
    expect(buildReportEmail({ ...base, reportedName: '   ' }).subject).toContain('Unnamed player');
  });
});

describe('reportMailtoUrl', () => {
  it('escapes the subject and body', () => {
    const url = reportMailtoUrl({ to: 'a@b.com', subject: 'a b&c', body: 'line1\nline2' });
    expect(url.startsWith('mailto:a@b.com?')).toBe(true);
    expect(url).toContain('subject=a%20b%26c');
    expect(url).toContain('line1%0Aline2');
    // An unescaped newline or ampersand would truncate the message.
    expect(url).not.toContain('\n');
  });
});
