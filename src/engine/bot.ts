import { randomFloat, type Card } from './cards';
import { betFraction, bluffFrequency, boardWetness, hasBlocker, minimumDefense, pushFoldAction } from './gto';
import { evaluateHand, HandCategory } from './handEvaluator';
import { NO_READ, readHand, type PlayerRead } from './handReads';
import { legalActions } from './holdem';
import { openWidth, preflopPercentile, PUSH_FOLD_MAX_BB, threeBetWidth } from './preflopRanges';
import {
  blendWithUniform,
  boardComboTable,
  boardStrength,
  buildComboTable,
  comboWeights,
  drawStrength,
  rangeEquity,
  rankInRange,
  withoutCards,
  type ComboTable,
} from './rangeEquity';
import { roundWager } from '../game/wager';
import type { BotDecision, GameState, LegalActions, Player } from './types';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function potSize(state: GameState): number {
  return state.pots.reduce((sum, pot) => sum + pot.amount, 0);
}

function sizedBet(legal: LegalActions, desired: number): number | undefined {
  if (legal.minBet === undefined || legal.maxBet === undefined) return undefined;
  // Bots bet round numbers too - otherwise the pot fills up with figures like
  // 368 and the table stops looking like it uses chips.
  return roundWager(desired, legal.minBet, legal.maxBet);
}

function sizedRaise(legal: LegalActions, desired: number): number | undefined {
  if (legal.minRaiseTo === undefined || legal.maxRaiseTo === undefined) return undefined;
  return roundWager(desired, legal.minRaiseTo, legal.maxRaiseTo);
}

function ensureLegal(legal: LegalActions, decision: BotDecision): BotDecision {
  if (legal.actions.includes(decision.action)) {
    if (decision.action === 'bet') {
      const amount = sizedBet(legal, decision.amount ?? legal.minBet ?? 0);
      if (amount !== undefined) return { action: 'bet', amount };
    } else if (decision.action === 'raise') {
      const amount = sizedRaise(legal, decision.amount ?? legal.minRaiseTo ?? 0);
      if (amount !== undefined) return { action: 'raise', amount };
    } else {
      return decision;
    }
  }

  if (legal.actions.includes('check')) return { action: 'check' };
  if (legal.actions.includes('call')) return { action: 'call' };
  if (legal.actions.includes('fold')) return { action: 'fold' };
  if (legal.actions.includes('allin')) return { action: 'allin' };
  return { action: 'check' };
}

export type Difficulty = 'easy' | 'medium' | 'hard' | 'expert';

interface DifficultyProfile {
  /** Monte Carlo trials used to estimate equity. More trials = less noise. */
  sims: number;
  /**
   * How often a hand with no value is turned into a bluff, heads-up.
   *
   * This has to be high enough that betting into the bot is not free. At the
   * old rates only ~4% of its bets were bluffs, so an opponent who folded to
   * every bet gave up almost nothing and could stab at every checked pot
   * unpunished. Scaled down as the pot gets more crowded, since a bluff has to
   * get through every player still in the hand.
   */
  bluffRate: number;
  /**
   * How far *above an even share of the pot* this bot's equity must be before it
   * bets or raises for value.
   *
   * An absolute threshold is wrong because the same number means opposite things
   * at different table sizes: 52% equity is a coin flip heads-up but crushing in
   * a six-way pot. Measuring the edge over `1/(opponents+1)` scales correctly.
   */
  valueEdge: number;
  /** Bet/raise sizing as a fraction of the pot. */
  aggression: number;
  /**
   * Shifts the pot-odds requirement. Positive = calls wider than the maths
   * says (loose), negative = demands a margin before calling (tight).
   */
  potOddsSlack: number;
  /** How much a late seat loosens the calling standard. */
  positionWeight: number;
  /**
   * How much this bot believes what the betting says, see `blendWithUniform`.
   *
   * Every level now estimates equity against the ranges opponents' actions
   * point to, not against random cards. Against random cards top pair is a
   * 75% favourite whatever happened, so the lower levels called three barrels
   * and a river overbet with it, and called a preflop three-bet with any two
   * cards because any two cards have a third of the equity of a random hand.
   * Trust is what separates the levels here: easy barely notices the
   * betting, hard nearly reads it as well as expert. None trusts it fully,
   * since a player betting every street with anything is the cheapest way to
   * beat a bot that does.
   *
   * Expert's 0.75 was measured with `scripts/bot-exploits.mts`: at full trust
   * a player betting 200 every street with any two cards beat it by 0.3bb a
   * hand, and a 60% pot stab on every street lost only 0.9bb. At 0.75 those
   * lose 2.3bb and 8.9bb, no scripted strategy does better than folding every
   * hand, and one pair still folds to a three-barrel river overbet 67% of the
   * time against 40% for random-hand equity. 0.82 kept more of the overbet
   * folds but gave back about a bb a hand to every aggressive script.
   */
  readTrust: number;
  /**
   * How much wider than the solver-style charts in `preflopRanges.ts` this
   * bot plays: 1 is the chart, 1.5 opens and limps half again as many hands.
   * Looser is the most natural way to be weaker preflop, and the most
   * recognisable one to a human opponent.
   */
  looseness: number;
  /**
   * The share of its opening and three-betting range a bot actually raises
   * with. The rest it limps or flat-calls, which is how passive players lose:
   * they let the blinds in cheaply and never make anyone fold. Expert and hard
   * raise every hand they play.
   */
  raiseShare: number;
}

