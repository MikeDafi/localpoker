# Store Submission Checklist, LocalPoker

> Legal/compliance review required: this checklist is based on the current codebase and public store-process norms. Apple and Google console wording changes often. Verify every answer in the live consoles before submission.

Primary runbook: `docs/store/APP-STORE-CONNECT.md`.

## 1. Current submission blockers

Audited against the live App Store Connect record, not just the code. Several fields were silently unset and have been filled in over the API; what remains is listed after them.

**Closed during the audit:**

1. **Age rating was never declared, and a poker app cannot ship without one.** Every field was null, which blocks submission outright and, if guessed wrong later, gets the app pulled. Declared as simulated gambling (frequent, because poker *is* the app), real gambling false, user generated content true, messaging false (reactions are a fixed curated set, there is no free text chat), advertising false. Apple computed **17+**. The in-app gate stays 18+, stricter than the store rating on purpose.
2. **Categories were unset.** Now Games, with Card and Casino subcategories.
3. **App Review had no notes, and the app opens on a sign-in screen.** A reviewer who cannot get in rejects under 2.1. The notes now state that no sign-in is needed, that "Play as Guest" gives full access, that the age gate wants a birth year such as 1990, and that there is no real-money anything. `demoAccountRequired` is false because Guest needs no credentials.
4. **Copyright was unset.** Now set.
5. **Legal pages are published and wired in.** All four URLs return 200, and the privacy, support and marketing URLs are on the record.
6. **Listing copy is in.** Subtitle, promotional text, keywords and description are set on the 1.0.0 record. What's New cannot be set on a first release, only on an update.
7. **Online rooms are configured.** Anonymous and Google auth enabled, `database.rules.json` published and verified against the live instance, `EXPO_PUBLIC_*` repository secrets set so EAS builds are not silently offline.
8. **Ad placeholders no longer render.** `EXPO_PUBLIC_ADS_ENABLED` is unset, so `ADS_ENABLED` is false and every slot renders nothing, which removes the 2.1 placeholder-content risk without shipping an ad SDK.

**Still open:**

9. **There are zero screenshots uploaded.** The record has no screenshot sets at all, so submission is impossible. The local set in `docs/store/screenshots/` is stale too: it predates the login rework, shows the removed email form, and four shots show the `Reserved banner slot` placeholder. Needs a human tapping through the app.
10. **App Privacy questionnaire is unanswered.** Apple exposes no public API for the nutrition label, so it needs the web UI. Use `docs/store/APP-PRIVACY-LABELS.md`; the answer that changed is **Contact Info > Email Address: Yes, linked to the user**, because Google sign-in makes Firebase Authentication store the account email.
11. **Giphy reaction GIFs are third-party content with no attribution.** `src/services/gifs.ts` hotlinks `media.giphy.com` with no API key, and nothing in the UI carries a "Powered by GIPHY" mark. Giphy's terms require attribution wherever their content is displayed, which makes this an intellectual property exposure under guideline 5.2 as well as a Giphy terms problem. `contentRightsDeclaration` is also unset and has to say the app contains third-party content. Either add the attribution mark to the emote sheet, or replace the pack with owned artwork.
12. **Google is the only third-party login, deliberately.** Guideline 4.8 wants an equivalent privacy-respecting option alongside a third-party login.

    The argument for shipping as is: 4.8 asks that the alternative limit data collection to name and email, let the user keep the email private, and not collect interactions for advertising. **Play as Guest** does better than all three, collecting no name, no email and no advertising data, and sits with equal prominence on the same screen.

    The risk is real, because Apple has historically read 4.8 as being about *account* options rather than about playing without one. If a reviewer rejects on 4.8, the fix is Sign in with Apple:
    - add `expo-apple-authentication` and request the `FULL_NAME` and `EMAIL` scopes with a SHA-256 nonce;
    - in the Apple Developer portal, enable the Sign in with Apple capability, then create a Services ID and a key for it;
    - enable the Apple provider in Firebase Authentication and paste in the Services ID, Team ID, Key ID and key;
    - sign in through `OAuthProvider('apple.com')` and reuse the link-then-fall-back path in `googleAuth.ts`, so an anonymous guest keeps their uid.
13. **EAS submit values are not committed.** `eas.json` carries no submit credentials. Follow `EAS-SUBMIT.md`.
14. **Sentry is off, so production has no error reporting.** `EXPO_PUBLIC_SENTRY_DSN` is blank, so every `captureError` call reports nowhere. Either set a real DSN and disclose diagnostics in App Privacy, or accept flying blind on 1.0.

**Checked and already compliant:**

