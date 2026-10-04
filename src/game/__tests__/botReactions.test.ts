import { describe, expect, it } from 'vitest';

import {
  BAD_BEAT_BLOCKED_GIF_TAGS,
  BOT_REACTION_BOT_COOLDOWN_MS,
  BOT_REACTION_GLOBAL_COOLDOWN_MS,
  BOT_REACTION_INITIAL_MEMORY,
  BOT_REACTION_MAX_PER_HAND,
  createBotReactionMemory,
  getBotReactionCandidates,
  maybeBotReaction,
  type BotReactionInput,
} from '../botReactions';
import { GIF_EMOTES } from '../cosmetics';
import { evaluateHand } from '../../engine/handEvaluator';
import type { Card, Rank, Suit } from '../../engine/cards';
import type { GameState, Player, Winner } from '../../engine/types';

const card = (rank: Rank, suit: Suit): Card => ({ rank, suit });

const player = (id: string, overrides: Partial<Player> = {}): Player => ({
  id,
  name: id.toUpperCase(),
  seatIndex: Number(id.replace(/\D/g, '')) || 0,
  chips: 1_000,
  holeCards: [card(2, 'c'), card(3, 'd')],
  folded: false,
  allIn: false,
  currentBet: 0,
  hasActed: false,
  isBot: id.startsWith('bot'),
  sittingOut: false,
  ...overrides,
});

const state = (overrides: Partial<GameState> = {}): GameState => ({
  config: {
    smallBlind: 5,
    bigBlind: 10,
    startingStack: 1_000,
    maxPlayers: 6,
    turnTimerSec: 30,
  },
  players: [
    player('human', { isBot: false, seatIndex: 0 }),
    player('bot-1', { seatIndex: 1 }),
    player('bot-2', { seatIndex: 2 }),
  ],
  board: [],
  deck: [],
  street: 'river',
  pots: [{ amount: 240, eligiblePlayerIds: ['human', 'bot-1', 'bot-2'] }],
  currentPlayerIndex: 0,
  dealerIndex: 0,
  currentBet: 0,
  minRaise: 10,
  lastAggressorIndex: null,
  handNumber: 7,
  winners: [],
  log: [],
  seed: 'test',
  contributions: { human: 80, 'bot-1': 80, 'bot-2': 80 },
  ...overrides,
});

const winner = (playerId: string, amount: number, board: readonly Card[], holeCards: readonly Card[]): Winner => ({
  playerId,
  amount,
  hand: evaluateHand([...holeCards, ...board]),
});

const bigShowdown = (botId = 'bot-1'): BotReactionInput => {
  const board = [card(14, 's'), card(13, 's'), card(8, 's'), card(4, 'd'), card(2, 'h')];
  const winningCards = [card(12, 's'), card(11, 's')];
  const botOneCards = botId === 'bot-1' ? winningCards : [card(7, 'c'), card(6, 'd')];
  const botTwoCards = botId === 'bot-2' ? winningCards : [card(5, 'c'), card(3, 'h')];
  const previous = state({
    players: [
      player('human', { isBot: false, holeCards: [card(9, 'c'), card(9, 'd')] }),
      player('bot-1', { holeCards: botOneCards }),
      player('bot-2', { holeCards: botTwoCards }),
    ],
    board: board.slice(0, 4),
    street: 'river',
  });
  const current = state({
    ...previous,
    board,
    street: 'showdown',
    winners: [winner(botId, 240, board, winningCards)],
  });
  return { previousState: previous, state: current, botId, nowMs: 50_000 };
};