/**
 * The difficulties differ in *how accurately they estimate equity* and *how
 * correctly they act on it*, rather than in arbitrary thresholds:
 *
 *  - easy runs few simulations, so its equity estimate is genuinely noisy
 *    (~±6%), barely reads the betting, plays too many hands and raises too
 *    few of them, and calls far too wide. It misjudges hands rather than
 *    being handicapped after the fact.
 *  - expert samples enough to be accurate to ~±2%, plays close to correct pot
 *    odds, uses position, and bluffs the most.
 */
const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { sims: 60, bluffRate: 0.06, valueEdge: 0.3, aggression: 0.4, potOddsSlack: 0.18, positionWeight: 0, readTrust: 0.2, looseness: 1.5, raiseShare: 0.3 },
  medium: { sims: 160, bluffRate: 0.14, valueEdge: 0.22, aggression: 0.55, potOddsSlack: 0.06, positionWeight: 0.02, readTrust: 0.45, looseness: 1.2, raiseShare: 0.8 },
  hard: { sims: 320, bluffRate: 0.22, valueEdge: 0.16, aggression: 0.65, potOddsSlack: 0.0, positionWeight: 0.04, readTrust: 0.65, looseness: 1.05, raiseShare: 1 },
  expert: { sims: 500, bluffRate: 0.3, valueEdge: 0.12, aggression: 0.75, potOddsSlack: -0.03, positionWeight: 0.06, readTrust: 0.75, looseness: 1, raiseShare: 1 },
};

/** Read trust by level, exported so tests can check the ordering. */
export function readTrust(difficulty: Difficulty): number {
  return (PROFILES[difficulty] ?? PROFILES.medium).readTrust;
}

/**
 * How much of its stack a bot will put in *voluntarily*, given its equity.
 *
 * Without this a bot that is a marginal favourite would happily stack off;
 * real players size their commitment to how far ahead they actually are.
 *
 * This caps the bot's own bets and raises only. It used to gate calls as well,
 * applied *after* the pot-odds test, which meant a call the bot had already
 * judged to be correct got thrown away purely because the number was large.
 * Below 50% equity the ceiling is 5% of stack, so essentially every real bet
 * became an automatic fold: facing 500 chips the bot folded 97.3% of the time,
 * and 94.6% of those folds were hands it had just computed as correctly priced.
 * That let an opponent win pot after pot with a flat 200 stab and no hand, for
 * about 5bb every hand. Price decides calls now; see `stackRiskPremium`.
 *
 * `spr` is the stack-to-pot ratio at the start of the street, see `streetSpr`.
 * How much equity it takes to commit depends on it. With a stack of one pot or
 * less behind, the money is as good as in already, and folding a decent hand
 * to save the last of it throws away the pot it is laying; deep, a hand gets
 * bet into on every street to come and the stack is only safe with the
 * hands that stay ahead. So the equity is shifted up to 0.12 when shallow and
 * down 0.08 when deep before the table below is read. 4 is neutral, which is
 * also the default for callers that have no stacks to measure.
 */
export function commitCeiling(equity: number, stack: number, spr = 4): number {
  const e = equity + clamp((4 - spr) * 0.04, -0.08, 0.12);
  if (e >= 0.85) return stack;
  if (e >= 0.72) return Math.floor(stack * 0.6);
  if (e >= 0.6) return Math.floor(stack * 0.33);
  if (e >= 0.5) return Math.floor(stack * 0.15);
  return Math.floor(stack * 0.05);
}

/**
 * Stack-to-pot ratio at the start of this street: the smaller of our stack
 * and the biggest opponent's, over the pot before anyone bet this street.
 *
 * Measured from the start of the street on purpose. Counting the bet we face
 * into the pot would make every big bet look like a shallow pot and talk the
 * bot into calling it, which is backwards: a pot-sized shove into a deep stack
 * is exactly the spot to be careful in.
 */
export function streetSpr(state: GameState, me: Player, opponents: readonly Player[]): number {
  const streetBets = state.players.reduce((sum, p) => sum + p.currentBet, 0);
  const potAtStart = Math.max(1, potSize(state) - streetBets);
  const largest = opponents.reduce((m, p) => Math.max(m, p.chips + p.currentBet), 0);
  return Math.min(me.chips + me.currentBet, largest) / potAtStart;
}

/** Whether a postflop hand is one pair or less, the hands that should not stack off deep. */
function onePairOrWorse(holeCards: readonly Card[], board: readonly Card[]): boolean {
  return evaluateHand([...holeCards, ...board]).category <= HandCategory.Pair;
}

