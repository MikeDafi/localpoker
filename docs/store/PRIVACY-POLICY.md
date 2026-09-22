# LocalPoker Privacy Policy Draft

**App:** LocalPoker: Poker with Friends (`com.localpoker.app`)  
**Effective date:** [PLACEHOLDER: effective date]  
**Publisher:** [PLACEHOLDER: company/legal entity name]  
**Contact:** [PLACEHOLDER: privacy contact email], [PLACEHOLDER: mailing address]  
**Governing jurisdiction / representative:** [PLACEHOLDER: jurisdiction, EU/UK representative or DPO if required]

> **Legal review required:** This is a product-specific draft prepared from the current codebase. It is not legal advice and must be reviewed by a qualified privacy/legal professional before publication.

## 1. What LocalPoker is

LocalPoker is a free, play-money Texas Hold'em game for adults 18 and older. The app does **not** offer real-money gambling, cash prizes, withdrawals, wagering for anything of real-world value, or real-money purchases in the current build.

The current app includes local play against bots and a partially built friends/online lobby using Firebase Realtime Database and anonymous Firebase Authentication. Real AdMob ads are **not** integrated yet; current ad placements are visual placeholders.

## 2. Age gate and children

LocalPoker is intended only for adults **18+**. The app blocks access until a user enters a birth year showing they are at least 18. The current implementation stores only an `ageVerified` flag on the device; it does **not** store the birth year.

If we learn that someone under 18 has used LocalPoker or provided personal data, contact us at [PLACEHOLDER: privacy contact email] so we can take appropriate action.

## 3. Data we process today

### A. Data stored locally on your device

The current app stores the following data in local device storage so the game can resume and remember your preferences:

- Age verification flag (`@pokerpals/ageVerified`).
- Local profile: random app profile ID, display name, Pal/avatar configuration, play-money coins, and XP.
- Local login state: guest/email provider label and a locally entered email-or-username handle. This is not real OAuth or a server account today.
- Local game stats, settings, friends list, saved game snapshot, and cosmetics owned/equipped with play-money coins.

This local data stays on the device unless a feature below sends a subset of it to a service. Deleting the app or clearing app storage generally removes it.

### B. Firebase anonymous authentication and friends lobby data

When Firebase is configured and anonymous sign-in is enabled, LocalPoker attempts to create/use an anonymous Firebase Authentication UID. This is used to support secure online room rules.

When a user creates or joins an online room, the app can send room/lobby data to Firebase Realtime Database, including:

- room code, host ID, room status, creation timestamp, and selected table settings;
- player ID, display name, Pal seed, seat index, chip count for the lobby, connected/presence status, and host/player flag;
- action records if/when the Firebase action-sync service is wired into gameplay.

As of this draft, online gameplay synchronization is not complete: the friends lobby presence scaffold exists, but table play still runs locally against bots.

### C. GIF reactions from Giphy's public CDN

The app contains a curated list of GIF IDs and loads thumbnail/full GIF images from `https://media.giphy.com`. When your device loads those images, Giphy (or its CDN providers) may receive standard network request information such as IP address, user agent, and the specific GIF URL requested. The app does not use a Giphy API key and does not send search terms to Giphy.

### D. Ads — **not active today**

Current ad placements are placeholders only. The app does **not** currently include the AdMob SDK and does **not** currently collect advertising identifiers, IDFA/AAID, ad interaction data, or ad consent signals.

**Conditional on ads shipping:** If AdMob or another ads SDK is integrated, the app and ad partners may process advertising identifiers, device/app information, approximate location inferred from IP, ad views/clicks, diagnostics, and consent choices to show, limit, personalize, and measure ads. Before shipping ads, the app must update this policy, Apple App Privacy labels, Google Play Data Safety answers, ATT text, and GDPR/UK/EU consent flow.

### E. Diagnostics and analytics

The current app has an in-app error boundary but no production crash-reporting or analytics SDK. Some errors are logged locally/development-side. If Sentry, Crashlytics, Firebase Analytics, or another SDK is added later, this policy and store disclosures must be updated before release.

## 4. Why we use data

We use data for these purposes:

- **App functionality:** age gating, saving progress, profile, settings, stats, cosmetics, room presence, and gameplay state.
- **Security and abuse prevention:** Firebase anonymous auth and database rules for online room access.
- **Service operation:** connecting to Firebase and loading selected GIF images from Giphy.
- **Advertising** (**conditional on ads shipping**): showing and measuring ads, respecting consent choices, frequency capping, fraud prevention, and ad personalization if the user consents where required.
- **Legal/compliance:** responding to rights requests, enforcing terms, and complying with law.

## 5. Sharing and service providers

We do not sell real-money gambling products and do not sell virtual coins for real-world value.

We may share or make data available to:

- **Google Firebase** for anonymous authentication and Realtime Database hosting.
- **Giphy/CDN providers** when GIF images are requested by your device.
- **Google AdMob and consent providers** (**conditional on ads shipping**) for ad delivery, measurement, fraud prevention, and consent management.
- **Crash/analytics providers** (**conditional on those SDKs shipping**) for diagnostics and product improvement.
- **Authorities or other parties** when required by law or to protect users, the app, or others.

## 6. Retention

- Local device data remains until you delete the app, clear app storage, or use in-app reset/delete features that are available.
- Firebase anonymous authentication records and room/lobby data are retained until deleted according to our operational retention process. **Production note:** the current code does not yet implement an automated Firebase room TTL/cleanup job; define and publish a retention schedule before launch.
- Giphy/CDN and future ad/crash providers retain request, advertising, and diagnostic data according to their own policies.

## 7. Your choices and rights

Depending on where you live, you may have rights to request access, correction, deletion, portability, restriction, objection, or appeal regarding personal data. California residents may also have rights to know, delete, correct, and opt out of sale/sharing. We do not currently sell personal information.

To make a request, contact [PLACEHOLDER: privacy contact email]. Because the current account model is anonymous/local, we may need information such as your anonymous Firebase UID, room code, device profile ID, or other details to locate data.

For advertising choices (**conditional on ads shipping**), you may be able to:

- decline App Tracking Transparency permission on iOS;
- reset or limit the mobile advertising ID in OS settings;
- choose non-personalized ads through the consent prompt where available.

## 8. Security

We use Firebase rules and standard transport security provided by Firebase/Giphy/CDN providers. No method of storage or transmission is perfectly secure. Do not share room codes with people you do not want in your private table.

## 9. International transfers

Firebase, Giphy/CDN providers, and future ads/diagnostics providers may process data in countries other than where you live. Add the appropriate transfer mechanism language after legal review: [PLACEHOLDER: SCCs/UK addendum/DPF/vendor transfer terms as applicable].

## 10. Changes

We may update this policy as LocalPoker changes. Material changes should be reflected in the hosted policy URL, in-app legal copy, and store privacy disclosures before submission.

## 11. Contact

[PLACEHOLDER: company/legal entity name]  
[PLACEHOLDER: mailing address]  
[PLACEHOLDER: privacy contact email]
