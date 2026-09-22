import { createDeck, shuffleDeck, type Card, type Seed } from './cards';
import { compareHands, evaluateHand } from './handEvaluator';
import type {
  ActionResult,
  GameConfig,
  GameState,
  LegalActions,
  Player,
  PlayerAction,
  PlayerInput,
  Pot,
  Winner,
} from './types';

function clonePlayer(player: Player): Player {
  return {
    ...player,
    holeCards: player.holeCards.map((card) => ({ ...card })),
  };
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map(clonePlayer),
    board: state.board.map((card) => ({ ...card })),
    deck: state.deck.map((card) => ({ ...card })),
    pots: state.pots.map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
    winners: state.winners.map((winner) => ({ ...winner, hand: winner.hand ? { ...winner.hand, cards: [...winner.hand.cards], ranks: [...winner.hand.ranks] } : undefined })),
    log: [...state.log],
    contributions: { ...state.contributions },
  };
}

function normalizeConfig(config: GameConfig): GameConfig {
  if (config.smallBlind <= 0 || config.bigBlind <= 0 || config.bigBlind < config.smallBlind) {
    throw new Error('Blinds must be positive and bigBlind must be at least smallBlind');
  }
  if (config.startingStack <= 0) throw new Error('startingStack must be positive');
  if (config.maxPlayers < 2) throw new Error('maxPlayers must be at least 2');
  return { ...config };
}

function normalizePlayers(players: readonly PlayerInput[], config: GameConfig): Player[] {
  if (players.length > config.maxPlayers) {
    throw new Error(`Too many players: maxPlayers is ${config.maxPlayers}`);
  }

  const ids = new Set<string>();
  return players
    .map((player, index) => {
      if (ids.has(player.id)) throw new Error(`Duplicate player id: ${player.id}`);
      ids.add(player.id);
      return {
        id: player.id,
        name: player.name,
        seatIndex: player.seatIndex ?? index,
        chips: player.chips ?? config.startingStack,
        holeCards: player.holeCards ? player.holeCards.map((card) => ({ ...card })) : [],
        folded: player.folded ?? false,
        allIn: player.allIn ?? false,
        currentBet: player.currentBet ?? 0,
        hasActed: player.hasActed ?? false,
        isBot: player.isBot ?? false,
        sittingOut: player.sittingOut ?? false,
      } satisfies Player;
    })
    .sort((a, b) => a.seatIndex - b.seatIndex);
}

function isParticipating(player: Player): boolean {
  return player.holeCards.length > 0 && !player.sittingOut;
}

function isRemaining(player: Player): boolean {
  return isParticipating(player) && !player.folded;
}

function canAct(player: Player): boolean {
  return isRemaining(player) && !player.allIn && player.chips > 0;
}

function activeSeatIndexes(players: readonly Player[]): number[] {
  return players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => !player.sittingOut && player.chips > 0)
    .map(({ index }) => index);
}

function findNextIndex(players: readonly Player[], fromIndex: number, predicate: (player: Player, index: number) => boolean): number {
  if (players.length === 0) return -1;
  for (let offset = 1; offset <= players.length; offset += 1) {
    const index = (fromIndex + offset + players.length) % players.length;
    if (predicate(players[index], index)) return index;
  }
  return -1;
}

function findFirstIndexFrom(players: readonly Player[], firstIndex: number, predicate: (player: Player, index: number) => boolean): number {
  return findNextIndex(players, firstIndex - 1, predicate);
}

function nextParticipatingIndex(players: readonly Player[], fromIndex: number): number {
  return findNextIndex(players, fromIndex, (player) => isParticipating(player));
}

function playersNeedingAction(state: GameState): number[] {
  return state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => canAct(player) && (!player.hasActed || player.currentBet < state.currentBet))
    .map(({ index }) => index);
}

function remainingIndexes(state: GameState): number[] {
  return state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => isRemaining(player))
    .map(({ index }) => index);
}

function commitChips(state: GameState, playerIndex: number, requestedAmount: number): number {
  const player = state.players[playerIndex];
  const amount = Math.max(0, Math.min(player.chips, requestedAmount));
  player.chips -= amount;
  player.currentBet += amount;
  player.allIn = player.chips === 0 && isParticipating(player) && !player.folded;
  state.contributions[player.id] = (state.contributions[player.id] ?? 0) + amount;
  return amount;
}

