import {
  EMOJI_EMOTES,
  FREE_EMOJI_COSMETIC_IDS,
  FREE_GIF_COSMETIC_IDS,
  FREE_STICKER_COSMETIC_IDS,
  GIF_EMOTES,
  STICKER_EMOTES,
  type EmojiCosmetic,
  type GifCosmetic,
  type StickerEmoteCosmetic,
} from './cosmetics';
import { gifUrl } from '../services/gifs';
import { HandCategory, compareHands, evaluateHand, type HandEvaluation } from '../engine/handEvaluator';
import type { Card } from '../engine/cards';
import type { GameState, Player } from '../engine/types';

export type BotReactionSituation =
  | 'botBusts'
  | 'badBeatLoss'
  | 'coolerLoss'
  | 'doubleUp'
  | 'bigShowdownWin'
  | 'lightWin'
  | 'splitPot'
  | 'bluffShown'
  | 'monsterBoard'
  | 'botAllIn'
  | 'facedShove'
  | 'foldedToPressure'
  | 'wonUncontested'
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
  /**
   * The reaction each bot used last, as a candidate key. Optional so a
   * memory built before this existed (or by hand in a test) still works.
   */
  readonly lastReactionByBot?: Readonly<Record<string, string>>;
  /** The table's last few reactions, newest last, any bot. */
  readonly recentReactionKeys?: readonly string[];
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
  /**
   * Draw from the whole reaction catalogue, paid items included.
   *
   * A bot is not a customer, and limiting it to the free tray is what left
   * it three emoji and a handful of GIFs to say everything with. It also
   * shows the paid reactions in use, which is the best advert they get.
   */
  fullCatalog?: boolean;
  botDifficulty?: BotReactionPersonality;
}

type CandidateKind = 'emoji' | 'gif' | 'sticker' | 'text';

