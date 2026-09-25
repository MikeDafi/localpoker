const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { endAt, get, limitToFirst, orderByKey, query, ref, set, startAt, update } = require('firebase/database');

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

    await assertSucceeds(set(ref(strangerDb, 'localpoker/handles/new_shark'), 'stranger'));
    logOk('authenticated user can create an unclaimed own handle');

    await assertFails(set(ref(playerDb, 'localpoker/handles/new_shark'), 'player'));
    logOk('claimed handle cannot be overwritten');

    await assertFails(set(ref(playerDb, 'localpoker/handles/forged_owner'), 'host'));
    logOk('user cannot claim a handle for another uid');

    // Renaming was impossible for a while: the app froze the first name it
    // published, so a rename silently reverted and friends searching the new
    // name found nobody. This walks the whole sequence the app now performs.
    await assertSucceeds(set(ref(strangerDb, 'localpoker/handles/renamed_to'), 'stranger'));
    await assertSucceeds(set(ref(strangerDb, 'localpoker/users/stranger'), {
      handle: 'renamed_to',
      displayName: 'Renamed To',
      updatedAt: Date.now(),
    }));
    await assertSucceeds(set(ref(strangerDb, 'localpoker/handles/new_shark'), null));
    logOk('user can rename: claim the new handle, repoint the profile, release the old');

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

    await assertFails(get(ref(playerDb, 'localpoker/views/ROOM12/host')));
    logOk('player cannot read another player private view');

    await assertSucceeds(get(ref(playerDb, 'localpoker/views/ROOM12/player')));
    logOk('player can read own private view');

    await assertSucceeds(set(ref(playerDb, playerRequestPath), friendRequest));
    logOk('sender can create pending request to another player');

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

    await assertFails(set(ref(strangerDb, 'localpoker/friendRequests/player/stranger'), {
      fromUid: 'stranger',
      fromHandle: users.stranger.handle,
      fromName: users.stranger.displayName,
      createdAt: 6,
      status: 'pending',
    }));
    logOk('blocked user cannot send a friend request to blocker');

    await assertSucceeds(set(ref(playerDb, 'localpoker/reports/report1'), {
      reporterUid: 'player',
      reportedUid: 'host',
      reportedName: users.host.displayName,
      context: 'friends',
      category: 'offensive_content',
      createdAt: 7,
    }));
    logOk('user can create an offensive content report');

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
