/**
 * Measure *why* the bot loses, not just that it does.
 *
 * `bot-exploits.mts` scores strategies; this one instruments the bot's actual
 * decisions so each weakness can be named and quantified rather than inferred
 * from a win rate. Everything here reads the bot's real choices in real hands.
 *
 * Run: node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/bot-probe.mts
 */
import { decideAction, type Difficulty } from '../src/engine/bot.ts';
import { randomFloat } from '../src/engine/cards.ts';
import { monteCarloEquity } from '../src/engine/equity.ts';
import { applyAction, createGame, legalActions, startHand } from '../src/engine/holdem.ts';
import type { GameConfig, GameState, LegalActions } from '../src/engine/types.ts';

const config: GameConfig = {
  smallBlind: 5,
  bigBlind: 10,
  startingStack: 1000,
  maxPlayers: 6,
  turnTimerSec: 30,
};

const HERO = 'HERO';
const BOT = 'BOT';
const difficulty: Difficulty = (process.argv[3] as Difficulty) ?? 'medium';
const HANDS = Number(process.argv[2] ?? 900);

function pot(state: GameState) {
  return state.pots.reduce((s, p) => s + p.amount, 0);
}

/**
 * Play hands where the hero bets a fixed number of chips at every opportunity,
 * and record what the bot did when facing it.
 */
function foldRateFacing(betChips: number) {
  let faced = 0;
  let folded = 0;
  let foldedWhilePriced = 0;
  let pricedSpots = 0;

  for (let h = 0; h < HANDS; h += 1) {
    const players = [
      { id: HERO, name: 'Hero', seatIndex: 0 },
      { id: BOT, name: 'Bot', seatIndex: 1, isBot: true },
    ];
    let state = startHand(createGame(config, players, 500000 + h));

    for (let i = 0; i < 400 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      if (!actor) break;
      const legal = legalActions(state, actor.id);

      if (actor.id === BOT) {
        const decision = decideAction(state, BOT, difficulty);
        if (legal.toCall > 0) {
          faced += 1;
          const odds = legal.toCall / (pot(state) + legal.toCall);
          // A generous reference: far more trials than any bot is allowed.
          const truth = monteCarloEquity(actor.holeCards, state.board, 1, 800, `probe:${h}:${i}`);
          const priced = truth >= odds;
          if (priced) pricedSpots += 1;
          if (decision.action === 'fold') {
            folded += 1;
            if (priced) foldedWhilePriced += 1;
          }
        }
        const r = applyAction(state, BOT, decision.action, decision.amount);
        if (!r.ok) break;
        state = r.state;
        continue;
      }

      // Hero: bet the fixed size whenever possible, else call.
      let act: { action: LegalActions['actions'][number]; amount?: number };
      if (legal.toCall > 0) {
        act = legal.actions.includes('raise') && legal.minRaiseTo !== undefined
          ? { action: 'raise', amount: Math.max(legal.minRaiseTo, Math.min(betChips, legal.maxRaiseTo ?? betChips)) }
          : { action: 'call' };
      } else if (legal.actions.includes('bet') && legal.minBet !== undefined) {
        act = { action: 'bet', amount: Math.max(legal.minBet, Math.min(betChips, legal.maxBet ?? betChips)) };
      } else {
        act = { action: 'check' };
      }
      const r = applyAction(state, HERO, act.action, act.amount);
      if (!r.ok) break;
      state = r.state;
    }
  }
  return {
    faced,
    foldPct: faced ? (folded / faced) * 100 : 0,
    pricedFoldPct: pricedSpots ? (foldedWhilePriced / pricedSpots) * 100 : 0,
    pricedSpots,
  };
}

console.log(`bot: "${difficulty}", ${HANDS} hands per row, stacks ${config.startingStack}\n`);

console.log('1. DOES BET SIZE, RATHER THAN PRICE, DECIDE WHETHER IT CALLS?');
console.log('   bet (chips)   % of stack   bot folds   folds *while* getting the right price');
for (const size of [50, 100, 150, 200, 300, 500, 1000]) {
  const r = foldRateFacing(size);
  console.log(
    `   ${String(size).padStart(9)}   ${String(Math.round((size / config.startingStack) * 100) + '%').padStart(10)}` +
      `   ${(r.foldPct.toFixed(1) + '%').padStart(9)}   ${(r.pricedFoldPct.toFixed(1) + '%').padStart(10)}` +
      `  (${r.pricedSpots} such spots)`,
  );
}

console.log('\n2. HOW OFTEN DOES IT EVER PUT IN A RAISE PREFLOP?');
{
  let spots = 0;
  let raises = 0;
  let calls = 0;
  let folds = 0;
  for (let h = 0; h < HANDS; h += 1) {
    const players = [
      { id: HERO, name: 'Hero', seatIndex: 0 },
      { id: BOT, name: 'Bot', seatIndex: 1, isBot: true },
    ];
    let state = startHand(createGame(config, players, 700000 + h));
    // Hero opens to 3bb; see what the bot does with it.
    const legalHero = legalActions(state, state.players[state.currentPlayerIndex]!.id);
    if (state.players[state.currentPlayerIndex]!.id !== HERO) {
      const d = decideAction(state, BOT, difficulty);
      const r = applyAction(state, BOT, d.action, d.amount);
      if (!r.ok) continue;
      state = r.state;
    }
    const lh = legalActions(state, HERO);
    if (lh.actions.includes('raise') && lh.minRaiseTo !== undefined) {
      const r = applyAction(state, HERO, 'raise', Math.min(30, lh.maxRaiseTo ?? 30));
      if (!r.ok) continue;
      state = r.state;
    }
    if (state.players[state.currentPlayerIndex]?.id !== BOT) continue;
    const d = decideAction(state, BOT, difficulty);
    spots += 1;
    if (d.action === 'raise' || d.action === 'allin') raises += 1;
    else if (d.action === 'call') calls += 1;
    else folds += 1;
  }
  console.log(`   facing a 3bb open, over ${spots} hands:`);
  console.log(`     re-raises ${((raises / spots) * 100).toFixed(1)}%   calls ${((calls / spots) * 100).toFixed(1)}%   folds ${((folds / spots) * 100).toFixed(1)}%`);
}

