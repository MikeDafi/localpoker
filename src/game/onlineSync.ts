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
  type BoardRunResult,
  type Street,
  type Winner,
} from '../engine';
import {
  exposedCardsForPublicState,
  normalizeHoleCardExposure,
  type HoleCardExposure,
  type PublicExposedHoleCards,
} from './holeCardExposure';

export type OnlineIntent = {
  type: PlayerAction;
  amount?: number;
  seq?: number;
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
  exposedHoleCards?: PublicExposedHoleCards;
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
  runCount?: number;
  runResults?: BoardRunResult[];
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

export type ExposedHoleCardsByPlayer = Record<string, HoleCardExposure | undefined>;

export type RedactedGameState = {
  publicState: PublicGameState;
  privateViews: Record<string, PrivatePlayerView>;
};

type HostValidationFailure = { ok: false; error: string; state: GameState };
type HostValidationSuccess = { ok: true; action: PlayerAction; amount?: number };
export type HostValidationResult = HostValidationFailure | HostValidationSuccess;
export type HostIntentValidationOptions = {
  actorId?: string;
  lastAppliedSeq?: number;
};
export type ConnectionSyncResult = { state: GameState; changed: boolean };
export type OnlineTablePlayerCountSource = {
  status?: string;
  players?: Record<string, unknown> | null;
};

export function shouldEndOnlineTableForTooFewPlayers(
  room: OnlineTablePlayerCountSource | null | undefined,
): boolean {
  if (!room || room.status !== 'playing') return false;
  return Object.keys(room.players ?? {}).length < 2;
}

const ACTIONS: readonly PlayerAction[] = ['fold', 'check', 'call', 'bet', 'raise', 'allin'];

const cloneCard = (card: Card): Card => ({ rank: card.rank, suit: card.suit });
const cloneCards = (cards: readonly Card[]): Card[] => cards.map(cloneCard);
const clonePlayer = (player: Player): Player => ({ ...player, holeCards: cloneCards(player.holeCards) });
const cloneGameState = (state: GameState): GameState => ({
  ...state,
  config: { ...state.config },
  players: state.players.map(clonePlayer),
  board: cloneCards(state.board),
  deck: cloneCards(state.deck),
  pots: state.pots.map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
  winners: state.winners.map((winner) => ({
    playerId: winner.playerId,
    amount: winner.amount,
    ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards), ranks: [...winner.hand.ranks] } } : {}),
  })),
  runResults: state.runResults?.map((run) => ({
    board: cloneCards(run.board),
    winners: run.winners.map((winner) => ({
      playerId: winner.playerId,
      amount: winner.amount,
      ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards), ranks: [...winner.hand.ranks] } } : {}),
    })),
  })),
  log: [...state.log],
  contributions: { ...state.contributions },
});

const isPositiveInteger = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

const isValidActionSeq = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

const playersWhoReachedShowdown = (state: GameState): number =>
  state.players.filter((player) => !player.folded && !player.sittingOut).length;

const shouldPublishHoleCards = (
  state: GameState,
  player: Player,
  revealed: ReadonlySet<string>,
): boolean => {
  if (state.street !== 'showdown') return false;
  if (player.sittingOut) return false;
  /*
   * A hand its owner chose to table.
   *
   * The automatic case below only fires at a contested showdown, which means
   * a hand that won because everyone folded was never published and the Show
   * button did nothing for anybody else. Showing a bluff is the whole reason
   * that button exists, so an explicit choice publishes regardless, including
   * for a player who folded and wants to prove what they laid down.
   */
  if (revealed.has(player.id)) return true;
  return state.board.length === 5 && !player.folded && playersWhoReachedShowdown(state) > 1;
};

