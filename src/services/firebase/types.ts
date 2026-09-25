import type { PlayerAction } from '../../engine';
import type { PrivatePlayerView, PublicGameState } from '../../game/onlineSync';

export type RoomPlayer = {
  id: string;
  name: string;
  palSeed?: string;
  seatIndex: number;
  chips: number;
  connected: boolean;
  isHost: boolean;
};

export type RoomStatus = 'lobby' | 'playing' | 'ended';

/** Who may find a room without being handed its code. */
export type RoomVisibility = 'public' | 'private';

/**
 * The small, deliberately public summary of a room.
 *
 * The room itself is only readable by its host and the players already in it,
 * which is what keeps a private game private. Discovery therefore cannot read
 * rooms directly: hosts publish this summary instead, and it carries only what
 * a browse list needs to show.
 */
export type RoomSummary = {
  code: string;
  hostUid: string;
  hostName: string;
  visibility: RoomVisibility;
  status: RoomStatus;
  playerCount: number;
  smallBlind: number;
  bigBlind: number;
  startingStack: number;
  updatedAt: number;
};

export type RoomState = {
  code: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  settingsJson: string;
  visibility?: RoomVisibility;
  hostName?: string;
  players: Record<string, RoomPlayer>;
  actionSeq: number;
  publicState?: PublicGameState;
  endedReason?: string;
  endedAt?: number;
};

export type RoomAction = {
  seq: number;
  playerId: string;
  type: PlayerAction;
  amount?: number;
  ts: number;
};

export type RoomPrivateView = PrivatePlayerView;
