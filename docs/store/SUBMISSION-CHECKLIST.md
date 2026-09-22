# Store Submission Checklist, LocalPoker

> Legal/compliance review required: this checklist is based on the current codebase and public store-process norms. Apple and Google console wording changes often. Verify every answer in the live consoles before submission.

Primary runbook: `docs/store/APP-STORE-CONNECT.md`.

## 1. Current submission blockers

1. **Ads decision required.** The app is positioned as free with ads, but `AdBanner` is only a static placeholder and no ad SDK is installed. The visible fake ad slot is an App Review rejection risk as placeholder content, separate from the privacy-label issue. For 1.0, either hide ad placeholders and submit as no-ads, or integrate real ads and complete ATT, consent, SKAdNetwork, and privacy disclosures.
2. **Legal URLs are not live yet.** Host `PRIVACY-POLICY.md` and `TERMS.md` through GitHub Pages, then fill the legal placeholders.
3. **Online rooms need production Firebase setup.** Enable Anonymous Authentication, publish `database.rules.json`, add production EAS Firebase env vars, and define room cleanup.
4. **EAS submit values are placeholders.** Replace Apple ID email, App Store Connect app ID, and Apple team ID before running `eas submit`.
5. **Sentry is off by default.** If you want Sentry in the release, add a real DSN, restore real Expo plugin org/project config, and update diagnostics disclosures.
6. **Screenshots are captured but blocked by ad placeholders.** `docs/store/screenshots/` has a real `1320 x 2868` iPhone 6.9-inch set. Do not upload the four screenshots that show `Reserved banner slot` until that placeholder is hidden or replaced by real disclosed ads.

## 2. Identity and build readiness

- App name: **LocalPoker: Poker with Friends**. Count: 30 of 30 characters.
- Bundle/package: `com.localpoker.app` in `app.json`.
- Store-facing app version: `1.0.0` in `app.json`.
- iOS build number: `1`; Android version code: `1` in `app.json`.
- Expo SDK: `~57.0.23` in `package.json`.
- EAS config exists with production build and submit profiles.
- iOS is now phone-only by deliberate product decision: `ios.supportsTablet = false` in `app.json`. The table UI is phone-tuned, so there is no iPad support at launch.
- Export compliance: `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`. Confirm the app uses only standard HTTPS/TLS and no custom non-exempt encryption.
- Sentry is optional. Production EAS does not set a placeholder DSN, and `app.json` has no placeholder Sentry plugin config. If a real DSN is added, update App Privacy for diagnostics.

## 3. Online rooms status

The prior checklist said there was an auth-ID mismatch where `LobbyScreen.tsx` used `profile.id` while rules required `auth.uid`. That specific issue is fixed.

Current code evidence:

- `roomSync.ts` resolves Firebase `auth.uid` with `authedPlayerId()` before create, join, action, presence, host state, and private view writes.
- `database.rules.json` requires room owner, player path, action `playerId`, and private view `playerId` to match `auth.uid`.
- `LobbyScreen.tsx` still constructs a local `RoomPlayer` from `profile.id`, but Firebase writes override the ID with `auth.uid` before database writes.
- `TableScreen.tsx` now uses Firebase online sync for room state, private views, action records, and host-published redacted game state.

Do not submit friend-room claims until the Firebase console steps and EAS production environment variables are done.

## 4. Privacy and data collection summary

Current no-ads, no-Sentry build behavior:

- Local-only storage: age verification flag, local profile ID, display name, Pal/avatar, virtual coins, XP, stats, settings, friends list, cosmetics, login provider label, local email-or-username handle, and saved game snapshots.
- Firebase, when configured: anonymous `auth.uid`, room code, host ID, room status, settings JSON, display name, Pal seed, seat, chips, connected state, action records, redacted public game state, and private player views.
- Giphy CDN: curated GIF thumbnail/full image URLs from `media.giphy.com`; no API key and no search terms.
- Sentry: installed but inactive unless `EXPO_PUBLIC_SENTRY_DSN` is set.
- Ads: no real ad SDK, no IDFA, no ATT, no SKAdNetwork list, and no ad data collection.
- Purchases: no IAP and no real-money gambling.

Use `APP-PRIVACY-LABELS.md` for the full App Privacy and Play Data Safety answer key.

## 5. Age rating guidance

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

## 6. Screenshots and store assets

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

## 7. Conditional real ads checklist

Before shipping a real ad-supported binary:

1. Add an ad SDK, for example `react-native-google-mobile-ads`, and native config through EAS.
2. Add real iOS and Android ad app IDs.
3. Use test ad unit IDs during validation, then production IDs for release.
4. Add Google UMP or equivalent consent flow where required.
5. Add `NSUserTrackingUsageDescription` and an ATT prompt only if tracking/IDFA is actually requested.
6. Add Google's current `SKAdNetworkItems` list or the chosen network's list.
7. Update Privacy Policy, App Privacy labels, Play Data Safety, age-rating Advertising answer, and Play Console **Contains ads**.
8. Re-run App Review screenshots so no placeholder ad slots remain.

## 8. Pre-submit technical checks

- Run `npx tsc --noEmit`.
- Run `npx vitest run` if code changed or before final release.
- Build a production EAS binary.
- Install the production build on a real iPhone.
- Verify:
  - age gate blocks under-18 birth years and invalid years;
  - hosted Terms and Privacy links are live;
  - guest/email local login is not represented as real OAuth;
  - Firebase anonymous auth works and rules are published;
  - online-room writes use `auth.uid`;
  - no placeholder Apple/Google sign-in buttons exist;
  - no real ads appear unless the ad disclosure path is complete;
  - no placeholder ad UI appears in a no-ads submission;
  - Giphy GIFs load and failure states do not break gameplay;
  - screenshots and copy never imply real-money gambling, cash prizes, deposits, withdrawals, or value transfer.