/**
 * Extra equity demanded on top of the raw price, for risking a large share of
 * the stack.
 *
 * This is the defensible kernel of the old commitment ceiling. Pot odds assume
 * the money is fungible, but a call that puts the whole stack in ends the hand
 * with no way to fold later and no chance to outplay anyone, so a bare
 * break-even price is not worth taking.
 *
 * Quadratic on purpose: the premium is negligible for the small and medium
 * bets where the ceiling used to do all its damage (a 190-chip call off 1000
 * costs 0.2% extra equity) and only reaches a real margin at a true stack-off.
 *
 * Scaled by the street's stack-to-pot ratio (see `streetSpr`), from a quarter
 * of the premium at an SPR of 1 to double at 8 and beyond: shallow, the stack
 * is mostly committed already and the last of it buys the whole pot; deep,
 * putting it in now gives up every later street on which to get away. One
 * pair or worse pays an extra margin deep, the textbook way to lose a stack:
 * it is ahead of the bluffs and behind everything that bets three streets for
 * value. The defaults reproduce the premium before SPR was considered.
 */
export function stackRiskPremium(toCall: number, stack: number, spr = 4, onePair = false): number {
  if (stack <= 0) return 0;
  const risk = clamp(toCall / stack, 0, 1);
  const depth = clamp(spr / 4, 0.25, 2);
  const pairMargin = onePair && spr > 6 ? 0.05 * risk : 0;
  return 0.06 * risk * risk * depth + pairMargin;
}

/**
 * The largest bet or raise medium and hard will make, as one cap for value and
 * bluffs alike.
 *
 * Value bets used to be capped by how much the hand's equity justified and
 * bluffs by a flat 40% of the stack, so once a pot grew any bet over 40% of
 * the stack was never a bluff, and folding to it was free. One cap for both,
 * set by the stack-to-pot ratio instead of the hand, keeps the size from
 * saying anything about the cards. With a pot or more already out in front of
 * the stack (an SPR of 1.5 or less) the cap is the whole stack: the bet is a
 * commitment either way, and a bluff shove there is as standard as a value one.
 */
function sharedBetCap(stack: number, spr: number): number {
  return spr <= 1.5 ? stack : Math.floor(stack * 0.6);
}

/**
 * Secret mixed into every bot random draw.
 *
 * The bot's randomness used to be a hash of `seed:handNumber:player:street:
 * logLength`, every part of which is in the game state both players hold. The
 * same hash recomputed outside the bot predicted 97.7% of its decisions,
 * including which hands it would bluff and when it would open-shove, and in an
 * online game the opposing device has all of those inputs.
 *
 * Generated once per process from a source that is not part of any game state,
 * so it cannot be recomputed from a shared seed. Decisions stay reproducible
 * within a session, which is all the replay and resume paths need.
 */
let botEntropy = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;

/** Pin the bot's randomness. For tests and for reproducing a reported hand. */
export function setBotEntropy(value: string): void {
  botEntropy = value;
}

/**
 * A bot random draw in [0, 1).
 *
 * `kind` keeps the draws independent. One shared draw per decision quietly
 * correlated unrelated choices: the same number decided whether to bluff and
 * whether to open-shove, so a bot could never do one while the other was live.
 */
function botRandom(state: GameState, playerId: string, kind: string): number {
  return randomFloat(
    `${botEntropy}:${String(state.seed)}:bot:${state.handNumber}:${playerId}:${state.street}:${state.log.length}:${kind}`,
  );
}

/**
 * How late this seat acts postflop, as 0 (first) to just under 1 (last).
 *
 * The offset matters. `(seat - dealer) % n` gives the dealer 0 and the seat
 * *before* the dealer the maximum, which is backwards: measured on a six-max
 * table the button scored 0.00 and the cutoff 0.83, so the bot played tightest
 * from the one seat it should have played widest. Counting back from the button
 * instead puts the small blind at 0 and the button at (n-1)/n, which is the
 * real order of postflop position.
 */
export function positionBonus(seatIndex: number, dealerIndex: number, playerCount: number): number {
  if (playerCount <= 0) return 0;
  // Double modulo so a dealer index ahead of the seat cannot go negative.
  const seatsAfterTheButton = (((seatIndex - dealerIndex - 1) % playerCount) + playerCount) % playerCount;
  return seatsAfterTheButton / playerCount;
}

/** How close to the balanced bluff frequency each level gets; below 1 under-bluffs. */
const GTO_BLUFF_SCALE = { medium: 0.8, hard: 1 } as const;

/**
 * Everything about the table a decision needs, worked out once.
 *
 * Shared by every level, so the lower ones see the same opponents, reads and
 * stacks as expert and differ only in what they do with them.
 */
