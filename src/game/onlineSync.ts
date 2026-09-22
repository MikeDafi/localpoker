import {
  applyAction,
  legalActions,
  type ActionResult,
  type Card,
  type GameConfig,
  type GameState,
  type LegalActions,
  type Player,
  type PlayerAction,
  type Pot,
  type Street,
  type Winner,
} from '../engine';

export type OnlineIntent = {
  type: PlayerAction;
  amount?: number;
};

export type PublicPlayerState = Pick<
  Player,
  | 'id'
  | 'name'
  | 'seatIndex'
  | 'chips'
  | 'folded'
  | 'allIn'
  | 'currentBet'
  | 'hasActed'
  | 'isBot'
  | 'sittingOut'
> & {
  connected?: boolean;
  isHost?: boolean;
  palSeed?: string;
  holeCardCount: number;
  holeCards?: Card[];
};

export type PublicGameState = {
  version: 1;
  config: GameConfig;
  players: Record<string, PublicPlayerState>;
  playerOrder: string[];
  board: Card[];
  pots: Pot[];
  currentPlayerIndex: number;
  currentPlayerId: string | null;
  dealerIndex: number;
  dealerId: string | null;
  currentBet: number;
  minRaise: number;
  handNumber: number;
  street: Street;
  winners: Winner[];
  contributions: Record<string, number>;
  legal: Record<string, LegalActions>;
  updatedAt?: number;
};

export type PrivatePlayerView = {
  version: 1;
  code?: string;
  playerId: string;
  handNumber: number;
  holeCards: Card[];
  updatedAt?: number;
};

export type PlayerPublishMeta = {
  connected?: boolean;
  isHost?: boolean;
  palSeed?: string;
};

export type RedactedGameState = {
  publicState: PublicGameState;
  privateViews: Record<string, PrivatePlayerView>;
};

type HostValidationFailure = { ok: false; error: string; state: GameState };
type HostValidationSuccess = { ok: true; action: PlayerAction; amount?: number };
export type HostValidationResult = HostValidationFailure | HostValidationSuccess;

const ACTIONS: readonly PlayerAction[] = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];

const cloneCard = (card: Card): Card => ({ rank: card.rank, suit: card.suit });
const cloneCards = (cards: readonly Card[]): Card[] => cards.map(cloneCard);

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const playersWhoReachedShowdown = (state: GameState): number =>
  state.players.filter((player) => !player.folded && !player.sittingOut).length;

const shouldPublishHoleCards = (state: GameState, player: Player): boolean =>
  state.street === 'showdown' &&
  state.board.length === 5 &&
  !player.folded &&
  !player.sittingOut &&
  playersWhoReachedShowdown(state) > 1;

export function redactGameState(
  state: GameState,
  options: { code?: string; playerMeta?: Record<string, PlayerPublishMeta>; updatedAt?: number } = {},
): RedactedGameState {
  const players: Record<string, PublicPlayerState> = {};
  const privateViews: Record<string, PrivatePlayerView> = {};

  for (const player of state.players) {
    const meta = options.playerMeta?.[player.id] ?? {};
    const publicPlayer: PublicPlayerState = {
      id: player.id,
      name: player.name,
      seatIndex: player.seatIndex,
      chips: player.chips,
      folded: player.folded,
      allIn: player.allIn,
      currentBet: player.currentBet,
      hasActed: player.hasActed,
      isBot: player.isBot,
      sittingOut: player.sittingOut,
      holeCardCount: player.holeCards.length,
      ...(typeof meta.connected === 'boolean' ? { connected: meta.connected } : {}),
      ...(typeof meta.isHost === 'boolean' ? { isHost: meta.isHost } : {}),
      ...(meta.palSeed ? { palSeed: meta.palSeed } : {}),
    };

    if (shouldPublishHoleCards(state, player)) {
      publicPlayer.holeCards = cloneCards(player.holeCards);
    }

    players[player.id] = publicPlayer;
    privateViews[player.id] = {
      version: 1,
      ...(options.code ? { code: options.code } : {}),
      playerId: player.id,
      handNumber: state.handNumber,
      holeCards: cloneCards(player.holeCards),
      ...(typeof options.updatedAt === 'number' ? { updatedAt: options.updatedAt } : {}),
    };
  }

  const legal: Record<string, LegalActions> = {};
  for (const player of state.players) {
    const playerLegal = legalActions(state, player.id);
    if (playerLegal.actions.length > 0) {
      legal[player.id] = playerLegal;
    }
  }

  const currentPlayer = state.players[state.currentPlayerIndex] ?? null;
  const dealer = state.players[state.dealerIndex] ?? null;

  return {
    publicState: {
      version: 1,
      config: { ...state.config },
      players,
      playerOrder: state.players.map((player) => player.id),
      board: cloneCards(state.board),
      pots: state.pots.map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
      currentPlayerIndex: state.currentPlayerIndex,
      currentPlayerId: currentPlayer?.id ?? null,
      dealerIndex: state.dealerIndex,
      dealerId: dealer?.id ?? null,
      currentBet: state.currentBet,
      minRaise: state.minRaise,
      handNumber: state.handNumber,
      street: state.street,
      winners: state.winners.map((winner) => ({
        playerId: winner.playerId,
        amount: winner.amount,
        ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards) } } : {}),
      })),
      contributions: { ...state.contributions },
      legal,
      ...(typeof options.updatedAt === 'number' ? { updatedAt: options.updatedAt } : {}),
    },
    privateViews,
  };
}

