import { callShoveWidth, openWidth, pushWidth, threeBetWidth } from './preflopRanges';
import type { GameState } from './types';

/**
 * What each player's actions this hand say about their cards.
 *
 * The expert bot used to estimate equity against random hands, so a raise, a
 * three-bet and a river overbet all looked like they came from the same
 * average holding. It called big bets and re-raised into strength because
 * nothing it saw narrowed anyone's range. This reads the hand back from the
 * log and turns it into the inputs `rangeEquity` weights its samples by.
 *
 * The log is the only per-street record the state keeps: bets live in
 * `currentBet` for the current street only, and `contributions` is a running
 * total. It has no street markers, and adding one would shift `log.length`,
 * which feeds every bot random draw and would change every decision at every
 * difficulty. So the betting round is replayed instead: a street ends when
 * nobody who can still act owes an action, which is the engine's own rule.
 */
export interface PlayerRead {
  /**
   * Narrowest preflop range their actions fit, as a top fraction of starting
   * hands. 1 means no information (a blind that checked, or a fold).
   */
  preflopWidth: number;
  /**
   * Bets and raises on the flop, turn and river, each weighted by its size:
   * a two-thirds pot bet counts 1, a quarter pot stab about 0.35, an overbet
   * up to 1.5. Counting every bet as a full barrel let a player fire small
   * bets on every street and be read as having the nuts by the river: the
   * bot folded to a flat 200-chip stab often enough that it won 1.6bb a hand.
   */
  postflopAggression: number;
  /** Calls on the flop, turn and river. */
  postflopCalls: number;
  /** Their latest postflop bet or raise, as a fraction of the pot it went into. */
  lastBetFraction: number;
  /**
   * Whether they checked earlier on the current street. A checking range is
   * capped, since most strong hands would have bet, and minimum defence has to
   * be measured against that weaker range or it under-defends.
   */
  checkedThisStreet: boolean;
}

/** A read that knows nothing: the whole range, no postflop actions. */
export const NO_READ: Readonly<PlayerRead> = {
  preflopWidth: 1,
  postflopAggression: 0,
  postflopCalls: 0,
  lastBetFraction: 0,
  checkedThisStreet: false,
};

/**
 * Reads above 20bb are deep-stack raises, not push/fold shoves. The shove chart
 * would call a 60bb jam "top 30%", which is absurd.
 */
const SHOVE_READ_MAX_BB = 20;

interface Replay {
  street: number;
  pot: number;
  currentBet: number;
  raiseLevel: number;
  lastRaiseWidth: number;
  bet: Map<string, number>;
  chips: Map<string, number>;
  acted: Set<string>;
  actedPreflop: Set<string>;
  folded: Set<string>;
  blinds: Set<string>;
}

function canStillAct(replay: Replay, id: string): boolean {
  return !replay.folded.has(id) && (replay.chips.get(id) ?? 0) > 0;
}

function commit(replay: Replay, id: string, amount: number): void {
  replay.bet.set(id, (replay.bet.get(id) ?? 0) + amount);
  replay.chips.set(id, (replay.chips.get(id) ?? 0) - amount);
  replay.pot += amount;
}

