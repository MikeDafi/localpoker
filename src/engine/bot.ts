import { randomFloat, type Card } from './cards';
import { chenScore, monteCarloEquity } from './equity';
import { legalActions } from './holdem';
import { roundWager } from '../game/wager';
import type { BotDecision, GameState, LegalActions } from './types';

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
   * Minimum Chen score this bot will open/raise with preflop. Chen is a
   * starting-hand *ranking*, which is exactly the right tool for "is this worth
   * playing aggressively" — unlike equity, it knows AKo is a better hand to
   * raise than 76s even when their raw equity is similar. Lower = raises wider.
   *
   * Calibrated against the actual distribution over all 1326 starting hands,
   * because Chen scores are compressed at the top and eyeballing the threshold
   * gets it badly wrong. The cumulative share of hands at each score:
   *
   *     chen >= 11  ->   2.4%      chen >= 6  ->  25.5%
   *     chen >=  9  ->   6.6%      chen >= 5  ->  43.3%
   *     chen >=  8  ->  10.7%      chen >= 4  ->  51.7%
   *     chen >=  7  ->  17.8%
   *
   * The old values (11 on medium) therefore opened the top 2.4% of hands, which
   * is not a poker strategy. These give roughly 6 / 18 / 25 / 43%.
   */
  chenRaiseMin: number;
  /**
   * How much of the correct preflop raising frequency this bot actually uses.
   * 1 = the full schedule in `preflopRaiseChance`.
   *
   * Preflop raises used to be governed by the same `valueEdge` test as
   * postflop, which heads-up demands ~72% equity. Almost no starting hand
   * clears that, so the bot re-raised 1.8% of the time and an opponent could
   * open every single hand without ever being punished for it.
   */
  defend: number;
}

/**
 * The difficulties differ in *how accurately they estimate equity* and *how
 * correctly they act on it*, rather than in arbitrary thresholds:
 *
 *  - easy runs few simulations, so its equity estimate is genuinely noisy
 *    (~±6%), and it calls far too wide — it misjudges hands rather than being
 *    handicapped after the fact.
 *  - expert samples enough to be accurate to ~±2%, plays close to correct pot
 *    odds, uses position, and bluffs the most.
 */
const PROFILES: Record<Difficulty, DifficultyProfile> = {
  easy: { sims: 60, bluffRate: 0.06, valueEdge: 0.3, aggression: 0.4, potOddsSlack: 0.18, positionWeight: 0, chenRaiseMin: 9, defend: 0.5 },
  medium: { sims: 160, bluffRate: 0.14, valueEdge: 0.22, aggression: 0.55, potOddsSlack: 0.06, positionWeight: 0.02, chenRaiseMin: 7, defend: 0.8 },
  hard: { sims: 320, bluffRate: 0.22, valueEdge: 0.16, aggression: 0.65, potOddsSlack: 0.0, positionWeight: 0.04, chenRaiseMin: 6, defend: 1 },
  expert: { sims: 500, bluffRate: 0.3, valueEdge: 0.12, aggression: 0.75, potOddsSlack: -0.03, positionWeight: 0.06, chenRaiseMin: 5, defend: 1 },
};

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
 */
