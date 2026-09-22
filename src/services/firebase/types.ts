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

export type RoomState = {
  code: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  settingsJson: string;
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
