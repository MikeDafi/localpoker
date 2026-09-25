declare const process: { env: Record<string, string | undefined> };

/**
 * Written as a plain `process.env.EXPO_PUBLIC_...` member expression on
 * purpose: that exact syntax is what `babel-preset-expo` replaces with the
 * literal value at build time. Guarding it with `typeof process` or optional
 * chaining can leave the lookup intact, and there is no `process.env` object at
 * runtime in a release bundle, so the flag would read as unset there.
 */
const envValue = process.env.EXPO_PUBLIC_ADS_ENABLED?.trim().toLowerCase();

export const ADS_ENABLED = envValue === 'true';
