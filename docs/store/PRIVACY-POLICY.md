# LocalPoker Privacy Policy Draft

**App:** LocalPoker: Poker with Friends (`com.mike0264.localpoker`)  
**Effective date:** September 22, 2026  
**Publisher:** LocalPoker  
**Contact:** maskndafi@gmail.com  

> Legal review required: this is a product-specific draft prepared from the current codebase. It is not legal advice and must be reviewed by a qualified privacy/legal professional before publication.

## 1. What LocalPoker is

LocalPoker is a free, play-money Texas Hold'em game for adults 18 and older. The app does **not** offer real-money gambling, cash prizes, withdrawals, wagering for anything of real-world value, or real-money purchases in the current build.

The current app includes local play against bots and Firebase-backed private room infrastructure using Firebase Realtime Database and anonymous Firebase Authentication when production Firebase configuration is provided. Real AdMob ads are **not** integrated yet. Current ad placements are visual placeholders only.

## 2. Age gate and children

LocalPoker is intended only for adults **18+**. The app blocks access until a user enters a birth year showing they are at least 18. The current implementation stores only an `ageVerified` flag on the device. It does not store the birth year.

If we learn that someone under 18 has used LocalPoker or provided personal data, contact us at maskndafi@gmail.com so we can take appropriate action.

## 3. Data we process today

### A. Data stored locally on your device

The current app stores the following data in local device storage so the game can resume and remember your preferences:

- Age verification flag (`@pokerpals/ageVerified`).
- Local profile: random app profile ID, display name, Pal/avatar configuration, play-money coins, and XP.
- Local login state: the sign-in provider label (guest or Google) and the handle you were given or claimed.
- Local game stats, settings, friends list, saved game snapshot, and cosmetics owned/equipped with play-money coins.

This local data stays on the device unless a feature below sends a subset of it to a service. Deleting the app or clearing app storage generally removes it.

### B. Firebase authentication and private room data

When Firebase is configured and anonymous sign-in is enabled, LocalPoker attempts to create or use an anonymous Firebase Authentication UID. This UID is used to secure online room rules.

If you choose **Sign in with Google**, LocalPoker asks Google to confirm who you are and passes the resulting token to Firebase Authentication. Firebase then stores your Google account's email address and display name against your UID, so the same account, handle and friends follow you to a new device. We use the email address only to identify the account and to suggest a starting handle; we never publish it to other players and never write it to the game database. You can play entirely as a guest instead, in which case no email address is involved. You can sign out at any time from Settings, and deleting your account removes the Firebase user along with the data listed below.

When a user creates, joins, or plays in an online room, the app can send room and gameplay data to Firebase Realtime Database, including:

- room code, host ID, room status, creation timestamp, and selected table settings;
- player ID, display name, Pal seed, seat index, chip count for the room, connected/presence status, and host/player flag;
- action records such as fold, check, call, bet, raise, or all-in, with sequence and timestamp;
- redacted public game state, such as board cards, street, pot/contribution data, public player state, and turn state;
- private per-player views, such as that player's own hole cards.

Room writes use Firebase `auth.uid`. The app no longer relies on the local profile ID for Firebase rule identity.

### B2. Social directory, friends, blocks and reports

The friends features need a shared directory, so using them stores more than
room data:

- a public handle claim mapping your chosen handle to your anonymous UID, and a
  directory profile holding that handle, your display name and a timestamp.
  Handles are readable by any signed-in player, which is how someone can find
  you by handle. They cannot be listed in bulk;
- friend requests you send or receive, each carrying the sender's UID, handle
  and display name;
- your friends list, as a pair of edges naming both users' UID, handle and
  display name;
- your block list, holding the blocked user's UID, handle and display name;
- any abuse report you submit, holding your UID, the reported user's UID and
  display name, the context (table or profile), the category, a timestamp and,
  where relevant, the room code. Reports are write-only for the reporter and
  are not readable back.

If you open a table for your friends, a summary of it (room code, your display
name, stakes, seat count and visibility) is written so it can be found: into a
public lobby anyone signed in can read if you mark the table public, and into
your friends' invite inboxes either way. Those summaries are removed when the
table starts or ends.

### C. GIF reactions from Giphy's public CDN

The app contains a curated list of GIF IDs and loads thumbnail/full GIF images from `https://media.giphy.com`. When your device loads those images, Giphy or its CDN providers may receive standard network request information such as IP address, user agent, and the specific GIF URL requested. The app does not use a Giphy API key and does not send search terms to Giphy.

