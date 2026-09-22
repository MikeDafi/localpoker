# App Privacy Labels and Google Play Data Safety Draft

> **Legal review required:** This is a code-traced disclosure draft, not legal advice. Store-console answers must be reviewed against the exact binary submitted and each SDK vendor's current disclosure guidance.

## Scope and evidence reviewed

Current build evidence:

- Age gate and in-app placeholder legal copy: `src/screens/AgeGateScreen.tsx`.
- Local persistence: `src/state/AppContext.tsx`, `src/screens/StoreScreen.tsx`.
- Firebase config/auth/Realtime Database services: `src/services/firebase/config.ts`, `auth.ts`, `roomSync.ts`, `types.ts`, `database.rules.json`.
- Friends lobby using Firebase presence: `src/screens/LobbyScreen.tsx`.
- Local table play and saved game snapshots: `src/screens/TableScreen.tsx`.
- Ads placeholder: `src/components/AdBanner.tsx`.
- GIF CDN usage: `src/services/gifs.ts`, `src/components/EmoteBar.tsx`.
- Login screen: `src/screens/LoginScreen.tsx`.
- Store config: `app.json`, `eas.json`, `package.json`.

Key current-state findings:

- Real ads are not integrated; `AdBanner` is a static placeholder.
- No crash-reporting or analytics SDK is integrated.
- Firebase anonymous auth is attempted, but real OAuth is not implemented.
- Online/friends play is partially built: lobby presence exists; gameplay sync is not wired into the table.
- Giphy GIFs load from public CDN URLs.

## Apple App Privacy Nutrition Label — current build (no ads SDK)

Recommended answer for **tracking** today: **No**. There is no IDFA/ATT flow, no advertising SDK, no data broker integration, and no cross-app tracking code in the current build.

| Apple data type | Collected today? | Linked to user? | Used for tracking? | Purpose | Code evidence and notes |
|---|---:|---:|---:|---|---|
| Contact Info — Email Address | **No** | No | No | N/A | `LoginScreen.tsx` accepts an email-or-username string, but `AppContext.login()` persists it only to AsyncStorage as `@pokerpals/auth`; no Firebase write path sends it. |
| Contact Info — Name | **No, if display names are treated as usernames/nicknames** | N/A | No | N/A | The app uses display names/nicknames, not legal first/last names. Disclose those under User ID / Gameplay Content below. If legal review or App Store Connect treats the nickname as Contact Info Name, change this row to **Yes / linked / not tracking**. |
| Identifiers — User ID | **Yes, when Firebase/online is used** | **Yes** | No | App functionality, account management, security | `ensureSignedIn()` calls Firebase anonymous auth and receives `auth.uid`; `roomSync.ts` writes `hostId`/player `id`; `database.rules.json` scopes writes to `auth.uid`. `AppContext.tsx` also creates a local random `profile.id` used by lobby code today. |
| Identifiers — Device ID | **No today** | No | No | N/A | No IDFA/IDFV/AAID access, no `react-native-google-mobile-ads`, no ATT prompt. Firebase Auth/Database SDKs may use service/session data, but the app code does not access advertising/device IDs. Update if vendor disclosure requires it. |
| User Content — Gameplay Content / Other User Content | **Yes, limited to online lobby metadata** | **Yes** | No | App functionality | `LobbyScreen.tsx` builds `RoomPlayer` from `profile.id`, `profile.name`, `palSeed`, seat, chips, connected, host; `roomSync.createRoom()`/`joinRoom()` write room code, settings JSON, player metadata, presence to Firebase. `pushAction()` exists but is not called by `TableScreen.tsx`, so gameplay actions are not collected today. |
| Usage Data — Product Interaction | **No analytics today** | No | No | N/A | Stats, coins, settings, saved games, cosmetics are stored locally via `AppContext.tsx`, `StoreScreen.tsx`, and `TableScreen.tsx`; no analytics SDK sends product-interaction events. Firebase presence above is disclosed as Gameplay Content. |
| Diagnostics — Crash Data / Performance Data | **No today** | No | No | N/A | `ErrorBoundary.tsx` logs locally and has a TODO for Sentry/Crashlytics. No crash SDK is installed. Update when crash reporting ships. |
| Location — Precise or Coarse | **No today** | No | No | N/A | No location APIs. Firebase/Giphy receive ordinary network requests; no app code requests or sends GPS/location. |
| Purchases / Financial Info | **No** | No | No | N/A | No IAP dependency/config; StoreScreen cosmetics use play-money coins only via `addCoins(-price)`. |
| Contacts, Photos/Videos, Audio, Files, Health/Fitness, Sensitive Info, Browsing/Search History | **No** | No | No | N/A | No code paths or permissions for these categories. `app.json` configures `expo-audio` with microphone/recording disabled. |
| Other Data — Giphy CDN request metadata | **Yes, by third-party CDN request** | Not linked by LocalPoker | No by LocalPoker | App functionality | `gifs.ts` builds `https://media.giphy.com/...` URLs and `EmoteBar.tsx` loads them in React Native `Image`. Giphy/CDN may receive IP/user agent and requested GIF URL; LocalPoker does not attach account IDs or search terms. |

### Apple notes for current submission

