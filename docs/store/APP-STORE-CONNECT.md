# App Store Connect Submission Sheet, LocalPoker

This is the paste-ready App Store Connect sheet for `com.localpoker.app` version `1.0.0`, build `1`. It assumes the submitted iOS app is phone-only, uses Firebase online rooms, does not ship real ads yet, and does not enable Sentry unless a real DSN is provided.

## Submission blockers and required decisions

1. **Ads are not real today.** `src/components/AdBanner.tsx` is a static placeholder and no ad SDK is installed. Shipping the visible fake ad slot is an App Review rejection risk because it is placeholder content, not only because it affects ad privacy answers. For submission, choose one path:
   - **No-ads 1.0 path:** hide or remove ad placeholder UI and ad copy before uploading, then recapture screenshots and answer all ad, tracking, IDFA, ATT, and SKAdNetwork questions as No.
   - **Ad-supported 1.0 path:** integrate a real ad SDK first, then add consent, ATT if tracking, SKAdNetwork IDs, and updated privacy labels.
2. **Legal URLs must be hosted before App Review, but not with placeholders.** GitHub Pages can host the `docs/store` Markdown files. The site build refuses to publish while unresolved legal or support placeholders remain. Fill the human-owned fields listed in `SUBMISSION-CHECKLIST.md`, follow the exact Pages steps below, then paste the resulting URLs.
3. **Online rooms need production Firebase setup.** Set the production `EXPO_PUBLIC_FIREBASE_*` values for EAS, enable Anonymous Authentication, publish `database.rules.json`, and define room cleanup. If online rooms are not enabled, remove friend-room claims from metadata and screenshots.
4. **EAS submit values must be supplied at submit time.** `eas.json` no longer contains placeholder Apple, ASC, team, or Google service-account values. Use `EAS-SUBMIT.md` so credentials come from environment variables, EAS credentials, prompts, or a local one-line edit that is not committed.
5. **Sentry is optional.** Production EAS no longer sets a placeholder DSN, and the placeholder Sentry Expo plugin config was removed. If you add a real `EXPO_PUBLIC_SENTRY_DSN`, restore real Sentry org/project config and update App Privacy for diagnostics before submitting.

## App identity and build fields

| Field | Value | Status |
|---|---|---|
| Bundle ID | `com.localpoker.app` | Matches `app.json`. Create this exact identifier in Apple Developer if it does not already exist. |
| App version | `1.0.0` | Matches `app.json`. |
| iOS build number | `1` | Matches `app.json`. Increment for each uploaded binary after the first. |
| Expo SDK | `~57.0.23` | Matches `package.json`. |
| EAS CLI | `>= 5.0.0` | Required by `eas.json`. |
| iPad support | `false` | Deliberate launch decision because the table UI is phone-tuned. No iPad support at launch, upload iPhone screenshots only. |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` | Use the standard encryption answer only if the app uses HTTPS/TLS and no custom non-exempt encryption. |
| Sentry | Disabled by default | Add real DSN plus real Expo plugin org/project only if shipping diagnostics. |

## Metadata, paste-ready

### App name

`LocalPoker: Poker with Friends`

Count: 30 of 30 characters.

### Subtitle

`Play-money Texas Hold'em`

Count: 24 of 30 characters.

### Promotional text

`Fast, friendly play-money poker with smart bots, private room codes, custom Pals, stats, reactions, and no real-money gambling.`

Count: 127 of 170 characters.

### Keywords

`poker,texasholdem,holdem,cards,friends,playmoney,cardgame,bots,offline,table`

Count: 76 of 100 characters. Use comma-separated keywords with no spaces.

### Description

LocalPoker is a friendly play-money Texas Hold'em table for adults who want quick card nights without real-money gambling.

Build your Pal, sit down with free virtual chips, and play fast hands against tuned bot opponents. Learn the rhythm of poker, try different difficulty settings, track your stats, and send quick reactions around the table.

Features:

- Play-money Texas Hold'em for adults 18 and older.
- No deposits, withdrawals, cash prizes, or real-world value.
- Smart local bot opponents with easy, medium, hard, and expert settings.
- Peelable hole cards, animated chips, hand results, and table reactions.
- Custom Pal avatars, virtual coins, XP, cosmetics, stats, and saved games.
- Private room-code lobby for friends once online rooms are enabled.

LocalPoker is for entertainment only. Virtual chips, coins, cosmetics, and stats have no monetary value and cannot be redeemed, sold, transferred, or exchanged for anything of value. Playing LocalPoker does not imply success in real-money gambling.

Important: friend rooms require the publisher's Firebase production setup. The app never offers real-money gambling.

### What's New for version 1.0.0

Welcome to LocalPoker 1.0.0.

