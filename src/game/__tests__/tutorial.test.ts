import { describe, expect, it } from 'vitest';
import { applyAction, createGame, legalActions, startHand, type GameState } from '../../engine';
import { DEFAULT_GAME_SETTINGS } from '../settings';
import {
  TUTORIAL_COPY,
  TUTORIAL_SAMPLE_ROOMS,
  TUTORIAL_SAMPLE_SEATS,
  TUTORIAL_SEED,
  TUTORIAL_STEPS,
  nextTutorialStep,
  resolveTutorialStatus,
  shouldStartTutorial,
  tutorialBotDecision,
  tutorialScreenFor,
  tutorialTableSettings,
} from '../tutorial';

const noHistory = { handsPlayed: 0, xp: 0, hasSavedGame: false };

describe('resolveTutorialStatus', () => {
  it('owes a fresh install the tutorial', () => {
    expect(resolveTutorialStatus({ ...noHistory, stored: null, hadProfile: false, signedIn: false })).toBe('pending');
  });

  it('never owes it once done', () => {
    expect(resolveTutorialStatus({ ...noHistory, stored: 'done', hadProfile: false, signedIn: false })).toBe('done');
  });

  it('keeps a stored pending across launches', () => {
    expect(resolveTutorialStatus({ ...noHistory, stored: 'pending', hadProfile: true, signedIn: true })).toBe('pending');
  });

  it('treats anyone with play history as an existing player', () => {
    for (const history of [
      { ...noHistory, handsPlayed: 3 },
      { ...noHistory, xp: 40 },
      { ...noHistory, hasSavedGame: true },
    ]) {
      expect(resolveTutorialStatus({ ...history, stored: null, hadProfile: true, signedIn: false })).toBe('done');
      // Evidence beats a stored pending too, for an account restored by signing in.
      expect(resolveTutorialStatus({ ...history, stored: 'pending', hadProfile: true, signedIn: true })).toBe('done');
    }
  });

  it('spares a signed in player from before the tutorial existed, even with no hands', () => {
    expect(resolveTutorialStatus({ ...noHistory, stored: null, hadProfile: true, signedIn: true })).toBe('done');
  });

  it('owes an older install that never got past sign in', () => {
    expect(resolveTutorialStatus({ ...noHistory, stored: null, hadProfile: true, signedIn: false })).toBe('pending');
  });
});

describe('shouldStartTutorial', () => {
  const base = { ...noHistory, status: 'pending' as const, signedIn: true, running: false };

  it('starts for a new player once signed in', () => {
    expect(shouldStartTutorial(base)).toBe(true);
  });

  it('waits for sign in', () => {
    expect(shouldStartTutorial({ ...base, signedIn: false })).toBe(false);
  });

  it('does not start twice', () => {
    expect(shouldStartTutorial({ ...base, running: true })).toBe(false);
  });

  it('never starts once done or over a history', () => {
    expect(shouldStartTutorial({ ...base, status: 'done' })).toBe(false);
    expect(shouldStartTutorial({ ...base, handsPlayed: 1 })).toBe(false);
    expect(shouldStartTutorial({ ...base, hasSavedGame: true })).toBe(false);
  });
});

describe('nextTutorialStep', () => {
  it('walks every step in order and then finishes', () => {
    const doing: Record<string, Parameters<typeof nextTutorialStep>[1]> = {
      peel: 'peeked', react: 'reacted', call: 'call', fold: 'fold',
      tableDone: 'next', pal: 'next', friends: 'next', join: 'next',
    };
    let step: ReturnType<typeof nextTutorialStep> = TUTORIAL_STEPS[0];
    const seen: string[] = [];
    while (step !== 'done') {
      seen.push(step);
      step = nextTutorialStep(step, doing[step]);
    }
    expect(seen).toEqual([...TUTORIAL_STEPS]);
  });

  it('waits for the thing the step asks for', () => {
    expect(nextTutorialStep('peel', 'call')).toBe('peel');
    expect(nextTutorialStep('peel', 'next')).toBe('peel');
    expect(nextTutorialStep('react', 'peeked')).toBe('react');
    expect(nextTutorialStep('call', 'fold')).toBe('call');
    expect(nextTutorialStep('fold', 'call')).toBe('fold');
    expect(nextTutorialStep('pal', 'fold')).toBe('pal');
  });

  it('accepts whichever of the paired buttons is on screen', () => {
    expect(nextTutorialStep('call', 'check')).toBe('fold');
    expect(nextTutorialStep('fold', 'raise')).toBe('tableDone');
    expect(nextTutorialStep('fold', 'bet')).toBe('tableDone');
    expect(nextTutorialStep('fold', 'allin')).toBe('tableDone');
  });

  it('sends each step to its screen', () => {
    expect(['peel', 'react', 'call', 'fold', 'tableDone'].map((s) => tutorialScreenFor(s as never))).toEqual(Array(5).fill('Table'));
    expect(tutorialScreenFor('pal')).toBe('PalDesigner');
    expect(tutorialScreenFor('friends')).toBe('Friends');
    expect(tutorialScreenFor('join')).toBe('CreateJoin');
  });

  it('has copy for every step, and a button for every step that only explains', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(TUTORIAL_COPY[step].title.length).toBeGreaterThan(0);
      if (nextTutorialStep(step, 'next') !== step) expect(TUTORIAL_COPY[step].next).toBeTruthy();
    }
  });

  it('keeps em dashes out of the copy', () => {
    expect(JSON.stringify(TUTORIAL_COPY)).not.toMatch(/—/);
  });
});