interface TableContext {
  bb: number;
  pot: number;
  stack: number;
  myBet: number;
  toCall: number;
  /** Opponents still contesting the pot, holding cards. */
  opponents: Player[];
  readOf: (id: string) => PlayerRead;
  roll: (kind: string) => number;
  seed: string;
  /** Monte Carlo trials for this decision, already scaled by table size. */
  sims: number;
}

function tableContext(state: GameState, me: Player, legal: LegalActions, profile: DifficultyProfile, salt: string): TableContext {
  const opponents = state.players.filter((p) => p.id !== me.id && !p.folded && !p.sittingOut && p.holeCards.length === 2);
  const reads = readHand(state);
  return {
    bb: Math.max(1, state.config.bigBlind),
    pot: Math.max(1, potSize(state)),
    stack: me.chips,
    myBet: me.currentBet,
    toCall: legal.toCall,
    opponents,
    readOf: (id) => reads.get(id) ?? NO_READ,
    roll: (kind) => botRandom(state, me.id, `${salt}${kind}`),
    seed: `${String(state.seed)}:${salt}eq:${state.handNumber}:${me.id}:${state.street}:${state.log.length}`,
    // Cost grows with the number of opponents (each needs a hand dealt and
    // evaluated per trial), so the trial count is scaled down as the pot gets
    // more crowded. That keeps a decision at roughly constant CPU cost and
    // spends the accuracy heads-up, where equity sits closest to the price.
    sims: Math.max(40, Math.round((profile.sims * 2) / (Math.max(1, opponents.length) + 1))),
  };
}

/** Each opponent's range as sampling weights, trusted as far as this level trusts reads. */
function opponentWeights(table: ComboTable, me: Player, ctx: TableContext, trust: number): Float64Array[] {
  const reads = ctx.opponents.length > 0 ? ctx.opponents.map((p) => ctx.readOf(p.id)) : [NO_READ];
  return reads.map((read) => withoutCards(blendWithUniform(comboWeights(table, read), trust), table, me.holeCards));
}

export function decideAction(state: GameState, playerId: string, difficulty: Difficulty = 'medium'): BotDecision {
  const profile = PROFILES[difficulty] ?? PROFILES.medium;
  const legal = legalActions(state, playerId);
  const me = state.players.find((candidate) => candidate.id === playerId);
  if (!me) return ensureLegal(legal, { action: 'check' });
  // Expert keeps its own postflop strategy, see `decideExpert`.
  if (difficulty === 'expert') return ensureLegal(legal, decideExpert(state, me, legal));

  const ctx = tableContext(state, me, legal, profile, '');
  if (state.board.length === 0) return ensureLegal(legal, rangePreflop(state, me, legal, profile, ctx));
  return ensureLegal(legal, decidePostflop(state, me, legal, difficulty, profile, ctx));
}

/**
 * Easy, medium and hard after the flop: equity against what the betting says
 * opponents hold, weighed against the price.
 *
 * Easy keeps its old habits beyond that: pot-fraction sizing, a flat bluff
 * rate and bluffs made with whatever it holds. Those are what make it
 * readable, and a beginner can learn to spot them. Medium and hard play the
 * way expert does at the two things that gave them away: their bluffs and
 * value bets are the same sizes, and they only bluff hands that cannot win
 * at showdown.
 */