export function hydrateGameState(publicState: PublicGameState, privateView?: PrivatePlayerView | null): GameState {
  const privateCards =
    privateView && privateView.handNumber === publicState.handNumber
      ? cloneCards(privateView.holeCards)
      : [];

  return {
    config: { ...publicState.config },
    players: publicState.playerOrder.map((playerId) => {
      const player = publicState.players[playerId];
      const ownCards = privateView?.playerId === playerId ? privateCards : undefined;
      return {
        id: player.id,
        name: player.name,
        seatIndex: player.seatIndex,
        chips: player.chips,
        holeCards: ownCards ?? cloneCards(player.holeCards ?? []),
        folded: player.folded,
        allIn: player.allIn,
        currentBet: player.currentBet,
        hasActed: player.hasActed,
        isBot: false,
        sittingOut: player.sittingOut,
      };
    }),
    board: cloneCards(publicState.board),
    deck: [],
    street: publicState.street,
    pots: publicState.pots.map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
    currentPlayerIndex: publicState.currentPlayerIndex,
    dealerIndex: publicState.dealerIndex,
    currentBet: publicState.currentBet,
    minRaise: publicState.minRaise,
    lastAggressorIndex: null,
    handNumber: publicState.handNumber,
    winners: publicState.winners.map((winner) => ({
      playerId: winner.playerId,
      amount: winner.amount,
      ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards) } } : {}),
    })),
    log: [],
    seed: 'online-redacted',
    contributions: { ...publicState.contributions },
  };
}

export function validateHostIntent(
  state: GameState,
  playerId: string,
  intent: OnlineIntent,
): HostValidationResult {
  const action = intent.type;
  if (!ACTIONS.includes(action)) {
    return { ok: false, error: `Unknown action: ${String(action)}`, state };
  }

  const current = state.players[state.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    return { ok: false, error: `Action rejected: it is not ${playerId}'s turn`, state };
  }

  const legal = legalActions(state, playerId);
  if (!legal.actions.includes(action)) {
    return { ok: false, error: `Action rejected: ${action} is not legal for ${playerId}`, state };
  }

  if (action === 'bet') {
    if (!isPositiveInteger(intent.amount)) {
      return { ok: false, error: 'Action rejected: bet amount must be a positive integer', state };
    }
    if (intent.amount < (legal.minBet ?? 0) || intent.amount > (legal.maxBet ?? 0)) {
      return { ok: false, error: 'Action rejected: bet amount is outside the legal range', state };
    }
    return { ok: true, action, amount: intent.amount };
  }

  if (action === 'raise') {
    if (!isPositiveInteger(intent.amount)) {
      return { ok: false, error: 'Action rejected: raise amount must be a positive integer', state };
    }
    if (intent.amount < (legal.minRaiseTo ?? 0) || intent.amount > (legal.maxRaiseTo ?? 0)) {
      return { ok: false, error: 'Action rejected: raise amount is outside the legal range', state };
    }
    return { ok: true, action, amount: intent.amount };
  }

  if (action === 'allin') {
    if (typeof intent.amount === 'number' && intent.amount !== legal.maxAllIn) {
      return { ok: false, error: 'Action rejected: all-in amount does not match the stack', state };
    }
    return { ok: true, action };
  }

  if (typeof intent.amount !== 'undefined') {
    return { ok: false, error: `Action rejected: ${action} does not take an amount`, state };
  }

  return { ok: true, action };
}

export function applyHostIntent(state: GameState, playerId: string, intent: OnlineIntent): ActionResult {
  const validation = validateHostIntent(state, playerId, intent);
  if (!validation.ok) {
    return validation;
  }

  return applyAction(state, playerId, validation.action, validation.amount);
}
