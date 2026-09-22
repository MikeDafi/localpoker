export { getDb, isFirebaseConfigured } from './config';
export { ensureSignedIn, getAuthUid, authReady } from './auth';
export {
  acceptFriendRequest,
  declineFriendRequest,
  normalizeHandle,
  publishUserDirectory,
  removeFriendship,
  resolveHandle,
  sendFriendRequest,
  subscribeSocialGraph,
} from './friends';
export type { DirectoryUser, FirebaseFriendResult, FriendEdgeRecord, FriendRequestRecord, SocialSnapshot } from './friends';
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
