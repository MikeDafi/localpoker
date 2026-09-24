import type { Card, Seed } from './cards';
import type { HandEvaluation } from './handEvaluator';

export interface Player {
  id: string;
  name: string;
  seatIndex: number;
  chips: number;
  holeCards: Card[];
  folded: boolean;
  allIn: boolean;
  currentBet: number;
  hasActed: boolean;
  isBot: boolean;
  sittingOut: boolean;
}

export type PlayerInput = Pick<Player, 'id' | 'name'> & Partial<Omit<Player, 'id' | 'name'>>;

export type Street = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface GameConfig {
  smallBlind: number;
  bigBlind: number;
  /** Posted by every player in the hand before the blinds. 0 disables antes. */
  ante?: number;
  startingStack: number;
  maxPlayers: number;
  turnTimerSec: number;
}

export type PlayerAction = 'fold' | 'check' | 'call' | 'bet' | 'raise' | 'allin';

export interface Pot {
  amount: number;
  eligiblePlayerIds: string[];
}

export interface Winner {
  playerId: string;
  amount: number;
  hand?: HandEvaluation;
}

export interface GameState {
  config: GameConfig;
  players: Player[];
  board: Card[];
  deck: Card[];
  street: Street;
  pots: Pot[];
  currentPlayerIndex: number;
  dealerIndex: number;
  currentBet: number;
  minRaise: number;
  lastAggressorIndex: number | null;
  handNumber: number;
  winners: Winner[];
  log: string[];
  seed: Seed;
  contributions: Record<string, number>;
}

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string; state: GameState };

export interface LegalActions {
  actions: PlayerAction[];
  toCall: number;
  minBet?: number;
  maxBet?: number;
  minRaiseTo?: number;
  maxRaiseTo?: number;
  minAllIn?: number;
  maxAllIn?: number;
}

export interface BotDecision {
  action: PlayerAction;
  amount?: number;
}