export function redactGameState(
  state: GameState,
  options: {
    code?: string;
    playerMeta?: Record<string, PlayerPublishMeta>;
    updatedAt?: number;
    /** Players who chose to table their hand, so it publishes to everyone. */
    revealed?: readonly string[];
    /** Per-card exposure chosen during the hand, separate from showdown reveal. */
    exposed?: ExposedHoleCardsByPlayer;
  } = {},
): RedactedGameState {
  const revealed = new Set(options.revealed ?? []);
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

    if (shouldPublishHoleCards(state, player, revealed)) {
      publicPlayer.holeCards = cloneCards(player.holeCards);
    }

    const exposedHoleCards = exposedCardsForPublicState(
      player.holeCards,
      normalizeHoleCardExposure(options.exposed?.[player.id]),
    );
    if (exposedHoleCards) {
      publicPlayer.exposedHoleCards = exposedHoleCards;
    }

    players[player.id] = publicPlayer;
    /*
     * Only somebody holding cards gets a private view.
     *
     * A player who is busted, sitting out, or joined after the deal has no
     * hole cards, and a view carrying an empty hand is refused by the rules,
     * which require exactly two. That matters far more than it sounds: the
     * whole snapshot is published as one multi-path write, so one unpublishable
     * view failed the entire update. The table stopped syncing from that
     * moment, silently, and the two devices drifted into different games, one
     * waiting on a turn that had passed and the other stuck on a finished
     * hand.
     */
    if (player.holeCards.length === 2) {
      privateViews[player.id] = {
        version: 1,
        ...(options.code ? { code: options.code } : {}),
        playerId: player.id,
        handNumber: state.handNumber,
        holeCards: cloneCards(player.holeCards),
        ...(typeof options.updatedAt === 'number' ? { updatedAt: options.updatedAt } : {}),
      };
    }
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
      ...(typeof state.runCount === 'number' ? { runCount: state.runCount } : {}),
      ...(state.runResults ? {
        runResults: state.runResults.map((run) => ({
          board: cloneCards(run.board),
          winners: run.winners.map((winner) => ({
            playerId: winner.playerId,
            amount: winner.amount,
            ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards) } } : {}),
          })),
        })),
      } : {}),
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
    // `playerOrder` and `players` are written by another player's device, so
    // they can disagree: a seat listed in the order but missing from the map
    // used to throw while rendering, taking the whole table down on the
    // joining client rather than on the one that produced the bad state.
    players: publicState.playerOrder.flatMap((playerId) => {
      const player = publicState.players[playerId];
      if (!player) return [];
      const ownCards = privateView?.playerId === playerId ? privateCards : undefined;
      return [{
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
      }];
    }),
    board: cloneCards(publicState.board ?? []),
    deck: [],
    street: publicState.street,
    pots: (publicState.pots ?? []).map((pot) => ({ amount: pot.amount, eligiblePlayerIds: [...pot.eligiblePlayerIds] })),
    currentPlayerIndex: publicState.currentPlayerIndex,
    dealerIndex: publicState.dealerIndex,
    currentBet: publicState.currentBet,
    minRaise: publicState.minRaise,
    lastAggressorIndex: null,
    handNumber: publicState.handNumber,
    winners: (publicState.winners ?? []).map((winner) => ({
      playerId: winner.playerId,
      amount: winner.amount,
      ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards) } } : {}),
    })),
    runCount: publicState.runCount,
    runResults: publicState.runResults?.map((run) => ({
      board: cloneCards(run.board),
      winners: run.winners.map((winner) => ({
        playerId: winner.playerId,
        amount: winner.amount,
        ...(winner.hand ? { hand: { ...winner.hand, cards: cloneCards(winner.hand.cards) } } : {}),
      })),
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
  options: HostIntentValidationOptions = {},
): HostValidationResult {
  if (options.actorId && options.actorId !== playerId) {
    return { ok: false, error: `Action rejected: ${options.actorId} cannot act for ${playerId}`, state };
  }

  if (typeof intent.seq !== 'undefined') {
    if (!isValidActionSeq(intent.seq)) {
      return { ok: false, error: 'Action rejected: action sequence must be a positive safe integer', state };
    }
    if (typeof options.lastAppliedSeq === 'number' && intent.seq <= options.lastAppliedSeq) {
      return { ok: false, error: 'Action rejected: stale action sequence', state };
    }
  }

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

export function applyHostIntent(
  state: GameState,
  playerId: string,
  intent: OnlineIntent,
  options: HostIntentValidationOptions = {},
): ActionResult {
  const validation = validateHostIntent(state, playerId, intent, options);
  if (!validation.ok) {
    return validation;
  }

  return applyAction(state, playerId, validation.action, validation.amount);
}

export function applyConnectionStatusToGameState(
  state: GameState,
  connectedByPlayerId: Record<string, boolean | undefined>,
): ConnectionSyncResult {
  let next = cloneGameState(state);
  let changed = false;

  const isDisconnected = (player: Player): boolean => connectedByPlayerId[player.id] === false;

  if (next.street !== 'showdown') {
    for (let guard = 0; guard < next.players.length; guard += 1) {
      const current = next.players[next.currentPlayerIndex];
      if (!current || !isDisconnected(current) || current.folded || current.allIn || current.sittingOut) {
        break;
      }

      const result = applyAction(next, current.id, 'fold');
      if (!result.ok) {
        break;
      }
      next = result.state;
      changed = true;
    }
  }

  for (const player of next.players) {
    if (isDisconnected(player)) {
      if (player.allIn && next.street !== 'showdown') {
        continue;
      }
      if (!player.folded && next.street !== 'showdown') {
        player.folded = true;
        changed = true;
      }
      if (!player.hasActed && next.street !== 'showdown') {
        player.hasActed = true;
        changed = true;
      }
      /*
       * Folded out of this hand, but not sat out of the game.
       *
       * Marking a disconnected player sittingOut removed them from every
       * future hand, so the moment someone locked their phone the table had
       * one live player left and announced itself finished: "You cleaned up"
       * over a hand that had just been played normally. It is also why the
       * next hand could not be dealt afterwards.
       *
       * The current hand genuinely cannot wait for them, so folding stands.
       * Whether they are gone for good is a question about the room, and the
       * room already answers it by sweeping a table nobody returns to after
       * ten minutes.
       */
    } else if (player.sittingOut) {
      player.sittingOut = false;
      changed = true;
    }
  }

  return { state: changed ? next : state, changed };
}
