# Enabling online play

Online play is wired in the app, but a human must enable Firebase services for the target project.

## 1. Environment keys

Copy `.env.example` to `.env` and fill in:

```sh
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_DATABASE_URL=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
```

Restart Expo after changing `.env`. In code, `isFirebaseConfigured()` returns `true` only when `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, and `EXPO_PUBLIC_FIREBASE_PROJECT_ID` are present.

## 2. Enable Anonymous auth

1. Open the Firebase console for the app project.
2. Go to **Build** > **Authentication** > **Sign-in method**.
3. Click **Add new provider** or open **Anonymous**.
4. Toggle **Enable** on.
5. Click **Save**.

Verification: create or join a friends room in the app. If Anonymous auth is off, the lobby reports that it could not sign in to play online.

## 3. Publish Realtime Database rules

Console path:

1. Open **Build** > **Realtime Database**.
2. Open the **Rules** tab.
3. Replace the editor contents with `database.rules.json` from this repo.
4. Click **Publish**.

CLI alternative, if the Firebase CLI is installed and authenticated:

```sh
firebase database:set /.settings/rules database.rules.json --project <project-id> --instance <database-instance-name>
```

Use the database instance name from the Realtime Database URL. For `https://my-app-default-rtdb.firebaseio.com`, the instance is `my-app-default-rtdb`.

Verification:

```sh
firebase database:get /.settings/rules --project <project-id> --instance <database-instance-name>
```

Confirm the returned rules match `database.rules.json`. Then open two app clients, create a friends room on one, join the room code on the other, start a game, and play one action from each client.

Before publishing, run the local security rules suite:

```sh
npm run test:rules
```

This starts the local Realtime Database emulator against `database.rules.json` and proves:

- A known handle and known user profile can be read exactly, but the `handles` and `users` collections cannot be listed.
- A user can create an unclaimed handle for themselves, cannot overwrite a claimed handle, and cannot claim a handle for another UID.
- A non-host room player can write their own action and advance `actionSeq` in the same multi-path update.
- A player cannot write an action attributed to another player.
- A stale or replayed `seq` is rejected.
- A non-player cannot read the room.
- A non-host cannot write `publicState`.
- A player cannot read another player's private view under `localpoker/views/$code/$uid`.
- A sender can create a pending friend request, but cannot accept it themselves.
- A third party cannot read or accept someone else's request.
- A user cannot write directly into another user's friends list.
- The recipient can accept and create both friend edges, and either side can remove the friendship.

The rules suite is separate from `npx vitest run`. It needs Java for the Realtime Database emulator. If Java or `firebase-tools` is missing, the wrapper prints a clear skip message so the normal app test suite is not affected.

## 4. Friend identity model

Online friends use a small Firebase directory:

- `localpoker/users/$uid` stores `{ handle, displayName, updatedAt }`.
- `localpoker/handles/$handle` stores the owning `$uid`.
- Handles are normalized to lowercase letters, numbers, and underscores, 3 to 20 characters.
- Handle claims are create-only in rules and are written with a transaction, so two installs racing for the same handle cannot both win.
- Directory lookup is exact-match only. The app may read `handles/$handle` and `users/$uid`, but the parent `handles` and `users` nodes are not readable, so clients cannot list the directory.

`users/$uid` is readable by any authenticated client by deliberate choice. A player who already knows a handle can resolve it to a display name before sending a request. The parent node remains unreadable, and Firebase anonymous UIDs are not guessable enough to make directory enumeration practical.

Friend requests require consent:

- `friendRequests/$toUid/$fromUid` may be created only by `$fromUid` with `status: "pending"`.
- Only `$toUid` can accept or decline.
- Accepting writes both users' friend edges.
- Either side can later remove the friendship.

Important identity limitation: current online identity is Firebase Anonymous Auth. That identity is per install. If a player deletes the app, clears app data, or changes device without linking a real account, their `uid`, handle claim, friend requests, and friend list are lost. This is acceptable for development and testing, but real shipping-quality accounts should link anonymous users to durable sign-in before marketing online friends as permanent.

## 5. What cleanup exists

The client marks a room `ended` when the host leaves or disconnects. Explicit host end also clears room actions, public state, and current private views. Ended room codes can be reclaimed by a new host after 24 hours.

This is not a full retention system. A production Firebase project should still add a server-side scheduled cleanup, for example a Cloud Function, to delete old `localpoker/rooms/*` and orphaned `localpoker/views/*` entries after the chosen retention window.