export function readHand(state: GameState): Map<string, PlayerRead> {
  const reads = new Map<string, PlayerRead>();
  const dealt = state.players.filter((p) => p.holeCards.length === 2 && !p.sittingOut);
  for (const p of dealt) reads.set(p.id, { ...NO_READ });

  const start = state.log.lastIndexOf(`Starting hand #${state.handNumber}`);
  if (start < 0) return reads;

  const idByName = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const p of dealt) {
    if (idByName.has(p.name)) ambiguous.add(p.name);
    idByName.set(p.name, p.id);
  }

  const replay: Replay = {
    street: 0,
    pot: 0,
    currentBet: 0,
    raiseLevel: 0,
    lastRaiseWidth: 1,
    bet: new Map(),
    // Stacks at the start of the hand, so an all-in from a blind is known to
    // be all in and is not waited on for an action that never comes.
    chips: new Map(dealt.map((p) => [p.id, p.chips + (state.contributions[p.id] ?? 0)])),
    acted: new Set(),
    actedPreflop: new Set(),
    folded: new Set(),
    blinds: new Set(),
  };
  const headsUp = dealt.length === 2;
  const bb = Math.max(1, state.config.bigBlind);

  const narrow = (id: string, width: number): void => {
    const read = reads.get(id);
    if (read) read.preflopWidth = Math.min(read.preflopWidth, Math.max(0.01, width));
  };

  const aggress = (id: string, newTotal: number): void => {
    const read = reads.get(id);
    const already = replay.bet.get(id) ?? 0;
    if (replay.street === 0) {
      // Everyone who has not acted voluntarily yet is still to act behind.
      const behind = dealt.filter((p) => p.id !== id && canStillAct(replay, p.id) && !replay.actedPreflop.has(p.id)).length;
      const allIn = (replay.chips.get(id) ?? 0) <= newTotal - already;
      const totalBB = newTotal / bb;
      let width: number;
      if (replay.raiseLevel === 0) {
        width = openWidth(behind, headsUp);
        if (allIn && totalBB <= SHOVE_READ_MAX_BB) width = Math.max(width, pushWidth(totalBB, behind));
      } else if (replay.raiseLevel === 1) {
        width = threeBetWidth(replay.lastRaiseWidth);
        if (allIn && totalBB <= SHOVE_READ_MAX_BB) {
          width = Math.max(width, callShoveWidth(totalBB, replay.lastRaiseWidth, behind) * 1.1);
        }
      } else {
        width = replay.lastRaiseWidth * 0.35;
      }
      narrow(id, width);
      replay.lastRaiseWidth = width;
      replay.raiseLevel += 1;
    } else if (read) {
      const potBefore = Math.max(1, replay.pot + (replay.currentBet - already));
      read.lastBetFraction = (newTotal - replay.currentBet) / potBefore;
      read.postflopAggression += Math.max(0.35, Math.min(1.5, read.lastBetFraction / 0.66));
    }
    commit(replay, id, newTotal - already);
    replay.currentBet = newTotal;
    replay.acted = new Set([id]);
  };

  const call = (id: string, amount: number): void => {
    const read = reads.get(id);
    if (replay.street === 0) {
      if (replay.raiseLevel === 0) {
        // A limp. Solvers barely limp, but players who do keep their best
        // hands for raising, so it is a wide range rather than a strong one.
        narrow(id, 0.65);
      } else {
        // Blinds have a discount and close the action, so they defend wider.
        const factor = replay.blinds.has(id) ? 1.6 : 1.2;
        narrow(id, replay.lastRaiseWidth * factor);
      }
    } else if (read) {
      read.postflopCalls += 1;
    }
    commit(replay, id, amount);
  };

  for (let i = start + 1; i < state.log.length; i += 1) {
    const line = state.log[i];
    let match: RegExpMatchArray | null;

    if ((match = /^Antes posted: (\d+)$/.exec(line))) {
      replay.pot += Number(match[1]);
      // Antes come straight off every stack and are not a bet, see commitAnte.
      continue;
    }
    if ((match = /^(.+) posts (small|big) blind (\d+)$/.exec(line))) {
      const id = idByName.get(match[1]);
      if (!id) continue;
      commit(replay, id, Number(match[3]));
      replay.blinds.add(id);
      replay.currentBet = Math.max(replay.currentBet, replay.bet.get(id) ?? 0);
      continue;
    }

    match = /^(.+?) (folds|checks|calls all in for \d+|calls \d+|bets \d+|raises to \d+|moves all in for \d+)$/.exec(line);
    if (!match || ambiguous.has(match[1])) continue;
    const id = idByName.get(match[1]);
    if (!id) continue;
    const verb = match[2];
    const amount = Number(/(\d+)$/.exec(verb)?.[1] ?? 0);

    if (verb === 'folds') {
      replay.folded.add(id);
    } else if (verb === 'checks') {
      const read = reads.get(id);
      if (read && replay.street > 0) read.checkedThisStreet = true;
    } else if (verb.startsWith('calls')) {
      call(id, amount);
    } else if (verb.startsWith('bets')) {
      aggress(id, amount);
    } else if (verb.startsWith('raises')) {
      aggress(id, amount);
    } else {
      const total = (replay.bet.get(id) ?? 0) + amount;
      if (total > replay.currentBet) aggress(id, total);
      else call(id, amount);
    }
    replay.acted.add(id);
    if (replay.street === 0) replay.actedPreflop.add(id);

    // The engine's own rule: the street ends once nobody who can still act
    // has either not acted or not matched the bet.
    const pending = dealt.some(
      (p) => canStillAct(replay, p.id) && (!replay.acted.has(p.id) || (replay.bet.get(p.id) ?? 0) < replay.currentBet),
    );
    const remaining = dealt.filter((p) => !replay.folded.has(p.id)).length;
    if (!pending && remaining > 1) {
      replay.street += 1;
      replay.currentBet = 0;
      replay.raiseLevel = 0;
      replay.bet = new Map();
      replay.acted = new Set();
      for (const read of reads.values()) read.checkedThisStreet = false;
    }
  }

  // If the replay lost track of the streets, its postflop reads are attached
  // to the wrong bets. The preflop widths come first and are still sound.
  const actualStreet = state.board.length === 0 ? 0 : state.board.length - 2;
  if (replay.street !== actualStreet) {
    for (const read of reads.values()) {
      read.postflopAggression = 0;
      read.postflopCalls = 0;
      read.lastBetFraction = 0;
      read.checkedThisStreet = false;
    }
  }

  return reads;
}
