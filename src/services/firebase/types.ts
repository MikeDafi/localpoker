import type { GameMode } from '../../game/gameMode';
import type { PlayerAction } from '../../engine';
import type { PrivatePlayerView, PublicGameState } from '../../game/onlineSync';

export type RoomHoleCardExposure = Partial<Record<'0' | '1', true>>;

export type RoomRunVote = {
  choice: 1 | 2 | 3;
  ts: number;
};

export type RoomPlayer = {
  id: string;
  name: string;
  palSeed?: string;
  /**
   * The player's actual Pal, as JSON.
   *
   * Without it a room could only draw `palFromSeed(palSeed)`, a doodle derived
   * from an id, so the same person appeared with one face in the friends list
   * and a different one at the table they were sitting at. Carried on the
   * player rather than looked up, so it works for someone you have not added.
   */
  palJson?: string;
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
  /**
   * Cash, tournament or turbo. Optional because rooms published by an older
   * build do not carry it, and a missing mode has to read as "we do not know"
   * rather than as a cash game somebody might sit down to by mistake.
   */
  gameMode?: GameMode;
  updatedAt: number;
};

export type RoomState = {
  code: string;
  hostId: string;
  status: RoomStatus;
  createdAt: number;
  settingsJson: string;
  tournamentStartedAt?: number | null;
  visibility?: RoomVisibility;
  hostName?: string;
  players: Record<string, RoomPlayer>;
  /** Uids with deliberate invite records, so the host can withdraw them. */
  invited?: Record<string, true>;
  actionSeq: number;
  publicState?: PublicGameState;
  shown?: Record<string, true>;
  exposed?: Record<string, RoomHoleCardExposure>;
  runVotes?: Record<string, RoomRunVote>;
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

export type RoomRebuyRequest = {
  playerId: string;
  ts: number;
};

export type RoomPrivateView = PrivatePlayerView;