function decidePostflop(
  state: GameState,
  me: Player,
  legal: LegalActions,
  difficulty: Exclude<Difficulty, 'expert'>,
  profile: DifficultyProfile,
  ctx: TableContext,
): BotDecision {
  const { pot, stack, myBet, toCall, opponents, roll } = ctx;
  const opponentCount = Math.max(1, opponents.length);
  const balanced = difficulty !== 'easy';

  const table = boardComboTable(state.board);
  const weights = opponentWeights(table, me, ctx, profile.readTrust);
  const rawEquity = rangeEquity(me.holeCards, state.board, table, weights, ctx.sims, ctx.seed);

  // Acting late is worth real equity: everyone else has already shown their hand.
  const seatIndex = state.players.findIndex((candidate) => candidate.id === me.id);
  const relativePosition = positionBonus(seatIndex, state.dealerIndex, state.players.length);
  const equity = clamp(rawEquity + relativePosition * profile.positionWeight, 0, 1);

  const strength = boardStrength(me.holeCards, state.board, table);
  const draw = drawStrength(me.holeCards, state.board);
  const street = state.street === 'flop' || state.street === 'turn' ? state.street : 'river';
  const spr = streetSpr(state, me, opponents);
  const onePair = onePairOrWorse(me.holeCards, state.board);

  // An even share of the pot. Equity above this is a real edge; below it the
  // hand is losing money however good the raw number looks.
  const fairShare = 1 / (opponentCount + 1);
  const edge = equity - fairShare;

  const ceiling = commitCeiling(equity, stack, spr);
  const sharedCap = sharedBetCap(stack, spr);
  // Easy's bluffs stay small, never a stack-off.
  const bluffCap = Math.min(Math.floor(stack * 0.4), Math.max(0, stack - 1));
  // A bluff has to get through everyone still in the hand, so it is worth far
  // less multiway. The profile rate is the heads-up rate.
  const bluffing = roll('bluff') < profile.bluffRate * (2 / (opponentCount + 1));
  // A hand that cannot win at showdown: weak on this board, or a draw that
  // has to improve. Betting anything in between turns it into a bluff that
  // only gets called by better, so medium and hard check those instead.
  const air = strength < 0.45 || draw > 0;

  if (toCall > 0) {
    // Break-even point: call `toCall` to win `pot + toCall`.
    const potOdds = toCall / (pot + toCall);
    const raiseCap = balanced ? sharedCap : ceiling;

    // Value raise when well ahead, sized by the pot but capped by what this
    // much equity justifies committing (easy) or by the shared cap (see
    // `sharedBetCap`), so the semi-bluff below is the same size.
    if (edge > profile.valueEdge && legal.actions.includes('raise')) {
      const desiredTo = (legal.minRaiseTo ?? 0) + Math.floor(pot * profile.aggression);
      const cappedTo = Math.min(desiredTo, myBet + raiseCap, legal.maxRaiseTo ?? desiredTo);
      if (cappedTo >= (legal.minRaiseTo ?? 0)) {
        return { action: 'raise', amount: cappedTo };
      }
    }

    // Semi-bluff raise. Easy raises any hand with some equity to fall back on,
    // at half the pot; medium and hard only raise draws, before the river,
    // and at their value size.
    const semiBluff = balanced ? bluffing && draw > 0 && street !== 'river' : bluffing && edge > -0.12;
    if (semiBluff && legal.actions.includes('raise')) {
      const desiredTo = (legal.minRaiseTo ?? 0) + Math.floor(pot * (balanced ? profile.aggression : 0.5));
      const cappedTo = Math.min(desiredTo, myBet + (balanced ? sharedCap : bluffCap));
      if (cappedTo >= (legal.minRaiseTo ?? 0) && cappedTo < (legal.maxRaiseTo ?? Number.POSITIVE_INFINITY)) {
        return { action: 'raise', amount: cappedTo };
      }
    }

    // The real decision: is calling +EV? Difficulty decides how far from correct
    // the answer is allowed to be, and a stack-off has to clear the price by a
    // margin that grows with the depth. Nothing else may veto a call that is
    // correctly priced.
    const premium = stackRiskPremium(toCall, stack, spr, onePair);
    if (equity >= potOdds - profile.potOddsSlack + premium) return { action: 'call' };
    return { action: 'fold' };
  }

  // Nothing to call: bet for value when ahead of the field.
  //
  // Medium and hard size every bet by street and texture, and bluff at the
  // same sizes, see `betFraction`. They used to bet three quarters of the pot
  // with value and half with bluffs, so the size alone said which it was.
  const wetness = boardWetness(state.board);
  const valueBetting = edge > profile.valueEdge * 0.7;
  if (valueBetting && legal.actions.includes('bet')) {
    const fraction = balanced
      ? betFraction(street, wetness, street === 'river' && equity >= 0.85)
      : equity > 0.85
        ? profile.aggression + 0.25
        : profile.aggression;
    const desired = Math.floor(pot * fraction);
    const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, balanced ? sharedCap : ceiling));
    if (target >= (legal.minBet ?? 0)) {
      return { action: 'bet', amount: target };
    }
  }

  // Bluff bets.
  //
  // Easy bluffs at a flat rate with anything, at half the pot. That is a
  // tell, and deliberately left in.
  //
  // Medium and hard bluff at the balanced frequency for the size they chose,
  // the way expert does: only with air, preferring draws on the early streets
  // (they still win when called) and blockers on the river. The river size is
  // polar as often as a value bet's is, so an overbet is not always the nuts.
  if (legal.actions.includes('bet') && !valueBetting) {
    if (balanced) {
      const polar = street === 'river' && roll('polar') < 0.4;
      const fraction = betFraction(street, wetness, polar);
      const preference = street === 'river' ? (hasBlocker(me.holeCards, state.board) ? 1.4 : 0.8) : draw > 0 ? 1.5 : 1;
      const chance = bluffFrequency(fraction, opponentCount) * GTO_BLUFF_SCALE[difficulty] * preference;
      if (air && roll('bluff') < chance) {
        const desired = Math.floor(pot * fraction);
        const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, sharedCap));
        if (target >= (legal.minBet ?? 0)) return { action: 'bet', amount: target };
      }
    } else if (bluffing) {
      const desired = Math.floor(pot * 0.5);
      const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, bluffCap));
      if (target >= (legal.minBet ?? 0) && target < stack) return { action: 'bet', amount: target };
    }
  }

  // Open-shove only as a near-lock.
  if (equity > 0.92 && legal.actions.includes('allin') && roll('shove') > 0.85 && difficulty !== 'easy') {
    return { action: 'allin' };
  }

  return { action: 'check' };
}

const EXPERT = PROFILES.expert;