- Do **not** answer that the app collects email addresses unless the submitted binary actually sends the email/handle off-device.
- Do **not** enable tracking/IDFA answers for the current placeholder-ad build.
- Do disclose Firebase anonymous/user IDs and online lobby metadata if the Firebase-enabled binary is submitted.
- If submitting with Firebase disabled and no online rooms, the label can be narrower, but the store build should match the app's actual runtime configuration.

## Apple App Privacy — after AdMob ships

Update the label before submitting an AdMob build. Expected additions, subject to Google's current AdMob disclosure guidance and your configuration:

| Apple data type | Collected after AdMob? | Linked to user? | Used for tracking? | Purpose | Notes |
|---|---:|---:|---:|---|---|
| Identifiers — Device ID | **Yes** | Likely yes | **Yes if personalized ads / IDFA cross-app tracking is enabled** | Third-party advertising, analytics, fraud prevention | Requires ATT prompt before IDFA access on iOS. If using only contextual/non-personalized ads with no tracking, tracking answer may differ. |
| Usage Data — Advertising Data / Product Interaction | **Yes** | Likely yes | Yes if used across apps/sites for ads | Third-party advertising, analytics | Ad impressions, clicks, ad requests, frequency/fraud signals. |
| Location — Coarse Location | **Likely yes** | Likely yes | Possible | Advertising, fraud prevention | Often inferred from IP by ad networks. Verify with vendor docs. |
| Diagnostics — Crash/Performance | **Possible** | Possible | No/possible depending SDK use | App functionality, analytics | If AdMob or crash SDK collects diagnostics, disclose. |
| Contact Info / Financial Info | Not from AdMob alone | N/A | N/A | N/A | Still no real-money purchases unless future IAP is added. |

Required before AdMob submission:

- Add/verify ATT purpose string and prompt timing.
- Add Google UMP or equivalent consent flow for EEA/UK and other required regions.
- Mark Google Play listing as **Contains ads**.
- Update privacy policy and Data Safety answers.

## Google Play Data Safety — current build (no ads SDK)

Recommended high-level current answers:

- **Does the app collect user data?** Yes, if Firebase/online lobby is enabled.
- **Is all collected data encrypted in transit?** Yes for Firebase/Giphy HTTPS traffic, assuming standard SDK/CDN transport.
- **Can users request deletion?** Yes, via the privacy contact placeholder; add an in-app/account deletion flow before production if possible.
- **Is data sharing declared?** Firebase as service provider may fall under Google's service-provider exception; Giphy receives CDN request metadata; AdMob sharing does not apply until ads ship. Confirm Play Console interpretation with counsel.

| Google data category | Collected today? | Shared? | Required or optional? | Purpose | Code evidence and notes |
|---|---:|---:|---|---|---|
| Personal info — Name | **Yes, for display name in online lobby** | No, except service provider processing | Optional/feature-dependent | App functionality | `profile.name` stored locally in `AppContext.tsx`; `LobbyScreen.tsx` sends it in `RoomPlayer`; `roomSync.ts` writes it to Firebase. It is a nickname/display name, not verified legal name. |
| Personal info — Email address | **No** | No | N/A | N/A | Email-or-username handle stays in AsyncStorage via `AppContext.tsx`; no Firebase write path. |
| User IDs | **Yes** | No, except service provider processing | Required for online rooms; local play can work without Firebase | App functionality, security/fraud prevention | Firebase anonymous `auth.uid`; app local `profile.id`; room rules and player paths. |
| App activity — App interactions / other actions | **Yes, limited online lobby presence/room metadata** | No, except service provider processing | Optional/feature-dependent | App functionality | Room code, status, settings JSON, seat/chip/presence data via `LobbyScreen.tsx` and `roomSync.ts`. `pushAction()` is not used by table gameplay today. |
| Device or other IDs | **No today from app code** | No | N/A | N/A | No ad SDK or advertising ID access. Re-evaluate Firebase vendor requirements and future AdMob. |
| Approximate location | **No today from app code** | No | N/A | N/A | No location APIs. Network services may process IP for delivery/security. |
| Diagnostics | **No today** | No | N/A | N/A | No crash-reporting SDK; `ErrorBoundary` only logs. |
| Financial info / Purchases | **No** | No | N/A | N/A | No IAP, no real-money gambling, virtual coins only. |
| Photos/Videos, Audio, Files/docs, Contacts, Calendar, Health/Fitness, Web browsing | **No** | No | N/A | N/A | No code paths or permissions. |

## Google Play Data Safety — after AdMob ships

Expected additions for an AdMob build, subject to Google's current SDK guidance:

| Google data category | Collected? | Shared? | Purpose | Notes |
|---|---:|---:|---|---|
| Device or other IDs | Yes | **Yes** with Google/advertising partners | Advertising/marketing, analytics, fraud prevention | AAID/IDFA or similar identifiers where available. |
| App activity | Yes | Yes | Advertising/marketing, analytics | Ad interactions, ad views, app interactions used for ad measurement. |
| Approximate location | Likely yes | Yes | Advertising/marketing, fraud prevention | Usually inferred from IP. |
| Diagnostics | Possible | Possible | Analytics, crash prevention, fraud/security | Verify SDK behavior. |

Also update the Play Console **Contains ads** flag to **Yes** when any real ad SDK/ad serving is present.
