# LocalPoker — Production Readiness Audit

_Last verified: 2026-09-19._  
_App: LocalPoker: Poker with Friends (`com.localpoker.app`), Expo SDK 57 / React Native / TypeScript / Firebase Realtime Database + anonymous auth scaffold._

> This audit reflects the code in this repository as of the verification date. It supersedes the earlier stale version, which listed several issues as both fixed and outstanding.

## Verification performed

- Reviewed store/legal/data paths: `AgeGateScreen.tsx`, `AppContext.tsx`, `StoreScreen.tsx`, `src/services/firebase/**`, `database.rules.json`, `AdBanner.tsx`, `gifs.ts`, `EmoteBar.tsx`, `LoginScreen.tsx`, `LobbyScreen.tsx`, `TableScreen.tsx`, `app.json`, `eas.json`.
- Ran `npx tsc --noEmit` successfully.
- Ran `npm test -- --reporter=dot`: **9 test files, 73 tests passed**.

## Accurate current state

### Store identity and build config

- `app.json` is store-facing version **1.0.0**, iOS bundle id **`com.localpoker.app`**, Android package **`com.localpoker.app`**, iOS build number `1`, Android version code `1`, runtime version policy `appVersion`.
- `eas.json` exists with development/preview/production profiles and submit placeholders.
- `package.json` remains private package version `0.1.0`; this does not drive the store version but is worth aligning later for clarity.

### Age gate and legal copy

- A blocking neutral **birth-year** age gate exists before login (`App.tsx` renders `AgeGateScreen` until `ageVerified`).
- `verifyAge()` rejects invalid years and users under 18, then stores only `@pokerpals/ageVerified = 'true'` in AsyncStorage; the birth year itself is not persisted.
- The in-app Terms/Privacy modal copy is still placeholder/development text. It is directionally consistent with play-money/no real gambling, but should be replaced or linked to final hosted docs from `docs/store/` before submission.

### Local persistence

`src/state/AppContext.tsx` persists these AsyncStorage keys:

- `@pokerpals/profile`: local random profile ID, display name, Pal config, coins, XP.
- `@pokerpals/stats`: poker stats.
- `@pokerpals/auth`: local login flag/provider/handle. This is not real OAuth.
- `@pokerpals/friends`: local friend list.
- `@pokerpals/settings`: game settings.
- `@pokerpals/savedgame`: full local game snapshot for resume.
- `@pokerpals/ageVerified`: age-gate flag only.

`src/screens/StoreScreen.tsx` also stores `@localpoker/cosmetics` locally. `TableScreen.tsx` debounces saved-game writes and flushes on unmount.

### What leaves the device today

- **Firebase anonymous auth:** `ensureSignedIn()` dynamically imports Firebase Auth and calls `signInAnonymously()` when Firebase env vars are configured.
- **Firebase lobby presence:** `LobbyScreen.tsx` calls `createRoom()`, `joinRoom()`, `setPlayerConnected()`, and `subscribeRoom()`. `roomSync.ts` writes room code, host/player IDs, display names, Pal seed, lobby chip count, seat index, connected state, host flag, and settings JSON to Realtime Database.
- **Gameplay sync:** `pushAction()` exists in `roomSync.ts`, but `TableScreen.tsx` does not call it; current table play is still local vs bots. The friends-room banner explicitly says live friend play needs Firebase setup.
- **Giphy CDN:** `gifs.ts` builds public `https://media.giphy.com/...` URLs; `EmoteBar.tsx` loads them as images. Giphy/CDN receives standard network requests.
- **Ads:** no real ad data leaves the device today. `AdBanner.tsx` is a placeholder and `react-native-google-mobile-ads` is not installed.

### Firebase rules

- `database.rules.json` is no longer public read/write. It requires `auth != null`, scopes player writes to `$uid`, validates authorship and basic payload sizes, and has no public `healthcheck` node.
- **Important remaining blocker:** the rules require IDs to equal `auth.uid`, but `LobbyScreen.tsx` still builds `RoomPlayer.id` from `profile.id`. As written, hardened rules are likely to reject create/join writes unless the lobby is changed to use `getAuthUid()`/`auth.uid` consistently.
- Publishing rules and enabling Anonymous provider remain human Firebase console steps.

### Auth/login

