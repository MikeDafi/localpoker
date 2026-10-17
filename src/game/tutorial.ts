import { legalActions, type BotDecision, type GameState, type PlayerAction } from '../engine';
import type { RoomSummary } from '../services/firebase/types';
import { normalizeSettings, type GameSettings } from './settings';

/**
 * The first-run tutorial, as data and pure decisions.
 *
 * Everything here is decidable without a device: who is shown the tutorial,
 * which step follows which, how the practice bots play and what the sample
 * tables look like. The screens only render the coach mark for the step they
 * are told is current and report what the player did.
 */

/**
 * Every step, in order.
 *
 * The first five happen at one table. They are separate steps rather than one
 * because each waits for the player to actually do the thing it describes,
 * and a coach mark that moves on by itself teaches nothing.
 */
export const TUTORIAL_STEPS = ['peel', 'react', 'call', 'fold', 'tableDone', 'pal', 'friends', 'join'] as const;

export type TutorialStep = (typeof TUTORIAL_STEPS)[number];

/** Stored under its own key. `pending` means a new player who has not finished or skipped it. */
export type TutorialStatus = 'pending' | 'done';

/** What a screen reports. `next` is the coach mark's own button, for steps that only explain. */
export type TutorialEvent = 'peeked' | 'reacted' | 'next' | PlayerAction;

export type TutorialScreen = 'Table' | 'PalDesigner' | 'Friends' | 'CreateJoin';

/**
 * Which player actions finish each table step.
 *
 * Call and check are the same lesson, because which of the two is on offer
 * depends on where the blinds fell, and the coach mark must never ask for a
 * button that is not there. Fold and raise are the same lesson for the same
 * reason, and a bet is what raising is called when nobody has bet yet.
 */
const STEP_ACTIONS: Partial<Record<TutorialStep, readonly TutorialEvent[]>> = {
  peel: ['peeked'],
  react: ['reacted'],
  call: ['call', 'check'],
  fold: ['fold', 'raise', 'bet', 'allin'],
  tableDone: ['next'],
  pal: ['next'],
  friends: ['next'],
  join: ['next'],
};

/**
 * The step after `step`, given what the player just did.
 *
 * Anything that is not this step's lesson leaves it where it is, so calling
 * while being asked to peel does not skip the peel. `done` means the whole
 * tutorial is over.
 */
export function nextTutorialStep(step: TutorialStep, event: TutorialEvent): TutorialStep | 'done' {
  if (!STEP_ACTIONS[step]?.includes(event)) return step;
  const index = TUTORIAL_STEPS.indexOf(step);
  return TUTORIAL_STEPS[index + 1] ?? 'done';
}

export function tutorialScreenFor(step: TutorialStep): TutorialScreen {
  switch (step) {
    case 'pal':
      return 'PalDesigner';
    case 'friends':
      return 'Friends';
    case 'join':
      return 'CreateJoin';
    default:
      return 'Table';
  }
}

/** Anything that shows this person has played before. */
export interface PlayHistory {
  handsPlayed: number;
  xp: number;
  hasSavedGame: boolean;
}

export function hasPlayHistory(history: PlayHistory): boolean {
  return history.handsPlayed > 0 || history.xp > 0 || history.hasSavedGame;
}

/**
 * Whether this device owes its player the tutorial, decided once at launch.
 *
 * A stored answer wins, except that a pending one gives way to evidence of
 * play, because signing in can restore an account with years of hands behind
 * it onto a device that had only ever seen the age gate.
 *
 * With nothing stored, the build is either a fresh install or one from before
 * the tutorial existed. A fresh install has no profile yet. An older install
 * that got as far as signing in is treated as an existing player even with no
 * hands recorded, because the Pal designer is behind sign in and a Pal they
 * spent time on is not something this can detect. Being shown a tutorial they
 * do not need costs an existing player more than missing one costs a new one,
 * who can replay it from Settings.
 */
export function resolveTutorialStatus(input: PlayHistory & {
  stored: string | null;
  hadProfile: boolean;
  signedIn: boolean;
}): TutorialStatus {
  if (input.stored === 'done') return 'done';
  if (hasPlayHistory(input)) return 'done';
  if (input.stored === 'pending') return 'pending';
  if (!input.hadProfile) return 'pending';
  return input.signedIn ? 'done' : 'pending';
}

/**
 * Whether to put a player at the tutorial table right now.
 *
 * Only once signed in, which is the moment the menu would otherwise appear,
 * and never over an existing history for the same reason as above.
 */
export function shouldStartTutorial(input: PlayHistory & {
  status: TutorialStatus;
  signedIn: boolean;
  running: boolean;
}): boolean {
  return input.status === 'pending' && input.signedIn && !input.running && !hasPlayHistory(input);
}

/**
 * The practice table: two bots, so there is a bet to call and somebody to
 * fold to, and a clock long enough that reading the coach mark never times
 * the player out. The player's own sound and look settings carry over.
 *
 * The seed deals the player pocket tens on the button, so they act first
 * with a Call on offer and the peel shows them something worth having.
 */