export function buildSidePots(players: readonly Player[], contributions: Record<string, number>): Pot[] {
  const positiveLevels = Array.from(new Set(Object.values(contributions).filter((amount) => amount > 0))).sort((a, b) => a - b);
  const pots: Pot[] = [];
  let previousLevel = 0;

  for (const level of positiveLevels) {
    const contributors = players.filter((player) => (contributions[player.id] ?? 0) >= level);
    const amount = (level - previousLevel) * contributors.length;
    if (amount > 0) {
      pots.push({
        amount,
        eligiblePlayerIds: contributors.filter((player) => !player.folded && isParticipating(player)).map((player) => player.id),
      });
    }
    previousLevel = level;
  }

  return pots;
}

function refreshPots(state: GameState): void {
  state.pots = buildSidePots(state.players, state.contributions);
}

function totalPot(state: GameState): number {
  return Object.values(state.contributions).reduce((sum, amount) => sum + amount, 0);
}

function resetStreetBets(state: GameState): void {
  state.currentBet = 0;
  state.minRaise = state.config.bigBlind;
  state.lastAggressorIndex = null;
  for (const player of state.players) {
    player.currentBet = 0;
    player.hasActed = false;
  }
}

function markAggression(state: GameState, aggressorIndex: number, raiseSize: number): void {
  state.currentBet = state.players[aggressorIndex].currentBet;
  state.minRaise = Math.max(raiseSize, state.config.bigBlind);
  state.lastAggressorIndex = aggressorIndex;
  for (const [index, player] of state.players.entries()) {
    if (canAct(player)) player.hasActed = index === aggressorIndex;
  }
  state.players[aggressorIndex].hasActed = true;
}

function drawFromDeck(state: GameState, count: number): Card[] {
  if (state.deck.length < count) throw new Error('Deck is exhausted');
  const cards = state.deck.slice(0, count);
  state.deck = state.deck.slice(count);
  return cards;
}

function dealHoleCards(state: GameState, dealerIndex: number): void {
  const order: number[] = [];
  const handIndexes = activeSeatIndexes(state.players);
  let index = dealerIndex;
  for (let i = 0; i < handIndexes.length; i += 1) {
    index = findNextIndex(state.players, index, (player) => !player.sittingOut && !player.folded && player.chips > 0);
    if (index === -1 || order.includes(index)) break;
    order.push(index);
  }

  for (let round = 0; round < 2; round += 1) {
    for (const playerIndex of order) {
      state.players[playerIndex].holeCards.push(...drawFromDeck(state, 1));
    }
  }
}

function setNextPlayerToAct(state: GameState, fromIndex: number): void {
  const next = findNextIndex(state.players, fromIndex, (_player, index) => playersNeedingAction(state).includes(index));
  state.currentPlayerIndex = next;
}

function firstPostflopIndex(state: GameState): number {
  return findNextIndex(state.players, state.dealerIndex, (player) => canAct(player));
}

function awardWhenEveryoneFolded(state: GameState): GameState {
  const next = cloneState(state);
  refreshPots(next);
  const remaining = remainingIndexes(next);
  if (remaining.length !== 1) return next;

  const winner = next.players[remaining[0]];
  const amount = totalPot(next);
  winner.chips += amount;
  next.street = 'showdown';
  next.currentPlayerIndex = -1;
  next.winners = amount > 0 ? [{ playerId: winner.id, amount }] : [];
  next.log.push(`${winner.name} wins ${amount} uncontested`);
  return next;
}

function oddChipOrder(state: GameState): string[] {
  const order: string[] = [];
  let index = state.dealerIndex;
  for (let i = 0; i < state.players.length; i += 1) {
    index = (index + 1 + state.players.length) % state.players.length;
    order.push(state.players[index].id);
  }
  return order;
}

