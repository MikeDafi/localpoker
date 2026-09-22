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

## LocalPoker — current status (auto-configured)

A Firebase **Web app** and **Realtime Database** were provisioned via the browser and the
config is already in **`.env`** (project `bestplan-dac49`, us-central1). `isFirebaseConfigured()`
returns true, so the app initializes Firebase.

**Data isolation:** all LocalPoker data is namespaced under `/localpoker/...` in the RTDB, so it
never touches other data in the project.

### One remaining manual step: publish database rules
The RTDB was created in locked mode, so writes are currently denied. Publish the rules so the
lobby/rooms work:

1. Firebase console → Realtime Database → **Rules**.
2. Paste the contents of **`database.rules.json`** (in this repo) and click **Publish**.
   (Or, for a quick start, choose "test mode".)

The provided rules scope public read/write to `/localpoker/rooms/*` and `/localpoker/healthcheck` only.

### Using a dedicated project instead of bestplan
Create a new Firebase project, add a Web app + Realtime Database, then replace the
`EXPO_PUBLIC_FIREBASE_*` values in `.env` and restart the dev server. No code changes needed.
