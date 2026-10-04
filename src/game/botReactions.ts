import {
  EMOJI_EMOTES,
  FREE_EMOJI_COSMETIC_IDS,
  FREE_GIF_COSMETIC_IDS,
  GIF_EMOTES,
  type EmojiCosmetic,
  type GifCosmetic,
} from './cosmetics';
import { gifUrl } from '../services/gifs';
import { HandCategory, compareHands, evaluateHand, type HandEvaluation } from '../engine/handEvaluator';
import type { Card } from '../engine/cards';
import type { GameState, Player } from '../engine/types';

export type BotReactionSituation =
  | 'botBusts'
  | 'badBeatLoss'
  | 'doubleUp'
  | 'bigShowdownWin'
  | 'monsterBoard'
  | 'foldedToPressure'
  | 'humanTank';

export type BotReactionPersonality = 'easy' | 'medium' | 'hard' | 'expert';
export type BotReactionEmoteAnim = 'bounce' | 'spin' | 'pulse' | 'shake' | 'burst';
export type BotReactionEmote = {
  type: 'emoji' | 'text' | 'sticker' | 'gif';
  value: string;
  anim?: BotReactionEmoteAnim;
};

export type BotReactionSkipReason =
  | 'no-situation'
  | 'no-candidates'
  | 'bot-cooldown'
  | 'global-cooldown'
  | 'hand-cap'
  | 'probability';

export interface BotReactionMemory {
  readonly botLastReactionAtMs: Readonly<Record<string, number>>;
  readonly tableLastReactionAtMs: number;
  readonly reactionsByHand: Readonly<Record<string, number>>;
}

export interface BotReactionInput {
  state: GameState;
  botId: string;
  nowMs: number;
  previousState?: GameState;
  humanPlayerId?: string;
  humanActionElapsedMs?: number;
  ownedCosmeticIds?: readonly string[];
  includeFreeReactions?: boolean;
  botDifficulty?: BotReactionPersonality;
}

export interface BotReactionCandidate {
  readonly situation: BotReactionSituation;
  readonly kind: 'emoji' | 'gif';
  readonly sourceId: string;
  readonly tags: readonly string[];
  readonly emote: BotReactionEmote;
}

export interface BotReactionDecision {
  readonly emote: BotReactionEmote | null;
  readonly memory: BotReactionMemory;
  readonly situation?: BotReactionSituation;
  readonly reason?: BotReactionSkipReason;
  readonly candidate?: BotReactionCandidate;
}

/** Forty five seconds keeps one bot from feeling chatty across several quick hands. */
export const BOT_REACTION_BOT_COOLDOWN_MS = 45_000;
/** Ten seconds lets a single table beat land before another seat speaks up. */
export const BOT_REACTION_GLOBAL_COOLDOWN_MS = 10_000;
/** Two reactions still feels lively, while three starts competing with the cards. */
export const BOT_REACTION_MAX_PER_HAND = 2;
/** Twelve big blinds is big enough to matter without waiting only for all ins. */
export const BOT_REACTION_BIG_POT_BIG_BLINDS = 12;
/** Four big blinds means the fold faced real pressure, not a routine blind call. */
export const BOT_REACTION_BIG_CALL_BIG_BLINDS = 4;
/** Thirty five percent of the pot catches large pressure when stakes are tiny. */
export const BOT_REACTION_BIG_CALL_POT_FRACTION = 0.35;
/** A 1.8x stack change catches practical double ups after blinds and odd chips. */
export const BOT_REACTION_DOUBLE_UP_RATIO = 1.8;
/** Sixty five percent of the timer is long enough to read as a tank. */
export const BOT_REACTION_HUMAN_TANK_TIMER_FRACTION = 0.65;
/** Ten seconds keeps very short timers from producing instant needles. */
export const BOT_REACTION_HUMAN_TANK_MIN_MS = 10_000;

