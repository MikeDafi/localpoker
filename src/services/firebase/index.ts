export { getDb, isFirebaseConfigured } from './config';
export { ensureSignedIn, getAuthUid, authReady } from './auth';
export {
  createRoom,
  endRoom,
  getCachedHostGame,
  joinRoom,
  leaveRoom,
  publishHostGameState,
  pushAction,
  setPlayerConnected,
  subscribeActions,
  subscribePrivateView,
  subscribeRoom,
  startRoomGame,
} from './roomSync';
export type { RoomAction, RoomPlayer, RoomPrivateView, RoomState, RoomStatus } from './types';
