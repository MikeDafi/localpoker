import { describe, expect, it } from 'vitest';

import {
  BAD_BEAT_BLOCKED_GIF_TAGS,
  BOT_REACTION_BOT_COOLDOWN_MS,
  BOT_REACTION_GLOBAL_COOLDOWN_MS,
  BOT_REACTION_INITIAL_MEMORY,
  BOT_REACTION_MAX_PER_HAND,
  BOT_REACTION_PROBABILITY_BY_SITUATION,
  botReactionTankThresholdMs,
  createBotReactionMemory,
  detectBotReactionSituations,
  getBotReactionCandidates,
  maybeBotReaction,
  type BotReactionInput,
  type BotReactionMemory,
  type BotReactionSituation,
} from '../botReactions';
import { EMOJI_EMOTES, GIF_EMOTES, STICKER_EMOTES } from '../cosmetics';
import { gifUrl } from '../../services/gifs';
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

  describe('variety', () => {
    const ALL_SITUATIONS = Object.keys(BOT_REACTION_PROBABILITY_BY_SITUATION) as BotReactionSituation[];
    const catalogueGifUrls = new Set(Object.values(GIF_EMOTES).map((gif) => gifUrl(gif.gifId)));
    const catalogueEmoji = new Set(Object.values(EMOJI_EMOTES).map((emoji) => emoji.emoji));
    const catalogueStickers = new Set(Object.values(STICKER_EMOTES).map((sticker) => sticker.sticker));

    it('gives every situation a wide pool once the full catalogue is open', () => {
      for (const situation of ALL_SITUATIONS) {
        const candidates = getBotReactionCandidates(situation, { fullCatalog: true });
        // Was three free emoji and a few GIFs for most situations.
        expect(candidates.length, situation).toBeGreaterThanOrEqual(8);
        const kinds = new Set(candidates.map((candidate) => candidate.kind));
        expect(kinds.has('text'), situation).toBe(true);
        expect(kinds.has('emoji'), situation).toBe(true);
      }
    });

    it('only uses GIFs, emoji and stickers that exist in the catalogue', () => {
      for (const situation of ALL_SITUATIONS) {
        for (const candidate of getBotReactionCandidates(situation, { fullCatalog: true })) {
          if (candidate.kind === 'gif') expect(catalogueGifUrls.has(candidate.emote.value), candidate.sourceId).toBe(true);
          if (candidate.kind === 'emoji') expect(catalogueEmoji.has(candidate.emote.value), candidate.sourceId).toBe(true);
          if (candidate.kind === 'sticker') expect(catalogueStickers.has(candidate.emote.value), candidate.sourceId).toBe(true);
          // The bubble is 150pt and two lines; longer lines get cut off.
          if (candidate.kind === 'text') expect(candidate.emote.value.length, candidate.emote.value).toBeLessThanOrEqual(16);
        }
      }
    });

    it('keeps every losing situation free of celebration even with the full catalogue', () => {
      const blocked = new Set<string>(BAD_BEAT_BLOCKED_GIF_TAGS);
      for (const situation of ['badBeatLoss', 'coolerLoss', 'foldedToPressure'] as const) {
        for (const candidate of getBotReactionCandidates(situation, { fullCatalog: true })) {
          if (candidate.kind !== 'gif') continue;
          expect(candidate.tags.some((tag) => blocked.has(tag)), `${situation} ${candidate.sourceId}`).toBe(false);
          expect(['🎉', '🙌', '🔥']).not.toContain(candidate.emote.value);
        }
      }
    });

    it('never repeats the same reaction back to back for one bot', () => {
      // Pinned to the first candidate every time, which is the worst case for
      // repeats: without the rule it would pick the same item forever.
      let memory: BotReactionMemory = createBotReactionMemory();
      let previous: string | null = null;
      for (let i = 0; i < 12; i++) {
        const decision = maybeBotReaction(
          { ...bigShowdown(), fullCatalog: true, nowMs: 100_000 + i * BOT_REACTION_BOT_COOLDOWN_MS, state: { ...bigShowdown().state, handNumber: 100 + i } },
          memory,
          () => 0,
        );
        expect(decision.emote).not.toBeNull();
        const key = `${decision.emote!.type}:${decision.emote!.value}`;
        expect(key).not.toBe(previous);
        previous = key;
        memory = decision.memory;
      }
    });

    it('still reacts when the only thing a bot owns is what it said last', () => {
      const owned = { ownedCosmeticIds: ['emoji-party'], includeFreeReactions: false };
      const first = maybeBotReaction({ ...bigShowdown(), ...owned }, createBotReactionMemory(), () => 0);
      expect(first.emote?.value).toBe('🎉');
      const second = maybeBotReaction(
        { ...bigShowdown(), ...owned, nowMs: 50_000 + BOT_REACTION_BOT_COOLDOWN_MS, state: { ...bigShowdown().state, handNumber: 8 } },
        first.memory,
        () => 0,
      );
      expect(second.emote?.value).toBe('🎉');
    });

    it('spreads picks across kinds and items under a seeded RNG', () => {
      let seed = 42;
      const rng = () => {
        seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
        return seed / 2_147_483_648;
      };
      const seen = new Set<string>();
      const kinds = new Set<string>();
      let memory: BotReactionMemory = createBotReactionMemory();
      for (let i = 0; i < 300; i++) {
        const decision = maybeBotReaction(
          { ...bigShowdown(), fullCatalog: true, nowMs: 100_000 + i * BOT_REACTION_BOT_COOLDOWN_MS, state: { ...bigShowdown().state, handNumber: 100 + i } },
          memory,
          rng,
        );
        memory = decision.memory;
        if (!decision.emote) continue;
        seen.add(`${decision.emote.type}:${decision.emote.value}`);
        kinds.add(decision.emote.type);
      }
      expect(kinds).toEqual(new Set(['emoji', 'gif', 'sticker', 'text']));
      expect(seen.size).toBeGreaterThanOrEqual(12);
    });
  });

  describe('situations', () => {
    it('reads a bot moving all in, and the other bots facing it', () => {
      const previous = state({ street: 'turn', board: [card(2, 's'), card(7, 'd'), card(9, 'h'), card(13, 'c')] });
      const current = state({
        ...previous,
        players: previous.players.map((p) => (p.id === 'bot-1' ? { ...p, allIn: true, chips: 0, currentBet: 1_000 } : p)),
      });
      expect(detectBotReactionSituations({ previousState: previous, state: current, botId: 'bot-1', nowMs: 0 }))
        .toContain('botAllIn');
      expect(detectBotReactionSituations({ previousState: previous, state: current, botId: 'bot-2', nowMs: 0 }))
        .toEqual(['facedShove']);
    });

    it('reads a human tabling air after betting as a bluff shown', () => {
      const board = [card(14, 'c'), card(10, 'h'), card(7, 'd'), card(4, 's'), card(2, 'c')];
      const previous = state({
        board: board.slice(0, 4),
        players: [
          player('human', { isBot: false, holeCards: [card(9, 's'), card(8, 'h')] }),
          player('bot-1', { holeCards: [card(14, 'd'), card(12, 'd')] }),
        ],
      });
      const current = state({
        ...previous,
        board,
        street: 'showdown',
        winners: [winner('bot-1', 160, board, [card(14, 'd'), card(12, 'd')])],
      });
      // A big pot too, but catching the bluff is the more particular line.
      const situations = detectBotReactionSituations({ previousState: previous, state: current, botId: 'bot-1', nowMs: 0 });
      expect(situations[0]).toBe('bluffShown');
    });

    it('reads a lost flush over flush as a cooler', () => {
      const board = [card(14, 'h'), card(10, 'h'), card(7, 'h'), card(4, 's'), card(2, 'c')];
      const humanCards = [card(13, 'h'), card(3, 'h')];
      const previous = state({
        board,
        street: 'river',
        players: [
          player('human', { isBot: false, holeCards: humanCards }),
          player('bot-1', { holeCards: [card(9, 'h'), card(8, 'h')] }),
        ],
      });
      const current = state({ ...previous, street: 'showdown', winners: [winner('human', 400, board, humanCards)] });
      expect(detectBotReactionSituations({ previousState: previous, state: current, botId: 'bot-1', nowMs: 0 }))
        .toEqual(['coolerLoss']);
    });

    it('reads a chop and a pot won without a showdown', () => {
      const board = [card(14, 'h'), card(13, 'd'), card(12, 'c'), card(11, 's'), card(10, 'h')];
      const previous = state({ board, street: 'river' });
      const chop = state({
        ...previous,
        street: 'showdown',
        winners: [winner('bot-1', 120, board, [card(2, 'c'), card(3, 'd')]), winner('human', 120, board, [card(2, 'c'), card(3, 'd')])],
      });
      expect(detectBotReactionSituations({ previousState: previous, state: chop, botId: 'bot-1', nowMs: 0 })).toContain('splitPot');

      const folded = state({ ...state({ street: 'flop' }), street: 'showdown', winners: [{ playerId: 'bot-2', amount: 60 }] });
      expect(detectBotReactionSituations({ previousState: state({ street: 'flop' }), state: folded, botId: 'bot-2', nowMs: 0 }))
        .toEqual(['wonUncontested']);
    });

    it('needles a long tank only past the threshold', () => {
      const s = state({ street: 'flop', currentPlayerIndex: 0 });
      const threshold = botReactionTankThresholdMs(s.config.turnTimerSec);
      expect(threshold).toBe(19_500);
      expect(botReactionTankThresholdMs(5)).toBe(10_000);
      const base = { state: s, botId: 'bot-1', nowMs: 0, humanPlayerId: 'human' };
      expect(detectBotReactionSituations({ ...base, humanActionElapsedMs: threshold - 1 })).toEqual([]);
      expect(detectBotReactionSituations({ ...base, humanActionElapsedMs: threshold })).toEqual(['humanTank']);
    });

    it('keeps every situation rare enough not to spam', () => {
      for (const chance of Object.values(BOT_REACTION_PROBABILITY_BY_SITUATION)) {
        expect(chance).toBeGreaterThan(0);
        expect(chance).toBeLessThanOrEqual(0.25);
      }
    });
  });
});