describe('the practice table', () => {
  const settings = tutorialTableSettings(DEFAULT_GAME_SETTINGS);

  const deal = (): GameState => startHand(createGame(
    {
      smallBlind: settings.smallBlind,
      bigBlind: settings.bigBlind,
      ante: settings.ante,
      startingStack: settings.startingStack,
      maxPlayers: settings.maxPlayers,
      turnTimerSec: settings.turnTimerSec,
    },
    [
      { id: 'me', name: 'You' },
      { id: 'bot-0', name: 'Ravi', isBot: true },
      { id: 'bot-1', name: 'Mika', isBot: true },
    ],
    TUTORIAL_SEED,
  ));

  /** Let the scripted bots act until it is the player's turn or the hand ends. */
  const botsUntilMe = (state: GameState): GameState => {
    let s = state;
    for (let guard = 0; guard < 30; guard++) {
      const actor = s.players[s.currentPlayerIndex];
      if (s.street === 'showdown' || !actor || actor.id === 'me') return s;
      const d = tutorialBotDecision(s, actor.id);
      const res = applyAction(s, actor.id, d.action, d.amount);
      expect(res.ok).toBe(true);
      s = res.state;
    }
    throw new Error('bots never handed the turn back');
  };

  it('is offline sized and slow enough to read', () => {
    expect(settings.numOpponents).toBe(2);
    expect(settings.turnTimerSec).toBe(60);
    expect(settings.confirmFoldWhenCheckAvailable).toBe(false);
  });

  it('always offers the buttons each coach mark asks for', () => {
    let s = botsUntilMe(deal());
    // The call lesson: Call or Check is there on the first decision.
    const first = legalActions(s, 'me').actions;
    expect(first.includes('call') || first.includes('check')).toBe(true);
    s = applyAction(s, 'me', first.includes('call') ? 'call' : 'check').state;

    // The fold lesson: after the flop the bots have bet into the player, so
    // Fold and Raise are both on screen.
    s = botsUntilMe(s);
    expect(s.street).toBe('flop');
    const second = legalActions(s, 'me').actions;
    expect(second).toContain('fold');
    expect(second.includes('raise') || second.includes('bet')).toBe(true);
  });

  it('keeps meeting a bet on every street if the player only calls', () => {
    let s = botsUntilMe(deal());
    s = applyAction(s, 'me', 'call').state;
    for (const street of ['flop', 'turn', 'river'] as const) {
      s = botsUntilMe(s);
      expect(s.street).toBe(street);
      expect(legalActions(s, 'me').actions).toContain('fold');
      s = applyAction(s, 'me', 'call').state;
    }
    expect(botsUntilMe(s).street).toBe('showdown');
  });

  it('deals the player a pair to peel at', () => {
    const me = deal().players.find((p) => p.id === 'me');
    expect(me?.holeCards[0].rank).toBe(me?.holeCards[1].rank);
  });
});

describe('sample tables', () => {
  it('are plainly samples and never real rooms', () => {
    for (const room of TUTORIAL_SAMPLE_ROOMS) {
      expect(room.hostName.startsWith('Sample')).toBe(true);
      expect(room.hostUid.startsWith('tutorial-sample')).toBe(true);
      expect(TUTORIAL_SAMPLE_SEATS[room.code]?.length).toBeGreaterThan(0);
    }
  });
});