/** Busts are rare, so one in five gets a reaction without making it automatic. */
export const BOT_REACTION_BUST_CHANCE = 0.2;
/** A true bad beat is rare and emotional, so it can speak slightly more often. */
export const BOT_REACTION_BAD_BEAT_CHANCE = 0.24;
/** Double ups are exciting but common enough that most stay quiet. */
export const BOT_REACTION_DOUBLE_UP_CHANCE = 0.14;
/** Big showdown wins should land sometimes, not after every pot. */
export const BOT_REACTION_BIG_SHOWDOWN_WIN_CHANCE = 0.18;
/** Monster boards are shared spectacle, so the rate stays modest. */
export const BOT_REACTION_MONSTER_BOARD_CHANCE = 0.12;
/** Folding to pressure happens often, so only a small share gets color. */
export const BOT_REACTION_FOLDED_TO_PRESSURE_CHANCE = 0.08;
/** Human tanks can annoy quickly, so this is the quietest situation. */
export const BOT_REACTION_HUMAN_TANK_CHANCE = 0.07;

export const BOT_REACTION_PROBABILITY_BY_SITUATION: Record<BotReactionSituation, number> = {
  botBusts: BOT_REACTION_BUST_CHANCE,
  badBeatLoss: BOT_REACTION_BAD_BEAT_CHANCE,
  doubleUp: BOT_REACTION_DOUBLE_UP_CHANCE,
  bigShowdownWin: BOT_REACTION_BIG_SHOWDOWN_WIN_CHANCE,
  monsterBoard: BOT_REACTION_MONSTER_BOARD_CHANCE,
  foldedToPressure: BOT_REACTION_FOLDED_TO_PRESSURE_CHANCE,
  humanTank: BOT_REACTION_HUMAN_TANK_CHANCE,
};

export const BAD_BEAT_BLOCKED_GIF_TAGS = [
  'win',
  'celebrate',
  'happy',
  'party',
  'yes',
  'money',
  'cash',
  'rich',
  'stack',
  'dance',
  'gg',
] as const;

export const BOT_REACTION_INITIAL_MEMORY: BotReactionMemory = {
  botLastReactionAtMs: {},
  tableLastReactionAtMs: Number.NEGATIVE_INFINITY,
  reactionsByHand: {},
};

interface SituationRule {
  readonly gifTags: readonly string[];
  readonly blockedGifTags?: readonly string[];
  readonly emojis: readonly string[];
}

const NEGATIVE_GIF_TAGS = ['sad', 'cry', 'lose', 'unlucky', 'badbeat', 'angry', 'tilt', 'facepalm', 'ugh'] as const;

const SITUATION_RULES: Record<BotReactionSituation, SituationRule> = {
  botBusts: {
    gifTags: NEGATIVE_GIF_TAGS,
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['😤', '😅', '😱'],
  },
  badBeatLoss: {
    gifTags: NEGATIVE_GIF_TAGS,
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['😤', '😅', '😱'],
  },
  doubleUp: {
    gifTags: ['win', 'celebrate', 'money', 'cash', 'rich', 'stack', 'clap'],
    emojis: ['🎉', '🙌', '💪', '🔥', '👍'],
  },
  bigShowdownWin: {
    gifTags: ['win', 'celebrate', 'money', 'cash', 'rich', 'stack', 'clap', 'thumbsup'],
    emojis: ['🎉', '🙌', '💪', '🔥', '😎', '👍', '🤝'],
  },
  monsterBoard: {
    gifTags: ['wow', 'shocked', 'omg', 'surprised', 'mindblown', 'amazing', 'clap'],
    emojis: ['😮', '🤯', '😱', '👍'],
  },
  foldedToPressure: {
    gifTags: ['think', 'thinking', 'hmm', 'facepalm', 'oops', 'sad', 'unlucky'],
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['🤔', '😅', '😤'],
  },
  humanTank: {
    gifTags: ['think', 'thinking', 'hmm', 'tank', 'decide', 'suspicious'],
    emojis: ['🤔', '😴'],
  },
};

type EvaluatedPlayer = {
  playerId: string;
  hand: HandEvaluation;
};

export function createBotReactionMemory(random: () => number = Math.random): BotReactionMemory {
  void random;
  return {
    botLastReactionAtMs: {},
    tableLastReactionAtMs: Number.NEGATIVE_INFINITY,
    reactionsByHand: {},
  };
}

