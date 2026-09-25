declare const __DEV__: boolean | undefined;
declare const require: ((moduleName: string) => unknown) | undefined;
declare const process: { env: Record<string, string | undefined> };

export type TelemetryLevel = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface TelemetryContext {
  tags?: Record<string, string | number | boolean | null | undefined>;
  extra?: Record<string, unknown>;
  contexts?: Record<string, Record<string, unknown>>;
  fingerprint?: string[];
  level?: TelemetryLevel;
}

export interface TelemetryBreadcrumb {
  message?: string;
  category?: string;
  level?: TelemetryLevel;
  data?: Record<string, unknown>;
}

interface SentryModule {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown, context?: TelemetryContext) => string | undefined;
  captureMessage: (
    message: string,
    levelOrContext?: TelemetryLevel | TelemetryContext,
  ) => string | undefined;
  addBreadcrumb?: (breadcrumb: TelemetryBreadcrumb) => void;
}

type SentryLoader = () => SentryModule;

/**
 * Trim and treat blank as unset. The *reads* have to stay literal
 * `process.env.EXPO_PUBLIC_...` member expressions, because that is the exact
 * syntax `babel-preset-expo` replaces with the value at build time; a computed
 * lookup resolves to nothing in a release bundle.
 */
const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const isDev = (): boolean => {
  if (typeof __DEV__ !== 'undefined') return Boolean(__DEV__);
  return clean(process.env.NODE_ENV) !== 'production';
};

const loadSentryModule: SentryLoader = () => {
  if (typeof require !== 'function') {
    throw new Error('CommonJS require is unavailable');
  }
  return require('@sentry/react-native') as SentryModule;
};

let sentryLoader: SentryLoader = loadSentryModule;
let sentry: SentryModule | null = null;
let unavailable = false;
let warnedUnavailable = false;

const warnDevOnce = (message: string, error?: unknown): void => {
  if (!isDev() || warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(message, error);
};

const disableTelemetry = (reason: string, error?: unknown): void => {
  sentry = null;
  unavailable = true;
  warnDevOnce(reason, error);
};

const getSentry = (): SentryModule | null => {
  if (sentry) return sentry;
  if (unavailable) return null;

  const dsn = clean(process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (!dsn) {
    unavailable = true;
    return null;
  }

  try {
    const loaded = sentryLoader();
    loaded.init({
      dsn,
      enabled: true,
      debug: isDev(),
      environment: isDev() ? 'development' : 'production',
      sendDefaultPii: false,
      tracesSampleRate: 0,
    });
    sentry = loaded;
    return sentry;
  } catch (error) {
    disableTelemetry('Telemetry is unavailable; continuing without Sentry.', error);
    return null;
  }
};

export const initTelemetry = (): void => {
  getSentry();
};

export const captureError = (error: unknown, context?: TelemetryContext): void => {
  const client = getSentry();
  if (!client) return;

  try {
    client.captureException(error, context);
  } catch (captureFailure) {
    disableTelemetry('Telemetry capture failed; disabling Sentry for this session.', captureFailure);
  }
};

export const captureMessage = (
  message: string,
  level: TelemetryLevel = 'info',
  context?: TelemetryContext,
): void => {
  const client = getSentry();
  if (!client) return;

  try {
    client.captureMessage(message, context ? { ...context, level } : level);
  } catch (captureFailure) {
    disableTelemetry('Telemetry message capture failed; disabling Sentry for this session.', captureFailure);
  }
};

export const addBreadcrumb = (breadcrumb: TelemetryBreadcrumb): void => {
  const client = getSentry();
  if (!client?.addBreadcrumb) return;

  try {
    client.addBreadcrumb(breadcrumb);
  } catch (captureFailure) {
    disableTelemetry('Telemetry breadcrumb capture failed; disabling Sentry for this session.', captureFailure);
  }
};

export const __setSentryLoaderForTests = (loader: SentryLoader): void => {
  sentryLoader = loader;
};

export const __resetTelemetryForTests = (): void => {
  sentryLoader = loadSentryModule;
  sentry = null;
  unavailable = false;
  warnedUnavailable = false;
};
