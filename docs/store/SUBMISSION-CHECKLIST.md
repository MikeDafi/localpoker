# Store Submission Checklist — LocalPoker

> **Legal/compliance review required:** This checklist is based on the current codebase and public store-process norms. Apple/Google console wording changes often; verify every answer in the live consoles before submission.

## 1. Identity and build readiness

- App name: **LocalPoker: Poker with Friends**.
- Bundle/package: `com.localpoker.app` (`app.json`).
- Store-facing app version: `1.0.0` (`app.json`).
- iOS build number: `1`; Android version code: `1` (`app.json`).
- EAS config exists (`eas.json`) with production build/submit placeholders.
- Export compliance: current `app.json` sets `ios.infoPlist.ITSAppUsesNonExemptEncryption = false`. Confirm the app uses only standard HTTPS/TLS and no non-exempt custom encryption.
- Do not submit until Firebase console setup below is complete or online-room UI is hidden/disabled.

## 2. Human-only console and hosting steps

- Host final legal URLs:
  - Privacy Policy URL: `[PLACEHOLDER: https://.../privacy]`
  - Terms URL: `[PLACEHOLDER: https://.../terms]`
  - Support URL: `[PLACEHOLDER: https://.../support]`
- Replace in-app placeholder legal modal copy or ensure it links to/summarizes the final hosted policy and terms.
- Firebase console:
  - Enable **Anonymous** sign-in provider.
  - Publish the current `database.rules.json`.
  - Fix the current auth-ID mismatch before relying on online rooms: `LobbyScreen.tsx` uses `profile.id`, while rules require `auth.uid`.
  - Add a room cleanup/retention process before production.
- App Store Connect:
  - Create app record with bundle id `com.localpoker.app`.
  - Add privacy policy URL, support URL, marketing URL if any.
  - Complete App Privacy answers from `docs/store/APP-PRIVACY-LABELS.md`.
  - Complete age rating questionnaire as below.
- Google Play Console:
  - Create app with package `com.localpoker.app`.
  - Complete Data Safety from `docs/store/APP-PRIVACY-LABELS.md`.
  - Complete IARC/content rating as below.
  - Complete Target audience and content; choose adults only / 18+ positioning.

## 3. Age rating questionnaire guidance

### Apple App Store Connect

Recommended answers for the current LocalPoker concept:

- **Simulated Gambling:** **Frequent/Intense**. Poker with play-money chips is the core gameplay loop, not incidental content.
- **Gambling:** **No**. The app has no real-money wagering, no deposits, no withdrawals, no cash prizes, and no items of real-world value.
- **Contests:** **No** unless tournaments with prizes/rankings are added later.
- **In-App Purchases:** **No today**. No IAP code/config is present. If chip packs, remove-ads, subscriptions, or cosmetics for money are added, update this.
- **Unrestricted Web Access:** **No**. The app loads curated Giphy CDN images but does not provide a browser or arbitrary web access.
- **User Generated Content / Messaging:** Treat as **No for networked UGC today** if submitting the current bot/local gameplay and lobby-only build. If custom text emotes/display names are synced between real users, answer according to Apple's UGC/messaging questions and add moderation, reporting, blocking, and safety controls.
- Other content categories (violence, sexual content, drugs, profanity, medical, horror): **None** unless store screenshots/copy introduce such content.

Reasoning: Apple distinguishes simulated gambling from real gambling. LocalPoker is a poker game with virtual chips, so simulated gambling must be disclosed even though the Terms/Privacy and age gate correctly say there is no real-money gambling.

Expected result: likely a high age rating (often 17+) because simulated gambling is frequent/intense. Keep the app's own 18+ gate and listing copy consistent with that.

### Google Play / IARC

Recommended answers:

- Game category: card/casino-style game / poker.
- **Simulated gambling:** **Yes**. Users play Texas Hold'em with virtual chips.
- **Real-money gambling / gambling for prizes of value:** **No**.
- **Can users win cash, prizes, or anything redeemable/transferable for value?** **No**.
- **In-app purchases:** **No today**; update if monetization is added.
- **Ads:** **No today** for the placeholder-only build. Mark **Yes** once AdMob or any real ad serving is integrated.
- **User interaction / UGC:** answer based on the submitted binary. Current friend lobby shows display names/presence; full chat/multiplayer UGC is not production-ready. If network text/emotes ship, add moderation/report/block flows and disclose UGC.
- Target audience: Adults / 18+ only.