export function getBotReactionCandidates(
  situation: BotReactionSituation,
  inventory: Pick<BotReactionInput, 'ownedCosmeticIds' | 'includeFreeReactions'> = {},
  random: () => number = Math.random,
): BotReactionCandidate[] {
  void random;
  const rule = SITUATION_RULES[situation];
  const blockedTags = rule.blockedGifTags ?? [];
  return [
    ...availableGifEmotes(inventory)
      .filter((gif) => hasAnyTag(gif.tags, rule.gifTags) && !hasAnyTag(gif.tags, blockedTags))
      .map((gif) => gifCandidate(situation, gif)),
    ...availableEmojiEmotes(inventory)
      .filter((emoji) => rule.emojis.includes(emoji.emoji))
      .map((emoji) => emojiCandidate(situation, emoji)),
  ];
}

export function maybeBotReaction(
  input: BotReactionInput,
  memory: BotReactionMemory = BOT_REACTION_INITIAL_MEMORY,
  random: () => number = Math.random,
): BotReactionDecision {
  const situations = detectSituations(input);
  if (situations.length === 0) {
    return { emote: null, memory, reason: 'no-situation' };
  }

  let foundSituation = false;
  for (const situation of situations) {
    const candidates = getBotReactionCandidates(situation, input, random);
    if (candidates.length === 0) continue;
    foundSituation = true;

    const cooldownReason = cooldownSkipReason(input, memory);
    if (cooldownReason) {
      return { emote: null, memory, situation, reason: cooldownReason };
    }

    const chance = BOT_REACTION_PROBABILITY_BY_SITUATION[situation];
    if (boundedRandom(random) >= chance) {
      return { emote: null, memory, situation, reason: 'probability' };
    }

    const candidate = pickCandidate(candidates, input.botDifficulty, random);
    return {
      emote: candidate.emote,
      memory: recordReaction(memory, input.botId, input.state.handNumber, input.nowMs),
      situation,
      candidate,
    };
  }

  return {
    emote: null,
    memory,
    situation: foundSituation ? situations[0] : undefined,
    reason: 'no-candidates',
  };
}

function availableGifEmotes(input: Pick<BotReactionInput, 'ownedCosmeticIds' | 'includeFreeReactions'>): GifCosmetic[] {
  const owned = new Set(input.ownedCosmeticIds ?? []);
  const free = new Set<string>(FREE_GIF_COSMETIC_IDS);
  const includeFree = input.includeFreeReactions ?? true;
  return Object.values(GIF_EMOTES).filter((gif) => owned.has(gif.id) || (includeFree && free.has(gif.id)));
}

function availableEmojiEmotes(input: Pick<BotReactionInput, 'ownedCosmeticIds' | 'includeFreeReactions'>): EmojiCosmetic[] {
  const owned = new Set(input.ownedCosmeticIds ?? []);
  const free = new Set<string>(FREE_EMOJI_COSMETIC_IDS);
  const includeFree = input.includeFreeReactions ?? true;
  return Object.values(EMOJI_EMOTES).filter((emoji) => owned.has(emoji.id) || (includeFree && free.has(emoji.id)));
}

function gifCandidate(situation: BotReactionSituation, gif: GifCosmetic): BotReactionCandidate {
  return {
    situation,
    kind: 'gif',
    sourceId: gif.id,
    tags: gif.tags,
    emote: { type: 'gif', value: gifUrl(gif.gifId) },
  };
}

function emojiCandidate(situation: BotReactionSituation, emoji: EmojiCosmetic): BotReactionCandidate {
  return {
    situation,
    kind: 'emoji',
    sourceId: emoji.id,
    tags: [],
    emote: { type: 'emoji', value: emoji.emoji },
  };
}

function hasAnyTag(tags: readonly string[], needles: readonly string[]): boolean {
  return needles.some((tag) => tags.includes(tag));
}