function addWinnerAmount(winners: Map<string, Winner>, playerId: string, amount: number, hand = winners.get(playerId)?.hand): void {
  const existing = winners.get(playerId);
  winners.set(playerId, {
    playerId,
    amount: (existing?.amount ?? 0) + amount,
    hand: hand ?? existing?.hand,
  });
}

export function showdown(state: GameState): GameState {
  const next = cloneState(state);
  while (next.board.length < 5 && next.deck.length > 0) {
    next.board.push(...drawFromDeck(next, 1));
  }

  refreshPots(next);
  const remaining = remainingIndexes(next);
  if (remaining.length === 0) {
    next.street = 'showdown';
    next.currentPlayerIndex = -1;
    next.winners = [];
    return next;
  }
  if (remaining.length === 1) return awardWhenEveryoneFolded(next);

  const evaluations = new Map<string, ReturnType<typeof evaluateHand>>();
  for (const index of remaining) {
    const player = next.players[index];
    evaluations.set(player.id, evaluateHand([...player.holeCards, ...next.board]));
  }

  const winners = new Map<string, Winner>();
  const oddOrder = oddChipOrder(next);

  for (const pot of next.pots) {
    const eligible = pot.eligiblePlayerIds.filter((playerId) => evaluations.has(playerId));
    if (eligible.length === 0 || pot.amount === 0) continue;

    let bestIds: string[] = [eligible[0]];
    for (const playerId of eligible.slice(1)) {
      const comparison = compareHands(evaluations.get(playerId)!, evaluations.get(bestIds[0])!);
      if (comparison > 0) bestIds = [playerId];
      else if (comparison === 0) bestIds.push(playerId);
    }

    const share = Math.floor(pot.amount / bestIds.length);
    let remainder = pot.amount % bestIds.length;
    const orderedBestIds = [...bestIds].sort((a, b) => oddOrder.indexOf(a) - oddOrder.indexOf(b));

    for (const playerId of orderedBestIds) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      const amount = share + extra;
      const player = next.players.find((candidate) => candidate.id === playerId);
      if (player) player.chips += amount;
      addWinnerAmount(winners, playerId, amount, evaluations.get(playerId));
    }
  }

  next.street = 'showdown';
  next.currentPlayerIndex = -1;
  next.winners = Array.from(winners.values()).filter((winner) => winner.amount > 0);
  next.log.push(`Showdown: ${next.winners.map((winner) => `${winner.playerId} wins ${winner.amount}`).join(', ')}`);
  return next;
}

function countPlayersWhoCanAct(state: GameState): number {
  return state.players.filter((player) => canAct(player)).length;
}

function advanceAfterRoundComplete(state: GameState): GameState {
  if (remainingIndexes(state).length <= 1) return awardWhenEveryoneFolded(state);
  if (state.street === 'river') return showdown(state);
  return advanceStreet(state);
}

export function advanceStreet(state: GameState): GameState {
  const next = cloneState(state);
  if (next.street === 'showdown') return next;

  if (remainingIndexes(next).length <= 1) return awardWhenEveryoneFolded(next);

  if (next.street === 'preflop') {
    next.board.push(...drawFromDeck(next, 3));
    next.street = 'flop';
  } else if (next.street === 'flop') {
    next.board.push(...drawFromDeck(next, 1));
    next.street = 'turn';
  } else if (next.street === 'turn') {
    next.board.push(...drawFromDeck(next, 1));
    next.street = 'river';
  } else {
    return showdown(next);
  }

  resetStreetBets(next);
  refreshPots(next);

  if (countPlayersWhoCanAct(next) <= 1) {
    return advanceAfterRoundComplete(next);
  }

  next.currentPlayerIndex = firstPostflopIndex(next);
  if (next.currentPlayerIndex === -1) return advanceAfterRoundComplete(next);
  return next;
}

function settleAfterAction(state: GameState, actorIndex: number): GameState {
  refreshPots(state);
  if (remainingIndexes(state).length <= 1) return awardWhenEveryoneFolded(state);

  if (playersNeedingAction(state).length === 0) {
    return advanceAfterRoundComplete(state);
  }

  setNextPlayerToAct(state, actorIndex);
  if (state.currentPlayerIndex === -1) return advanceAfterRoundComplete(state);
  return state;
}