Reasoning: Google/IARC also treats play-money poker as simulated gambling even without real-money gambling. Ratings vary by region; the app's own 18+ gate should remain.

## 4. Screenshots and store assets

### Apple

- Screenshots: upload **1–10 screenshots per required device display** and localization in App Store Connect.
- Because `ios.supportsTablet` is `true`, prepare both iPhone and iPad screenshot sets.
- Practical portrait set to prepare first (confirm the exact slots shown in App Store Connect, because Apple updates device classes):
  - iPhone large display: 6.9-inch class (commonly 1320×2868 portrait) and/or the 6.7/6.5-inch class requested by ASC (for example 1290×2796, 1284×2778, or 1242×2688 portrait).
  - iPhone 5.5-inch fallback if ASC requests it: 1242×2208 portrait.
  - iPad because `supportsTablet` is enabled: 13-inch iPad Pro class (commonly 2064×2752 portrait) and/or 12.9-inch class (2048×2732 portrait).
- Use PNG/JPEG, RGB, no alpha; generate directly from simulators/devices where possible instead of upscaling marketing art.
- Recommended screenshot sequence:
  1. Age gate / play-money 18+ messaging.
  2. Home lobby channel grid.
  3. Poker table with play-money chips.
  4. Friends room/lobby (only if the submitted build works with Firebase rules).
  5. Pal/avatar customization.
  6. Stats/profile.
- Avoid showing real ads until AdMob is actually integrated. Placeholder ad slots are acceptable only if they match the submitted UI and do not imply a real advertiser.

### Google Play

- Phone screenshots: at least **2**, up to **8**.
- Recommended: also provide tablet screenshots (7-inch and 10-inch categories) if distributing to tablets.
- Common Play asset constraints: PNG or JPEG, 320–3840 px per side, max 2:1 aspect ratio, no transparent background for many graphic assets. Verify in the Play Console.
- Feature graphic: prepare 1024×500 px.
- App icon: 512×512 px Play icon, matching the production icon.

## 5. Store listing copy draft

### App name

LocalPoker: Poker with Friends

### Apple subtitle (30 characters max)

Play-money Texas Hold'em

### Apple promotional text

Friendly play-money poker with custom Pals, smart bots, private room codes, and zero real-money gambling.

### Short description / tagline

Play free Texas Hold'em with friends or bots. Play-money only. 18+.

### Full description draft

LocalPoker is a friendly play-money Texas Hold'em table built for quick games at home or on the go.

Create a Pal, sit down with free virtual chips, and play against difficulty-tuned bots while private friend-room play is being built out. LocalPoker is designed for casual poker fans who want the cards, chips, reactions, and table atmosphere without real-money gambling.

Features:

- Free play-money Texas Hold'em.
- No deposits, withdrawals, cash prizes, or real-world value.
- Blocking 18+ age gate.
- Custom Pal avatars and cosmetics earned with virtual coins.
- Smart bot opponents using real poker equity calculations.
- Stats, settings, saved games, and quick reactions.
- Private room-code lobby scaffold for friends.

LocalPoker is for entertainment only. Virtual coins have no monetary value and cannot be redeemed, sold, or transferred for value.

### Keywords draft (Apple, keep under 100 characters)

poker,texas holdem,holdem,cards,friends,play money,table,bots,casino

## 6. Pre-submit technical checks

- Run `npx tsc --noEmit`.
- Run `npm test -- --reporter=dot`.
- Build a production EAS binary for each platform.
- Install the production build on real devices.
- Verify:
  - age gate blocks under-18 birth years and invalid years;
  - Terms/Privacy links/copy match hosted docs;
  - guest/email local login is not represented as real OAuth;
  - Firebase anonymous auth works, rules are published, and online-room writes use `auth.uid`;
  - no placeholder Apple/Google sign-in buttons exist;
  - no real ads appear unless AdMob/consent/ATT are fully implemented;
  - Giphy GIFs load and failure states do not break gameplay;
  - no hidden real-money/IAP copy appears in screenshots or listings.

## 7. Conditional AdMob checklist

Before shipping a real ad-supported binary:

- Add `react-native-google-mobile-ads` and native config through EAS/dev build.
- Add real iOS and Android AdMob app IDs.
- Add ATT purpose string and prompt only when tracking/IDFA is actually requested.
- Add Google UMP consent flow for GDPR/UK/EU and other required regions.
- Update Privacy Policy, Apple App Privacy labels, Google Data Safety, and Google Play **Contains ads**.
- Test with test ad unit IDs first; never ship test IDs in production.
