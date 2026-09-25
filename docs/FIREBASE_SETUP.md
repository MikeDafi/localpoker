# Firebase Realtime Multiplayer Setup

LocalPoker can run without Firebase credentials. When the `EXPO_PUBLIC_FIREBASE_*` variables are
missing, the Firebase layer returns no-op/offline results and local play continues to work.

## 1. Create and configure Firebase

1. Create a project in the [Firebase console](https://console.firebase.google.com/).
2. Add a Web app to the project and copy its Firebase config values.
3. Enable **Realtime Database** and choose the region closest to your players.
4. Copy `.env.example` to `.env` in the repo root and fill in the copied values.
5. Restart Expo so `EXPO_PUBLIC_` values are inlined into the app bundle.

## 2. Environment variables

```sh
EXPO_PUBLIC_FIREBASE_API_KEY=your-api-key
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
EXPO_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.firebaseio.com
EXPO_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=1234567890
EXPO_PUBLIC_FIREBASE_APP_ID=1:1234567890:web:abcdef123456
```

Only `API_KEY`, `DATABASE_URL`, and `PROJECT_ID` are required for the service to initialize.

## 3. Suggested data layout

```text
/rooms/<code>              -> RoomState
/rooms/<code>/players      -> RoomState.players
/rooms/<code>/actions      -> pushed RoomAction records
/rooms/<code>/actionSeq    -> latest action sequence number
```

Use short, unguessable, uppercase room codes such as `7KQ9T2`; anyone with the code can join.

## 4. Starter Realtime Database rules

These unauthenticated starter rules are intended for private friend rooms during development: the
room code is the access key, writes are shape-limited, and room codes must match a safe pattern. For
production, add Firebase Auth and App Check so writes can be tied to real users/devices.

```json
{
  "rules": {
    "rooms": {
      "$code": {
        ".read": "$code.matches(/^[A-Z0-9-]{4,16}$/)",
        ".write": "!data.exists() && $code.matches(/^[A-Z0-9-]{4,16}$/) && newData.child('code').val() === $code && newData.hasChildren(['code', 'hostId', 'status', 'createdAt', 'settingsJson', 'players', 'actionSeq'])",
        "players": {
          "$playerId": {
            ".write": "data.parent().parent().exists() && (newData.isNull() || (newData.child('id').val() === $playerId && newData.hasChildren(['id', 'name', 'seatIndex', 'chips', 'connected', 'isHost'])))",
            ".validate": "newData.isNull() || (newData.child('id').isString() && newData.child('name').isString() && newData.child('seatIndex').isNumber() && newData.child('chips').isNumber() && newData.child('connected').isBoolean() && newData.child('isHost').isBoolean())"
          }
        },
        "actions": {
          "$actionId": {
            ".write": "data.parent().parent().exists() && !data.exists() && newData.hasChildren(['seq', 'playerId', 'type', 'ts'])",
            ".validate": "newData.child('seq').isNumber() && newData.child('playerId').isString() && newData.child('type').isString() && newData.child('ts').isNumber()"
          }
        },
        "actionSeq": {
          ".write": "data.parent().exists() && newData.isNumber()"
        }
      }
    }
  }
}
```


---

## LocalPoker - current status

LocalPoker runs on its own Firebase project, **`localpoker`** (us-central1).

It was deliberately separated from `bestplan-dac49`, which has a billing account attached
(Blaze). `localpoker` has **no billing account**, so it is on the Spark free plan and
usage stops at the free quota rather than generating a bill. That is the safer default for a
free app that anyone can download. The previous values are kept in `.env.bestplan-backup`.

Provisioned and already done:

- Web app created, config written to `.env` (gitignored)
- Realtime Database instance `localpoker-default-rtdb` created
- Security rules from `database.rules.json` deployed and live

**Data isolation:** all LocalPoker data is namespaced under `/localpoker/...`.

### Redeploy the rules after changing room discovery

Browsing for a table needs two nodes that did not exist before, so
`database.rules.json` must be redeployed or the lists come back empty:

- `/localpoker/publicRooms/$code` - the open lobby. Readable by anyone signed
  in, writable only by the host of that room, and validated so a room marked
  `private` cannot be advertised here.
- `/localpoker/roomInvites/$uid/$code` - a per-friend inbox. Readable only by
  its owner, writable only by an accepted friend of that owner who also hosts
  the room in question.

They exist because `/localpoker/rooms/$code` is readable only by the host and
the players already seated, which is what keeps a private game private. A browse
list cannot be built from it without opening every table to everyone, so hosts
publish a small summary instead, carrying only what a list needs to show.

`npm run test:rules` covers both, including the two cases that matter: a private
room cannot be listed publicly, and a non-friend cannot push a table into your
invites.

### One remaining manual step: enable Anonymous sign-in

This cannot be scripted on the free plan. The Identity Toolkit admin API that toggles sign-in
providers is part of Identity Platform, which requires billing, so the Firebase console is the
only route on Spark.

1. Open https://console.firebase.google.com/project/localpoker/authentication/providers
2. Click **Get started** if prompted.
3. Enable **Anonymous**, then **Save**.

Until that is done, `ensureSignedIn()` returns null and the app falls back to local-only play.
That is intentional: see `src/services/firebase/auth.ts`, which no-ops rather than breaking.

### Verifying it worked

    npm run test:rules     # rules suite against the local emulator

Then launch the app and open a friends room. If sign-in is working, room writes succeed; if not,
the app stays usable offline and logs a warning rather than crashing.

### Moving to a different project

Create a Firebase project, add a Web app and a Realtime Database, deploy the rules with
`npx firebase deploy --only database --project <id>`, then replace the `EXPO_PUBLIC_FIREBASE_*`
values in `.env` and restart the dev server. No code changes needed.