Custom text reactions, emojis, stickers, and GIF choices are local table UI today and are not synced to Firebase as chat messages.

### D. Ads, not active today

Current ad placements are placeholders only. The app does **not** currently include the AdMob SDK and does **not** currently collect advertising identifiers, IDFA/AAID, ad interaction data, or ad consent signals.

**Conditional on ads shipping:** If AdMob or another ads SDK is integrated, the app and ad partners may process advertising identifiers, device/app information, approximate location inferred from IP, ad views/clicks, diagnostics, and consent choices to show, limit, personalize, and measure ads. Before shipping ads, the app must update this policy, Apple App Privacy labels, Google Play Data Safety answers, ATT text if tracking is used, ad network identifiers, and GDPR/UK/EU consent flow.

### E. Diagnostics and telemetry

The current app includes optional Sentry telemetry code. It is disabled unless `EXPO_PUBLIC_SENTRY_DSN` is set for the submitted build. Production EAS configuration does not set a placeholder DSN.

If Sentry is enabled, errors and diagnostic context may be sent to Sentry so we can debug crashes and app errors. The code is configured with `sendDefaultPii: false` and no performance tracing. Before enabling Sentry in a submitted build, this policy and store privacy disclosures must be updated according to Sentry's current SDK privacy guidance.

## 4. Why we use data

We use data for these purposes:

- **App functionality:** age gating, saving progress, profile, settings, stats, cosmetics, room presence, and gameplay state.
- **Security and abuse prevention:** Firebase anonymous auth and database rules for online room access.
- **Service operation:** connecting to Firebase and loading selected GIF images from Giphy.
- **Diagnostics, conditional on Sentry being enabled:** finding and fixing crashes and app errors.
- **Advertising, conditional on ads shipping:** showing and measuring ads, respecting consent choices, frequency capping, fraud prevention, and ad personalization if the user consents where required.
- **Legal/compliance:** responding to rights requests, enforcing terms, and complying with law.

## 5. Sharing and service providers

We do not sell real-money gambling products and do not sell virtual coins for real-world value.

We may share or make data available to:

- **Google Firebase** for anonymous authentication and Realtime Database hosting.
- **Giphy/CDN providers** when GIF images are requested by your device.
- **Sentry**, conditional on diagnostics being enabled, for crash/error reporting.
- **Google AdMob and consent providers**, conditional on ads shipping, for ad delivery, measurement, fraud prevention, and consent management.
- **Authorities or other parties** when required by law or to protect users, the app, or others.

## 6. Retention

- Local device data remains until you delete the app, clear app storage, or use in-app reset/delete features that are available.
- Firebase anonymous authentication records and room/lobby/gameplay data are retained until deleted according to our operational retention process. **Production note:** the current code does not yet implement an automated Firebase room TTL/cleanup job. Define and publish a retention schedule before launch.
- Giphy/CDN, Sentry if enabled, and future ad providers retain request, diagnostic, advertising, and consent data according to their own policies.

## 7. Your choices and rights

Depending on where you live, you may have rights to request access, correction, deletion, portability, restriction, objection, or appeal regarding personal data. California residents may also have rights to know, delete, correct, and opt out of sale/sharing. We do not currently sell personal information.

To make a request, contact maskndafi@gmail.com. If you signed in with Google, give us that email address so we can find the account. If you played as a guest, the account is anonymous, so we may need details such as your Firebase UID, room code, or device profile ID to locate the data.

For advertising choices, conditional on ads shipping, you may be able to:

- decline App Tracking Transparency permission on iOS if tracking is requested;
- reset or limit the mobile advertising ID in OS settings;
- choose non-personalized ads through the consent prompt where available.

## 8. Security

We use Firebase rules and standard transport security provided by Firebase, Giphy/CDN providers, and other service providers. No method of storage or transmission is perfectly secure. Do not share room codes with people you do not want in your private table.

## 9. International transfers

Firebase, Giphy/CDN providers, Sentry if enabled, and future ads providers may process data in countries other than where you live. Those vendors operate under their own published transfer safeguards. LocalPoker does not itself transfer personal data for any purpose beyond running the app.

## 10. Changes

We may update this policy as LocalPoker changes. Material changes should be reflected in the hosted policy URL, in-app legal copy, and store privacy disclosures before submission.

## 11. Contact

LocalPoker  
maskndafi@gmail.com