export const TUTORIAL_SEED = 11;

export function tutorialTableSettings(base: GameSettings): GameSettings {
  return normalizeSettings({
    ...base,
    gameMode: 'cash',
    numOpponents: 2,
    maxPlayers: 3,
    smallBlind: 10,
    bigBlind: 20,
    ante: 0,
    startingStack: 2000,
    turnTimerSec: 60,
    botSpeed: 'normal',
    // The fold lesson must not stop to ask whether they meant it.
    confirmFoldWhenCheckAvailable: false,
  });
}

/**
 * How a practice bot plays: open the betting after the flop, otherwise check
 * or call.
 *
 * Scripted rather than the real bots, because the coach marks ask for
 * particular buttons. A real bot folding round to the player leaves nobody to
 * call, and one shoving makes the only lesson on offer an all in. With these,
 * the player always meets a bet after the flop, so Fold and Raise are both on
 * screen for the step that asks for them.
 */
export function tutorialBotDecision(state: GameState, playerId: string): BotDecision {
  const legal = legalActions(state, playerId);
  if (state.street !== 'preflop' && legal.actions.includes('bet') && legal.minBet) {
    return { action: 'bet', amount: legal.minBet };
  }
  if (legal.actions.includes('check')) return { action: 'check' };
  if (legal.actions.includes('call')) return { action: 'call' };
  if (legal.actions.includes('allin')) return { action: 'allin' };
  return { action: 'fold' };
}

/** What each coach mark says. Short, because it sits over a live table. */
export const TUTORIAL_COPY: Record<TutorialStep, { title: string; body: string; next?: string }> = {
  peel: {
    title: 'Peek at your cards',
    body: 'Your two cards are face down so nobody else can see them. Drag up on them to peel the corners and read your hand.',
  },
  react: {
    title: 'Say something',
    body: 'Tap the chat bubble to send a reaction or make your Pal move. Everyone at the table sees it over your seat.',
  },
  call: {
    title: 'Call or check',
    body: 'On your turn, Call matches the bet in front of you. When there is nothing to match, the same button says Check and passes for free.',
  },
  fold: {
    title: 'Fold or raise',
    body: 'Fold gives up the hand and the chips you have put in. Raise (Bet when nobody has) puts more in. Try one.',
  },
  tableDone: {
    title: 'That is poker',
    body: 'Best five card hand from your two and the five on the table wins the pot, or the last player who has not folded does.',
    next: 'Next: your Pal',
  },
  pal: {
    title: 'Make your Pal',
    body: 'This is you at the table. Pick a tab above, then change anything you like. You can come back any time from My Pal on the menu.',
    next: 'Save and continue',
  },
  friends: {
    title: 'Add a friend',
    body: 'Type a friend’s name here and tap Add. They accept, and you can invite them to your tables. Nothing is sent while you practise.',
    next: 'Next: find a game',
  },
  join: {
    title: 'Join a game',
    body: 'When a friend opens a table it shows up here. Tap Join to sit down. These are sample tables, just for the tutorial.',
    next: 'Finish',
  },
};

/**
 * The sample tables shown in the join step.
 *
 * Clearly fake on purpose, by name and by code, and only ever handed to the
 * Join Room list while the tutorial is on that step. Nothing here is written
 * anywhere: they are not rooms, they are pictures of rooms.
 */
export const TUTORIAL_SAMPLE_ROOMS: readonly RoomSummary[] = [
  {
    code: 'DEMO',
    hostUid: 'tutorial-sample-1',
    hostName: 'Sample: Riley',
    visibility: 'private',
    status: 'lobby',
    playerCount: 3,
    smallBlind: 10,
    bigBlind: 20,
    startingStack: 2000,
    gameMode: 'cash',
    updatedAt: 0,
  },
  {
    code: 'TEST',
    hostUid: 'tutorial-sample-2',
    hostName: 'Sample: Jordan',
    visibility: 'private',
    status: 'lobby',
    playerCount: 2,
    smallBlind: 25,
    bigBlind: 50,
    startingStack: 5000,
    gameMode: 'tournament',
    updatedAt: 0,
  },
];

export const TUTORIAL_SAMPLE_SEATS: Readonly<Record<string, { id: string; name: string; palSeed: string }[]>> = {
  DEMO: [
    { id: 'sample-riley', name: 'Riley', palSeed: 'sample-riley' },
    { id: 'sample-sam', name: 'Sam', palSeed: 'sample-sam' },
    { id: 'sample-alex', name: 'Alex', palSeed: 'sample-alex' },
  ],
  TEST: [
    { id: 'sample-jordan', name: 'Jordan', palSeed: 'sample-jordan' },
    { id: 'sample-casey', name: 'Casey', palSeed: 'sample-casey' },
  ],
};