export interface BotReactionCandidate {
  readonly situation: BotReactionSituation;
  readonly kind: CandidateKind;
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
/**
 * How many of the table's latest reactions count as "just seen".
 *
 * Four is about one orbit's worth of chatter at the cooldowns above, which is
 * as far back as anyone notices a repeat.
 */
export const BOT_REACTION_RECENT_MEMORY = 4;
/** A recently seen reaction is not banned, only made unlikely. */
export const BOT_REACTION_RECENT_WEIGHT = 0.15;

/** Busts are rare, so one in five gets a reaction without making it automatic. */
export const BOT_REACTION_BUST_CHANCE = 0.2;
/** A true bad beat is rare and emotional, so it can speak slightly more often. */
export const BOT_REACTION_BAD_BEAT_CHANCE = 0.24;
/** A cooler is nearly as rare as a bad beat and just as felt. */
export const BOT_REACTION_COOLER_CHANCE = 0.22;
/** Double ups are exciting but common enough that most stay quiet. */
export const BOT_REACTION_DOUBLE_UP_CHANCE = 0.14;
/** Big showdown wins should land sometimes, not after every pot. */
export const BOT_REACTION_BIG_SHOWDOWN_WIN_CHANCE = 0.18;
/** Winning with nothing but a high card is a story worth telling now and then. */
export const BOT_REACTION_LIGHT_WIN_CHANCE = 0.2;
/** Chops are rare and friendly. */
export const BOT_REACTION_SPLIT_POT_CHANCE = 0.15;
/** Someone tabling air after betting it is the table's best joke. */
export const BOT_REACTION_BLUFF_SHOWN_CHANCE = 0.2;
/** Monster boards are shared spectacle, so the rate stays modest. */
export const BOT_REACTION_MONSTER_BOARD_CHANCE = 0.12;
/** A shove is loud already, so the line that goes with it is occasional. */
export const BOT_REACTION_BOT_ALL_IN_CHANCE = 0.12;
/**
 * Facing a shove is rolled by every bot still in the hand, so the per bot
 * rate is low: at a full table the chance somebody says something is still
 * around one in three, and the table cooldown stops a chorus.
 */
export const BOT_REACTION_FACED_SHOVE_CHANCE = 0.08;
/** Folding to pressure happens often, so only a small share gets color. */
export const BOT_REACTION_FOLDED_TO_PRESSURE_CHANCE = 0.08;
/** Pots won without a showdown are the most common event here, so the quietest win. */
export const BOT_REACTION_WON_UNCONTESTED_CHANCE = 0.05;
/** Human tanks can annoy quickly, so this is among the quietest situations. */
export const BOT_REACTION_HUMAN_TANK_CHANCE = 0.07;

export const BOT_REACTION_PROBABILITY_BY_SITUATION: Record<BotReactionSituation, number> = {
  botBusts: BOT_REACTION_BUST_CHANCE,
  badBeatLoss: BOT_REACTION_BAD_BEAT_CHANCE,
  coolerLoss: BOT_REACTION_COOLER_CHANCE,
  doubleUp: BOT_REACTION_DOUBLE_UP_CHANCE,
  bigShowdownWin: BOT_REACTION_BIG_SHOWDOWN_WIN_CHANCE,
  lightWin: BOT_REACTION_LIGHT_WIN_CHANCE,
  splitPot: BOT_REACTION_SPLIT_POT_CHANCE,
  bluffShown: BOT_REACTION_BLUFF_SHOWN_CHANCE,
  monsterBoard: BOT_REACTION_MONSTER_BOARD_CHANCE,
  botAllIn: BOT_REACTION_BOT_ALL_IN_CHANCE,
  facedShove: BOT_REACTION_FACED_SHOVE_CHANCE,
  foldedToPressure: BOT_REACTION_FOLDED_TO_PRESSURE_CHANCE,
  wonUncontested: BOT_REACTION_WON_UNCONTESTED_CHANCE,
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
  /** Emoji from the catalogue, matched by the character. */
  readonly emojis: readonly string[];
  /** Stickers from the catalogue, matched by the character. */
  readonly stickers: readonly string[];
  /**
   * Short lines, bot only.
   *
   * These are not added to TEXT_EMOTES on purpose: that list is the player's
   * free tray, its size is part of the store's free-to-paid balance (see the
   * "about a quarter free" test), and a line like "Tick tock" is a bot's
   * personality rather than something a player asked for. Kept to about 14
   * characters so the bubble, capped at 150pt and two lines, never truncates.
   */
  readonly words: readonly string[];
}

const NEGATIVE_GIF_TAGS = ['sad', 'cry', 'lose', 'unlucky', 'badbeat', 'angry', 'tilt', 'facepalm', 'ugh'] as const;
const CELEBRATE_GIF_TAGS = ['win', 'celebrate', 'money', 'cash', 'rich', 'stack', 'clap', 'happy', 'yes'] as const;
const THINK_GIF_TAGS = ['think', 'thinking', 'hmm', 'decide', 'suspicious', 'stare'] as const;

const SITUATION_RULES: Record<BotReactionSituation, SituationRule> = {
  botBusts: {
    gifTags: [...NEGATIVE_GIF_TAGS, 'gg'],
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS.filter((tag) => tag !== 'gg'),
    emojis: ['😤', '😅', '😱', '🤝'],
    stickers: [],
    words: ['GG', 'GG all', 'Ouch', "I'll be back", 'Rebuy time?', 'Unlucky'],
  },
  badBeatLoss: {
    gifTags: NEGATIVE_GIF_TAGS,
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['😤', '😅', '😱', '🤯'],
    stickers: [],
    words: ['Unlucky', 'The river!!', 'Every time', 'How??', 'Brutal', 'Runner runner'],
  },
  coolerLoss: {
    gifTags: ['shocked', 'omg', 'facepalm', 'sad', 'unlucky', 'mindblown'],
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['😱', '🤯', '😅', '🤝'],
    stickers: [],
    words: ['Cooler', 'What a spot', "Couldn't fold", 'Sick hand', 'Nice hand!'],
  },
  doubleUp: {
    gifTags: CELEBRATE_GIF_TAGS,
    emojis: ['🎉', '🙌', '💪', '🔥', '👍'],
    stickers: ['🚀', '💰', '🔥'],
    words: ["Let's go!", 'Doubled!', 'Back in it', 'Needed that'],
  },
  bigShowdownWin: {
    gifTags: [...CELEBRATE_GIF_TAGS, 'thumbsup'],
    emojis: ['🎉', '🙌', '💪', '🔥', '😎', '👍', '🤝'],
    stickers: ['🎉', '💰', '💎', '🔥'],
    words: ["Let's go!", 'Ship it', 'Nice pot', 'Thank you', 'GG'],
  },
  lightWin: {
    gifTags: ['laugh', 'lol', 'funny', 'bluff', 'stare', 'suspicious'],
    emojis: ['😎', '😂', '😅'],
    stickers: ['🃏', '👀'],
    words: ['Felt it', 'Good read', 'Had a hunch', 'Just enough', 'High card!'],
  },
  splitPot: {
    gifTags: ['gg', 'cheers', 'agree', 'ok', 'respect', 'nice'],
    emojis: ['🤝', '👍', '😅'],
    stickers: ['🃏'],
    words: ['Chop chop', 'Split it', 'Fair enough', 'GG'],
  },
  bluffShown: {
    gifTags: ['laugh', 'lol', 'funny', 'haha', 'bluff', 'suspicious', 'stare'],
    blockedGifTags: ['sad', 'cry'],
    emojis: ['😂', '😮', '😎'],
    stickers: ['👀', '😂', '🃏'],
    words: ['Caught you', 'Nice try', 'Knew it', 'Bluffing?', 'Bold move'],
  },
  monsterBoard: {
    gifTags: ['wow', 'shocked', 'omg', 'surprised', 'mindblown', 'amazing', 'clap'],
    emojis: ['😮', '🤯', '😱', '👍'],
    stickers: ['👀', '💎'],
    words: ['Wow!', 'What a board', 'Wild runout', 'No way'],
  },
  botAllIn: {
    gifTags: ['allin', 'shove', 'bet', 'chips', 'stare'],
    emojis: ['💪', '😎', '🔥', '🍀'],
    stickers: ['🚀', '🔥'],
    words: ['All in!', 'Your move', 'Send it', 'Feeling lucky'],
  },
  facedShove: {
    gifTags: [...THINK_GIF_TAGS, 'tank'],
    emojis: ['🤔', '😮', '😅'],
    stickers: ['👀'],
    words: ['Hmm...', 'Bluffing?', 'Big bet', 'Do you have it?'],
  },
  foldedToPressure: {
    gifTags: ['think', 'thinking', 'hmm', 'facepalm', 'oops', 'sad', 'unlucky'],
    blockedGifTags: BAD_BEAT_BLOCKED_GIF_TAGS,
    emojis: ['🤔', '😅', '😤'],
    stickers: [],
    words: ['Too rich', 'Not this time', "I'll let it go", 'Next one', 'Fine, take it'],
  },
  wonUncontested: {
    gifTags: ['thumbsup', 'ok', 'good', 'chips'],
    emojis: ['😎', '👍', '🤝'],
    stickers: ['🃏'],
    words: ['Thank you', "I'll take it", 'Nice fold', 'Free chips'],
  },
  humanTank: {
    gifTags: [...THINK_GIF_TAGS, 'tank'],
    emojis: ['🤔', '😴'],
    stickers: ['👀'],
    words: ['Fold!', 'Tick tock', 'Take your time', 'Zzz...', 'Any day now'],
  },
};

/**
 * Situations in the order they win when one transition sets off several.
 *
 * Only the first that has something to say is rolled, so this is a priority
 * list: what happened to the bot outranks what it saw, and the showdown
 * outranks the betting that led to it.
 */
const SITUATION_PRIORITY: readonly BotReactionSituation[] = [
  'botBusts',
  'badBeatLoss',
  'coolerLoss',
  // Ahead of the wins: catching a bluff is the more particular thing to say
  // about a pot than that it was big.
  'bluffShown',
  'doubleUp',
  'bigShowdownWin',
  'lightWin',
  'splitPot',
  'monsterBoard',
  'botAllIn',
  'facedShove',
  'foldedToPressure',
  'wonUncontested',
  'humanTank',
];

/**
 * How much each personality leans on each kind of reaction.
 *
 * Picking the kind first and the item second keeps the catalogue's shape from
 * deciding the mix: with every GIF available a flat pick would be a GIF four
 * times in five, simply because there are seventy-odd of them.
 */
const KIND_WEIGHTS: Record<BotReactionPersonality, Record<CandidateKind, number>> = {
  easy: { emoji: 4, sticker: 2.5, gif: 2.5, text: 1.5 },
  medium: { emoji: 3, sticker: 1.5, gif: 3, text: 2.5 },
  hard: { emoji: 2.5, sticker: 0.8, gif: 2, text: 3.5 },
  expert: { emoji: 2.5, sticker: 0.8, gif: 2, text: 3.5 },
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

/** How long a human must sit on a decision before a bot may needle them. */
export function botReactionTankThresholdMs(turnTimerSec: number): number {
  const timerMs = Math.max(0, turnTimerSec) * 1000;
  return Math.max(BOT_REACTION_HUMAN_TANK_MIN_MS, timerMs * BOT_REACTION_HUMAN_TANK_TIMER_FRACTION);
}

type Inventory = Pick<BotReactionInput, 'ownedCosmeticIds' | 'includeFreeReactions' | 'fullCatalog'>;

export function getBotReactionCandidates(
  situation: BotReactionSituation,
  inventory: Inventory = {},
  random: () => number = Math.random,
): BotReactionCandidate[] {
  void random;
  const rule = SITUATION_RULES[situation];
  const blockedTags = rule.blockedGifTags ?? [];
  // Words are free for players too (every TEXT_EMOTES entry costs nothing),
  // so they follow the free tray rather than the owned list.
  const wordsAvailable = inventory.fullCatalog || (inventory.includeFreeReactions ?? true);
  return [
    ...availableGifEmotes(inventory)
      .filter((gif) => hasAnyTag(gif.tags, rule.gifTags) && !hasAnyTag(gif.tags, blockedTags))
      .map((gif) => gifCandidate(situation, gif)),
    ...availableEmojiEmotes(inventory)
      .filter((emoji) => rule.emojis.includes(emoji.emoji))
      .map((emoji) => emojiCandidate(situation, emoji)),
    ...availableStickerEmotes(inventory)
      .filter((sticker) => rule.stickers.includes(sticker.sticker))
      .map((sticker) => stickerCandidate(situation, sticker)),
    ...(wordsAvailable ? rule.words.map((word) => textCandidate(situation, word)) : []),
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

    const candidate = pickCandidate(candidates, input.botDifficulty, memory, input.botId, random);
    return {
      emote: candidate.emote,
      memory: recordReaction(memory, input.botId, input.state.handNumber, input.nowMs, candidateKey(candidate)),
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

/** Which situations a transition sets off for one bot, in priority order. */
export function detectBotReactionSituations(input: BotReactionInput): BotReactionSituation[] {
  return detectSituations(input);
}

function isAvailable(id: string, owned: ReadonlySet<string>, free: ReadonlySet<string>, input: Inventory): boolean {
  if (input.fullCatalog) return true;
  return owned.has(id) || ((input.includeFreeReactions ?? true) && free.has(id));
}

function availableGifEmotes(input: Inventory): GifCosmetic[] {
  const owned = new Set(input.ownedCosmeticIds ?? []);
  const free = new Set<string>(FREE_GIF_COSMETIC_IDS);
  return Object.values(GIF_EMOTES).filter((gif) => isAvailable(gif.id, owned, free, input));
}

function availableEmojiEmotes(input: Inventory): EmojiCosmetic[] {
  const owned = new Set(input.ownedCosmeticIds ?? []);
  const free = new Set<string>(FREE_EMOJI_COSMETIC_IDS);
  return Object.values(EMOJI_EMOTES).filter((emoji) => isAvailable(emoji.id, owned, free, input));
}

function availableStickerEmotes(input: Inventory): StickerEmoteCosmetic[] {
  const owned = new Set(input.ownedCosmeticIds ?? []);
  const free = new Set<string>(FREE_STICKER_COSMETIC_IDS);
  return Object.values(STICKER_EMOTES).filter((sticker) => isAvailable(sticker.id, owned, free, input));
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

function stickerCandidate(situation: BotReactionSituation, sticker: StickerEmoteCosmetic): BotReactionCandidate {
  return {
    situation,
    kind: 'sticker',
    sourceId: sticker.id,
    tags: [],
    emote: { type: 'sticker', value: sticker.sticker, anim: sticker.anim },
  };
}

function textCandidate(situation: BotReactionSituation, word: string): BotReactionCandidate {
  return {
    situation,
    kind: 'text',
    sourceId: `word:${word}`,
    tags: [],
    emote: { type: 'text', value: word },
  };
}

/**
 * What counts as "the same reaction" for the no-repeat rule.
 *
 * By what is shown rather than by id, so "GG" as a bot word and a GG from
 * somewhere else, or one emoji reached from two situations, count as one.
 */
function candidateKey(candidate: BotReactionCandidate): string {
  return `${candidate.emote.type}:${candidate.emote.value}`;
}

function hasAnyTag(tags: readonly string[], needles: readonly string[]): boolean {
  return needles.some((tag) => tags.includes(tag));
}

function detectSituations(input: BotReactionInput): BotReactionSituation[] {
  const bot = input.state.players.find((player) => player.id === input.botId);
  if (!bot?.isBot) return [];

  const checks: Record<BotReactionSituation, () => boolean> = {
    botBusts: () => isBotBust(input),
    badBeatLoss: () => isBadBeatLoss(input),
    coolerLoss: () => isCoolerLoss(input),
    doubleUp: () => isDoubleUp(input),
    bigShowdownWin: () => isBigShowdownWin(input),
    lightWin: () => isLightWin(input),
    splitPot: () => isSplitPot(input),
    bluffShown: () => isBluffShown(input),
    monsterBoard: () => isMonsterBoard(input),
    botAllIn: () => isBotAllIn(input),
    facedShove: () => isFacedShove(input),
    foldedToPressure: () => isFoldedToPressure(input),
    wonUncontested: () => isWonUncontested(input),
    humanTank: () => isHumanTank(input, bot),
  };
  return SITUATION_PRIORITY.filter((situation) => checks[situation]());
}

function isNewShowdown(input: BotReactionInput): boolean {
  return input.state.street === 'showdown'
    && (!input.previousState
      || input.previousState.street !== 'showdown'
      || input.previousState.handNumber !== input.state.handNumber);
}

/** A showdown where cards were compared, as opposed to everyone folding to one player. */
function isContestedShowdown(input: BotReactionInput): boolean {
  return isNewShowdown(input) && input.state.winners.some((winner) => winner.hand);
}

function playerPair(input: BotReactionInput): { before?: Player; now?: Player } {
  return {
    before: input.previousState?.players.find((player) => player.id === input.botId),
    now: input.state.players.find((player) => player.id === input.botId),
  };
}

function isBotBust(input: BotReactionInput): boolean {
  if (!input.previousState || !isNewShowdown(input)) return false;
  const { before, now } = playerPair(input);
  return Boolean(before && now && before.chips > 0 && now.chips <= 0);
}

function isDoubleUp(input: BotReactionInput): boolean {
  if (!input.previousState || !isNewShowdown(input)) return false;
  const { before, now } = playerPair(input);
  if (!before || !now || before.chips <= 0) return false;
  return now.chips >= before.chips * BOT_REACTION_DOUBLE_UP_RATIO
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

/**
 * Lost a compared showdown holding a flush or better.
 *
 * Distinct from a bad beat, which is about being ahead before the last card:
 * a cooler is two big hands meeting, and the right noise is shock rather
 * than grievance.
 */
function isCoolerLoss(input: BotReactionInput): boolean {
  if (!isContestedShowdown(input)) return false;
  if (input.state.winners.some((winner) => winner.playerId === input.botId)) return false;
  const bot = input.state.players.find((player) => player.id === input.botId);
  if (!bot || bot.folded) return false;
  const hand = bestHand(bot, input.state.board);
  return !!hand && hand.category >= HandCategory.Flush;
}

/** Won a compared showdown with nothing better than a high card. */
function isLightWin(input: BotReactionInput): boolean {
  if (!isContestedShowdown(input)) return false;
  const winner = input.state.winners.find((candidate) => candidate.playerId === input.botId);
  return !!winner?.hand && winner.hand.category === HandCategory.HighCard;
}

function isSplitPot(input: BotReactionInput): boolean {
  if (!isContestedShowdown(input)) return false;
  const handWinners = new Set(input.state.winners.filter((winner) => winner.hand).map((winner) => winner.playerId));
  return handWinners.size >= 2 && handWinners.has(input.botId);
}

/**
 * Somebody else tabled a high card after putting real money in.
 *
 * "Bluff" is inferred, not known: the engine does not record intent, so this
 * is the visible version of it, air at showdown after at least the pressure
 * that counts as a big call elsewhere in this file.
 */
function isBluffShown(input: BotReactionInput): boolean {
  if (!isContestedShowdown(input) || input.state.board.length < 5) return false;
  const bigMoney = input.state.config.bigBlind * BOT_REACTION_BIG_CALL_BIG_BLINDS;
  return input.state.players.some((player) => {
    if (player.id === input.botId || player.folded || player.sittingOut) return false;
    if ((input.state.contributions[player.id] ?? 0) < bigMoney) return false;
    const hand = bestHand(player, input.state.board);
    return !!hand && hand.category === HandCategory.HighCard;
  });
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

function sameHand(input: BotReactionInput): input is BotReactionInput & { previousState: GameState } {
  return !!input.previousState && input.previousState.handNumber === input.state.handNumber;
}

function isBotAllIn(input: BotReactionInput): boolean {
  if (!sameHand(input)) return false;
  const { before, now } = playerPair(input);
  return Boolean(before && now && !before.allIn && now.allIn && !now.folded);
}

/** Another player just moved all in while this bot is still in the hand with a decision to come. */
function isFacedShove(input: BotReactionInput): boolean {
  if (!sameHand(input) || input.state.street === 'showdown') return false;
  const { now } = playerPair(input);
  if (!now || now.folded || now.allIn || now.sittingOut || now.chips <= 0) return false;
  const previousById = new Map(input.previousState.players.map((player) => [player.id, player]));
  return input.state.players.some((player) => {
    if (player.id === input.botId) return false;
    const before = previousById.get(player.id);
    return !!before && !before.allIn && player.allIn && !player.folded;
  });
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

function isWonUncontested(input: BotReactionInput): boolean {
  if (!isNewShowdown(input)) return false;
  const winners = input.state.winners;
  return winners.length === 1 && winners[0].playerId === input.botId && !winners[0].hand;
}

function isHumanTank(input: BotReactionInput, bot: Player): boolean {
  if (!input.humanPlayerId || input.humanActionElapsedMs === undefined) return false;
  const actor = input.state.players[input.state.currentPlayerIndex];
  if (!actor || actor.id !== input.humanPlayerId || actor.isBot || input.state.street === 'showdown') return false;
  if (bot.sittingOut || bot.chips <= 0) return false;
  return input.humanActionElapsedMs >= botReactionTankThresholdMs(input.state.config.turnTimerSec);
}

function bestHand(player: Player, board: readonly Card[]): HandEvaluation | null {
  if (player.holeCards.length !== 2 || board.length < 3) return null;
  try {
    return evaluateHand([...player.holeCards, ...board]);
  } catch {
    return null;
  }
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

function recordReaction(
  memory: BotReactionMemory,
  botId: string,
  handNumber: number,
  nowMs: number,
  key: string,
): BotReactionMemory {
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
    lastReactionByBot: {
      ...(memory.lastReactionByBot ?? {}),
      [botId]: key,
    },
    recentReactionKeys: [...(memory.recentReactionKeys ?? []), key].slice(-BOT_REACTION_RECENT_MEMORY),
  };
}

/**
 * Kind first, then the item, never the bot's own last one.
 *
 * The bot's previous reaction is removed outright, so it cannot say the same
 * thing twice running, unless it is the only thing it has to say (a tiny
 * owned inventory), where saying it again beats saying nothing. Anything the
 * table has seen in the last few reactions is kept but made unlikely, so two
 * bots do not trade the same GIF either.
 */
function pickCandidate(
  candidates: readonly BotReactionCandidate[],
  personality: BotReactionPersonality = 'medium',
  memory: BotReactionMemory,
  botId: string,
  random: () => number,
): BotReactionCandidate {
  const last = memory.lastReactionByBot?.[botId];
  const fresh = candidates.filter((candidate) => candidateKey(candidate) !== last);
  const pool = fresh.length > 0 ? fresh : candidates;
  const recent = new Set(memory.recentReactionKeys ?? []);

  const kindWeights = KIND_WEIGHTS[personality];
  const kinds = (['emoji', 'gif', 'sticker', 'text'] as const).filter((kind) => pool.some((c) => c.kind === kind));
  const kind = weightedPick(kinds, (k) => kindWeights[k], random);
  const ofKind = pool.filter((candidate) => candidate.kind === kind);
  return weightedPick(
    ofKind,
    (candidate) => candidateWeight(candidate, personality) * (recent.has(candidateKey(candidate)) ? BOT_REACTION_RECENT_WEIGHT : 1),
    random,
  );
}

function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, random: () => number): T {
  const weighted = items.map((item) => ({ item, weight: Math.max(0, weightOf(item)) }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = boundedRandom(random) * totalWeight;
  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) return entry.item;
  }
  return weighted[weighted.length - 1].item;
}

function candidateWeight(candidate: BotReactionCandidate, personality: BotReactionPersonality): number {
  const tags = candidate.tags;
  if (personality === 'easy') {
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