console.log('\n3. IS THE POSITION BONUS POINTING THE RIGHT WAY?');
{
  // Reproduce both formulas and ask which seat each one rewards.
  const n = 6;
  const dealerIndex = 0;
  console.log('   seat  acts postflop        was   now');
  for (let seat = 0; seat < n; seat += 1) {
    const before = ((seat - dealerIndex + n) % n) / n;
    const after = ((seat - dealerIndex - 1 + n * 2) % n) / n;
    // Postflop the small blind acts first and the button acts last.
    const order = (seat - dealerIndex - 1 + n) % n;
    const label = seat === dealerIndex ? 'LAST (button)' : order === 0 ? 'FIRST (small blind)' : `${order + 1}th`;
    console.log(`   ${String(seat).padStart(4)}  ${label.padEnd(20)} ${before.toFixed(2)}  ${after.toFixed(2)}`);
  }
}

console.log('\n4. WHEN THE BOT BETS, HOW OFTEN IS IT BLUFFING?');
{
  let bets = 0;
  let weak = 0;
  for (let h = 0; h < HANDS; h += 1) {
    const players = [
      { id: HERO, name: 'Hero', seatIndex: 0 },
      { id: BOT, name: 'Bot', seatIndex: 1, isBot: true },
    ];
    let state = startHand(createGame(config, players, 900000 + h));
    for (let i = 0; i < 400 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      if (!actor) break;
      if (actor.id === BOT) {
        const d = decideAction(state, BOT, difficulty);
        if (d.action === 'bet' || d.action === 'raise' || d.action === 'allin') {
          bets += 1;
          const truth = monteCarloEquity(actor.holeCards, state.board, 1, 600, `bluff:${h}:${i}`);
          if (truth < 0.5) weak += 1;
        }
        const r = applyAction(state, BOT, d.action, d.amount);
        if (!r.ok) break;
        state = r.state;
      } else {
        const legal = legalActions(state, HERO);
        const act = legal.toCall > 0 ? 'call' : 'check';
        const r = applyAction(state, HERO, act as never);
        if (!r.ok) break;
        state = r.state;
      }
    }
  }
  console.log(`   of ${bets} bets/raises, ${((weak / Math.max(1, bets)) * 100).toFixed(1)}% were made with the worse hand.`);
  console.log('   (a bot that never bluffs can be folded to for free)');
}

console.log('\n5. CAN THE BOT\'S BLUFFS BE PREDICTED FROM WHAT THE PLAYER CAN SEE?');
{
  // The attack: the bot's randomness used to be a hash of values the client
  // already holds - the game seed, hand number, player id, street and log
  // length - so any player able to read the app's own state could recompute the
  // coin flip before acting. This runs that exact attack against the current
  // bot. It now mixes in a per-process secret that is in no game state, so the
  // recomputed flip should be uncorrelated with what the bot actually does.
  const BLUFF_RATE = { easy: 0.06, medium: 0.14, hard: 0.22, expert: 0.3 }[difficulty] ?? 0.14;
  let predictions = 0;
  let correct = 0;
  for (let h = 0; h < HANDS; h += 1) {
    const players = [
      { id: HERO, name: 'Hero', seatIndex: 0 },
      { id: BOT, name: 'Bot', seatIndex: 1, isBot: true },
    ];
    let state = startHand(createGame(config, players, 1300000 + h));
    for (let i = 0; i < 400 && state.street !== 'showdown'; i += 1) {
      const actor = state.players[state.currentPlayerIndex];
      if (!actor) break;
      if (actor.id === BOT) {
        // Recompute the bot's coin flip from public state alone.
        const roll = randomFloat(
          `${String(state.seed)}:bot:${state.handNumber}:${BOT}:${state.street}:${state.log.length}`,
        );
        const predictedBluff = roll < BLUFF_RATE;
        const d = decideAction(state, BOT, difficulty);
        const legal = legalActions(state, BOT);
        // A bluff only shows itself where the bot had the option to be
        // aggressive; elsewhere the flip is unobservable either way.
        if (legal.actions.includes('bet') || legal.actions.includes('raise')) {
          predictions += 1;
          const wasAggressive = d.action === 'bet' || d.action === 'raise' || d.action === 'allin';
          if (predictedBluff === wasAggressive) correct += 1;
        }
        const r = applyAction(state, BOT, d.action, d.amount);
        if (!r.ok) break;
        state = r.state;
      } else {
        const legal = legalActions(state, HERO);
        const r = applyAction(state, HERO, (legal.toCall > 0 ? 'call' : 'check') as never);
        if (!r.ok) break;
        state = r.state;
      }
    }
  }
  const rate = (correct / Math.max(1, predictions)) * 100;
  console.log(`   ran the attack in ${predictions} spots, predicted the bot's aggression ${rate.toFixed(1)}%`);
  console.log('   (the seed, hand number, street and log length are all on the client;');
  console.log('    the per-process secret mixed in with them is not)');
}
