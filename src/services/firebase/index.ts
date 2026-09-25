export { getDb, isFirebaseConfigured } from './config';
export { deleteCurrentAuthUser, ensureSignedIn, getAuthUid, authReady, signOutFirebase } from './auth';
export {
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
  GOOGLE_WEB_CLIENT_ID,
  googleSignUpField,
  isGoogleSignInConfigured,
  signInWithGoogleIdToken,
} from './googleAuth';
export type { GoogleIdentity, GoogleSignInResult } from './googleAuth';
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
  searchHandles,
  HANDLE_SEARCH_MIN_PREFIX,
  sendFriendRequest,
  subscribeSocialGraph,
} from './friends';
export type {
  BlockRecord,
  DeleteAccountHints,
  DirectoryMatch,
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