function isValidAmount(amount: number | undefined): amount is number {
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0;
}

function reject(state: GameState, error: string): ActionResult {
  return { ok: false, error, state };
}

export function createGame(config: GameConfig, players: readonly PlayerInput[], seed: Seed = Date.now()): GameState {
  const normalizedConfig = normalizeConfig(config);
  const normalizedPlayers = normalizePlayers(players, normalizedConfig);
  return {
    config: normalizedConfig,
    players: normalizedPlayers,
    board: [],
    deck: createDeck(),
    street: 'showdown',
    pots: [],
    currentPlayerIndex: -1,
    dealerIndex: -1,
    currentBet: 0,
    minRaise: normalizedConfig.bigBlind,
    lastAggressorIndex: null,
    handNumber: 0,
    winners: [],
    log: [],
    seed,
    contributions: {},
  };
}

export function startHand(state: GameState): GameState {
  const next = cloneState(state);
  const activeIndexes = activeSeatIndexes(next.players);
  if (activeIndexes.length < 2) throw new Error('At least two seated players with chips are required to start a hand');

  next.handNumber += 1;
  next.board = [];
  next.deck = shuffleDeck(`${String(next.seed)}:${next.handNumber}`);
  next.street = 'preflop';
  next.pots = [];
  next.currentBet = 0;
  next.minRaise = next.config.bigBlind;
  next.lastAggressorIndex = null;
  next.winners = [];
  next.contributions = {};
  next.log = [...next.log, `Starting hand #${next.handNumber}`].slice(-200);

  for (const player of next.players) {
    const participating = !player.sittingOut && player.chips > 0;
    player.holeCards = [];
    player.folded = !participating;
    player.allIn = false;
    player.currentBet = 0;
    player.hasActed = false;
  }

  const oldDealerIndex = next.dealerIndex;
  next.dealerIndex = findNextIndex(next.players, oldDealerIndex, (player) => !player.sittingOut && player.chips > 0);
  dealHoleCards(next, next.dealerIndex);

  const participatingCount = next.players.filter((player) => isParticipating(player)).length;
  const smallBlindIndex = participatingCount === 2 ? next.dealerIndex : nextParticipatingIndex(next.players, next.dealerIndex);
  const bigBlindIndex = nextParticipatingIndex(next.players, smallBlindIndex);
  const firstActionIndex = participatingCount === 2 ? next.dealerIndex : nextParticipatingIndex(next.players, bigBlindIndex);

  const smallPosted = commitChips(next, smallBlindIndex, next.config.smallBlind);
  const bigPosted = commitChips(next, bigBlindIndex, next.config.bigBlind);
  next.currentBet = Math.max(smallPosted, bigPosted);
  next.lastAggressorIndex = bigBlindIndex;
  refreshPots(next);
  next.log.push(`${next.players[smallBlindIndex].name} posts small blind ${smallPosted}`);
  next.log.push(`${next.players[bigBlindIndex].name} posts big blind ${bigPosted}`);

  if (remainingIndexes(next).length <= 1) return awardWhenEveryoneFolded(next);
  if (playersNeedingAction(next).length === 0) return advanceAfterRoundComplete(next);

  next.currentPlayerIndex = findFirstIndexFrom(next.players, firstActionIndex, (_player, index) => playersNeedingAction(next).includes(index));
  return next.currentPlayerIndex === -1 ? advanceAfterRoundComplete(next) : next;
}