function commitCeiling(equity: number, stack: number): number {
  if (equity >= 0.85) return stack;
  if (equity >= 0.72) return Math.floor(stack * 0.6);
  if (equity >= 0.6) return Math.floor(stack * 0.33);
  if (equity >= 0.5) return Math.floor(stack * 0.15);
  return Math.floor(stack * 0.05);
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
 */
export function stackRiskPremium(toCall: number, stack: number): number {
  if (stack <= 0) return 0;
  const risk = clamp(toCall / stack, 0, 1);
  return 0.06 * risk * risk;
}

/**
 * How often to put in a preflop raise, by starting-hand ranking.
 *
 * This covers opening as well as re-raising: heads-up the small blind and in
 * six-max everyone after the blinds already face a bet, so every preflop raise
 * comes through here.
 *
 * Chen is the right measure: it knows AKo is a better hand to put in a raise
 * than 76s even though their raw equity against a random hand is similar.
 * Thresholds are relative to the profile's opening standard, so a looser bot
 * raises wider without a second table of numbers.
 *
 * The bottom rung is the light raise, from hands below the opening standard.
 * Without it the bot's raises would be perfectly honest and folding to them
 * would be free, which is the same mistake as never bluffing.
 */
function preflopRaiseChance(chen: number, profile: DifficultyProfile): number {
  const min = profile.chenRaiseMin;
  if (chen >= min + 4) return 0.85;
  if (chen >= min + 1) return 0.45;
  if (chen >= min) return 0.22;
  if (chen >= min - 3) return profile.bluffRate * 0.5;
  return 0;
}

/**
 * Estimate this bot's chance of winning the hand.
 *
 * Monte Carlo at every street, including preflop.
 *
 * It is tempting to use the Chen score preflop since it is far cheaper, but Chen
 * produces a *ranking*, not a probability — 72o scores 0 on a normalised Chen
 * scale while its real heads-up equity is ~0.36. Feeding a ranking into a
 * pot-odds comparison made every bot fold far too much preflop, and the tighter
 * the profile the worse it bled blinds. A rollout also knows something Chen
 * fundamentally cannot: how many opponents are still in the pot.
 *
 * Cost grows with the number of opponents (each needs a hand dealt and evaluated
 * per trial), so the trial count is scaled down as the pot gets more crowded.
 * That keeps a decision at roughly constant CPU cost whatever the table looks
 * like, and spends the accuracy heads-up, where equity sits closest to the
 * pot-odds boundary.
 */
function estimateEquity(
  state: GameState,
  holeCards: readonly Card[],
  opponents: number,
  profile: DifficultyProfile,
  seed: string,
): number {
  const sims = Math.max(40, Math.round((profile.sims * 2) / (opponents + 1)));
  return monteCarloEquity(holeCards, state.board, opponents, sims, seed);
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

export function decideAction(state: GameState, playerId: string, difficulty: Difficulty = 'medium'): BotDecision {
  const profile = PROFILES[difficulty] ?? PROFILES.medium;
  const legal = legalActions(state, playerId);
  const me = state.players.find((candidate) => candidate.id === playerId);
  if (!me) return ensureLegal(legal, { action: 'check' });

  const bluffRoll = botRandom(state, playerId, 'bluff');
  const shoveRoll = botRandom(state, playerId, 'shove');
  const preflopRoll = botRandom(state, playerId, 'preflop');
  const pot = Math.max(1, potSize(state));
  const stack = me.chips;
  const myBet = me.currentBet;

  // Only players still contesting the pot matter to an equity estimate.
  const opponents = Math.max(
    1,
    state.players.filter((p) => p.id !== playerId && !p.folded && !p.sittingOut).length,
  );

  const rawEquity = estimateEquity(
    state,
    me.holeCards,
    opponents,
    profile,
    `${String(state.seed)}:eq:${state.handNumber}:${playerId}:${state.street}`,
  );

  // Acting late is worth real equity: everyone else has already shown their hand.
  const seatIndex = state.players.findIndex((candidate) => candidate.id === playerId);
  const relativePosition = positionBonus(seatIndex, state.dealerIndex, state.players.length);
  const equity = clamp(rawEquity + relativePosition * profile.positionWeight, 0, 1);

  // Preflop, aggression is governed by starting-hand quality (Chen) rather than
  // raw equity: heads-up almost any two cards clear 33% equity, which is not a
  // reason to raise. Postflop the equity estimate is the better guide.
  const preflop = state.board.length === 0;
  const chen = preflop ? chenScore(me.holeCards) : 0;
  const mayOpen = !preflop || chen >= profile.chenRaiseMin;

  // An even share of the pot. Equity above this is a real edge; below it the
  // hand is losing money however good the raw number looks.
  const fairShare = 1 / (opponents + 1);
  const edge = equity - fairShare;

  const ceiling = commitCeiling(equity, stack);
  // Bluffs stay small — never a stack-off.
  const bluffCap = Math.min(Math.floor(stack * 0.4), Math.max(0, stack - 1));
  // A bluff has to get through everyone still in the hand, so it is worth far
  // less multiway. The profile rate is the heads-up rate.
  const bluffing = bluffRoll < profile.bluffRate * (2 / (opponents + 1));

  // Preflop raising, by hand ranking rather than by equity edge. Heads-up the
  // equity tests below need ~72% to fire, which almost nothing clears preflop,
  // so without this the bot only ever raised aces and kings and opening against
  // it was free.
  //
  // Deliberately outside the `toCall > 0` split: the big blind facing a call
  // has nothing to call but may still raise, and that option used to be
  // unreachable, so the bot never once raised from the big blind.
  if (preflop && legal.actions.includes('raise') && legal.minRaiseTo !== undefined) {
    const chance = preflopRaiseChance(chen, profile) * profile.defend;
    if (preflopRoll < chance) {
      const light = chen < profile.chenRaiseMin;
      const desiredTo = legal.minRaiseTo + Math.floor(pot * (light ? 0.5 : 0.75));
      const cappedTo = Math.min(desiredTo, myBet + (light ? bluffCap : ceiling), legal.maxRaiseTo ?? desiredTo);
      if (cappedTo >= legal.minRaiseTo) {
        return ensureLegal(legal, { action: 'raise', amount: cappedTo });
      }
    }
  }

  if (legal.toCall > 0) {
    // Break-even point: call `toCall` to win `pot + toCall`.
    const potOdds = legal.toCall / (pot + legal.toCall);

    // Value raise when well ahead, sized by the pot but capped by what this
    // much equity justifies committing.
    if (mayOpen && edge > profile.valueEdge && legal.actions.includes('raise')) {
      const desiredTo = (legal.minRaiseTo ?? 0) + Math.floor(pot * profile.aggression);
      const cappedTo = Math.min(desiredTo, myBet + ceiling, legal.maxRaiseTo ?? desiredTo);
      if (cappedTo >= (legal.minRaiseTo ?? 0)) {
        return ensureLegal(legal, { action: 'raise', amount: cappedTo });
      }
    }

    // Semi-bluff raise: needs equity to fall back on, and must not commit the stack.
    if (mayOpen && bluffing && edge > -0.12 && legal.actions.includes('raise')) {
      const desiredTo = (legal.minRaiseTo ?? 0) + Math.floor(pot * 0.5);
      const cappedTo = Math.min(desiredTo, myBet + bluffCap);
      if (cappedTo >= (legal.minRaiseTo ?? 0) && cappedTo < (legal.maxRaiseTo ?? Number.POSITIVE_INFINITY)) {
        return ensureLegal(legal, { action: 'raise', amount: cappedTo });
      }
    }

    // The real decision: is calling +EV? Difficulty decides how far from correct
    // the answer is allowed to be, and a near stack-off has to clear the price
    // by a margin. Nothing else may veto a call that is correctly priced.
    const pricedIn = equity >= potOdds - profile.potOddsSlack + stackRiskPremium(legal.toCall, stack);
    if (pricedIn) {
      return ensureLegal(legal, { action: 'call' });
    }

    return ensureLegal(legal, { action: 'fold' });
  }

  // Nothing to call: bet for value when ahead of the field.
  const valueBetting = mayOpen && edge > profile.valueEdge * 0.7;
  if (valueBetting && legal.actions.includes('bet')) {
    const desired = Math.floor(pot * (equity > 0.85 ? profile.aggression + 0.25 : profile.aggression));
    const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, ceiling));
    if (target >= (legal.minBet ?? 0)) {
      return ensureLegal(legal, { action: 'bet', amount: target });
    }
  }

  // Bluff bet, capped so it can never become an all-in.
  //
  // This used to require `edge > -0.15`, which meant the bot only ever "bluffed"
  // with hands that already had some equity. Those are thin value bets, not
  // bluffs, and the hands it actually should be betting - the ones with no way
  // to win at showdown - were the only ones it always checked. Measured, just
  // 10% of its bets were made with the worse hand even after raising the rate,
  // so folding to it stayed nearly free. A hand that cannot win unless the
  // other player folds is exactly the right hand to bet.
  if (mayOpen && bluffing && !valueBetting && legal.actions.includes('bet')) {
    const desired = Math.floor(pot * 0.5);
    const target = Math.min(Math.max(legal.minBet ?? 0, desired), Math.min(legal.maxBet ?? desired, bluffCap));
    if (target >= (legal.minBet ?? 0) && target < stack) {
      return ensureLegal(legal, { action: 'bet', amount: target });
    }
  }

  // Open-shove only as a near-lock.
  if (equity > 0.92 && legal.actions.includes('allin') && shoveRoll > 0.85 && difficulty !== 'easy') {
    return ensureLegal(legal, { action: 'allin' });
  }

  return ensureLegal(legal, { action: 'check' });
}