- Play-money Texas Hold'em with tuned bot opponents.
- Peelable hole cards, animated chips, reactions, and custom Pals.
- Stats, saved games, settings, virtual coins, and cosmetics.
- Private room-code lobby support for Firebase-backed friend rooms.
- Adults-only 18+ age gate and no real-money gambling.

## URLs

Use the GitHub Actions Pages workflow added in `.github/workflows/pages.yml`. It builds styled HTML from the Markdown sources in `docs/store` with `docs/site/build-legal-site.mjs`, then deploys only from the LocalPoker branch `i-want-to-build-a-poker-ios-ap` to the `github-pages` environment.

This is the cleanest setup because `origin/main` is unrelated to LocalPoker. It does not require putting generated HTML or a `docs/` Pages folder on `main`. Tradeoff: GitHub Pages is still one site per repository. If `MikeDafi/bestplan` already needs Pages for the unrelated `main` project, or if Pages is unavailable for this private repo on the account plan, use a separate public repo such as `localpoker-legal` or another static host, then replace the same URL fields below with that host's URLs.

Expected public site base after Pages is enabled:

`https://mikedafi.github.io/bestplan/`

Use these App Store Connect URLs:

| App Store Connect field | URL |
|---|---|
| Privacy Policy URL | `https://mikedafi.github.io/bestplan/privacy/` |
| Support URL | `https://mikedafi.github.io/bestplan/support/` |
| Marketing URL, optional | `https://mikedafi.github.io/bestplan/` |
| Terms URL, if requested outside ASC metadata | `https://mikedafi.github.io/bestplan/terms/` |

GitHub Pages steps:

1. Push the LocalPoker branch with `.github/workflows/pages.yml`.
2. In GitHub, open `MikeDafi/bestplan`.
3. Go to **Settings**.
4. Go to **Pages**.
5. Under **Build and deployment**, set **Source** to **GitHub Actions**.
6. Click **Save** if GitHub shows a save button.
7. Go to **Actions**.
8. Open **Legal Pages**.
9. Click **Run workflow** and choose branch `i-want-to-build-a-poker-ios-ap`, or push a docs change to that branch.
10. Wait for the deployment to the `github-pages` environment.
11. Open `https://mikedafi.github.io/bestplan/privacy/`, `https://mikedafi.github.io/bestplan/terms/`, and `https://mikedafi.github.io/bestplan/support/` in a private browser window.

These URLs are not live until the user enables Pages in repository settings and the Legal Pages workflow completes successfully.

Before App Review, replace the remaining non-URL legal placeholders in `PRIVACY-POLICY.md` and `TERMS.md`. The public support and privacy contact email is already set to `maskndafi@gmail.com`. See `SUBMISSION-CHECKLIST.md` section 2 for the exact human-owned fields. The Pages build intentionally fails until those values are filled.

## Age rating answer sheet

Answer the exact App Store Connect wording shown in the console. If the console wording differs, preserve the substance below.

| Question or category | Answer |
|---|---|
| Simulated Gambling | **Frequent/Intense**. Poker with virtual chips is the core gameplay. |
| Gambling | **No**. No real-money wagering, deposits, withdrawals, cash-outs, prizes, or value transfer. |
| Contests | **No**. No tournaments with prizes or anything redeemable for value. |
| In-App Purchases | **No** today. No IAP code or store products are present. |
| Advertising | **No for the current placeholder build**. Change to Yes only after a real ad SDK or paid promotion ships. |
| Unrestricted Web Access | **No**. The app loads curated Giphy CDN images but has no browser and no arbitrary web navigation. |
| User-Generated Content | **No for current networked behavior**. Display names and room gameplay are limited private-room data, not broad distribution. Re-answer if networked custom messages, GIFs, or public content ship. |
| Social Media | **No**. No feed, public discovery, likes, shares, or amplification. |
| Social Media Disabled for Users Under 13 | **Not applicable** because Social Media is No and the app is 18+. |
| Messaging and Chat | **No for current networked behavior**. The reaction sheet is local on the table today and is not a network chat system. Re-answer if player-to-player text/GIF messages are synced online. |
| Mature or Suggestive Themes | **None** unless screenshots or copy add mature content beyond poker. |
| Profanity or Crude Humor | **None** in current app copy and curated reactions. |
| Alcohol, Tobacco, Drug Use or References | **None**. |
| Medical or Treatment Information | **None**. |
| Horror or Fear Themes | **None**. |
| Violence categories | **None**. |
| Sexual content or nudity categories | **None**. |
| Kids category | **No**. The app is adults-only 18+. |
| Age gate in app | Yes, a blocking birth-year gate requires users to be 18 or older. |