function detectSituations(input: BotReactionInput): BotReactionSituation[] {
  const bot = input.state.players.find((player) => player.id === input.botId);
  if (!bot?.isBot) return [];

  const situations: BotReactionSituation[] = [];
  if (isBotBust(input)) situations.push('botBusts');
  if (isBadBeatLoss(input)) situations.push('badBeatLoss');
  if (isDoubleUp(input)) situations.push('doubleUp');
  if (isBigShowdownWin(input)) situations.push('bigShowdownWin');
  if (isMonsterBoard(input)) situations.push('monsterBoard');
  if (isFoldedToPressure(input)) situations.push('foldedToPressure');
  if (isHumanTank(input, bot)) situations.push('humanTank');
  return situations;
}

function isNewShowdown(input: BotReactionInput): boolean {
  return input.state.street === 'showdown'
    && (!input.previousState
      || input.previousState.street !== 'showdown'
      || input.previousState.handNumber !== input.state.handNumber);
}

function isBotBust(input: BotReactionInput): boolean {
  if (!input.previousState || !isNewShowdown(input)) return false;
  const previousBot = input.previousState.players.find((player) => player.id === input.botId);
  const currentBot = input.state.players.find((player) => player.id === input.botId);
  return Boolean(previousBot && currentBot && previousBot.chips > 0 && currentBot.chips <= 0);
}

function isDoubleUp(input: BotReactionInput): boolean {
  if (!input.previousState || !isNewShowdown(input)) return false;
  const previousBot = input.previousState.players.find((player) => player.id === input.botId);
  const currentBot = input.state.players.find((player) => player.id === input.botId);
  if (!previousBot || !currentBot || previousBot.chips <= 0) return false;
  return currentBot.chips >= previousBot.chips * BOT_REACTION_DOUBLE_UP_RATIO
    && input.state.winners.some((winner) => winner.playerId === input.botId);
}

function isBigShowdownWin(input: BotReactionInput): boolean {
  if (!isNewShowdown(input)) return false;
  const winner = input.state.winners.find((candidate) => candidate.playerId === input.botId);
  if (!winner?.hand) return false;
  return winner.amount >= input.state.config.bigBlind * BOT_REACTION_BIG_POT_BIG_BLINDS;
}

function isBadBeatLoss(input: BotReactionInput): boolean {
  if (!input.previousState || !isNewShowdown(input)) return false;
  if (input.previousState.board.length < 3 || input.state.board.length <= input.previousState.board.length) return false;
  if (input.state.winners.some((winner) => winner.playerId === input.botId)) return false;
  if (!input.state.winners.some((winner) => winner.hand)) return false;
  const priorStandings = evaluatePlayersOnBoard(input.previousState.players, input.previousState.board);
  const botStanding = priorStandings.find((standing) => standing.playerId === input.botId);
  if (!botStanding) return false;
  return priorStandings.every((standing) => (
    standing.playerId === input.botId || compareHands(botStanding.hand, standing.hand) > 0
  ));
}

function isMonsterBoard(input: BotReactionInput): boolean {
  const board = input.state.board;
  if (board.length < 5) return false;
  if (input.previousState && boardKey(input.previousState.board) === boardKey(board)) return false;
  try {
    return evaluateHand(board).category >= HandCategory.FullHouse;
  } catch {
    return false;
  }
}

function isFoldedToPressure(input: BotReactionInput): boolean {
  if (!input.previousState || input.previousState.handNumber !== input.state.handNumber) return false;
  const previousBot = input.previousState.players.find((player) => player.id === input.botId);
  const currentBot = input.state.players.find((player) => player.id === input.botId);
  if (!previousBot || !currentBot || previousBot.folded || !currentBot.folded) return false;
  const toCall = Math.max(0, input.previousState.currentBet - previousBot.currentBet);
  const pot = Math.max(totalPot(input.previousState), totalContributions(input.previousState), input.previousState.config.bigBlind);
  return toCall >= input.previousState.config.bigBlind * BOT_REACTION_BIG_CALL_BIG_BLINDS
    || toCall >= pot * BOT_REACTION_BIG_CALL_POT_FRACTION;
}