describe('bot reactions', () => {
  it('never maps a bad beat to a celebratory GIF from the real catalog', () => {
    const candidates = getBotReactionCandidates('badBeatLoss', {
      ownedCosmeticIds: Object.keys(GIF_EMOTES),
      includeFreeReactions: false,
    });
    const gifCandidates = candidates.filter((candidate) => candidate.kind === 'gif');
    const blockedTags = new Set<string>(BAD_BEAT_BLOCKED_GIF_TAGS);

    expect(gifCandidates.length).toBeGreaterThan(0);
    for (const candidate of gifCandidates) {
      const gif = GIF_EMOTES[candidate.sourceId];
      expect(gif, candidate.sourceId).toBeDefined();
      expect(gif.tags.some((tag) => blockedTags.has(tag))).toBe(false);
    }
  });

  it('suppresses a bot that is still inside its own cooldown', () => {
    const first = maybeBotReaction(bigShowdown(), createBotReactionMemory(), () => 0);
    expect(first.emote).not.toBeNull();

    const second = maybeBotReaction(
      { ...bigShowdown(), nowMs: 50_000 + BOT_REACTION_BOT_COOLDOWN_MS - 1 },
      first.memory,
      () => 0,
    );
    expect(second.emote).toBeNull();
    expect(second.reason).toBe('bot-cooldown');
  });

  it('uses the table cooldown to stop a mass reaction at one showdown', () => {
    const first = maybeBotReaction(bigShowdown('bot-1'), createBotReactionMemory(), () => 0);
    expect(first.emote).not.toBeNull();

    const second = maybeBotReaction(
      { ...bigShowdown('bot-2'), nowMs: 50_000 + BOT_REACTION_GLOBAL_COOLDOWN_MS - 1 },
      first.memory,
      () => 0,
    );
    expect(second.emote).toBeNull();
    expect(second.reason).toBe('global-cooldown');
  });

  it('caps reactions per hand even after cooldowns have cleared', () => {
    const decision = maybeBotReaction(
      bigShowdown('bot-2'),
      {
        botLastReactionAtMs: {},
        tableLastReactionAtMs: 0,
        reactionsByHand: { 7: BOT_REACTION_MAX_PER_HAND },
      },
      () => 0,
    );

    expect(decision.emote).toBeNull();
    expect(decision.reason).toBe('hand-cap');
  });

  it('reacts at a pinned zero roll and stays quiet at a pinned high roll', () => {
    const loud = maybeBotReaction(bigShowdown(), createBotReactionMemory(), () => 0);
    expect(loud.emote).not.toBeNull();
    expect(loud.situation).toBe('bigShowdownWin');

    const quiet = maybeBotReaction(bigShowdown(), createBotReactionMemory(), () => 0.999);
    expect(quiet.emote).toBeNull();
    expect(quiet.reason).toBe('probability');
    expect(quiet.memory).toEqual(BOT_REACTION_INITIAL_MEMORY);
  });

  it('returns nothing rather than throwing when the bot has no available reactions', () => {
    const decision = maybeBotReaction(
      { ...bigShowdown(), ownedCosmeticIds: [], includeFreeReactions: false },
      createBotReactionMemory(),
      () => 0,
    );

    expect(decision.emote).toBeNull();
    expect(decision.reason).toBe('no-candidates');
  });

  it('detects a bot that was ahead and then lost the runout as a bad beat', () => {
    const previousBoard = [card(14, 'c'), card(2, 'h'), card(7, 'h'), card(9, 'c')];
    const finalBoard = [...previousBoard, card(10, 'h')];
    const botCards = [card(14, 's'), card(14, 'd')];
    const humanCards = [card(13, 'h'), card(12, 'h')];
    const previous = state({
      board: previousBoard,
      players: [
        player('human', { isBot: false, holeCards: humanCards }),
        player('bot-1', { holeCards: botCards }),
      ],
      pots: [{ amount: 300, eligiblePlayerIds: ['human', 'bot-1'] }],
    });
    const current = state({
      ...previous,
      board: finalBoard,
      street: 'showdown',
      winners: [winner('human', 300, finalBoard, humanCards)],
    });

    const decision = maybeBotReaction(
      { previousState: previous, state: current, botId: 'bot-1', nowMs: 80_000 },
      createBotReactionMemory(),
      () => 0,
    );

    expect(decision.situation).toBe('badBeatLoss');
    expect(decision.emote).not.toBeNull();
  });
});
