# Store Submission Checklist, LocalPoker

> Legal/compliance review required: this checklist is based on the current codebase and public store-process norms. Apple and Google console wording changes often. Verify every answer in the live consoles before submission.

Primary runbook: `docs/store/APP-STORE-CONNECT.md`.

## 1. Current submission blockers

1. **Ads decision required.** The app is positioned as free with ads, but `AdBanner` is only a static placeholder and no ad SDK is installed. The visible fake ad slot is an App Review rejection risk as placeholder content, separate from the privacy-label issue. For 1.0, either hide ad placeholders and submit as no-ads, or integrate real ads and complete ATT, consent, SKAdNetwork, and privacy disclosures. **Currently resolved by omission:** `EXPO_PUBLIC_ADS_ENABLED` is unset, so `ADS_ENABLED` is false and every ad slot renders nothing. Build 9 ships with no ad UI at all.
2. **Done: legal pages are published and wired into App Store Connect.** No placeholder markers remain, so the Legal Pages workflow builds and deploys. All four URLs return 200:
   - <https://mikedafi.github.io/localpoker/>
   - <https://mikedafi.github.io/localpoker/privacy/>
   - <https://mikedafi.github.io/localpoker/terms/>
   - <https://mikedafi.github.io/localpoker/support/>

   The privacy, support, and marketing URLs are set on the App Store Connect record over the API. The jurisdiction, entity and venue questions in section 2 are deliberately answered by *not* naming a jurisdiction: the Terms defer to the consumer law of wherever the player lives, which is a defensible position for a solo developer with no legal entity, and avoids asserting facts nobody has decided yet. Revisit if an entity is formed.
3. **App Privacy questionnaire still has to be answered by hand.** Apple exposes no public API for the privacy nutrition label, so this one genuinely needs the App Store Connect web UI. Use the answer sheet in `docs/store/APP-PRIVACY-LABELS.md`; note that **Contact Info > Email Address is now Yes, linked to the user**, because Google sign-in makes Firebase Authentication store the account email.
4. **Done: online rooms are configured.** Anonymous and Google authentication are enabled, `database.rules.json` is published and verified against the live instance, and the `EXPO_PUBLIC_*` repository secrets are set so EAS builds are configured. Build 8 predates all of this and is silently offline; build 9 is the first working one. Room cleanup is still undefined.
5. **EAS submit values are not committed.** `eas.json` has no placeholder submit values. Follow `EAS-SUBMIT.md` to supply Apple, ASC, team, and Google Play credentials without committing secrets or fake IDs.
6. **Sentry is off by default.** If you want Sentry in the release, add a real DSN, restore real Expo plugin org/project config, and update diagnostics disclosures.
7. **Screenshots need recapturing.** `docs/store/screenshots/` has a real `1320 x 2868` iPhone 6.9-inch set, but four of them show `Reserved banner slot` and the login shot shows the removed email form. Recapture from build 9, where the ad slots render nothing and the login screen offers Google and Guest.
8. **Google is the only third-party login, deliberately.** App Review guideline 4.8 (Login Services) requires an equivalent privacy-respecting option alongside a third-party login. The decision here is to ship Google plus Guest and not add Sign in with Apple.

   The argument for that reading: 4.8's requirement is that the alternative limit data collection to name and email, let the user keep the email private, and not collect interactions for advertising. **Play as Guest** does better than all three, because it collects no name, no email and no advertising data at all, and it is offered with equal prominence on the same screen.

   The risk is real, though, because Apple has historically read 4.8 as being about *account* options rather than about playing without one. If a reviewer rejects on 4.8, the fix is Sign in with Apple:
   - add `expo-apple-authentication` and request the `FULL_NAME` and `EMAIL` scopes with a SHA-256 nonce;
   - in the Apple Developer portal, enable the Sign in with Apple capability, then create a Services ID and a key for it;
   - enable the Apple provider in Firebase Authentication and paste in the Services ID, Team ID, Key ID and key;
   - sign in through `OAuthProvider('apple.com')` and reuse the link-then-fall-back path in `googleAuth.ts`, so an anonymous guest keeps their uid.

   None of that blocks TestFlight, which does not go through App Review for internal testers.

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