- **5.1.1(v) account deletion.** In-app at Settings > Delete account; removes the Firebase user, the directory entry, the handle claim and room presence.
- **1.2 user generated content.** Report and block are available from both the Friends screen and a live table, a blocked player's name is masked at the table, names pass a moderation filter (15 call sites), and the reaction set is curated rather than an open Giphy search.
- **3.1.1 in-app purchase.** The Store spends only coins earned by playing. No StoreKit, no purchasable currency, so no IAP obligation and nothing to route through Apple.
- **Export compliance.** `ITSAppUsesNonExemptEncryption = false`, and the app uses only standard TLS.

## 2. Human-owned legal fields, and how they were resolved

The site build intentionally fails while any `[PLACEHOLDER: ...]` or similar marker remains. None remain, so the Legal Pages workflow deploys. The support, privacy, and Terms contact email is `maskndafi@gmail.com`, which is a reasonable published developer contact for a solo indie app. If LocalPoker grows, a dedicated support alias is the usual next step.

The jurisdiction and entity questions were resolved by **not** answering them. LocalPoker is published by an individual with no legal entity, so there is no company name, registered address, EU/UK representative or DPO to name, and inventing any of them would be worse than omitting them. The Terms therefore defer to the consumer law of wherever the player lives rather than asserting a governing law and venue, and the Privacy Policy describes vendor transfer safeguards rather than claiming a transfer mechanism of its own. For a free, play-money, no-purchase app that collects an email address only through Google sign-in, that is a defensible position.

Revisit all of it if any of these change:

- an entity is formed, or the app starts taking money;
- the app ships real ads, which adds an advertising-data relationship and usually a consent vendor;
- the user base grows enough that a GDPR representative is genuinely required.

The Markdown files are:

- `docs/store/SUPPORT.md`
- `docs/store/PRIVACY-POLICY.md`
- `docs/store/TERMS.md`

Published at:

| Page | URL |
|---|---|
| Landing | <https://mikedafi.github.io/localpoker/> |
| Privacy Policy | <https://mikedafi.github.io/localpoker/privacy/> |
| Terms | <https://mikedafi.github.io/localpoker/terms/> |
| Support | <https://mikedafi.github.io/localpoker/support/> |

All three are already set on the App Store Connect record: privacy policy on the app info localization, support and marketing URLs on the 1.0 version localization.

## 3. Identity and build readiness

- App name: **LocalPoker: Poker with Friends**. Count: 30 of 30 characters.
- Bundle/package: `com.mike0264.localpoker` in `app.json`.
- Store-facing app version: `1.0.0` in `app.json`.
- iOS build number: `app.json` says `1`, but EAS owns the real number (`appVersionSource: remote` with `autoIncrement`), so it is ignored for iOS. TestFlight is on build **9**. Android version code is `1` in `app.json`.
- Expo SDK: `~57.0.23` in `package.json`.
- EAS config exists with an explicit store production build profile and submit profiles that contain only safe metadata.
- iOS is now phone-only by deliberate product decision: `ios.supportsTablet = false` in `app.json`. The table UI is phone-tuned, so there is no iPad support at launch.
- Export compliance: `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`. Confirm the app uses only standard HTTPS/TLS and no custom non-exempt encryption.
- Sentry is optional. Production EAS does not set a placeholder DSN, and `app.json` has no placeholder Sentry plugin config. If a real DSN is added, update App Privacy for diagnostics.

## 4. Online rooms status

The prior checklist said there was an auth-ID mismatch where `LobbyScreen.tsx` used `profile.id` while rules required `auth.uid`. That specific issue is fixed.

Current code evidence:

- `roomSync.ts` resolves Firebase `auth.uid` with `authedPlayerId()` before create, join, action, presence, host state, and private view writes.
- `database.rules.json` requires room owner, player path, action `playerId`, and private view `playerId` to match `auth.uid`.
- `LobbyScreen.tsx` still constructs a local `RoomPlayer` from `profile.id`, but Firebase writes override the ID with `auth.uid` before database writes.
- `TableScreen.tsx` now uses Firebase online sync for room state, private views, action records, and host-published redacted game state.

Do not submit friend-room claims until the Firebase console steps and EAS production environment variables are done.

## 5. Privacy and data collection summary

Current no-ads, no-Sentry build behavior:

- Local-only storage: age verification flag, local profile ID, display name, Pal/avatar, virtual coins, XP, stats, settings, friends list, cosmetics, login provider label, claimed handle, and saved game snapshots.
- Firebase, when configured: `auth.uid` (anonymous for guests, tied to the Google account after sign-in), room code, host ID, room status, settings JSON, display name, Pal seed, seat, chips, connected state, action records, redacted public game state, and private player views.
- Firebase Authentication, when a player signs in with Google: the Google account's email address and display name, held against the `uid`. The app never writes the address to the database; it only derives a handle suggestion from it.
- Giphy CDN: curated GIF thumbnail/full image URLs from `media.giphy.com`; no API key and no search terms.
- Sentry: installed but inactive unless `EXPO_PUBLIC_SENTRY_DSN` is set.
- Ads: no real ad SDK, no IDFA, no ATT, no SKAdNetwork list, and no ad data collection.
- Purchases: no IAP and no real-money gambling.

Use `APP-PRIVACY-LABELS.md` for the full App Privacy and Play Data Safety answer key.

## 6. Age rating guidance

Use the literal answer sheet in `APP-STORE-CONNECT.md`.

High-confidence answers for the current concept:

- Simulated Gambling: **Frequent/Intense**.
- Real-money Gambling: **No**.
- Contests with prizes: **No**.
- In-App Purchases: **No**.
- Advertising: **No** for the placeholder build, **Yes** only after real ads ship.
- Unrestricted Web Access: **No**.
- Messaging and Chat: **No** for current networked behavior. Re-answer if text/GIF reactions are synced between users later.
- User-Generated Content: **No** for current networked behavior. Re-answer if public or broadly distributed UGC is added.
- Kids category: **No**. Keep adults-only 18+ positioning.

Expected Apple result: likely 17+ because simulated gambling is frequent. Keep the in-app 18+ gate.

## 7. Screenshots and store assets

Apple current phone-only requirement, checked 2026-09-21:

- Upload 1 to 10 screenshots per required display size and localization.
- For iPhone apps, provide 6.9-inch screenshots at `1260 x 2736`, `1290 x 2796`, or `1320 x 2868` portrait. If those are provided, App Store Connect scales smaller iPhone sizes.
- 6.5-inch screenshots, `1284 x 2778` or `1242 x 2688`, are required only if 6.9-inch screenshots are not provided.
- Use PNG, JPG, or JPEG, RGB, no alpha channel or transparency.
- Since `ios.supportsTablet` is false by launch decision, iPad screenshots should not be required and LocalPoker should not claim iPad support. If tablet support is re-enabled, prepare 13-inch iPad screenshots too.

Shot list:

1. Home screen.
2. Difficulty/table setup.
3. Table mid-hand.
4. Peeled hole cards.
5. Showdown or hand result.
6. Stats.
7. Friends lobby, only after online rooms are production-ready.
8. Pal customization or Store.

Do not show placeholder ads in final screenshots. Apple's placeholder-content review risk applies even before considering ad privacy. Upload screenshots only after the placeholder slot is hidden or after real ads are integrated and disclosed.

## 8. Conditional real ads checklist

Before shipping a real ad-supported binary:

1. Add an ad SDK, for example `react-native-google-mobile-ads`, and native config through EAS.
2. Add real iOS and Android ad app IDs.
3. Use test ad unit IDs during validation, then production IDs for release.
4. Add Google UMP or equivalent consent flow where required.
5. Add `NSUserTrackingUsageDescription` and an ATT prompt only if tracking/IDFA is actually requested.
6. Add Google's current `SKAdNetworkItems` list or the chosen network's list.
7. Update Privacy Policy, App Privacy labels, Play Data Safety, age-rating Advertising answer, and Play Console **Contains ads**.
8. Re-run App Review screenshots so no placeholder ad slots remain.

## 9. Pre-submit technical checks

- Run `npx tsc --noEmit`.
- Run `npx vitest run` if code changed or before final release.
- Run `npm run test:rules` with Java installed so Firebase Realtime Database rules protect hole-card confidentiality.
- Build a production EAS binary.
- Install the production build on a real iPhone.
- Verify:
  - age gate blocks under-18 birth years and invalid years;
  - hosted Terms and Privacy links are live;
  - Google sign-in completes on a real device and survives deleting and reinstalling the app;
  - signing in with Google while playing as a guest keeps the same handle, friends and stats;
  - Firebase anonymous auth works and rules are published;
  - online-room writes use `auth.uid`;
  - every sign-in button on the login screen actually works, no placeholders;
  - no real ads appear unless the ad disclosure path is complete;
  - no placeholder ad UI appears in a no-ads submission;
  - Giphy GIFs load and failure states do not break gameplay;
  - screenshots and copy never imply real-money gambling, cash prizes, deposits, withdrawals, or value transfer.