function isHumanTank(input: BotReactionInput, bot: Player): boolean {
  if (!input.humanPlayerId || input.humanActionElapsedMs === undefined) return false;
  const actor = input.state.players[input.state.currentPlayerIndex];
  if (!actor || actor.id !== input.humanPlayerId || actor.isBot || input.state.street === 'showdown') return false;
  if (bot.sittingOut || bot.chips <= 0) return false;
  const timerMs = input.state.config.turnTimerSec * 1000;
  const threshold = Math.max(BOT_REACTION_HUMAN_TANK_MIN_MS, timerMs * BOT_REACTION_HUMAN_TANK_TIMER_FRACTION);
  return input.humanActionElapsedMs >= threshold;
}

function evaluatePlayersOnBoard(players: readonly Player[], board: readonly Card[]): EvaluatedPlayer[] {
  if (board.length < 3 || board.length > 5) return [];
  const standings: EvaluatedPlayer[] = [];
  for (const player of players) {
    if (player.folded || player.sittingOut || player.holeCards.length !== 2) continue;
    try {
      standings.push({
        playerId: player.id,
        hand: evaluateHand([...player.holeCards, ...board]),
      });
    } catch {
      return [];
    }
  }
  return standings;
}

function cooldownSkipReason(input: BotReactionInput, memory: BotReactionMemory): BotReactionSkipReason | null {
  const botLastAt = memory.botLastReactionAtMs[input.botId];
  if (botLastAt !== undefined && input.nowMs - botLastAt < BOT_REACTION_BOT_COOLDOWN_MS) {
    return 'bot-cooldown';
  }
  if (input.nowMs - memory.tableLastReactionAtMs < BOT_REACTION_GLOBAL_COOLDOWN_MS) {
    return 'global-cooldown';
  }
  const handKey = String(input.state.handNumber);
  if ((memory.reactionsByHand[handKey] ?? 0) >= BOT_REACTION_MAX_PER_HAND) {
    return 'hand-cap';
  }
  return null;
}

function recordReaction(memory: BotReactionMemory, botId: string, handNumber: number, nowMs: number): BotReactionMemory {
  const handKey = String(handNumber);
  return {
    botLastReactionAtMs: {
      ...memory.botLastReactionAtMs,
      [botId]: nowMs,
    },
    tableLastReactionAtMs: nowMs,
    reactionsByHand: {
      ...memory.reactionsByHand,
      [handKey]: (memory.reactionsByHand[handKey] ?? 0) + 1,
    },
  };
}

function pickCandidate(
  candidates: readonly BotReactionCandidate[],
  personality: BotReactionPersonality = 'medium',
  random: () => number,
): BotReactionCandidate {
  const weighted = candidates.map((candidate) => ({
    candidate,
    weight: candidateWeight(candidate, personality),
  }));
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let roll = boundedRandom(random) * totalWeight;
  for (const item of weighted) {
    roll -= item.weight;
    if (roll <= 0) return item.candidate;
  }
  return weighted[weighted.length - 1].candidate;
}

function candidateWeight(candidate: BotReactionCandidate, personality: BotReactionPersonality): number {
  const tags = candidate.tags;
  if (personality === 'easy') {
    if (candidate.kind === 'emoji') return 2;
    if (hasAnyTag(tags, ['laugh', 'wow', 'shocked', 'angry'])) return 1.6;
    return 1;
  }
  if (personality === 'hard' || personality === 'expert') {
    if (hasAnyTag(tags, ['clap', 'thumbsup', 'think', 'facepalm'])) return 1.8;
    if (candidate.emote.value === '👍' || candidate.emote.value === '🤔' || candidate.emote.value === '😎') return 1.7;
    if (hasAnyTag(tags, ['angry', 'party', 'dance'])) return 0.7;
    return 1;
  }
  return 1;
}

function boundedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (value >= 1) return 0.999_999_999;
  return value;
}

function totalPot(state: GameState): number {
  return state.pots.reduce((sum, pot) => sum + pot.amount, 0);
}

function totalContributions(state: GameState): number {
  return Object.values(state.contributions).reduce((sum, amount) => sum + amount, 0);
}

function boardKey(board: readonly Card[]): string {
  return board.map((card) => `${card.rank}${card.suit}`).join(',');
}
