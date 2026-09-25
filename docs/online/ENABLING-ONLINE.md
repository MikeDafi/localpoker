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

### How these reach a release build, and how that used to go wrong

`EXPO_PUBLIC_*` variables are not read at runtime. `babel-preset-expo` finds the literal text `process.env.EXPO_PUBLIC_SOMETHING` in the source and replaces it with the value while bundling, and a release bundle has no `process.env` object left at all. Two consequences:

1. **The read has to be a literal member expression.** A `readEnv('EXPO_PUBLIC_...')` helper, a computed `process.env[key]` lookup, or optional chaining through `process.env?.` all leave a lookup that finds nothing once bundled. That is exactly what happened here: development worked, and every production build silently reported online play as "not configured". `src/services/__tests__/envInlining.test.ts` now fails the build if that pattern comes back.
2. **The values must exist wherever bundling happens.** A local build reads `.env` from this directory. An EAS cloud build never sees `.env`, because it is gitignored, so the values have to come from the build profile's `env` block in `eas.json` instead.

The `ios-release` job in `.github/workflows/ci.yml` writes that block from repository secrets and refuses to build if the three required ones are missing. Add these under **Settings > Secrets and variables > Actions**:

```
EXPO_PUBLIC_FIREBASE_API_KEY             (required)
EXPO_PUBLIC_FIREBASE_DATABASE_URL        (required)
EXPO_PUBLIC_FIREBASE_PROJECT_ID          (required)
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
EXPO_PUBLIC_SENTRY_DSN
```

They are public client identifiers rather than real secrets. They are stored as secrets only so this public repository carries no project identifiers.

To confirm a built binary actually has them, export a production bundle and search it:

```sh
npx expo export --platform ios --output-dir dist-check
grep -c -a -F "$EXPO_PUBLIC_FIREBASE_API_KEY" dist-check/_expo/static/js/ios/*.hbc
```

A count of `0` means the app will launch and behave as if Firebase were never configured.

## 2. Enable Anonymous auth

1. Open the Firebase console for the app project.
2. Go to **Build** > **Authentication** > **Sign-in method**.
3. Click **Add new provider** or open **Anonymous**.
4. Toggle **Enable** on.
5. Click **Save**.

Verification: create or join a friends room in the app. If Anonymous auth is off, the lobby reports that it could not sign in to play online.

## 2b. Enable Google sign-in

Anonymous auth alone is per install. Google sign-in is what makes an account survive a reinstall or a new device, so enable it before shipping.

1. In **Authentication** > **Sign-in method**, add the **Google** provider and enable it.
2. Set a project support email, then **Save**.
3. Register the iOS app under **Project settings** > **Your apps** > **Add app** > **iOS**, using the bundle identifier from `app.json` (`ios.bundleIdentifier`). Firebase creates the iOS OAuth client for you.
4. Copy both client IDs into `.env`:

```sh
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=...apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=...apps.googleusercontent.com
```

The web client ID is under **Sign-in method** > **Google** > **Web SDK configuration**. The iOS one is on the iOS app you just registered. Both are public identifiers that ship inside the app binary; they live in `.env` only to match the rest of the Firebase config.

Leaving both blank hides the Google button and leaves Guest as the only option, so a fork without these keys still builds and runs.

**Google sign-in never works in Expo Go.** The OAuth redirect is bound to this app's bundle identifier, and Expo Go's is `host.exp.Exponent`, so Google would have nowhere to send the user back to. Test it with `npx expo run:ios` or a TestFlight build. The redirect scheme itself needs no manual setup: `npx expo prebuild` writes the bundle identifier into `CFBundleURLTypes` automatically, which is the URI `expo-auth-session` hands to Google.

Signing in while already playing as a guest *links* the Google credential to the existing anonymous user, so the handle, friends and stats that uid already owns carry over. If that Google account already has its own Firebase user, the app signs into that one instead, since it is the identity with the real history.

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

Identity durability: a guest is Firebase Anonymous Auth, which is per install. A guest who deletes the app, clears app data, or changes device loses their `uid`, handle claim, friend requests, and friend list, and handles are create-only in the rules, so the old claim cannot be reclaimed. Google sign-in (section 2b) is the fix: it links that anonymous uid to a Google account, so the same person gets the same identity on the next device. Guest play stays available, but do not market a guest's friends list as permanent.

## 5. What cleanup exists

The client marks a room `ended` when the host leaves or disconnects. Explicit host end also clears room actions, public state, and current private views. Ended room codes can be reclaimed by a new host after 24 hours.

This is not a full retention system. A production Firebase project should still add a server-side scheduled cleanup, for example a Cloud Function, to delete old `localpoker/rooms/*` and orphaned `localpoker/views/*` entries after the chosen retention window.