Expected result: Apple will likely assign a high age rating, often 17+, because simulated gambling is frequent. Keep the store copy, screenshots, Privacy Policy, and Terms consistent with play-money only.

## App Privacy answers

Use `docs/store/APP-PRIVACY-LABELS.md` as the detailed answer key. For the intended 1.0 binary with Firebase enabled, no real ads, and no Sentry DSN:

- Tracking: **No**.
- Data linked to the user: **User ID** and **Gameplay Content**, for Firebase anonymous UID, display name or screen name, private room metadata, public game state, private player views, and action records.
- Data not linked to the user: **Other Data Types**, if legal chooses to disclose Giphy CDN request metadata conservatively.
- Email address: **No**, because the email-or-username field stays in local AsyncStorage and is not sent to Firebase.
- Diagnostics: **No**, unless a real Sentry DSN is set for the submitted build.
- Device ID, Advertising Data, Product Interaction for ads, Coarse Location for ads: **No**, unless a real ad SDK ships.

## Screenshot requirements

Checked against Apple's App Store Connect screenshot specification page on 2026-09-21. Apple can change device classes, so confirm the upload wells in App Store Connect before final submission.

For this phone-only iOS app:

- Upload **1 to 10** screenshots for each required display size and localization.
- Use PNG, JPG, or JPEG.
- Use RGB screenshots with no alpha channel or transparency.
- If you provide the required highest-resolution iPhone size, App Store Connect scales to smaller iPhone sizes.

Required iPhone size today:

| Device class | Accepted portrait sizes | Requirement |
|---|---|---|
| 6.9-inch iPhone display | `1260 x 2736`, `1290 x 2796`, or `1320 x 2868` | Required if the app runs on iPhone. |
| 6.5-inch iPhone display | `1284 x 2778` or `1242 x 2688` | Required only if 6.9-inch screenshots are not provided. |

Because `ios.supportsTablet` is now `false` by deliberate product choice, App Store Connect should not require iPad screenshot wells for this iOS submission. This also means LocalPoker does not claim iPad support at launch. If tablet support is re-enabled later, upload 13-inch iPad screenshots too, commonly `2064 x 2752` or `2048 x 2732` portrait.

### Shot list for LocalPoker

Capture these in order for the 6.9-inch iPhone well:

1. Home screen, showing LocalPoker, Quick Play, Friends, Stats, Store, and the play-money identity.
2. Difficulty and table setup, showing Easy, Medium, Hard, Expert, stakes, table size, and start button.
3. Table mid-hand, showing cards, chips, bot opponents, pot, and action buttons.
4. Peeled hole cards, showing the signature card-peel interaction.
5. Showdown or hand result, showing the outcome and virtual coin reward.
6. Stats screen, showing player stats without implying real-money results.
7. Friends lobby, only after Firebase online rooms are enabled in production.
8. Pal customization or Store, showing cosmetics bought with virtual coins only.

Do not show placeholder ads in final App Store screenshots unless a real ad SDK is integrated and the ad disclosure path is complete. Do not show any copy that implies cash prizes, deposits, withdrawals, betting for value, or real-money gambling.

### Captured screenshots in this repo

These files were captured from a dedicated iPhone 17 Pro Max simulator with the status bar overridden to 9:41, full battery, 4 cellular bars, and 3 Wi-Fi bars. Each file is RGB PNG at `1320 x 2868`, which is an accepted 6.9-inch iPhone portrait size for the required iPhone screenshot well.

| File | Dimensions | App Store Connect slot | Content |
|---|---:|---|---|
| `docs/store/screenshots/localpoker-iphone-6.9-01-difficulty-select.png` | `1320 x 2868` | iPhone 6.9-inch | Difficulty and table setup. |
| `docs/store/screenshots/localpoker-iphone-6.9-02-table-mid-hand.png` | `1320 x 2868` | iPhone 6.9-inch | Table mid-hand with board, pot, players, and action state. |
| `docs/store/screenshots/localpoker-iphone-6.9-03-visible-hole-cards.png` | `1320 x 2868` | iPhone 6.9-inch | Visible hole cards during live play. |
| `docs/store/screenshots/localpoker-iphone-6.9-04-stats.png` | `1320 x 2868` | iPhone 6.9-inch | Player stats and stack history. |
| `docs/store/screenshots/localpoker-iphone-6.9-05-friends.png` | `1320 x 2868` | iPhone 6.9-inch | Private room create/invite screen. |

Do **not** upload these exact screenshots for App Review while the fake ad slot remains visible. Four of the five shots show the static `Reserved banner slot`, which is placeholder content and a likely rejection risk. After choosing the no-ads path or integrating real ads, recapture the same shot list.

## Ordered submission runbook

Follow these steps in order.

