const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { endAt, get, limitToFirst, orderByKey, query, ref, serverTimestamp, set, startAt, update } = require('firebase/database');

const projectId = 'demo-localpoker';
const rules = fs.readFileSync('database.rules.json', 'utf8');
const [host, portText] = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9015').split(':');

const roomPath = 'localpoker/rooms/ROOM12';
const playerActionPath = `${roomPath}/actions/player-call`;
const actionSeqPath = `${roomPath}/actionSeq`;
const playerRequestPath = 'localpoker/friendRequests/host/player';

const users = {
  host: { handle: 'host_ace', displayName: 'Host Ace', updatedAt: 1 },
  player: { handle: 'river_shark', displayName: 'River Shark', updatedAt: 1 },
  stranger: { handle: 'table_ghost', displayName: 'Table Ghost', updatedAt: 1 },
};

const friendRequest = {
  fromUid: 'player',
  fromHandle: users.player.handle,
  fromName: users.player.displayName,
  createdAt: 1,
  status: 'pending',
};

const room = {
  code: 'ROOM12',
  hostId: 'host',
  status: 'playing',
  createdAt: 1,
  settingsJson: '{}',
  actionSeq: 0,
  players: {
    host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true },
    player: { id: 'player', name: 'Player', seatIndex: 1, chips: 100, connected: true, isHost: false },
  },
};

const validPublicState = {
  version: 1,
  config: { smallBlind: 5, bigBlind: 10, startingStack: 100, maxPlayers: 6, turnTimerSec: 30 },
  players: {
    host: {
      id: 'host',
      name: 'Host',
      seatIndex: 0,
      chips: 100,
      folded: false,
      allIn: false,
      currentBet: 0,
      hasActed: false,
      isBot: false,
      sittingOut: false,
      holeCardCount: 2,
    },
    player: {
      id: 'player',
      name: 'Player',
      seatIndex: 1,
      chips: 100,
      folded: false,
      allIn: false,
      currentBet: 0,
      hasActed: false,
      isBot: false,
      sittingOut: false,
      holeCardCount: 2,
    },
  },
  playerOrder: ['host', 'player'],
  board: [],
  pots: [],
  street: 'preflop',
  handNumber: 1,
  winners: [],
  contributions: { host: 0, player: 0 },
  legal: {},
  currentPlayerIndex: 0,
  dealerIndex: 0,
  currentBet: 0,
  minRaise: 10,
};

const privateView = (playerId) => ({
  version: 1,
  code: 'ROOM12',
  playerId,
  handNumber: 1,
  holeCards: [
    { rank: 14, suit: 's' },
    { rank: 13, suit: 's' },
  ],
});

function logOk(message) {
  console.log(`ok: ${message}`);
}

