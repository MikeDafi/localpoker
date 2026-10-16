/**
 * Average wall-clock time per bot decision, by difficulty.
 *
 * Bots run on phones, where a decision that takes tens of milliseconds on a
 * laptop can stall the UI thread, so any change to the decision logic should
 * be checked against this before and after. Plays heads-up and six-handed
 * bot-only hands and times every `decideAction` call.
 *
 * Usage: bun scripts/bot-timing.mts [hands]
 */
import { decideAction, setBotEntropy, type Difficulty } from '../src/engine/bot';
import { applyAction, createGame, startHand } from '../src/engine/holdem';
import type { GameState } from '../src/engine/types';

setBotEntropy('timing');
const hands = Number(process.argv[2] ?? 150);
const config = { smallBlind: 5, bigBlind: 10, startingStack: 1000, maxPlayers: 6, turnTimerSec: 30 };

for (const difficulty of ['easy', 'medium', 'hard', 'expert'] as Difficulty[]) {
  let total = 0;
  let count = 0;
  let worst = 0;
  for (const seats of [2, 6]) {
    for (let h = 0; h < hands; h += 1) {
      const players = Array.from({ length: seats }, (_, i) => ({ id: `P${i}`, name: `P${i}`, seatIndex: i, isBot: true }));
      let s: GameState = startHand(createGame(config, players, 5000 + h));
      for (let guard = 0; guard < 200 && s.street !== 'showdown'; guard += 1) {
        const actor = s.players[s.currentPlayerIndex];
        const t0 = performance.now();
        const d = decideAction(s, actor.id, difficulty);
        const dt = performance.now() - t0;
        total += dt;
        count += 1;
        worst = Math.max(worst, dt);
        const r = applyAction(s, actor.id, d.action, d.amount);
        if (!r.ok) break;
        s = r.state;
      }
    }
  }
  console.log(`${difficulty.padEnd(7)} ${count} decisions, avg ${(total / count).toFixed(2)} ms, worst ${worst.toFixed(1)} ms`);
}