1. **Choose the ads path.**
   1. For no-ads 1.0, remove or hide the placeholder banner UI and any copy saying ads support the app.
   2. For ad-supported 1.0, integrate the real ad SDK, add consent, update privacy labels, add ATT if tracking, add SKAdNetwork IDs, and test real ad behavior with test ad units first.
2. **Finish legal docs.**
   1. Fill every placeholder in `docs/store/PRIVACY-POLICY.md`.
   2. Fill every placeholder in `docs/store/TERMS.md`.
   3. Have legal or a qualified reviewer approve both.
3. **Enable GitHub Pages.**
   1. Use the Pages steps in the URLs section.
   2. Verify the Privacy Policy and Terms URLs in a private browser window.
4. **Prepare Firebase production.**
   1. In Firebase, enable Anonymous Authentication.
   2. In Realtime Database, publish `database.rules.json`.
   3. Add production EAS environment variables for `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_DATABASE_URL`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`, `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `EXPO_PUBLIC_FIREBASE_APP_ID`.
   4. Define how old rooms will be deleted or retained.
5. **Create the app record.**
   1. In Apple Developer, create or confirm bundle ID `com.localpoker.app`.
   2. In App Store Connect, go to **My Apps**.
   3. Click **+**.
   4. Choose **New App**.
   5. Platform: **iOS**.
   6. Name: `LocalPoker: Poker with Friends`.
   7. Primary language: choose the app's primary localization, likely English (U.S.).
   8. Bundle ID: `com.localpoker.app`.
   9. SKU: `localpoker-ios`.
   10. User Access: Full Access unless you need a limited-access app.
6. **Create version 1.0.0 metadata.**
   1. Open the new iOS app record.
   2. Create iOS version `1.0.0` if it is not already present.
   3. Paste the app name, subtitle, promotional text, description, keywords, and What's New text from this document.
   4. Paste the Privacy Policy, Support, and Marketing URLs.
   5. Set category to Games, Card or Casino as available in the console. Use Card first if offered.
7. **Answer Age Rating.**
   1. Open **Age Rating**.
   2. Use the answer sheet above.
   3. Confirm the final rating and keep the app's 18+ positioning.
8. **Answer App Privacy.**
   1. Open **App Privacy**.
   2. Use `APP-PRIVACY-LABELS.md`.
   3. Do not disclose ads or tracking for a no-ads binary.
   4. Disclose diagnostics if you enabled Sentry with a real DSN.
9. **Capture screenshots.**
   1. Boot an iPhone 17 Pro Max, iPhone 16 Pro Max, iPhone 15 Pro Max, or another simulator that captures an accepted 6.9-inch size.
   2. Run LocalPoker from the production or release candidate build.
   3. Capture the shot list above.
   4. Convert screenshots to RGB PNG or JPEG with no alpha channel.
   5. Upload 1 to 10 final images into the 6.9-inch iPhone screenshot well.
10. **Build the release.**
    1. Run `npx tsc --noEmit`.
    2. Run `npx vitest run` if time allows or if code changed.
    3. Run `eas build --platform ios --profile production`.
    4. Install the build on a real iPhone or simulator-supported release channel and smoke-test age gate, local play, online room creation, stats, legal links, and ad behavior.
11. **Submit the binary.**
    1. Follow `docs/store/EAS-SUBMIT.md`. Set `EXPO_APPLE_ID`, set `EXPO_APPLE_APP_SPECIFIC_PASSWORD` if using app-specific password auth, and let interactive EAS prompt for missing ASC values.
    2. For non-interactive submit, add `ascAppId` and, if needed, `appleTeamId` as a local one-line `eas.json` edit at submit time, then do not commit that edit.
    3. Run `eas submit --platform ios --profile production`.
    4. Wait for App Store Connect processing.
    5. Select the processed build in the 1.0.0 app version.
12. **Final review checklist.**
    1. Confirm screenshots do not show placeholder ads unless ads really ship.
    2. Confirm copy says play-money only and never implies real-money gambling.
    3. Confirm Privacy Policy URL is live.
    4. Confirm Firebase rooms work in the exact build submitted, or remove friend-room claims.
    5. Confirm there are no broken buttons, placeholder credentials, or unfinished console warnings visible to users.
13. **Submit for review.**
    1. Add review notes: "LocalPoker is play-money only. It has no deposits, withdrawals, cash prizes, or real-world value. The birth-year gate blocks users under 18. If testing online rooms, use Anonymous Firebase-backed private room codes."
    2. If online rooms need specific steps, include them in Review Notes.
    3. Click **Submit for Review**.

Expected review focus: simulated gambling disclosure, no real-money claims, legal URL availability, placeholder ads, privacy label accuracy, age gate behavior, and whether friend rooms work if advertised.