export function legalActions(state: GameState, playerId: string): LegalActions {
  const playerIndex = state.players.findIndex((player) => player.id === playerId);
  const player = state.players[playerIndex];
  if (!player || state.currentPlayerIndex !== playerIndex || state.street === 'showdown' || !canAct(player)) {
    return { actions: [], toCall: 0 };
  }

  const toCall = Math.max(0, state.currentBet - player.currentBet);
  const actions: PlayerAction[] = [];
  const result: LegalActions = {
    actions,
    toCall,
    minAllIn: player.chips,
    maxAllIn: player.chips,
  };

  if (toCall > 0) {
    actions.push('fold', 'call');
  } else {
    // Fold is always allowed (you can fold even when you could check).
    actions.push('fold', 'check');
  }

  if (player.chips > 0) actions.push('allin');

  if (state.currentBet === 0) {
    result.minBet = state.config.bigBlind;
    result.maxBet = player.chips;
    if (player.chips >= state.config.bigBlind) actions.push('bet');
  } else {
    const maxRaiseTo = player.currentBet + player.chips;
    const minRaiseTo = state.currentBet + state.minRaise;
    result.minRaiseTo = minRaiseTo;
    result.maxRaiseTo = maxRaiseTo;
    // A below-min all-in does NOT reopen the betting: players who have already
    // acted at this level may only call or fold, not re-raise. They can raise
    // only if they haven't acted yet, or they're facing a full (>= minRaise) raise.
    const reopened = !player.hasActed || toCall >= state.minRaise;
    if (reopened && maxRaiseTo >= minRaiseTo && player.chips > toCall) actions.push('raise');
  }

  return result;
}

export function applyAction(state: GameState, playerId: string, action: PlayerAction, amount?: number): ActionResult {
  const legal = legalActions(state, playerId);
  if (!legal.actions.includes(action)) return reject(state, `${action} is not legal for ${playerId}`);

  const actorIndex = state.players.findIndex((player) => player.id === playerId);
  const next = cloneState(state);
  const actor = next.players[actorIndex];
  const toCall = Math.max(0, next.currentBet - actor.currentBet);

  if (action === 'fold') {
    actor.folded = true;
    actor.hasActed = true;
    next.log.push(`${actor.name} folds`);
  } else if (action === 'check') {
    if (toCall !== 0) return reject(state, 'Cannot check while facing a bet');
    actor.hasActed = true;
    next.log.push(`${actor.name} checks`);
  } else if (action === 'call') {
    if (toCall <= 0) return reject(state, 'Cannot call with nothing to call');
    const called = commitChips(next, actorIndex, toCall);
    actor.hasActed = true;
    next.log.push(`${actor.name} calls ${called}`);
  } else if (action === 'bet') {
    if (!isValidAmount(amount)) return reject(state, 'Bet amount must be a positive integer');
    if (next.currentBet !== 0) return reject(state, 'Cannot bet after a bet has been made');
    if (amount < next.config.bigBlind) return reject(state, `Minimum bet is ${next.config.bigBlind}`);
    if (amount > actor.chips) return reject(state, 'Bet exceeds player stack');
    commitChips(next, actorIndex, amount);
    markAggression(next, actorIndex, amount);
    next.log.push(`${actor.name} bets ${amount}`);
  } else if (action === 'raise') {
    if (!isValidAmount(amount)) return reject(state, 'Raise amount must be the new total bet as a positive integer');
    const minRaiseTo = next.currentBet + next.minRaise;
    const maxRaiseTo = actor.currentBet + actor.chips;
    if (amount < minRaiseTo) return reject(state, `Minimum raise is to ${minRaiseTo}`);
    if (amount > maxRaiseTo) return reject(state, 'Raise exceeds player stack');
    const previousBet = next.currentBet;
    commitChips(next, actorIndex, amount - actor.currentBet);
    markAggression(next, actorIndex, amount - previousBet);
    next.log.push(`${actor.name} raises to ${amount}`);
  } else if (action === 'allin') {
    const chipsBefore = actor.chips;
    const previousBet = next.currentBet;
    const previousMinRaise = next.minRaise;
    const targetBet = actor.currentBet + chipsBefore;
    commitChips(next, actorIndex, chipsBefore);
    actor.hasActed = true;

    if (targetBet > previousBet) {
      const raiseSize = targetBet - previousBet;
      next.currentBet = targetBet;
      const fullBetOrRaise = previousBet === 0 ? targetBet >= next.config.bigBlind : raiseSize >= previousMinRaise;
      if (fullBetOrRaise) {
        markAggression(next, actorIndex, previousBet === 0 ? targetBet : raiseSize);
      }
      next.log.push(`${actor.name} moves all in for ${chipsBefore}`);
    } else {
      next.log.push(`${actor.name} calls all in for ${chipsBefore}`);
    }
  }

  return { ok: true, state: settleAfterAction(next, actorIndex) };
}