/**
 * The expert strategy: the same equity-versus-price core as the other levels,
 * but with the four things that kept it well short of a sound player fixed.
 *
 *  1. Equity is computed against opponents' *ranges*, narrowed by what they did
 *     this hand, instead of against random cards. Raises and overbets now mean
 *     something, so it stops paying off big bets with medium hands.
 *  2. Against small bets it defends close to minimum defence frequency, so a
 *     third-pot stab with any two cards no longer prints money.
 *  3. Bluffs are sized like value bets and made at the balanced frequency for
 *     that size, preferring draws on early streets and blockers on the river,
 *     and that includes check-raises.
 *  4. Preflop it plays position-aware ranges, and push/fold when short.
 *
 * The lower levels now share 1 and 4 (see `decidePostflop` and
 * `rangePreflop`), with less trust in their reads and looser ranges.
 */
function decideExpert(state: GameState, me: Player, legal: LegalActions): BotDecision {
  const ctx = tableContext(state, me, legal, EXPERT, 'x:');
  const { pot, stack, myBet, toCall, opponents, readOf, roll } = ctx;
  const opponentCount = Math.max(1, opponents.length);

  // Bluffs stay well short of the stack: a bluff that gets called is meant to
  // lose a bet, not the session.
  const bluffCap = Math.min(Math.floor(stack * 0.35), Math.max(0, stack - 1));

  if (state.board.length === 0) return rangePreflop(state, me, legal, EXPERT, ctx);

  const table = boardComboTable(state.board);
  const weights = opponentWeights(table, me, ctx, EXPERT.readTrust);
  const equity = rangeEquity(me.holeCards, state.board, table, weights, ctx.sims, ctx.seed);
  const strength = boardStrength(me.holeCards, state.board, table);
  const draw = drawStrength(me.holeCards, state.board);
  const fairShare = 1 / (opponentCount + 1);
  const spr = streetSpr(state, me, opponents);
  const onePair = onePairOrWorse(me.holeCards, state.board);
  const ceiling = commitCeiling(equity, stack, spr);
  const street = state.street === 'flop' || state.street === 'turn' ? state.street : 'river';
  const myRead = readOf(me.id);

  if (toCall > 0) {
    const potOdds = toCall / (pot + toCall);
    // The size every raise is made at, value or not: 80% of the pot after
    // calling, on top of the bet.
    const raiseSize = state.currentBet + Math.floor((pot + toCall) * 0.8);

    // Value raise: well ahead of the range that bet, which is already a
    // stronger range than random, so this is a real edge and not a guess.
    if (equity >= fairShare + 0.24 && legal.actions.includes('raise') && legal.minRaiseTo !== undefined) {
      const cappedTo = Math.min(Math.max(raiseSize, legal.minRaiseTo), myBet + ceiling, legal.maxRaiseTo ?? raiseSize);
      if (cappedTo >= legal.minRaiseTo) return { action: 'raise', amount: cappedTo };
    }

    // Check-raise bluffs. Having checked, the value raises left in our range
    // are the strong hands that trapped (a quarter of them, see `trap`
    // below), and a range that only ever check-raises those can be bet into
    // for free once it checks and folded to the moment it raises. Balance
    // them with bluffs at the ratio a raise of this size needs, from the
    // hands that make the best bluffs: draws before the river, air holding a
    // blocker on it. Sized exactly like the value raise.
    //
    // The frequency is the balanced bluff rate scaled by the trap rate,
    // since the value side is only the trapped quarter of strong hands; the
    // draw preference makes up for draws being a smaller share of a checking
    // range than air is of a betting one.
    if (myRead.checkedThisStreet && legal.actions.includes('raise') && legal.minRaiseTo !== undefined) {
      const raiseFraction = (raiseSize - state.currentBet) / Math.max(1, pot + toCall);
      const candidate = street === 'river' ? strength < 0.45 && hasBlocker(me.holeCards, state.board) : draw >= 0.42;
      const preference = street === 'river' ? 1 : draw >= 0.6 ? 2 : 1.2;
      const chance = bluffFrequency(raiseFraction, opponentCount) * TRAP_RATE * preference;
      if (candidate && roll('checkraise') < chance) {
        const cappedTo = Math.min(Math.max(raiseSize, legal.minRaiseTo), myBet + bluffCap);
        if (cappedTo >= legal.minRaiseTo && cappedTo < (legal.maxRaiseTo ?? Number.POSITIVE_INFINITY)) {
          return { action: 'raise', amount: cappedTo };
        }
      }
    }

    // Semi-bluff raise with a real draw, never on the river (nothing left to
    // draw to) and never big enough to be a stack-off.
    if (street !== 'river' && draw >= 0.6 && legal.actions.includes('raise') && legal.minRaiseTo !== undefined) {
      if (roll('semibluff') < 0.3 / opponentCount) {
        const desiredTo = state.currentBet + Math.floor((pot + toCall) * 0.7);
        const cappedTo = Math.min(Math.max(desiredTo, legal.minRaiseTo), myBet + bluffCap);
        if (cappedTo >= legal.minRaiseTo && cappedTo < (legal.maxRaiseTo ?? Number.POSITIVE_INFINITY)) {
          return { action: 'raise', amount: cappedTo };
        }
      }
    }

    const premium = stackRiskPremium(toCall, stack, spr, onePair);
    if (equity >= potOdds + premium) return { action: 'call' };

    // Minimum defence. Equity against a betting range that is modelled as
    // balanced puts every bluff-catcher right at break-even, so the price test
    // alone folds nearly all of them on estimate noise, and a bot that does
    // that can be bet into every street with any two cards. Defend the top
    // `mdf` of our own range instead, ranked by board strength.
    //
    // Two guards keep this from becoming a calling station. It needs some real
    // equity: half the price against small bets, nearly the full price
    // against big ones, where a bad call costs the most. And the stack-off
    // premium is added on top, so a call that puts the stack in still has to
    // be close to correctly priced. There is deliberately no cap on the share
    // of stack: one used to stop the bot calling its last 200 chips into a
    // 1,800 pot at 10% pot odds, and an opponent who bet every river won 68bb
    // each time it worked.
    const mdf = minimumDefense(toCall, pot, opponentCount);
    const ownWeights = comboWeights(table, myRead);
    if (myRead.checkedThisStreet) {
      // Having checked, we mostly do not hold the hands we would have bet for
      // value, so rank against the capped range that is actually left.
      for (let k = 0; k < ownWeights.length; k += 1) if (table.strength[k] >= 0.8) ownWeights[k] *= 0.35;
    }
    const ownRange = rankInRange(table, ownWeights, strength);
    const betOfPot = toCall / Math.max(1, pot - toCall);
    const equityFloor = (betOfPot <= 0.75 ? potOdds * 0.5 : potOdds - 0.07) + premium;
    if (ownRange >= 1 - mdf && equity >= equityFloor) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // Nothing to call. Value bet when ahead of the range that checked to us,
  // sized by texture, with the nut hands going big on the river.
  //
  // First to act on the flop or turn, a strong hand sometimes checks instead.
  // A checking range with nothing strong in it can be bet into with any two
  // cards; a few traps are what make a check-raise possible at all.
  const nutted = equity >= 0.85;
  const firstToAct = opponents.every((p) => !p.hasActed);
  const trap = street !== 'river' && firstToAct && equity >= 0.75 && roll('trap') < TRAP_RATE;
  if (!trap && equity >= fairShare + 0.1 && legal.actions.includes('bet')) {
    const size = betFraction(street, boardWetness(state.board), nutted);
    const desired = Math.floor(pot * size);
    const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, ceiling));
    if (target >= (legal.minBet ?? 0)) return { action: 'bet', amount: target };
  }

  // Bluffs come from hands with little showdown value: betting a medium hand
  // turns it into a bluff that only gets called by better. Draws are the best
  // early-street bluffs, since they can still win when called; on the river
  // that becomes blockers.
  const air = strength < 0.45 || draw > 0;
  if (air && legal.actions.includes('bet')) {
    const polar = street === 'river' && roll('polar') < 0.4;
    const size = betFraction(street, boardWetness(state.board), polar);
    const preference =
      street === 'river' ? (hasBlocker(me.holeCards, state.board) ? 1.5 : 0.6) : draw > 0 ? 1.8 : street === 'flop' ? 1 : 0.6;
    if (roll('bluff') < bluffFrequency(size, opponentCount) * preference) {
      const desired = Math.floor(pot * size);
      const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, bluffCap));
      if (target >= (legal.minBet ?? 0) && target < stack) return { action: 'bet', amount: target };
    }
  }

  return { action: 'check' };
}

