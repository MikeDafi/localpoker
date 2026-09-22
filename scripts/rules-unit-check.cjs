const fs = require('node:fs');
const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
const { get, ref, set, update } = require('firebase/database');

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
  } finally {
    await testEnv.cleanup();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
