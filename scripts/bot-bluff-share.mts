/**
 * How often each difficulty's bets are bluffs, by street.
 *
 * Plays bot against bot heads-up and, for every bet or raise, checks whether
 * the bettor held the worse hand against the opponent's actual cards on the
 * final board. GTO bets and raises bluff about b/(1+2b) of the time at a bet
 * of b times the pot: 20% at a third of the pot, about 30% at three quarters.
 *
 * Usage: bun scripts/bot-bluff-share.mts [difficulty] [hands]
 */
import { decideAction } from '../src/engine/bot';
import { applyAction, createGame, startHand } from '../src/engine/holdem';
import { compareHands, evaluateHand } from '../src/engine/handEvaluator';
import type { Difficulty } from '../src/game/settings';
import type { GameState } from '../src/engine/types';

const difficulty = (process.argv[2] ?? 'expert') as Difficulty;
const hands = Number(process.argv[3] ?? 3000);
const config = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };
type Row = { bets: number; bluffs: number; size: number };
const streets: Record<string, Row> = { flop: { bets: 0, bluffs: 0, size: 0 }, turn: { bets: 0, bluffs: 0, size: 0 }, river: { bets: 0, bluffs: 0, size: 0 } };
let raises = 0; let raiseBluffs = 0;

for (let h = 0; h < hands; h += 1) {
  let s: GameState = startHand(createGame(config, [
    { id: 'A', name: 'A', seatIndex: 0, isBot: true }, { id: 'B', name: 'B', seatIndex: 1, isBot: true }], 1000 + h));
  const acts: { id: string; street: string; kind: string; frac: number }[] = [];
  for (let guard = 0; guard < 60 && s.street !== 'showdown'; guard += 1) {
    const actor = s.players[s.currentPlayerIndex];
    const d = decideAction(s, actor.id, difficulty);
    const pot = s.pots.reduce((a, p) => a + p.amount, 0) + s.players.reduce((a, p) => a + p.currentBet, 0);
    if (s.street !== 'preflop' && (d.action === 'bet' || d.action === 'raise')) {
      acts.push({ id: actor.id, street: s.street, kind: d.action, frac: ((d.amount ?? 0) - actor.currentBet) / Math.max(1, pot) });
    }
    const r = applyAction(s, actor.id, d.action, d.amount);
    if (!r.ok) break;
    s = r.state;
  }
  // Deal out whatever board is left so every bet can be judged on five cards.
  const board = [...s.board, ...s.deck].slice(0, 5);
  const [a, b] = s.players;
  if (a.holeCards.length < 2 || b.holeCards.length < 2) continue;
  const cmp = compareHands(evaluateHand([...a.holeCards, ...board]), evaluateHand([...b.holeCards, ...board]));
  for (const act of acts) {
    const worse = act.id === 'A' ? cmp < 0 : cmp > 0;
    if (act.kind === 'raise') { raises += 1; if (worse) raiseBluffs += 1; continue; }
    const row = streets[act.street]; if (!row) continue;
    row.bets += 1; row.size += act.frac; if (worse) row.bluffs += 1;
  }
}
for (const [street, r] of Object.entries(streets)) {
  const f = r.size / Math.max(1, r.bets);
  console.log(`${difficulty} ${street}: ${r.bets} bets, ${(100 * r.bluffs / Math.max(1, r.bets)).toFixed(1)}% worse hand, avg ${(f * 100).toFixed(0)}% pot, GTO ~${(100 * f / (1 + 2 * f)).toFixed(0)}%`);
}
console.log(`${difficulty} raises: ${raises}, ${(100 * raiseBluffs / Math.max(1, raises)).toFixed(1)}% worse hand`);
