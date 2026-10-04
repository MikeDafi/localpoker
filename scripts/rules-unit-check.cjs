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

    // A pending request is the one other way in, so a friend request can
    // notify before the friendship exists. It ends when the request does.
    await assertSucceeds(set(ref(strangerDb, 'localpoker/friendRequests/host/stranger'), {
      fromUid: 'stranger', fromHandle: users.stranger.handle, fromName: users.stranger.displayName,
      createdAt: 33, status: 'pending',
    }));
    await assertSucceeds(get(ref(strangerDb, 'localpoker/pushTokens/host')));
    logOk('a pending requester can read a token, and only while pending');

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

    await assertFails(update(ref(playerDb), {
      'localpoker/rooms/PLAY1/actions/a4': { playerId: 'host', type: 'fold', seq: 3, ts: 54 },
      'localpoker/rooms/PLAY1/actionSeq': 3,
    }));
    logOk('and nobody can act on another player behalf');

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
      'localpoker/rooms/PLAY1/state': { version: 1, handNumber: 9, street: 'preflop' },
      'localpoker/rooms/PLAY1/shown': null,
    }));
    logOk('the host clears every tabled hand as part of publishing the next one');

    await assertFails(set(ref(playerDb, 'localpoker/rooms/PLAY1/shown'), null));
    logOk('a player cannot clear the table\'s shown hands wholesale');

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
      'localpoker/rooms/PLAY1/state': { version: 1, handNumber: 10, street: 'preflop' },
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
