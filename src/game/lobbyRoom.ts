export const ENDED_ROOM_RECLAIM_MS = 24 * 60 * 60 * 1000;

export type ExistingHostedRoom = {
  hostId?: string | null;
  status?: string | null;
  endedAt?: number | null;
};

export type HostedRoomOpenPlan =
  | { type: 'attach'; reopenEnded: boolean }
  | { type: 'replace' }
  | { type: 'reject'; reason: string };

export const isEndedRoomReclaimable = (
  room: ExistingHostedRoom | null,
  now = Date.now(),
): boolean =>
  room?.status === 'ended' &&
  typeof room.endedAt === 'number' &&
  now - room.endedAt >= ENDED_ROOM_RECLAIM_MS;

export const planHostedRoomOpen = (
  room: ExistingHostedRoom | null,
  hostId: string,
  now = Date.now(),
): HostedRoomOpenPlan => {
  if (room?.hostId === hostId) {
    if (room.status === 'lobby') {
      return { type: 'attach', reopenEnded: false };
    }
    if (room.status === 'ended') {
      return { type: 'attach', reopenEnded: true };
    }
  }

  if (isEndedRoomReclaimable(room, now)) {
    return { type: 'replace' };
  }

  return { type: 'reject', reason: 'Room already exists.' };
};

export const shouldLeaveRoomOnLobbyUnmount = ({
  online,
  preservingRoom,
}: {
  online: boolean;
  preservingRoom: boolean;
}): boolean => online && !preservingRoom;
