import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetTelemetryForTests,
  __setSentryLoaderForTests,
  addBreadcrumb,
  captureError,
  captureMessage,
  initTelemetry,
} from '../telemetry';

const env = (globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
}).process.env;

const originalDsn = env.EXPO_PUBLIC_SENTRY_DSN;

describe('telemetry graceful degradation', () => {
  beforeEach(() => {
    __resetTelemetryForTests();
    delete env.EXPO_PUBLIC_SENTRY_DSN;
  });

  afterEach(() => {
    if (originalDsn === undefined) delete env.EXPO_PUBLIC_SENTRY_DSN;
    else env.EXPO_PUBLIC_SENTRY_DSN = originalDsn;
    __resetTelemetryForTests();
    vi.restoreAllMocks();
  });

  it('no-ops without a DSN and never loads Sentry', () => {
    let loadAttempts = 0;
    __setSentryLoaderForTests(() => {
      loadAttempts += 1;
      throw new Error('Sentry should not load without a DSN');
    });

    expect(() => initTelemetry()).not.toThrow();
    expect(() => captureError(new Error('render failed'), { tags: { area: 'test' } })).not.toThrow();
    expect(() => captureMessage('test message', 'warning')).not.toThrow();
    expect(() => addBreadcrumb({ message: 'test breadcrumb' })).not.toThrow();
    expect(loadAttempts).toBe(0);
  });

  it('no-ops when native Sentry is unavailable', () => {
    env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let loadAttempts = 0;
    __setSentryLoaderForTests(() => {
      loadAttempts += 1;
      throw new Error('native module missing');
    });

    expect(() => initTelemetry()).not.toThrow();
    expect(() => captureError(new Error('render failed'))).not.toThrow();
    expect(() => captureMessage('test message')).not.toThrow();
    expect(() => addBreadcrumb({ category: 'test', message: 'breadcrumb' })).not.toThrow();

    expect(loadAttempts).toBe(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('Telemetry is unavailable');
  });
  it('stays inert in a development build, so local debugging cannot page the team', () => {
    /*
     * A developer running against Metro shares the project DSN. Every
     * deliberate crash and every debugging harness used to raise a real
     * Sentry issue from a local worktree, which is how a harness bug ended up
     * notifying the project.
     */
    env.EXPO_PUBLIC_SENTRY_DSN = 'https://public@example.com/1';
    const options: Record<string, unknown>[] = [];
    __setSentryLoaderForTests(() => ({
      init: (opts: Record<string, unknown>) => options.push(opts),
      captureException: () => {},
      captureMessage: () => {},
      addBreadcrumb: () => {},
      withScope: (fn: (scope: unknown) => void) => {
        fn({ setTag: () => {}, setTags: () => {}, setExtras: () => {}, setLevel: () => {} });
      },
    }) as never);

    initTelemetry();

    expect(options).toHaveLength(1);
    // vitest runs with __DEV__ undefined and NODE_ENV 'test', so isDev() is true.
    expect(options[0].enabled).toBe(false);
    expect(options[0].environment).toBe('development');
  });
});
