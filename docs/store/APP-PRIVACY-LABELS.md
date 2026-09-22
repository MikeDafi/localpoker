# App Privacy Labels and Google Play Data Safety, LocalPoker

> Legal review required: this is a code-traced disclosure draft, not legal advice. Store-console answers must match the exact binary, environment variables, SDK configuration, and vendor disclosures submitted.

## Scope and current code evidence

Reviewed evidence:

- Age gate and legal modal copy: `src/screens/AgeGateScreen.tsx`.
- Local persistence: `src/state/AppContext.tsx`, `src/screens/StoreScreen.tsx`.
- Firebase config, anonymous auth, room sync, and rules: `src/services/firebase/config.ts`, `auth.ts`, `roomSync.ts`, `types.ts`, `database.rules.json`.
- Friends lobby using Firebase identities: `src/screens/LobbyScreen.tsx`.
- Online table sync: `src/screens/TableScreen.tsx`, `src/game/onlineSync.ts`.
- Telemetry: `src/services/telemetry.ts`, `App.tsx`, `src/components/ErrorBoundary.tsx`, `src/services/sound.ts`.
- GIF CDN usage: `src/services/gifs.ts`, `src/components/EmoteBar.tsx`, `src/components/Seat.tsx`.
- Ads placeholder: `src/components/AdBanner.tsx`.
- Store config: `app.json`, `eas.json`, `package.json`.

Key current-state findings:

- Real ads are **not** integrated. There is no `react-native-google-mobile-ads` dependency, no AdMob app ID, no ATT string, and no `SKAdNetworkItems` list. `AdBanner` is a static placeholder.
- Sentry is installed and the app calls `initTelemetry()`, but telemetry is disabled unless `EXPO_PUBLIC_SENTRY_DSN` is set. Production `eas.json` does not set a placeholder DSN.
- Firebase is optional at runtime. If `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, and `EXPO_PUBLIC_FIREBASE_PROJECT_ID` are present, the app initializes Firebase, signs in anonymously, and can sync private room data.
- The old auth-ID mismatch is fixed. `roomSync.ts` resolves `auth.uid` internally for create, join, actions, presence, host game state, and private views. `LobbyScreen.tsx` still builds a local `profile.id` for offline display, but Firebase writes are rewritten to `auth.uid` before reaching the database.
- Online gameplay sync is now partially wired into `TableScreen.tsx`: hosts publish redacted public game state and private hole-card views, and players push action records. Emote messages and GIF reactions are local only today.
- Giphy GIFs load from public CDN URLs. The app does not use a Giphy API key and does not send search terms to Giphy.

## Apple App Privacy, recommended current 1.0 answers

Assumption for this answer sheet: Firebase online rooms are enabled for the submitted binary, real ads are not shipped, and no real Sentry DSN is set.

Recommended **Tracking** answer: **No**. The current 1.0 path has no IDFA access, no ATT prompt, no advertising SDK, no data broker integration, and no cross-app tracking code.

| Apple data type | Collected today? | Linked to user? | Used for tracking? | Purpose | Code evidence and notes |
|---|---:|---:|---:|---|---|
| Contact Info, Email Address | **No** | No | No | N/A | `LoginScreen.tsx` accepts an email-or-username string, but `AppContext.login()` persists it only to AsyncStorage as `@pokerpals/auth`. No Firebase write path sends it. |
| Contact Info, Name | **No, if display names are treated as screen names** | N/A | No | N/A | The app uses nicknames/display names, not legal first or last names. Disclose screen names under User ID and Gameplay Content. If counsel treats nicknames as Name, change this to Yes, linked, App Functionality. |
| Identifiers, User ID | **Yes, when Firebase is enabled** | **Yes** | No | App Functionality, security | Firebase anonymous `auth.uid`; room `hostId`; `players/$uid`; action `playerId`; private view `playerId`; display name as a screen name. |
| Identifiers, Device ID | **No for current no-ads, no-Sentry binary** | No | No | N/A | No advertising ID access, no AdMob SDK, no ATT prompt. Re-evaluate if Sentry vendor guidance or another SDK requires Device ID disclosure. |
| User Content, Gameplay Content | **Yes, when Firebase rooms are used** | **Yes** | No | App Functionality | Room code, settings JSON, room status, players, connected state, chip counts, public game state, redacted player metadata, action records, and private hole-card views. |
| User Content, Other User Content | **No for current networked behavior** | No | No | N/A | Custom text reactions, emojis, stickers, and GIF choices are local table UI today and are not pushed to Firebase. Change this if reactions become networked. |
| Usage Data, Product Interaction | **No analytics today** | No | No | N/A | Stats, settings, cosmetics, coins, local saved games, and local hand history stay in AsyncStorage. Firebase gameplay data is disclosed as Gameplay Content, not analytics. |
| Diagnostics, Crash Data or Other Diagnostic Data | **No unless Sentry DSN is set** | No | No | N/A | `telemetry.ts` no-ops without `EXPO_PUBLIC_SENTRY_DSN`. If a real DSN is set, disclose crash and diagnostic data according to Sentry's current privacy manifest and your Sentry settings. |
| Location, Precise or Coarse | **No from app code** | No | No | N/A | No location APIs. Firebase, Giphy, and Sentry if enabled receive ordinary network requests. If a vendor uses IP-derived location and requires disclosure, update. |
| Purchases or Financial Info | **No** | No | No | N/A | No IAP dependency, no StoreKit products, no real-money gambling, and no purchases. Virtual coins are local play-money state. |
| Contacts, Photos or Videos, Audio, Files, Health, Fitness, Sensitive Info, Browsing History, Search History | **No** | No | No | N/A | No code paths or permissions for these categories. `expo-audio` is configured with microphone and recording disabled. |
| Other Data Types, Giphy CDN request metadata | **Conservative Yes** | Not linked by LocalPoker | No | App Functionality | `gifs.ts` builds `https://media.giphy.com/...` URLs and React Native `Image` loads them. Giphy/CDN may receive IP address, user agent, and requested GIF URL. LocalPoker sends no account ID, API key, or search terms. Legal may decide this is optional if it is only transient CDN delivery. |