(async () => {
  const testEnv = await initializeTestEnvironment({
    projectId,
    database: { host, port: Number(portText), rules },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, roomPath), room);
      await set(ref(db, 'localpoker/views/ROOM12/host'), privateView('host'));
      await set(ref(db, 'localpoker/views/ROOM12/player'), privateView('player'));
      await set(ref(db, 'localpoker/users'), users);
      await set(ref(db, 'localpoker/handles'), {
        [users.host.handle]: 'host',
        [users.player.handle]: 'player',
        [users.stranger.handle]: 'stranger',
      });
    });

    const playerDb = testEnv.authenticatedContext('player').database();
    const hostDb = testEnv.authenticatedContext('host').database();
    const strangerDb = testEnv.authenticatedContext('stranger').database();

    // Friend requests and reports are only accepted alongside a bump of the
    // sender's throttle stamp, in the same write, the way the app sends them.
    const withBump = (uid, kind, path, value) => ({
      [path]: value,
      [`localpoker/rateLimits/${uid}/${kind}`]: serverTimestamp(),
    });
    // Seeds a stamp directly, so a test can stand on either side of the gap
    // without sleeping through it, or clear it so an assertion fails for the
    // reason it names rather than for the throttle.
    const setStamp = (uid, kind, value) => testEnv.withSecurityRulesDisabled((ctx) => (
      set(ref(ctx.database(), `localpoker/rateLimits/${uid}/${kind}`), value)
    ));

    await assertSucceeds(get(ref(playerDb, `localpoker/handles/${users.host.handle}`)));
    logOk('known handle can be resolved exactly');

    await assertFails(get(ref(playerDb, 'localpoker/handles')));
    logOk('handles collection cannot be listed');

    // The add-friend autocomplete needs a prefix query. It is allowed only
    // when it is bounded on both ends and limited, so the directory still
    // cannot be pulled down in one request.
    await assertSucceeds(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      startAt('ho'),
      endAt('ho\uf8ff'),
      limitToFirst(8),
    )));
    logOk('bounded prefix search over handles is allowed');

    await assertFails(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      startAt('ho'),
      endAt('ho\uf8ff'),
      limitToFirst(500),
    )));
    logOk('prefix search cannot raise its own limit');

    await assertFails(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      limitToFirst(8),
    )));
    logOk('unbounded query over handles is still refused');

    await assertSucceeds(get(ref(playerDb, 'localpoker/users/host')));
    logOk('known user profile can be read exactly');

    await assertFails(get(ref(playerDb, 'localpoker/users')));
    logOk('users collection cannot be listed');

    // Enumeration: a wide range with a moving start used to page through
    // every name ten at a time. A query must now be one prefix, at least two
    // characters long.
    await assertFails(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      startAt('aa'),
      endAt(''),
      limitToFirst(8),
    )));
    logOk('a range spanning the whole directory cannot be used to page through it');

    await assertFails(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      startAt('h'),
      endAt('h'),
      limitToFirst(8),
    )));
    logOk('a one character prefix is refused');

    await assertFails(get(query(
      ref(playerDb, 'localpoker/handles'),
      orderByKey(),
      startAt('host_ace'),
      endAt('zzzz'),
      limitToFirst(8),
    )));
    logOk('a cursor range that is not one prefix is refused');

    // One handle per account. A claim is only accepted alongside the profile
    // pointing at it, so a bare claim, which builds 63 to 65 still send first,
    // is refused.
    await assertFails(set(ref(strangerDb, 'localpoker/handles/squatted'), 'stranger'));
    logOk('a bare handle claim with no profile pointing at it is refused');

    await assertFails(update(ref(strangerDb), {
      'localpoker/handles/squat_one': 'stranger',
      'localpoker/handles/squat_two': 'stranger',
      'localpoker/users/stranger': { handle: 'squat_one', displayName: 'Squatter', updatedAt: 1 },
    }));
    logOk('two claims in one write are refused, since the profile names only one');

    await assertSucceeds(update(ref(strangerDb), {
      'localpoker/handles/new_shark': 'stranger',
      [`localpoker/handles/${users.stranger.handle}`]: null,
      'localpoker/users/stranger': { handle: 'new_shark', displayName: 'Table Ghost', updatedAt: 2 },
    }));
    logOk('claim, profile and release land together in one write');

    await assertFails(update(ref(playerDb), {
      'localpoker/handles/new_shark': 'player',
      'localpoker/users/player': { handle: 'new_shark', displayName: 'River Shark', updatedAt: 3 },
    }));
    logOk('claimed handle cannot be overwritten');

    await assertFails(set(ref(playerDb, 'localpoker/handles/forged_owner'), 'host'));
    logOk('user cannot claim a handle for another uid');

    await assertFails(update(ref(strangerDb), {
      'localpoker/handles/hopped_to': 'stranger',
      'localpoker/users/stranger': { handle: 'hopped_to', displayName: 'Table Ghost', updatedAt: 4 },
    }));
    logOk('moving the profile to a new handle without releasing the old one is refused');

    // Renaming was impossible for a while: the app froze the first name it
    // published, so a rename silently reverted and friends searching the new
    // name found nobody. This is the single write the app now performs.
    await assertSucceeds(update(ref(strangerDb), {
      'localpoker/handles/renamed_to': 'stranger',
      'localpoker/handles/new_shark': null,
      'localpoker/users/stranger': { handle: 'renamed_to', displayName: 'Renamed To', updatedAt: Date.now() },
    }));
    logOk('user can rename: claim the new handle, repoint the profile, release the old');

    await assertSucceeds(set(ref(strangerDb, 'localpoker/users/stranger'), {
      handle: 'renamed_to', displayName: 'Renamed Again', updatedAt: Date.now(),
    }));
    logOk('a profile edit that keeps its handle needs no claim, which is what old builds send');

    await assertFails(set(ref(strangerDb, 'localpoker/users/stranger'), {
      handle: 'renamed_to', displayName: 'Renamed To', updatedAt: 5, junk: 'x'.repeat(1000),
    }));
    logOk('a directory entry refuses fields it does not define');

    await assertFails(set(ref(playerDb, 'localpoker/handles/renamed_to'), null));
    logOk('user cannot release a handle somebody else holds');

    await assertFails(set(ref(strangerDb, 'localpoker/users/stranger'), {
      handle: 'never_claimed',
      displayName: 'Renamed To',
      updatedAt: Date.now(),
    }));
    logOk('profile cannot point at a handle that was never claimed');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/CREAT1': {
        code: 'CREAT1',
        hostId: 'host',
        status: 'lobby',
        createdAt: 10,
        settingsJson: '{}',
        actionSeq: 0,
        players: {
          host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true },
        },
      },
      'localpoker/userRooms/host/CREAT1': { code: 'CREAT1', role: 'host', updatedAt: 10 },
    }));
    logOk('host can create room and own userRooms index in one multi-path write');

    // The bug this pins: `publicRooms` and `roomInvites` both prove ownership
    // with `root.../rooms/$code/hostId === auth.uid`, and `root` is the state
    // *before* the write. Bundling them with the room's own creation therefore
    // fails, and because multi-path updates are atomic it took the room down
    // with it. Every "play with friends" table hit this.
    await assertFails(update(ref(hostDb), {
      'localpoker/rooms/ATOMIC': {
        code: 'ATOMIC', hostId: 'host', status: 'lobby', createdAt: 10,
        settingsJson: '{}', actionSeq: 0, visibility: 'public',
        players: { host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true } },
      },
      'localpoker/publicRooms/ATOMIC': {
        code: 'ATOMIC', hostUid: 'host', hostName: 'Host',
        visibility: 'public', status: 'lobby', updatedAt: 10,
      },
    }));
    logOk('room plus publicRooms in one atomic write is refused, which was the bug');

    // The fix: the room lands first, so the rule can see it on the second write.
    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PUB1': {
        code: 'PUB1', hostId: 'host', status: 'lobby', createdAt: 10,
        settingsJson: '{}', actionSeq: 0, visibility: 'public',
        players: { host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true } },
      },
    }));
    await assertSucceeds(set(ref(hostDb, 'localpoker/publicRooms/PUB1'), {
      code: 'PUB1', hostUid: 'host', hostName: 'Host',
      visibility: 'public', status: 'lobby', updatedAt: 10,
    }));
    logOk('host can list a public room once the room itself exists');

    // Inviting requires the recipient to already count the host as a friend,
    // so seed that edge directly rather than replaying the whole request flow.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      // A real accepted friendship writes both directions, and the rules read
      // each side for different things: the invite rule asks whether the
      // invitee counts the host as a friend, the push-token rule asks whether
      // the token owner counts the reader as one.
      await set(ref(ctx.database(), 'localpoker/friends/player/host'), {
        uid: 'host', handle: users.host.handle, displayName: users.host.displayName, createdAt: 5,
      });
      await set(ref(ctx.database(), 'localpoker/friends/host/player'), {
        uid: 'player', handle: users.player.handle, displayName: users.player.displayName, createdAt: 5,
      });
    });

    await assertSucceeds(set(ref(hostDb, 'localpoker/roomInvites/player/PUB1'), {
      code: 'PUB1', hostUid: 'host', hostName: 'Host',
      visibility: 'public', status: 'lobby', updatedAt: 10,
    }));
    logOk('host can invite an accepted friend to an existing room');

    await assertSucceeds(get(ref(playerDb, 'localpoker/roomInvites/player')));
    logOk('invited friend can read their own invites');

    await assertFails(set(ref(strangerDb, 'localpoker/publicRooms/PUB1'), {
      code: 'PUB1', hostUid: 'stranger', hostName: 'Ghost',
      visibility: 'public', status: 'lobby', updatedAt: 11,
    }));
    logOk('a non-host cannot list someone else\'s room');

    await assertFails(set(ref(hostDb, 'localpoker/roomInvites/stranger/PUB1'), {
      code: 'PUB1', hostUid: 'host', hostName: 'Host',
      visibility: 'public', status: 'lobby', updatedAt: 10,
    }));
    logOk('a non-friend cannot be sent a room invite');

    await assertFails(get(ref(strangerDb, 'localpoker/roomInvites/player')));
    logOk('invites cannot be read by anyone else');

    // Presence: anyone signed in may see whether a friend is reachable, but
    // only the owner may claim it, or you could mark someone else offline.
    await assertSucceeds(set(ref(hostDb, 'localpoker/presence/host'), { online: true, lastSeen: 20 }));
    logOk('a user can publish their own presence');

    await assertSucceeds(get(ref(playerDb, 'localpoker/presence/host')));
    logOk('a signed-in user can read a friend presence');

    await assertFails(set(ref(playerDb, 'localpoker/presence/host'), { online: false, lastSeen: 21 }));
    logOk('a user cannot rewrite someone else presence');

    await assertFails(get(ref(strangerDb, 'localpoker/presence/host')));
    logOk('a stranger cannot read presence');

    await assertFails(set(ref(hostDb, 'localpoker/presence/host'), { online: 'yes', lastSeen: 20 }));
    logOk('presence rejects a malformed record');

    // Pal: published so a redesign reaches friends, bounded so the directory
    // cannot be used as free storage.
    await assertSucceeds(set(ref(hostDb, 'localpoker/users/host'), {
      handle: users.host.handle, displayName: users.host.displayName, updatedAt: 22,
      palJson: JSON.stringify({ version: 1, skinTone: 3 }),
    }));
    logOk('a user can publish their own Pal');

    await assertFails(set(ref(hostDb, 'localpoker/users/host'), {
      handle: users.host.handle, displayName: users.host.displayName, updatedAt: 23,
      palJson: 'x'.repeat(601),
    }));
    logOk('an oversized Pal is refused');

    // A push token is a capability: whoever reads it can notify that person.
    // Read scope is therefore the whole security question for notifications.
    await assertSucceeds(set(ref(hostDb, 'localpoker/pushTokens/host'), {
      token: 'ExponentPushToken[abc123]', updatedAt: 30,
    }));
    logOk('a user can publish their own push token');

    await assertFails(set(ref(playerDb, 'localpoker/pushTokens/host'), {
      token: 'ExponentPushToken[evil]', updatedAt: 31,
    }));
    logOk('a user cannot overwrite someone else push token');

    await assertFails(set(ref(hostDb, 'localpoker/pushTokens/host'), {
      token: 'not-an-expo-token', updatedAt: 32,
    }));
    logOk('a push token that Expo could not have issued is refused');

    // player already counts host as a friend from the invite fixture above.
    await assertSucceeds(get(ref(playerDb, 'localpoker/pushTokens/host')));
    logOk('an accepted friend can read a token, which is how invites notify');

    await assertFails(get(ref(strangerDb, 'localpoker/pushTokens/host')));
    logOk('a stranger cannot read a push token');

    // A pending request used to be a way in, so a request could notify. Since
    // anyone can send one, that handed any stranger the token. Not any more.
    // The stranger renamed to `renamed_to` above, so that is their real handle.
    await assertSucceeds(update(ref(strangerDb), withBump('stranger', 'friendRequest',
      'localpoker/friendRequests/host/stranger', {
        fromUid: 'stranger', fromHandle: 'renamed_to', fromName: users.stranger.displayName,
        createdAt: serverTimestamp(), status: 'pending',
      })));
    await assertFails(get(ref(strangerDb, 'localpoker/pushTokens/host')));
    logOk('a pending requester can no longer read the recipient push token');

    await assertFails(get(ref(strangerDb, 'localpoker/presence/host')));
    logOk('nor their presence, which is for accepted friends only');

    // Impersonation: fromHandle is shown to the recipient, so it must be the
    // sender's own claimed handle.
    await setStamp('stranger', 'friendRequest', null);
    await assertFails(update(ref(strangerDb), withBump('stranger', 'friendRequest',
      'localpoker/friendRequests/player/stranger', {
        fromUid: 'stranger', fromHandle: users.host.handle, fromName: 'Host Ace',
        createdAt: serverTimestamp(), status: 'pending',
      })));
    logOk('a friend request cannot claim somebody else handle');

    await setStamp('stranger', 'friendRequest', null);
    await assertFails(update(ref(strangerDb), withBump('stranger', 'friendRequest',
      'localpoker/friendRequests/player/stranger', {
        fromUid: 'stranger', fromHandle: 'renamed_to', fromName: 'Table Ghost',
        createdAt: 1, status: 'pending',
      })));
    logOk('a friend request must carry the server timestamp');

    await setStamp('stranger', 'friendRequest', null);
    await assertFails(update(ref(strangerDb), withBump('stranger', 'friendRequest',
      'localpoker/friendRequests/player/stranger', {
        fromUid: 'stranger', fromHandle: 'renamed_to', fromName: 'Table Ghost',
        createdAt: serverTimestamp(), status: 'pending', note: 'x'.repeat(5000),
      })));
    logOk('a friend request refuses fields it does not define');

    // The join path. A joiner has to establish the room exists before seating
    // themselves, and the old rule denied exactly that read, so nobody who was
    // not already in a room could ever get into one.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/JOIN1'), {
        code: 'JOIN1', hostId: 'host', status: 'lobby', createdAt: 40,
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: true } },
      });
      await set(ref(ctx.database(), 'localpoker/rooms/LIVE1'), {
        code: 'LIVE1', hostId: 'host', status: 'playing', createdAt: 41,
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: true } },
      });
    });

    await assertSucceeds(get(ref(strangerDb, 'localpoker/rooms/JOIN1')));
    logOk('someone holding the code can read a room that is still in the lobby');

    await assertSucceeds(set(ref(strangerDb, 'localpoker/rooms/JOIN1/players/stranger'), {
      id: 'stranger', name: 'Stranger', isHost: false, connected: true,
    }));
    logOk('and can then seat themselves, which is the whole join flow');

    await assertFails(get(ref(strangerDb, 'localpoker/rooms/LIVE1')));
    logOk('but cannot read a game already in progress they never joined');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/LIVE1/players/stranger'), {
      id: 'stranger', name: 'Stranger', isHost: false, connected: true,
    }));
    logOk('and cannot seat themselves into a game already under way');

    await assertSucceeds(get(ref(strangerDb, 'localpoker/rooms/NOSUCH')));
    logOk('a room that does not exist still reads as empty rather than denied');

    // A guest acting on their turn. pushAction writes the action and the
    // room's action counter in one update, so both paths have to pass or the
    // player's call silently never lands and the table sits on their turn
    // forever.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/PLAY1'), {
        code: 'PLAY1', hostId: 'host', status: 'playing', createdAt: 50, actionSeq: 0,
        players: {
          host: { id: 'host', name: 'Host', isHost: true, connected: true },
          player: { id: 'player', name: 'Player', isHost: false, connected: true },
        },
      });
    });

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/a1': { playerId: 'player', type: 'call', seq: 1, ts: 51 },
      'localpoker/rooms/PLAY1/actionSeq': 1,
    }));
    logOk('a seated guest can push an action and advance the counter');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/actions/a2': { playerId: 'host', type: 'check', seq: 2, ts: 52 },
      'localpoker/rooms/PLAY1/actionSeq': 2,
    }));
    logOk('and so can the host');

    await assertFails(update(ref(strangerDb), {
      'localpoker/rooms/PLAY1/actions/a3': { playerId: 'stranger', type: 'fold', seq: 3, ts: 53 },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('someone not seated cannot act at the table');

    // The counter is gated on a seat, but the action node used to be gated on
    // auth alone, so writing only the action slipped a stranger's fold into
    // the queue for the host to read.
    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/actions/a3only'),
      { playerId: 'stranger', type: 'fold', seq: 3, ts: 53 }));
    logOk('not even by writing the action without the counter');

    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/a4': { playerId: 'host', type: 'fold', seq: 3, ts: 54 },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('and nobody can act on another player behalf');

    // Push keys are readable by every seat, so without the data check a
    // seated guest could replace somebody else's queued action with their
    // own. (The host can already write the whole room; that is the trust
    // model, not this gap.)
    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/a2': { playerId: 'player', type: 'fold', seq: 3, ts: 57 },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('a seated player cannot overwrite another player queued action');

    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/fat': { playerId: 'player', type: 'call', seq: 3, ts: 58, blob: 'x'.repeat(5000) },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('an action refuses fields it does not define');

    // A lobby is readable by anyone signed in, so an open-ended room was
    // free storage that every joiner downloaded.
    await assertFails(set(ref(hostDb, 'localpoker/rooms/PLAY1/junk'), 'x'.repeat(5000)));
    logOk('a room refuses top-level fields it does not define');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/visibility': 'private',
      'localpoker/rooms/PLAY1/hostName': 'Host',
    }));
    logOk('but still takes the visibility and host name the app writes');

    // The client used to send Date.now() as the sequence number, which asks to
    // jump the counter from 0 to about 1.7e12. The cap that stops anyone
    // exhausting the sequence refused it, so every action in every hand was
    // denied. The earlier assertions here all used 1, 2, 3 and so agreed with
    // my assumption rather than with what the app actually sent.
    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/big': { playerId: 'player', type: 'call', seq: Date.now(), ts: 55 },
      'localpoker/rooms/PLAY1/actionSeq': Date.now(),
    }));
    logOk('a timestamp sized sequence jump is refused, which is what broke betting');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/a5': { playerId: 'player', type: 'call', seq: 3, ts: 56 },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('and simply taking the next number is accepted');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/bet4': { playerId: 'player', type: 'raise', amount: 40, seq: 4, ts: serverTimestamp() },
      'localpoker/rooms/PLAY1/actionSeq': 4,
    }));
    logOk('a full action with an amount and server time is still accepted');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/CLOSE1'), {
        code: 'CLOSE1', hostId: 'host', status: 'playing', createdAt: 57, actionSeq: 0,
        players: {
          host: { id: 'host', name: 'Host', isHost: true, connected: true },
          player: { id: 'player', name: 'Player', isHost: false, connected: true },
        },
      });
      await set(ref(ctx.database(), 'localpoker/rooms/AWAY1'), {
        code: 'AWAY1', hostId: 'host', status: 'playing', createdAt: 58, actionSeq: 0,
        players: {
          host: { id: 'host', name: 'Host', isHost: true, connected: true },
          player: { id: 'player', name: 'Player', isHost: false, connected: true },
        },
      });
    });

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/CLOSE1/status': 'ended',
      'localpoker/rooms/CLOSE1/endedReason': 'Host left the table.',
      'localpoker/rooms/CLOSE1/endedAt': 59,
    }));
    logOk('the host can close the table with a reason');

    await assertSucceeds(get(ref(playerDb, 'localpoker/rooms/CLOSE1/endedReason')));
    logOk('a seated player can read why the table closed');

    await assertFails(get(ref(strangerDb, 'localpoker/rooms/CLOSE1/endedReason')));
    logOk('a stranger cannot read why a private table closed');

    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/CLOSE1/status': 'ended',
      'localpoker/rooms/CLOSE1/endedReason': 'Player tried to close it.',
      'localpoker/rooms/CLOSE1/endedAt': 60,
    }));
    logOk('a seated non-host cannot close the table');

    await assertFails(update(ref(strangerDb), {
      'localpoker/rooms/CLOSE1/status': 'ended',
      'localpoker/rooms/CLOSE1/endedReason': 'Stranger tried to close it.',
      'localpoker/rooms/CLOSE1/endedAt': 61,
    }));
    logOk('a stranger cannot close the table');

    await assertSucceeds(set(ref(hostDb, 'localpoker/rooms/AWAY1/hostAwayAt'), 62));
    logOk('the host can mark their own room as host-away');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/AWAY1/hostAwayAt'), 63));
    logOk('a seated non-host cannot mark the host as away');

    /*
     * The whole create-then-join handshake, written exactly as the app writes
     * it, because the pieces all passing individually has twice now not meant
     * the sequence works. Host creates, friend joins, each must then see the
     * other in the roster.
     */
    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/FLOW1': {
        code: 'FLOW1', hostId: 'host', status: 'lobby', createdAt: 80,
        settingsJson: '{"smallBlind":10,"bigBlind":20}',
        visibility: 'private', hostName: 'Host', actionSeq: 0,
        invited: { player: true },
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: true } },
      },
      'localpoker/userRooms/host/FLOW1': { code: 'FLOW1', role: 'host', updatedAt: 80 },
    }));
    logOk('the host can create a room that records who it invited');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/roomInvites/player/FLOW1': {
        code: 'FLOW1', hostUid: 'host', hostName: 'Host',
        visibility: 'private', status: 'lobby', updatedAt: 80,
      },
    }));
    logOk('and then advertise it to that friend');

    /*
     * Invite is a patch now, not part of creation. The host records the
     * invitee on a room that already exists, and the create-with-the-field-set
     * case passing above does not prove this shape passes: a refused patch
     * would make the Invite button silently do nothing.
     */
    await assertSucceeds(update(ref(hostDb), {
      'localpoker/roomInvites/player/FLOW1': {
        code: 'FLOW1', hostUid: 'host', hostName: 'Host',
        visibility: 'private', status: 'lobby', updatedAt: 82,
      },
      'localpoker/rooms/FLOW1/invited/player': true,
    }));
    logOk('and can record a later invite on a room that already exists');

    const invite = await get(ref(playerDb, 'localpoker/roomInvites/player/FLOW1'));
    if (!invite.exists()) throw new Error('the invited friend cannot see the invite');
    logOk('the friend can see the invite');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/rooms/FLOW1/players/player': { id: 'player', name: 'Player', isHost: false, connected: true },
      'localpoker/userRooms/player/FLOW1': { code: 'FLOW1', role: 'player', updatedAt: 81 },
    }));
    logOk('the friend can take a seat');

    const seenByGuest = await get(ref(playerDb, 'localpoker/rooms/FLOW1'));
    const guestSees = Object.keys(seenByGuest.val()?.players ?? {});
    if (!guestSees.includes('host')) throw new Error(`guest cannot see the host, saw: ${guestSees}`);
    logOk('and the guest can see the host in the roster');

    const seenByHost = await get(ref(hostDb, 'localpoker/rooms/FLOW1'));
    const hostSees = Object.keys(seenByHost.val()?.players ?? {});
    if (!hostSees.includes('player')) throw new Error(`host cannot see the guest, saw: ${hostSees}`);
    logOk('and the host can see the guest');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/FLOW1/players/player'), {
      id: 'player', name: 'Player', isHost: false, connected: true,
      palJson: JSON.stringify({ skin: 2, hair: 3 }),
    }));
    logOk('a player can bring their own Pal to the table');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/FLOW1/players/player'), {
      id: 'player', name: 'Player', isHost: false, connected: true,
      palJson: 'x'.repeat(900),
    }));
    logOk('but not an oversized one');

    /*
     * The desync. A busted or sitting-out player holds no cards, and a view
     * carrying an empty hand is refused. Because the whole snapshot is
     * published as one multi-path write, that single refusal failed the
     * entire update and the table silently stopped syncing for everyone.
     */
    const card = (rank, suit) => ({ rank, suit });
    await assertSucceeds(set(ref(hostDb, 'localpoker/views/FLOW1/player'), {
      version: 1, playerId: 'player', handNumber: 2,
      holeCards: [card(10, 'h'), card(11, 's')],
    }));
    logOk('a view with two cards is accepted');

    await assertFails(set(ref(hostDb, 'localpoker/views/FLOW1/player'), {
      version: 1, playerId: 'player', handNumber: 3, holeCards: [],
    }));
    logOk('a view with an empty hand is refused, which is what broke syncing');

    await assertSucceeds(set(ref(hostDb, 'localpoker/views/FLOW1/player'), null));
    logOk('so a player who was not dealt in has their view cleared instead');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: '\u{1F525}', ts: 60,
    }));
    logOk('a seated player can send a reaction');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/host'), {
      type: 'emoji', value: '\u{1F621}', ts: 61,
    }));
    logOk('but not one attributed to somebody else');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/emotes/stranger'), {
      type: 'emoji', value: '\u{1F44B}', ts: 62,
    }));
    logOk('and someone not at the table cannot react at all');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: 'x'.repeat(200), ts: 63,
    }));
    logOk('an oversized reaction is refused, so this cannot become a chat log');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'essay', value: 'hello', ts: 64,
    }));
    logOk('and an unknown reaction kind is refused');

    /*
     * Pal motions are a third kind of reaction alongside emoji and gifs. The
     * rule whitelists reaction types, so a new kind is refused in production
     * until it is added here AND deployed. Nothing deploys rules, see
     * `npm run deploy:rules`.
     */
    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'palMotion', value: 'wave', ts: 1060,
    }));
    logOk('a pal motion is an allowed reaction kind');

    /*
     * The rate limit. Each reaction's stamp has to move a second past the
     * last and may not run more than a minute ahead of the server, so a
     * modified client gets a bounded burst and then one a second.
     */
    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: '\u{1F525}', ts: 1500,
    }));
    logOk('a reaction less than a second after the last is refused');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: '\u{1F525}', ts: Date.now() + 10 * 60 * 1000,
    }));
    logOk('a reaction stamped far in the future is refused, so the gate cannot be pre-spent');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'text', value: 'All in!', ts: 2060,
    }));
    logOk('a typed reaction is allowed');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'text', value: 'shit hand', ts: 3060,
    }));
    logOk('a typed reaction with a slur is refused');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: '\u{1F44D}', ts: serverTimestamp(),
    }));
    logOk('a reaction stamped with server time, as the app now sends, is accepted');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/emotes/player'), {
      type: 'emoji', value: '\u{1F44D}', ts: serverTimestamp(),
    }));
    logOk('and an immediate second one is refused by the one-a-second gate');

    /*
     * Tabling your hand.
     *
     * Showing a bluff only means anything if the others see it, so the flag
     * lives in the room rather than on the shower's device. It had rules but
     * no assertions, which is precisely how three earlier write paths shipped
     * broken, so the host's clear is exercised in the multi-path shape the
     * app actually uses: one refused path fails the entire publish.
     */
    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/shown/player'), true));
    logOk('a seated player can table their own hand');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/shown/host'), true));
    logOk('but cannot expose somebody else\'s');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/shown/stranger'), true));
    logOk('and someone not at the table cannot show anything');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/shown/player'), 'yes'));
    logOk('the flag has to be a boolean, not a payload');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/publicState': { ...validPublicState, handNumber: 9 },
      'localpoker/rooms/PLAY1/shown': null,
    }));
    logOk('the host clears every tabled hand as part of publishing the next one');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/shown'), null));
    logOk('a player cannot clear the table\'s shown hands wholesale');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/handReady/player'), {
      handNumber: 10, ts: 56,
    }));
    logOk('a seated player can mark themselves ready for the next hand');

    await assertSucceeds(get(ref(hostDb, 'localpoker/rooms/PLAY1/handReady/player')));
    logOk('another seated player can read hand readiness');

    await assertFails(get(ref(strangerDb, 'localpoker/rooms/PLAY1/handReady')));
    logOk('someone not at the table cannot read hand readiness');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/handReady/host'), {
      handNumber: 10, ts: 57,
    }));
    logOk('a player cannot mark somebody else ready');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/handReady/stranger'), {
      handNumber: 10, ts: 58,
    }));
    logOk('a stranger cannot mark themselves ready in a room they never joined');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/handReady/player'), {
      handNumber: 10, ts: 59,
    }));
    logOk('a stranger cannot mark a seated player ready');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/handReady/player'), {
      handNumber: 10, ts: 60, playerId: 'host',
    }));
    logOk('hand readiness cannot carry an extra target player');

    await assertSucceeds(set(ref(hostDb, 'localpoker/rooms/PLAY1/handReady/host'), {
      handNumber: 10, ts: 61,
    }));
    logOk('the host marks only their own readiness as a player');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/publicState': { ...validPublicState, handNumber: 11 },
      'localpoker/rooms/PLAY1/handReady': null,
    }));
    logOk('the host clears readiness as part of publishing the next hand');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/handReady'), null));
    logOk('a player cannot clear hand readiness wholesale');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player/0'), true));
    logOk('a seated player can expose their own left card');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player/1'), true));
    logOk('and can expose their own right card separately');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/host/0'), true));
    logOk('but cannot expose another player card');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/exposed/stranger/0'), true));
    logOk('and someone not at the table cannot expose a card');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player/2'), true));
    logOk('only the two hole-card slots can be exposed');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player/0'), false));
    logOk('an exposed card cannot be hidden again by writing false');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player/1'), null));
    logOk('a player cannot take back an exposed card');

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/publicState': { ...validPublicState, handNumber: 10 },
      'localpoker/rooms/PLAY1/exposed': null,
    }));
    logOk('the host clears every exposed card as part of publishing the next one');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed'), null));
    logOk('a player cannot clear exposed cards wholesale');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/rebuys/player'), {
      playerId: 'player', ts: 65,
    }));
    logOk('a seated player can request their own rebuy');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/rebuys/host'), {
      playerId: 'host', ts: 66,
    }));
    logOk('but cannot request a rebuy for somebody else');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/rebuys/stranger'), {
      playerId: 'stranger', ts: 67,
    }));
    logOk('and someone not at the table cannot request a rebuy');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/rebuys/player'), {
      playerId: 'player', ts: 68, amount: 1000000,
    }));
    logOk('a rebuy request cannot carry a client chosen amount');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/runVotes/player'), {
      choice: 3, ts: 69,
    }));
    logOk('a seated player can vote for a run count');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/runVotes/host'), {
      choice: 2, ts: 70,
    }));
    logOk('but cannot vote for somebody else');

    // The host is a player too, and is the one most likely to be all in when
    // the question is asked, so their own vote has to be allowed.
    await assertSucceeds(set(ref(hostDb, 'localpoker/rooms/PLAY1/runVotes/host'), {
      choice: 2, ts: 71,
    }));
    logOk('the host can vote for themselves');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/PLAY1/runVotes/stranger'), {
      choice: 2, ts: 71,
    }));
    logOk('and someone not at the table cannot vote on run count');

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/PLAY1/runVotes/player'), {
      choice: 4, ts: 72,
    }));
    logOk('four boards is allowed, which is the most the wheel offers');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/runVotes/player'), {
      choice: 5, ts: 72,
    }));
    logOk('run-count votes are capped at four');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/runVotes/player'), {
      choice: 2, ts: 73, playerId: 'host',
    }));
    logOk('a run-count vote cannot carry an extra target player');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/players/player/chips'), 5000));
    logOk('a player cannot hand themselves chips through their room entry');

    await assertSucceeds(set(ref(hostDb, 'localpoker/rooms/PLAY1/rebuys/player'), null));
    logOk('the host can clear a handled rebuy request');

    /*
     * The host clearing a seat, and withdrawing the adverts.
     *
     * Two new write shapes: evicting a player who let their rebuy window run
     * out, and pulling an ended room out of publicRooms and every outstanding
     * invite. Both are multi-path, so one refused child fails the lot, and
     * both are exactly the kind of rule that has shipped broken here before
     * for want of an assertion.
     */
    /*
     * A guest leaving clears their own exposed cards along with their seat.
     *
     * leaveRoom sends one multi-path update, and exposed/{me} used to be
     * host-only, so every guest leave was refused whole and the guest stayed
     * seated. Clearing is allowed only while giving up the seat in the same
     * write, which keeps "no taking back a shown card" for anyone still seated.
     */
    const seated = (await get(ref(hostDb, 'localpoker/rooms/PLAY1/players/player'))).val();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/PLAY1/exposed/player'), { 0: true });
    });

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/exposed/player'), null));
    logOk('a seated player still cannot clear their exposed cards wholesale');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/players/player': null,
      'localpoker/views/PLAY1/player': null,
      'localpoker/userRooms/player/PLAY1': null,
      'localpoker/rooms/PLAY1/exposed/player': null,
      'localpoker/rooms/PLAY1/handReady/player': null,
      'localpoker/rooms/PLAY1/runVotes/player': null,
    }));
    logOk('a guest leaving clears their seat and exposed cards in one update');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/PLAY1/players/player'), seated);
    });

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/PLAY1/players/player': null,
      'localpoker/views/PLAY1/player': null,
      'localpoker/userRooms/player/PLAY1': null,
    }));
    logOk('the host can free up the seat of a player who did not rebuy');

    await assertFails(update(ref(strangerDb), {
      'localpoker/rooms/PLAY1/players/host': null,
    }));
    logOk('but a stranger cannot clear somebody out of a table');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/ADVERT'), {
        code: 'ADVERT', hostId: 'host', status: 'lobby', createdAt: 80,
        invited: { player: true },
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: true } },
      });
      await set(ref(ctx.database(), 'localpoker/publicRooms/ADVERT'), { code: 'ADVERT', hostUid: 'host', createdAt: 80 });
      await set(ref(ctx.database(), 'localpoker/roomInvites/player/ADVERT'), { code: 'ADVERT', hostUid: 'host', createdAt: 80 });
    });

    await assertSucceeds(update(ref(hostDb), {
      'localpoker/rooms/ADVERT/status': 'ended',
      'localpoker/rooms/ADVERT/endedAt': Date.now(),
      'localpoker/rooms/ADVERT/endedReason': 'Host left the room.',
      'localpoker/publicRooms/ADVERT': null,
      'localpoker/roomInvites/player/ADVERT': null,
    }));
    logOk('a host leaving ends the room and withdraws its listing and invites');

    const stillListed = await get(ref(hostDb, 'localpoker/publicRooms/ADVERT'));
    if (stillListed.exists()) throw new Error('ended room is still advertised publicly');
    logOk('so the closed room is no longer offered under Join Room');

    // Losing a connection is not leaving, so a dropped host marks the room
    // rather than killing it, and the room only becomes disposable once
    // nobody has come back for ten minutes.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/FRESH1'), {
        code: 'FRESH1', hostId: 'host', status: 'lobby', createdAt: 70,
        hostAwayAt: Date.now(),
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: false } },
      });
      await set(ref(ctx.database(), 'localpoker/rooms/COLD1'), {
        code: 'COLD1', hostId: 'host', status: 'lobby', createdAt: 71,
        hostAwayAt: Date.now() - 11 * 60 * 1000,
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: false } },
      });
    });

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/FRESH1'), null));
    logOk('a table whose host just dropped cannot be binned out from under them');

    await assertSucceeds(set(ref(strangerDb, 'localpoker/rooms/COLD1'), null));
    logOk('a table nobody returned to for ten minutes can be cleared by anyone');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await set(ref(ctx.database(), 'localpoker/rooms/COLD2'), {
        code: 'COLD2', hostId: 'host', status: 'lobby', createdAt: 72,
        hostAwayAt: Date.now() - 11 * 60 * 1000,
        players: { host: { id: 'host', name: 'Host', isHost: true, connected: false } },
      });
    });
    await assertFails(set(ref(strangerDb, 'localpoker/rooms/COLD2'), {
      code: 'COLD2', hostId: 'stranger', status: 'lobby', createdAt: 73,
    }));
    logOk('and clearing it means deleting it, not seizing it');

    await assertFails(update(ref(hostDb), {
      'localpoker/rooms/BADHOST': {
        code: 'BADHOST',
        hostId: 'player',
        status: 'lobby',
        createdAt: 10,
        settingsJson: '{}',
        actionSeq: 0,
        players: {
          player: { id: 'player', name: 'Player', seatIndex: 0, chips: 100, connected: true, isHost: true },
        },
      },
      'localpoker/userRooms/host/BADHOST': { code: 'BADHOST', role: 'host', updatedAt: 10 },
    }));
    logOk('host cannot create room with another uid as hostId');

    await assertFails(update(ref(hostDb), {
      'localpoker/rooms/BADIDX': {
        code: 'BADIDX',
        hostId: 'host',
        status: 'lobby',
        createdAt: 10,
        settingsJson: '{}',
        actionSeq: 0,
        players: {
          host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true },
        },
      },
      'localpoker/userRooms/player/BADIDX': { code: 'BADIDX', role: 'host', updatedAt: 10 },
    }));
    logOk('host cannot create another user userRooms index');

    await assertSucceeds(update(ref(playerDb), {
      [playerActionPath]: { playerId: 'player', type: 'call', seq: 1, ts: 1 },
      [actionSeqPath]: 1,
    }));
    logOk('non-host writes own action plus actionSeq');

    await assertFails(update(ref(playerDb), {
      [`${roomPath}/actions/forged-host-action`]: { playerId: 'host', type: 'call', seq: 2, ts: 2 },
      [actionSeqPath]: 2,
    }));
    logOk('player cannot write action as another player');

    await assertFails(update(ref(playerDb), {
      [`${roomPath}/actions/replayed-action`]: { playerId: 'player', type: 'call', seq: 1, ts: 3 },
      [actionSeqPath]: 1,
    }));
    logOk('stale seq is rejected');

    await assertFails(get(ref(strangerDb, roomPath)));
    logOk('non-player cannot read room');

    await assertFails(set(ref(playerDb, `${roomPath}/publicState`), validPublicState));
    logOk('non-host cannot write publicState');

    await assertSucceeds(set(ref(hostDb, `${roomPath}/publicState`), validPublicState));
    logOk('host can write the same valid publicState');

    await assertSucceeds(set(ref(hostDb, `${roomPath}/publicState`), {
      ...validPublicState,
      players: {
        ...validPublicState.players,
        player: {
          ...validPublicState.players.player,
          exposedHoleCards: { 1: { rank: 9, suit: 'h' } },
        },
      },
    }));
    logOk('host can publish exactly one exposed hole card');

    await assertFails(set(ref(hostDb, `${roomPath}/publicState`), {
      ...validPublicState,
      players: {
        ...validPublicState.players,
        player: {
          ...validPublicState.players.player,
          exposedHoleCards: { 2: { rank: 9, suit: 'h' } },
        },
      },
    }));
    logOk('host cannot publish an exposed card outside the two hole-card slots');

    await assertFails(get(ref(playerDb, 'localpoker/views/ROOM12/host')));
    logOk('player cannot read another player private view');

    await assertSucceeds(get(ref(playerDb, 'localpoker/views/ROOM12/player')));
    logOk('player can read own private view');

    await assertSucceeds(update(ref(playerDb), withBump('player', 'friendRequest',
      playerRequestPath, { ...friendRequest, createdAt: serverTimestamp() })));
    logOk('sender can create pending request to another player, bumping their throttle');
    // Accepting rewrites the record and the rules insist createdAt is
    // unchanged, so later steps must carry the server's value, not the fixture's.
    friendRequest.createdAt = (await get(ref(playerDb, playerRequestPath))).val().createdAt;

    const toStranger = 'localpoker/friendRequests/stranger/player';
    const playerRequest = () => ({ ...friendRequest, createdAt: serverTimestamp() });

    await assertFails(update(ref(playerDb), withBump('player', 'friendRequest', toStranger, playerRequest())));
    logOk('a second friend request straight after is refused by the ten second gap');

    await setStamp('player', 'friendRequest', Date.now() - 11000);
    await assertSucceeds(update(ref(playerDb), withBump('player', 'friendRequest', toStranger, playerRequest())));
    logOk('and accepted once the gap has passed');

    // Delete-and-resend is the spam this exists for: the sender may withdraw
    // a request, but resending it is throttled like any other.
    await assertSucceeds(set(ref(playerDb, toStranger), null));
    await setStamp('player', 'friendRequest', null);
    await assertFails(set(ref(playerDb, toStranger), playerRequest()));
    logOk('a friend request without the throttle bump in the same write is refused');

    await assertFails(set(ref(playerDb, 'localpoker/rateLimits/host/friendRequest'), serverTimestamp()));
    logOk('nobody can write somebody else throttle stamp');

    await assertFails(get(ref(playerDb, 'localpoker/rateLimits/host')));
    logOk('nor read it');

    await setStamp('player', 'friendRequest', Date.now() - 60000);
    await assertSucceeds(get(ref(playerDb, 'localpoker/rateLimits/player')));
    logOk('the owner can read their own, which is how the app explains a refusal');

    await assertFails(set(ref(playerDb, 'localpoker/rateLimits/player/friendRequest'), null));
    logOk('and cannot delete it, which would reset the clock');

    await assertFails(set(ref(playerDb, 'localpoker/rateLimits/player/friendRequest'), Date.now() - 60000));
    logOk('or backdate it: a stamp must be the server now');

    await assertFails(set(ref(playerDb, 'localpoker/rateLimits/player/other'), serverTimestamp()));
    logOk('and only the two known throttles exist');

    await assertFails(update(ref(playerDb, playerRequestPath), { ...friendRequest, status: 'accepted' }));
    logOk('sender cannot accept their own request');

    await assertFails(get(ref(strangerDb, playerRequestPath)));
    logOk('third party cannot read another player request');

    await assertFails(update(ref(strangerDb, playerRequestPath), { ...friendRequest, status: 'accepted' }));
    logOk('third party cannot accept another player request');

    await assertFails(set(ref(playerDb, 'localpoker/friends/host/player'), {
      uid: 'player',
      handle: users.player.handle,
      displayName: users.player.displayName,
      status: 'accepted',
      updatedAt: 2,
    }));
    logOk('user cannot write directly into another user friends list');

    await assertSucceeds(update(ref(hostDb), {
      [playerRequestPath]: { ...friendRequest, status: 'accepted' },
      'localpoker/friends/host/player': {
        uid: 'player',
        handle: users.player.handle,
        displayName: users.player.displayName,
        status: 'accepted',
        updatedAt: 2,
      },
      'localpoker/friends/player/host': {
        uid: 'host',
        handle: users.host.handle,
        displayName: users.host.displayName,
        status: 'accepted',
        updatedAt: 2,
      },
    }));
    logOk('recipient can accept request and create both friend edges');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/friends/host/player': null,
      'localpoker/friends/player/host': null,
    }));
    logOk('either side can remove a friendship');

    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await update(ref(db), {
        'localpoker/users/player': users.player,
        [`localpoker/handles/${users.player.handle}`]: 'player',
        'localpoker/friends/player/host': {
          uid: 'host',
          handle: users.host.handle,
          displayName: users.host.displayName,
          status: 'accepted',
          updatedAt: 3,
        },
        'localpoker/friends/host/player': {
          uid: 'player',
          handle: users.player.handle,
          displayName: users.player.displayName,
          status: 'accepted',
          updatedAt: 3,
        },
        'localpoker/friendRequests/player/host': {
          fromUid: 'host',
          fromHandle: users.host.handle,
          fromName: users.host.displayName,
          createdAt: 4,
          status: 'pending',
        },
        'localpoker/friendRequests/stranger/player': {
          fromUid: 'player',
          fromHandle: users.player.handle,
          fromName: users.player.displayName,
          createdAt: 4,
          status: 'pending',
        },
        'localpoker/userRooms/player/ROOM12': { code: 'ROOM12', role: 'player', updatedAt: 4 },
        'localpoker/views/ROOM12/player': privateView('player'),
        'localpoker/rooms/ROOM12/players/player': room.players.player,
      });
    });

    await assertFails(set(ref(hostDb, `localpoker/handles/${users.player.handle}`), null));
    logOk('user cannot release another user handle');

    await assertSucceeds(set(ref(playerDb, `localpoker/handles/${users.player.handle}`), null));
    logOk('user can release own handle');

    await assertSucceeds(set(ref(playerDb, `localpoker/handles/${users.player.handle}`), 'player'));
    logOk('released handle can be reclaimed by the same user');

    // Room membership. The room fixture is `playing`, so these also cover the
    // case that matters most: a table already in progress.
    const seat = (over = {}) => ({
      id: 'stranger', name: 'Table Ghost', seatIndex: 2, chips: 100,
      connected: true, isHost: false, ...over,
    });

    await assertFails(set(ref(strangerDb, `${roomPath}/players/stranger`), seat()));
    logOk('a stranger cannot join a room that is already playing');

    await assertFails(set(ref(playerDb, `${roomPath}/players/player`), {
      id: 'player', name: 'Player', seatIndex: 1, chips: 100, connected: true, isHost: true,
    }));
    logOk('a player cannot promote themselves to host');

    await assertFails(set(ref(playerDb, `${roomPath}/players/player`), {
      id: 'player', name: 'Player', seatIndex: 1, chips: 100, connected: true,
      isHost: false, isAdmin: true,
    }));
    logOk('a player cannot add fields of their own to their roster entry');

    // Players advance this when they act, so it cannot be locked to the host.
    // What must not be possible is jumping to the top of the number space,
    // which would leave every later action stale and wedge the table forever.
    await assertFails(set(ref(playerDb, `${roomPath}/actionSeq`), 9007199254740990));
    logOk('a seated player cannot jump the action sequence to the ceiling');

    // A lobby anyone may sit down in, except someone the host has blocked.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.database();
      await set(ref(db, 'localpoker/rooms/LOBBY1'), {
        code: 'LOBBY1', hostId: 'host', status: 'lobby', createdAt: 1,
        settingsJson: '{}', actionSeq: 0,
        players: { host: { id: 'host', name: 'Host', seatIndex: 0, chips: 100, connected: true, isHost: true } },
      });
      await set(ref(db, 'localpoker/blocks/host/stranger'), {
        uid: 'stranger', handle: users.stranger.handle,
        displayName: users.stranger.displayName, createdAt: 1,
      });
    });

    await assertSucceeds(set(ref(playerDb, 'localpoker/rooms/LOBBY1/players/player'), seat({ id: 'player', name: 'Player' })));
    logOk('a player can join a room that is still in the lobby');

    await assertFails(set(ref(strangerDb, 'localpoker/rooms/LOBBY1/players/stranger'), seat()));
    logOk('a user the host blocked cannot join their lobby');

    // Room discovery. The room itself stays readable only by its players, so
    // these summary nodes are what a browse list is built from, and they are
    // exactly where a private table could leak.
    const summary = (over = {}) => ({
      code: 'ROOM12', hostUid: 'host', hostName: 'Host Ace', visibility: 'public',
      status: 'lobby', playerCount: 1, smallBlind: 5, bigBlind: 10,
      startingStack: 1000, updatedAt: 1, ...over,
    });

    await assertSucceeds(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary()));
    logOk('host can advertise their own public room');

    await assertSucceeds(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary({
      gameMode: 'tournament', updatedAt: serverTimestamp(),
    })));
    logOk('a summary with a game mode and server time, as the app now sends, is accepted');

    await assertFails(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary({ junk: 'x'.repeat(5000) })));
    logOk('a public listing refuses fields a summary does not carry');

    await assertFails(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary({ status: 'x'.repeat(100) })));
    logOk('a public listing status is length capped');

    await assertFails(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary({ updatedAt: Date.now() + 24 * 60 * 60 * 1000 })));
    logOk('a public listing cannot be stamped in the future to pin it at the top');

    await assertFails(set(ref(hostDb, 'localpoker/roomInvites/player/ROOM12'), summary({ visibility: 'private', junk: 'x'.repeat(5000) })));
    logOk('an invite refuses fields a summary does not carry');

    await assertFails(set(ref(hostDb, 'localpoker/roomInvites/player/ROOM12'), summary({ visibility: 'private', status: 'x'.repeat(100) })));
    logOk('an invite status is length capped');

    await assertSucceeds(get(ref(strangerDb, 'localpoker/publicRooms')));
    logOk('anyone signed in can browse the public lobby');

    await assertFails(set(ref(playerDb, 'localpoker/publicRooms/ROOM12'), summary({ hostUid: 'player' })));
    logOk('a non-host cannot advertise someone else\'s room');

    await assertFails(set(ref(hostDb, 'localpoker/publicRooms/ROOM12'), summary({ visibility: 'private' })));
    logOk('a private room cannot be put in the public lobby');

    await assertFails(set(ref(strangerDb, 'localpoker/publicRooms/ROOM12'), null));
    logOk('a stranger cannot delist another host room');

    // The per-friend inbox: this is what makes a private table findable by the
    // people it is for, and by nobody else.
    await assertSucceeds(set(ref(hostDb, 'localpoker/roomInvites/player/ROOM12'), summary({ visibility: 'private' })));
    logOk('host can invite an accepted friend to a private table');

    await assertSucceeds(get(ref(playerDb, 'localpoker/roomInvites/player')));
    logOk('user can read their own room invites');

    await assertFails(get(ref(strangerDb, 'localpoker/roomInvites/player')));
    logOk('nobody else can read a user room invites');

    await assertFails(set(ref(strangerDb, 'localpoker/roomInvites/player/ROOM12'), summary({ hostUid: 'stranger' })));
    logOk('a non-friend cannot push a table into your invites');

    await assertFails(set(ref(hostDb, 'localpoker/users/player'), null));
    logOk('user cannot delete another user directory profile');

    await assertSucceeds(set(ref(playerDb, 'localpoker/blocks/player/stranger'), {
      uid: 'stranger',
      handle: users.stranger.handle,
      displayName: users.stranger.displayName,
      createdAt: 5,
    }));
    logOk('user can block another user');

    await assertFails(set(ref(hostDb, 'localpoker/blocks/player/stranger'), {
      uid: 'stranger',
      displayName: users.stranger.displayName,
      createdAt: 5,
    }));
    logOk('user cannot write another user block list');

    await setStamp('stranger', 'friendRequest', null);
    await assertFails(update(ref(strangerDb), withBump('stranger', 'friendRequest',
      'localpoker/friendRequests/player/stranger', {
        fromUid: 'stranger',
        fromHandle: 'renamed_to',
        fromName: users.stranger.displayName,
        createdAt: serverTimestamp(),
        status: 'pending',
      })));
    logOk('blocked user cannot send a friend request to blocker');

    /*
     * Blocking and reporting have to actually stop notifications.
     *
     * A push arrives from Expo without passing through the app, so no client
     * side filter can stop one. The only thing that can is losing the ability
     * to read the recipient's push token, which `pushTokens/$uid` grants to
     * the owner, to a friend, or to someone with a pending request. Blocking
     * and reporting both clear every one of those edges, so these two checks
     * are what make "no notifications from someone you blocked" a property of
     * the rules rather than a promise in a comment.
     */
    await assertSucceeds(set(ref(playerDb, 'localpoker/pushTokens/player'), {
      token: 'ExponentPushToken[aaaaaaaaaaaaaaaaaaaaaa]',
      updatedAt: 7,
    }));
    logOk('a player can publish their own push token');

    await assertFails(get(ref(strangerDb, 'localpoker/pushTokens/player')));
    logOk('and somebody they blocked cannot read it, so cannot notify them');

    /*
     * The other half of the same fact: a *current* friend can read it. That
     * is the capability, and it is why blocking and reporting both clear the
     * friend edges rather than writing a flag somewhere. Take the edge away
     * and the read above is what the blocked user gets.
     */
    await assertSucceeds(get(ref(hostDb, 'localpoker/pushTokens/player')));
    logOk('while a current friend can, which is the edge blocking removes');

    const report = (over = {}) => ({
      reporterUid: 'player', reportedUid: 'host', reportedName: users.host.displayName,
      context: 'friends', category: 'offensive_content', createdAt: serverTimestamp(), ...over,
    });

    await assertSucceeds(update(ref(playerDb), withBump('player', 'report', 'localpoker/reports/report1', report())));
    logOk('user can create an offensive content report, bumping their throttle');

    await assertFails(update(ref(playerDb), withBump('player', 'report', 'localpoker/reports/report1b', report())));
    logOk('a second report straight after is refused by the thirty second gap');

    await setStamp('player', 'report', Date.now() - 31000);
    await assertSucceeds(update(ref(playerDb), withBump('player', 'report', 'localpoker/reports/report1c', report())));
    logOk('and accepted once the gap has passed');

    await setStamp('player', 'report', null);
    await assertFails(set(ref(playerDb, 'localpoker/reports/report1d'), report()));
    logOk('a report without the throttle bump in the same write is refused');

    await setStamp('player', 'report', null);
    await assertFails(update(ref(playerDb), withBump('player', 'report', 'localpoker/reports/report2', report({ createdAt: 7 }))));
    logOk('a report must carry the server timestamp');

    await setStamp('player', 'report', null);
    await assertFails(update(ref(playerDb), withBump('player', 'report', 'localpoker/reports/report3',
      report({ evidence: 'x'.repeat(100000) }))));
    logOk('a report refuses fields it does not define, so it is not a free upload sink');

    await assertFails(get(ref(playerDb, 'localpoker/reports/report1')));
    logOk('reporter cannot read reports');

    await assertFails(update(ref(playerDb, 'localpoker/reports/report1'), {
      category: 'offensive_content',
    }));
    logOk('reporter cannot edit reports');

    await assertSucceeds(update(ref(playerDb), {
      'localpoker/users/player': null,
      [`localpoker/handles/${users.player.handle}`]: null,
      'localpoker/friends/player/host': null,
      'localpoker/friends/host/player': null,
      'localpoker/friendRequests/player/host': null,
      'localpoker/friendRequests/stranger/player': null,
      'localpoker/blocks/player': null,
      'localpoker/userRooms/player/ROOM12': null,
      'localpoker/views/ROOM12/player': null,
      'localpoker/rooms/ROOM12/players/player': null,
    }));
    logOk('user can delete own account records and room presence');

    await assertFails(update(ref(hostDb), {
      'localpoker/users/player': null,
      [`localpoker/handles/${users.player.handle}`]: null,
      'localpoker/friends/player/host': null,
      'localpoker/friendRequests/stranger/player': null,
      'localpoker/userRooms/player/ROOM12': null,
    }));
    logOk('user cannot delete another user account records');
  } finally {
    await testEnv.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
