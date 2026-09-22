export { getDb, isFirebaseConfigured } from './config';
export { deleteCurrentAuthUser, ensureSignedIn, getAuthUid, authReady } from './auth';
export {
  acceptFriendRequest,
  blockUser,
  deleteOnlineAccount,
  declineFriendRequest,
  normalizeHandle,
  publishUserDirectory,
  removeFriendship,
  reportUser,
  resolveHandle,
  sendFriendRequest,
  subscribeSocialGraph,
} from './friends';
export type {
  BlockRecord,
  DeleteAccountHints,
  DirectoryUser,
  FirebaseFriendResult,
  FriendEdgeRecord,
  FriendRequestRecord,
  ReportContext,
  ReportRecord,
  SocialSnapshot,
} from './friends';
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