### Apple notes for the current submission

- Do not say the app collects email addresses unless the submitted binary sends the email-or-username off-device.
- Do not answer Yes to tracking, IDFA, or advertising data for the current placeholder-ad build.
- Do disclose Firebase user IDs and gameplay content if online rooms are enabled.
- If Sentry is enabled with a real DSN, add diagnostics before submission.
- If Firebase is not configured for production, either narrow the privacy label or do not advertise online rooms.

## Apple App Privacy, if Sentry is enabled

If you set `EXPO_PUBLIC_SENTRY_DSN` for the submitted build, update the label before submission. Expected additions, subject to Sentry's current Apple privacy manifest and your configuration:

| Apple data type | Collected after Sentry is enabled? | Linked to user? | Used for tracking? | Purpose | Notes |
|---|---:|---:|---:|---|---|
| Diagnostics, Crash Data | **Yes** | Usually not linked unless you add user context | No | App Functionality | ErrorBoundary, startup, storage, sound, and Firebase error capture can send exceptions. |
| Diagnostics, Other Diagnostic Data | **Likely yes** | Usually not linked unless configured | No | App Functionality | May include stack traces, OS/app/device context, breadcrumbs, and event metadata. |
| Identifiers, Device ID | **Verify with Sentry vendor guidance** | Verify | No | App Functionality | Do not guess. Use Sentry's current SDK privacy manifest for the exact answer. |

The code sets `sendDefaultPii: false` and `tracesSampleRate: 0`, so it is not configured for product analytics or performance tracing today.

## Apple App Privacy, after real ads ship

Do not use this section until a real ad SDK is in the binary.

Expected additions for an AdMob-style build, subject to Google's current SDK guidance and your consent configuration:

| Apple data type | Collected after ads? | Linked to user? | Used for tracking? | Purpose | Notes |
|---|---:|---:|---:|---|---|
| Identifiers, Device ID | **Yes** | Likely yes | Yes if personalized ads, IDFA, or cross-app measurement is enabled | Third-Party Advertising, Analytics, fraud prevention | Requires ATT before IDFA access. |
| Usage Data, Advertising Data | **Yes** | Likely yes | Yes if used across apps or sites | Third-Party Advertising, Analytics | Ad impressions, clicks, ad requests, frequency, and measurement. |
| Usage Data, Product Interaction | **Likely yes** | Likely yes | Possible | Third-Party Advertising, Analytics | Ad SDKs often collect app interaction signals for ads and measurement. |
| Location, Coarse Location | **Likely yes** | Likely yes | Possible | Third-Party Advertising, fraud prevention | Often inferred from IP. Verify with vendor docs. |
| Diagnostics | **Possible** | Possible | No or possible depending on SDK use | App Functionality, Analytics | Verify with vendor docs. |

Required before any real ad-supported submission:

- Add the ad SDK and native config through an EAS development or production build.
- Add real iOS and Android app IDs.
- Add `NSUserTrackingUsageDescription` only if tracking or IDFA access is actually requested.
- Add ATT prompt timing only if tracking is requested.
- Add Google's current `SKAdNetworkItems` list or the list required by the chosen ad network.
- Add Google UMP or equivalent consent flow for EEA, UK, and other required regions.
- Update Privacy Policy, App Privacy labels, Play Data Safety, and store age-rating Advertising answer.

## Google Play Data Safety, recommended current 1.0 answers

Assumption: Firebase online rooms are enabled, no real ads, no Sentry DSN.

Recommended high-level answers:

- **Does the app collect user data?** Yes, when online rooms are enabled.
- **Is all collected data encrypted in transit?** Yes for Firebase and HTTPS CDN traffic, assuming standard SDK/CDN transport.
- **Can users request deletion?** Yes via the privacy contact. Add an in-app deletion flow later if accounts become persistent.
- **Does the app share user data?** Firebase processing may be service-provider processing. Giphy/CDN receives request metadata. Real ad sharing does not apply until ads ship. Confirm final Play Console interpretation with counsel.

| Google data category | Collected today? | Shared? | Required or optional? | Purpose | Code evidence and notes |
|---|---:|---:|---|---|---|
| Personal info, Name | **Yes for display name in online rooms** | Service-provider processing through Firebase | Optional for local play, required for named online presence | App functionality | `profile.name` is stored locally and written as `RoomPlayer.name` when joining a room. It is a nickname, not a verified legal name. |
| Personal info, Email address | **No** | No | N/A | N/A | Email-or-username stays local in AsyncStorage. |
| User IDs | **Yes** | Service-provider processing through Firebase | Required for online rooms | App functionality, security | Firebase anonymous `auth.uid`, room `hostId`, player paths, action IDs, and private views. |
| App activity, App interactions or other actions | **Yes, for online gameplay** | Service-provider processing through Firebase | Required for online rooms | App functionality | Room creation/join, presence, action records, public game state, and private views. |
| Device or other IDs | **No for current no-ads, no-Sentry binary** | No | N/A | N/A | No ad SDK. Re-evaluate Sentry or any future SDK. |
| Approximate location | **No from app code** | No | N/A | N/A | No location APIs. Network services may process IP for delivery/security. |
| Diagnostics | **No unless Sentry DSN is set** | No unless Sentry enabled | N/A | N/A | Telemetry no-ops without DSN. |
| Financial info, Purchases | **No** | No | N/A | N/A | No IAP, no real-money gambling, virtual coins only. |
| Photos/Videos, Audio, Files, Contacts, Calendar, Health/Fitness, Web browsing | **No** | No | N/A | N/A | No code paths or permissions. |

## Google Play Data Safety, after Sentry or ads ship

- If Sentry is enabled, add diagnostics according to Sentry's current Google Play Data Safety guidance.
- If real ads ship, mark **Contains ads** Yes and add data categories required by the ad SDK, commonly Device or other IDs, App activity, Advertising ID or device IDs, Approximate location, diagnostics, sharing with Google/advertising partners, and Advertising/marketing purpose.
