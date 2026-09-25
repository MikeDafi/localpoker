export const OBJECTIONABLE_TERMS = [
  'fuck',
  'shit',
  'cunt',
  'nazi',
  'hitler',
  'nigger',
  'faggot',
] as const;

const LEET_CHARS: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  '$': 's',
  '!': 'i',
};

export type PublicNameKind = 'name' | 'handle';

export const normalizeModerationText = (input: string): string =>
  input
    .toLowerCase()
    .split('')
    .map((char) => LEET_CHARS[char] ?? char)
    .join('')
    .replace(/[^a-z0-9]/g, '');

export const containsObjectionableTerm = (input: string): boolean => {
  const normalized = normalizeModerationText(input);
  return OBJECTIONABLE_TERMS.some((term) => normalized.includes(term));
};

export const publicNameIssue = (input: string, kind: PublicNameKind): string | null => {
  if (containsObjectionableTerm(input)) {
    return `Choose a different ${kind}.`;
  }
  return null;
};

export const maskedPublicName = (input: string): string =>
  containsObjectionableTerm(input) ? 'Blocked player' : input;