- Fake **Continue with Apple/Google** buttons have been removed from `LoginScreen.tsx`.
- The remaining email option is local only: it stores a handle in AsyncStorage and does not verify email or create a server account.
- Real Apple/Google/email OAuth remains outstanding.

### Ads, analytics, crash reporting

- Ads are placeholders only; real AdMob, ATT, UMP consent, and store ad disclosures are not implemented.
- `ErrorBoundary` exists and prevents white-screen render crashes with a recovery UI, but production crash reporting is not wired. `componentDidCatch` currently logs and has a TODO for Sentry/Crashlytics.
- No analytics SDK is integrated.

### Poker engine and bot AI

- Bot decisioning uses Chen starting-hand scoring plus Monte Carlo rollout equity (`src/engine/equity.ts`, `bot.ts`).
- The test suite includes bot/equity coverage and currently passes **73 tests**.

## Store-readiness documents added

Created under `docs/store/`:

- `PRIVACY-POLICY.md`
- `TERMS.md`
- `APP-PRIVACY-LABELS.md`
- `SUBMISSION-CHECKLIST.md`
- `README.md`

These are drafts and require legal review, hosted URLs, and final console answers before publication.

## What is fixed versus the prior audit

- The old audit contradicted itself by listing **C1 database rules** as both fixed and still fully public. Current rules are hardened in the repo, though not necessarily published and not yet matched by lobby identity code.
- The old **H3 no age gate/legal** finding is obsolete: a blocking 18+ birth-year gate exists. Final hosted legal docs and updated in-app links are still required.
- The old **fake Apple/Google login** concern is partially resolved: those buttons are gone. Real OAuth remains unimplemented.
- The old **M2 save thrash/unbounded log** issue is mostly resolved by debounced saved-game writes and log capping.
- The old **M4 no crash handling** issue is partially resolved by `ErrorBoundary`; crash reporting/analytics remain outstanding.
- The old **M5 app.json missing store fields/version 0.1.0** issue is mostly resolved in `app.json` and `eas.json`; `package.json` still says `0.1.0` but is not the store source of truth.
- The old **L4 no CI** issue is obsolete: `.github/workflows/ci.yml` runs `tsc` and `vitest`, and the local verification passed.

## Remaining blockers / risks

### Critical before enabling online/friends production

1. **Firebase auth UID mismatch:** update lobby/room code to use Firebase `auth.uid` consistently with `database.rules.json`.
2. **Publish Firebase rules and enable Anonymous provider** in the console.
3. **Actual multiplayer gameplay sync is not implemented.** Current friend rooms are lobby/presence only; table play remains local vs bots.
4. **Server-authoritative economy and gameplay are not implemented.** Coins, XP, stats, cosmetics, and saved game are client/local-authoritative. This is acceptable for play-money local entertainment, but not for competitive online integrity or any future IAP/rewarded-ad economy.

### Required before store submission

1. Host final Privacy Policy and Terms URLs and replace/supersede placeholder in-app modal copy.
2. Complete Apple App Privacy and Google Data Safety answers from the code-traced mapping in `docs/store/APP-PRIVACY-LABELS.md`.
3. Answer age-rating questionnaires as simulated gambling: play-money poker is still simulated gambling even with no real-money gambling.
4. Ensure screenshots/listing copy do not imply real-money gambling, cash prizes, working ads, or working live multiplayer gameplay beyond what ships.
5. Decide whether the first submission includes Firebase online rooms. If yes, fix the UID mismatch and retention cleanup first; if no, hide/disable online-room entry points.

### Outstanding product/engineering work

- Real Apple/Google/email OAuth.
- Server-authoritative economy and abuse controls.
- Host/server-authoritative multiplayer state sync.
- AdMob integration with ATT and UMP consent.
- Production crash reporting and analytics (being added separately).
- Firebase room cleanup/retention job.
- Update stale `docs/FIREBASE_SETUP.md`; it still contains older unauthenticated starter-rule language and healthcheck references that no longer match `database.rules.json`.

## Recommended launch path

1. Finish legal/store docs and hosted URLs.
2. Fix Firebase auth UID wiring or disable online rooms for v1.0.0.
3. Publish Firebase rules and verify Anonymous auth in a production EAS build.
4. Submit with no real ads first, or finish AdMob + ATT + UMP and update all disclosures before submitting.
5. Add crash reporting and operational monitoring.
6. Build true multiplayer/economy authority before promoting friend gameplay as live competitive play.
