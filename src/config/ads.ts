declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;

const envValue = typeof process !== 'undefined'
  ? process.env?.EXPO_PUBLIC_ADS_ENABLED?.trim().toLowerCase()
  : undefined;

export const ADS_ENABLED = envValue === 'true';