/** How often expert slow-plays a strong hand first to act on the flop or turn. */
const TRAP_RATE = 0.25;

/**
 * Preflop for every level: position-aware opening and three-betting ranges
 * from `preflopRanges.ts`, and calls by equity against the raiser's range.
 *
 * The lower levels used to raise by Chen score with a fixed chance per band,
 * the same in every seat, and call by equity against random hands. That
 * opened 8-3 suited under the gun as readily as on the button, and called a
 * three-bet with any two cards, since any two cards have a third of the
 * equity of a random hand and a three-bet is usually priced at about a third.
 * Now every level reads the same charts, widened by its `looseness` and
 * raising `raiseShare` of what it plays, and only expert switches to
 * push/fold when short.
 */
function rangePreflop(state: GameState, me: Player, legal: LegalActions, profile: DifficultyProfile, ctx: TableContext): BotDecision {
  const { bb, pot, stack, myBet, toCall, opponents, readOf, roll } = ctx;
  const percentile = preflopPercentile(me.holeCards);
  const headsUp = state.players.filter((p) => p.holeCards.length === 2 && !p.sittingOut).length === 2;
  const raised = state.currentBet > bb;
  const raiserWidth = opponents.reduce((w, p) => Math.min(w, readOf(p.id).preflopWidth), 1);
  // Players still to act after us: anyone in the hand who has not acted yet
  // (or must act again) and can still put chips in.
  const behind = opponents.filter((p) => !p.allIn && p.chips > 0 && !p.hasActed).length;

  const largestOpponent = opponents.reduce((m, p) => Math.max(m, p.chips + p.currentBet), 0);
  const effectiveBB = Math.min(stack + myBet, largestOpponent) / bb;

  if (profile === EXPERT && effectiveBB <= PUSH_FOLD_MAX_BB) {
    const aggressorAllIn = opponents.some((p) => p.allIn && p.currentBet >= state.currentBet && raised);
    const choice = pushFoldAction({
      percentile,
      effectiveBB,
      behind,
      facing: !raised ? 'unopened' : aggressorAllIn ? 'shove' : 'raise',
      raiserWidth,
      canCheck: toCall === 0,
    });
    if (choice === 'shove') return { action: 'allin' };
    if (choice === 'call') return legal.actions.includes('call') ? { action: 'call' } : { action: 'allin' };
    return { action: choice };
  }

  const canRaise = legal.actions.includes('raise') && legal.minRaiseTo !== undefined;
  const raiseTo = (desired: number): BotDecision | null => {
    if (!canRaise || legal.minRaiseTo === undefined) return null;
    const to = Math.min(Math.max(desired, legal.minRaiseTo), legal.maxRaiseTo ?? desired);
    // A raise that would put most of the stack in is a shove in all but name;
    // make it one rather than leaving a stack too small to fold.
    if (to - myBet >= stack * 0.45) return { action: 'allin' };
    return { action: 'raise', amount: to };
  };

  if (!raised) {
    const limpers = opponents.filter((p) => p.currentBet >= bb && p.hasActed).length;
    // How wide this level plays from here. Isolating limpers needs a tighter
    // raising range than opening: there is already a player who has said they
    // want to see a flop.
    const playWidth = Math.min(1, openWidth(Math.max(1, behind), headsUp) * profile.looseness);
    const raiseWidth = playWidth * profile.raiseShare * (limpers > 0 ? 0.7 : 1);
    if (percentile <= raiseWidth) {
      // 2.5 big blinds, plus one for every limper, who would otherwise be
      // getting a cheap price to call.
      const open = raiseTo(Math.round(2.5 * bb + limpers * bb));
      if (open) return open;
    }
    if (toCall === 0) return { action: 'check' };
    // Completing from the small blind into a limped or heads-up pot is cheap
    // enough that a wide range is worth a flop.
    if (toCall <= bb / 2 && percentile <= Math.min(1, 0.6 * profile.looseness)) return { action: 'call' };
    // The part of the playing range a passive level does not raise, it limps.
    if (percentile <= playWidth) return { action: 'call' };
    return { action: 'fold' };
  }

  // Facing a raise. Re-raise for value from the top of what continues, and
  // occasionally with suited aces and suited connectors just below it: they
  // block the hands that continue and play well when called.
  const valueWidth = threeBetWidth(raiserWidth) * profile.looseness * profile.raiseShare;
  // Position after the flop, not preflop: the big blind closes the preflop
  // action but is first to act on every street after it.
  const order = (p: Player): number => positionBonus(state.players.indexOf(p), state.dealerIndex, state.players.length);
  const inPosition = opponents.every((p) => order(p) < order(me));
  if (percentile <= valueWidth) {
    const reraise = raiseTo(Math.round(state.currentBet * (inPosition ? 3 : 3.5)));
    if (reraise) return reraise;
  }
  const [a, b] = me.holeCards;
  const suited = a.suit === b.suit;
  const bluffShape = suited && (a.rank === 14 || b.rank === 14 || Math.abs(a.rank - b.rank) === 1);
  if (bluffShape && percentile <= raiserWidth * 1.5 && roll('light3bet') < profile.bluffRate) {
    const reraise = raiseTo(Math.round(state.currentBet * (inPosition ? 3 : 3.5)));
    if (reraise && reraise.action === 'raise') return reraise;
  }

  // Call by equity against the raiser's range, with a margin out of position,
  // where less of that equity gets realised. A level's slack loosens the
  // price (expert's negative slack is a postflop margin, and preflop the
  // position margin does that job).
  const table = buildComboTable(me.holeCards, []);
  const weights = opponentWeights(table, me, ctx, profile.readTrust);
  const equity = rangeEquity(me.holeCards, [], table, weights, ctx.sims, ctx.seed);
  const potOdds = toCall / (pot + toCall);
  // An all-in call realises all of its equity, there is no later street to be
  // outplayed on, so it gets no position margin.
  const allInCall = toCall >= stack || opponents.some((p) => p.allIn);
  const realisation = allInCall ? 0 : inPosition ? 0.01 : 0.04;
  const slack = (profile.looseness - 1) * 0.06;
  if (equity >= potOdds - slack + realisation + stackRiskPremium(toCall, stack)) return { action: 'call' };
  return { action: 'fold' };
}
