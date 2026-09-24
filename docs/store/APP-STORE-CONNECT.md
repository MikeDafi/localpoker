# App Store Connect Submission Sheet, LocalPoker

This is the paste-ready App Store Connect sheet for `com.mike0264.localpoker` version `1.0.0`, build `1`. It assumes the submitted iOS app is phone-only, uses Firebase online rooms, does not ship real ads yet, and does not enable Sentry unless a real DSN is provided.

## Where this stands right now

Verified 2026-09-24. **Nothing has been submitted, and nothing is on TestFlight.**

The Apple Developer Program membership is **active**: the team is
`Michael Askndafi - D7VUBSSP2F` and already carries four other apps. Step 0 of
the runbook is therefore done, and the earlier note about enrolment being the
gate no longer applies.

| Question | Answer | How it was checked |
|---|---|---|
| Linked to an EAS project? | **Yes** | `@mike0264/localpoker`, project `0cb2ee24-24de-4ecb-b7ca-8f7a3f896373`. Done, it is free and needs no Apple account. |
| Builds natively outside Expo Go? | **Yes** | Release configuration, simulator, unsigned. Verified reaching the age gate from a fresh install. |
| Has a release binary been built? | No | `npx eas-cli@latest build:list` is empty. A simulator build is not a release binary. |
| Developer Program membership? | **Active** | Team `Michael Askndafi - D7VUBSSP2F`, with four other apps already in App Store Connect. |
| Bundle ID registered? | **Yes** | `com.mike0264.localpoker`, registered under that team. |
| App record in App Store Connect? | **Yes** | `LocalPoker: Poker with Friends`, ASC app ID `6815726621`, iOS 1.0 in *Prepare for Submission*. |
| On TestFlight? | **No** | Follows from the above. TestFlight distributes an *uploaded build*, so with no release binary there is nothing to be on it. |
| Is any Apple ID a TestFlight tester? | Not applicable | Testers are per app. With no app record there is no tester list. |
| Distribution certificate present? | No | The only code-signing identity is `Apple Development: Michael Askndafi`. Uploading needs an **Apple Distribution** certificate. |

Re-check any time with:

```
npx eas-cli@latest project:info
npx eas-cli@latest build:list
security find-identity -v -p codesigning
```

**The gate is the paid Apple Developer Program**, currently 99 USD per year. A
free Apple ID can run the app on a simulator and on your own device, but it
cannot produce a Distribution certificate, so it cannot upload to App Store
Connect and therefore cannot reach TestFlight. No amount of local work removes
that step; see step 0 of the runbook.

## Submission blockers and required decisions

1. **Ads are not real today.** `src/components/AdBanner.tsx` is a static placeholder and no ad SDK is installed. Shipping the visible fake ad slot is an App Review rejection risk because it is placeholder content, not only because it affects ad privacy answers. For submission, choose one path:
   - **No-ads 1.0 path:** hide or remove ad placeholder UI and ad copy before uploading, then recapture screenshots and answer all ad, tracking, IDFA, ATT, and SKAdNetwork questions as No.
   - **Ad-supported 1.0 path:** integrate a real ad SDK first, then add consent, ATT if tracking, SKAdNetwork IDs, and updated privacy labels.
2. **Legal URLs must be hosted before App Review, but not with placeholders.** GitHub Pages can host the `docs/store` Markdown files. The site build refuses to publish while unresolved legal or support placeholders remain. Fill the human-owned fields listed in `SUBMISSION-CHECKLIST.md`, follow the exact Pages steps below, then paste the resulting URLs.
3. **Online rooms need production Firebase setup.** Set the production `EXPO_PUBLIC_FIREBASE_*` values for EAS, enable Anonymous Authentication, publish `database.rules.json`, and define room cleanup. If online rooms are not enabled, remove friend-room claims from metadata and screenshots.
4. **EAS submit values are now real, not placeholders.** `eas.json` carries `ascAppId` `6815726621` and `appleTeamId` `D7VUBSSP2F`. Neither is a secret, and having them committed is what makes a non-interactive `eas submit` possible. The Apple ID itself is still supplied at submit time through `EXPO_APPLE_ID`, because that is personal data and does not belong in the repo. See `EAS-SUBMIT.md`.
5. **EU trader status must be set before any new app can be submitted.** App Store Connect now blocks new submissions for the European Union under the Digital Services Act until the account's trader status is provided, and warns that apps will be removed from the EU store without it. It is set by an Admin or Account Holder under Business, not per app.
6. **Sentry is optional.** Production EAS no longer sets a placeholder DSN, and the placeholder Sentry Expo plugin config was removed. If you add a real `EXPO_PUBLIC_SENTRY_DSN`, restore real Sentry org/project config and update App Privacy for diagnostics before submitting.

## App identity and build fields

| Field | Value | Status |
|---|---|---|
| Bundle ID | `com.mike0264.localpoker` | Registered in Apple Developer under team `D7VUBSSP2F`. **Not** `com.localpoker.app`: that string is already taken by another developer. Bundle IDs are unique across all of Apple, not just your account, and the portal only says so at the final Register step. |
| Apple Team ID | `D7VUBSSP2F` | Michael Askndafi. Needed as `appleTeamId` for a non-interactive `eas submit`. |
| App version | `1.0.0` | Matches `app.json`. |
| iOS build number | `1` | Matches `app.json`. Increment for each uploaded binary after the first. |
| Expo SDK | `~57.0.23` | Matches `package.json`. |
| EAS CLI | `>= 5.0.0` | Required by `eas.json`. |
| iPad support | `false` | Deliberate launch decision because the table UI is phone-tuned. No iPad support at launch, upload iPhone screenshots only. Confirmed on a 13-inch simulator: `docs/store/screenshots/felt-ipad/localpoker-13-01.png` shows the felt in the top third with the lower half empty. |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` | Use the standard encryption answer only if the app uses HTTPS/TLS and no custom non-exempt encryption. |
| Sentry | Disabled by default | Add real DSN plus real Expo plugin org/project only if shipping diagnostics. |

### Build it natively before you trust it

Expo Go is not a preview of the shipped app, and three defects hid behind that
difference until the first standalone Release build. All three would have
shipped.

- **The app never got past its own splash screen.** Hiding the splash hung off
  `NavigationContainer`'s `onReady`, which only fires once a navigator mounts
  inside it. `RootNavigator` renders a plain view while app state hydrates, and
  renders the age gate before that, so on a fresh install no navigator ever
  mounted, `onReady` never fired, and the native splash stayed up forever with
  the age gate stranded behind it. Expo Go never showed this because it uses
  its own splash, not the app's. Readiness is now stated directly, with a
  timeout backstop so no single stalled promise can wedge the splash again.
- **The app icon was the Expo scaffold icon.** `assets/icon.png` was still the
  blue chevron from `create-expo-app`. The real icon had been designed and
  committed to `docs/design/icon-final/pokerface-v4.svg` but was never exported
  or referenced, so the binary carried the template artwork.
- **The splash image was the scaffold placeholder too**, the grey grid and
  concentric circles that ship with the Expo template.

Shipping either placeholder is a Guideline 4.3 and 2.3.3 problem on its own:
it is not the app's artwork and it is visibly unfinished.

To reproduce the check without any Apple account, because a simulator build
needs no signing:

```
npx expo prebuild --platform ios
git checkout -- package.json   # prebuild rewrites the ios/android scripts
xcodebuild -workspace ios/LocalPokerPokerwithFriends.xcworkspace \
  -scheme LocalPokerPokerwithFriends -configuration Release \
  -sdk iphonesimulator -derivedDataPath .maestro/NativeBuild \
  CODE_SIGNING_ALLOWED=NO build
xcrun simctl install booted <path to the built .app>
xcrun simctl launch booted com.mike0264.localpoker
```

Uninstall between runs. A fresh install is the case that broke, and an existing
install hides it because the age gate has already been cleared.

Note that `expo prebuild` rewrites the `ios` and `android` npm scripts to
`expo run:*`. This project drives Expo Go on a dev server for its capture
suite, so revert that change rather than committing it.

### The home screen name is set separately

`expo.name` is the full marketing name and is what App Store Connect wants. The
home screen fits roughly twelve characters, so the full name renders there as
`LocalPoker:Poker...`. `ios.infoPlist.CFBundleDisplayName` is set to
`LocalPoker` for the icon label. Changing `expo.name` alone would have changed
the store listing too, which is not the same decision.

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

This is the cleanest setup because `origin/main` is unrelated to LocalPoker. It does not require putting generated HTML or a `docs/` Pages folder on `main`. Tradeoff: GitHub Pages is still one site per repository. If `MikeDafi/localpoker` already needs Pages for the unrelated `main` project, or if Pages is unavailable for this private repo on the account plan, use a separate public repo such as `localpoker-legal` or another static host, then replace the same URL fields below with that host's URLs.

Expected public site base after Pages is enabled:

`https://mikedafi.github.io/localpoker/`

Use these App Store Connect URLs:

| App Store Connect field | URL |
|---|---|
| Privacy Policy URL | `https://mikedafi.github.io/localpoker/privacy/` |
| Support URL | `https://mikedafi.github.io/localpoker/support/` |
| Marketing URL, optional | `https://mikedafi.github.io/localpoker/` |
| Terms URL, if requested outside ASC metadata | `https://mikedafi.github.io/localpoker/terms/` |

GitHub Pages steps:

1. Push the LocalPoker branch with `.github/workflows/pages.yml`.
2. In GitHub, open `MikeDafi/localpoker`.
3. Go to **Settings**.
4. Go to **Pages**.
5. Under **Build and deployment**, set **Source** to **GitHub Actions**.
6. Click **Save** if GitHub shows a save button.
7. Go to **Actions**.
8. Open **Legal Pages**.
9. Click **Run workflow** and choose branch `i-want-to-build-a-poker-ios-ap`, or push a docs change to that branch.
10. Wait for the deployment to the `github-pages` environment.
11. Open `https://mikedafi.github.io/localpoker/privacy/`, `https://mikedafi.github.io/localpoker/terms/`, and `https://mikedafi.github.io/localpoker/support/` in a private browser window.

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

Because `ios.supportsTablet` is now `false` by deliberate product choice, App Store Connect should not require iPad screenshot wells for this iOS submission. This also means LocalPoker does not claim iPad support at launch. If tablet support is re-enabled later, upload 13-inch iPad screenshots too, commonly `2064 x 2752` or `2048 x 2732` portrait. A 13-inch set can already be built from staged captures, but it is not uploadable yet for a second reason beyond the flag: see "The iPad set, and why it is staged rather than shipped" below.

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

One set of six slides lives in `docs/store/screenshots/felt/`. Upload it to the
iPhone 6.9-inch well; App Store Connect scales them for smaller iPhone wells,
so no other size is needed. The raw device captures they are built from are in
`docs/store/screenshots/raw/`.

Earlier there were four competing sets (`felt`, `night`, `sharp`, `craft`).
That was a decision aid, not a deliverable, and keeping four half-maintained
sets meant a fix to the shared compositor had to be judged four times. The
`felt` angle won and the rest were deleted.

| # | Headline | Capture | Why it is in this position |
|---:|---|---|---|
| 1 | Real Texas Hold'em. Actually free. | `04-action.png` | The objection to clear first is price, so it leads. |
| 2 | Heads up with a friend. | `21-headsup.png` | The social hook, ahead of the bots. |
| 3 | Bots that actually play poker. | `02-difficulty.png` | The answer to "who do I play when nobody is around". |
| 4 | Every hand, tracked. | `06-stats.png` | Depth, for the viewer still scrolling. |
| 5 | Say something. | `22-reactions.png` | Proof the table is social, not solitaire. |
| 6 | Your table, your Pal. | `08-pal.png` | Personalization, the softest sell, so it goes last. |

Slide 2 really is one opponent. It used to be captured six-handed under a
"heads up" headline, because `numOpponents` renders as a stepper rather than a
`UISlider` and the test's `app.sliders` query silently matched nothing. The
capture test now steps the control down and asserts it reached the minimum, so
the headline and the picture cannot drift apart again.

Rebuild with `python3 scripts/build-store-images.py`. Copy, capture and
flourish placement all live in the `SLIDES` table at the top of that script.

Every slide is checked before it is written, and the build fails rather than
emitting an image that misses:

- exactly the device's declared size (`1320 x 2868` for 6.9-inch iPhone,
  `2064 x 2752` for 13-inch iPad), RGB, no alpha
- headline of seven words or fewer, so it survives a search thumbnail
- no capture reused inside the set, which would read as padding
- headline contrast **at or above 7:1** (WCAG AAA) measured on the rendered
  pixels, not assumed from the palette

That last check is not decorative. It caught slide 3 at 6.1:1 after the
background alone was already dark enough: the court-card flourish behind the
headline was tinted *lighter* than the backdrop and was eating the contrast.
The flourish is now debossed, tinted darker than the background, so it can only
ever help white type.

Captions exist because the App Store renders the first images at thumbnail size
in search, where a raw capture of this dark table is unreadable. Type is the
app's own Fredoka. Each backdrop is sampled from its own screenshot's dominant
hue, so the set is one family without every slide being the same flat green.

The palette deliberately avoids casino red and gold. Guideline 2.3.8 requires
screenshots to be suitable for a 4+ audience even though the app itself carries
a 17+ simulated-gambling rating, so looking like a real-money casino would
fight the rating, the store copy and the privacy labels at once.

No slide shows the reserved ad banner, because `EXPO_PUBLIC_ADS_ENABLED`
defaults to false and `AdBanner` returns null when it is off. If a real ad SDK
is integrated later, the set must be recaptured: shipping screenshots that hide
ads the app actually displays is a misrepresentation.

Known weakness: hole cards are face down in the table slides. That is the peel
interaction behaving correctly, but it undersells the game. The pending
`deal-faceup` change would fix it, and rerunning the build regenerates the set.

### The iPad set, and why it is staged rather than shipped

`scripts/build-store-images.py` carries two device profiles and emits a 13-inch
iPad set (`2064 x 2752`) into `docs/store/screenshots/felt-ipad/` alongside the
iPhone set. It skips that profile with a notice rather than failing when the
captures are absent, because the iPhone set is the one that ships.

One layout serves both canvases. Every measurement is a fraction of the canvas,
and type is keyed to the canvas *diagonal* rather than to either edge: keyed to
height it goes timid on the much wider iPad canvas, keyed to width it eats the
slide. The fractions are set so the iPhone numbers land exactly where they were
tuned by hand, which is the check that the iPad profile was added without
disturbing the set that matters. All twelve slides clear AAA.

**Do not upload the iPad set, and not only because `supportsTablet` is
`false`.** Slide `localpoker-13-01.png` shows the problem better than any
description: the felt occupies the top third and the bottom half of the screen
is empty. The table is laid out for a phone's aspect ratio and does not adapt.
Shipping that as marketing would advertise a broken tablet experience and
invite a Guideline 2.3.3 rejection for not showing the app in genuine use.

The grid screens are a different story. Stats, home, difficulty and Pal all
reflow correctly into the wider canvas and look good. So the blocker is
specific: it is the *table* screens, which are slides 1 and 2, the two that
carry the pitch.

Re-enabling iPad is therefore a two-part change, not a flag flip:

1. Adapt the table layout for a 4:3 aspect ratio, then recapture.
2. Set `ios.supportsTablet` to `true`, which also puts the iPad experience in
   front of App Review.

### Running the capture suite against a second device

```
xcrun simctl boot "iPad Pro 13-inch (M5)"
xcrun simctl openurl booted exp://127.0.0.1:8095    # reload the project first
xcodebuild test -project .maestro/xctest/UITestHarness.xcodeproj -scheme Harness \
  -derivedDataPath .maestro/DerivedData -destination 'name=iPad Pro 13-inch (M5)' \
  -only-testing:LocalPokerUITests/LocalPokerUITests/testS1Store
```

`storeOut` picks its output folder from the captured pixel width, so running
the same test against an iPad destination cannot overwrite the iPhone set.
`testS1Store`, `testS2Rest`, `testS5Duo` and `testS6Home` together produce
every capture the slides use.

Reload the project between runs. XCUITest terminates the app when a run ends,
and because the suite drives Expo Go rather than a standalone build, that drops
the loaded project: Expo Go comes back to its own project list with no app in
it. A test that starts there finds nothing and, because every capture is
guarded by `if tap(...)`, used to finish green having written no files at all.
For the same reason nothing in the suite may call `app.terminate()` to get back
to a known state.

Four things had to be fixed before an iPad run would complete, and three were
real bugs in the app rather than in the tests:

- **Leaving the table opens a confirmation alert.** `leave()` always calls
  `Alert.alert('Leave table?')`. The alert is modal, so every element behind it
  reports as present but not hittable. Unanswered, it stalled the entire run:
  the next back tap hit the dimmed screen behind the sheet, and so did the one
  after that. This was the actual cause of the stranded iPad pass. `backTap()`
  now answers it.
- **The back chevron had no accessibility label.** It was an icon-only
  `Pressable` in both `ScreenHeader` and `TableScreen`, so VoiceOver announced
  nothing and the harness had to tap a hard-coded coordinate. A coordinate
  tuned on a 440pt-wide iPhone lands about 20pt off on a 1032pt-wide iPad,
  because the header is laid out in points and so occupies a *smaller fraction*
  of a larger screen. Both buttons now carry `accessibilityLabel="Go back"`.
- **Tile labels surface as buttons on iPad**, not as static text, because the
  Pressable groups its children into one accessibility element. Gates written
  against `app.staticTexts` alone returned false while the label was plainly on
  screen. The gates now check both collections.
- **Capture tests could pass having captured nothing.** `requireStored` now
  names what each test owes and fails when it does not deliver, which is how
  the three failures above were finally told apart instead of all presenting as
  the same silent green run.

A fifth symptom was not a bug at all: a run that appeared to show broken guest
sign-in was simply an already-signed-in session. Auth persists through
AsyncStorage now, so on any simulator that has run the app before there is no
"Play as Guest" button to wait for. `gate()` returns early when it is already
home.

## Ordered submission runbook

Follow these steps in order.

0. **Account and project setup. This is all done.**
   Recorded because the next person will not be able to tell from the repo
   alone, and because two of these steps have a trap in them.
   1. Apple Developer Program: **active**, team `D7VUBSSP2F`.
   2. `eas-cli` is deliberately not a dependency of this project, so invoke it
      as `npx eas-cli@latest ...` throughout. A bare `eas` will not resolve.
   3. EAS project: **linked**, `@mike0264/localpoker`. `expo.owner` and
      `expo.extra.eas.projectId` in `app.json` are what tie builds to it.
      Confirm with `npx eas-cli@latest project:info`.
   4. Bundle ID: **registered**, `com.mike0264.localpoker`. It is deliberately
      not `com.localpoker.app`: that string is already registered to another
      developer. Bundle IDs are unique across all of Apple rather than per
      account, and the portal only tells you at the final Register step, after
      the whole form is filled.
   5. App Store Connect record: **created**, app ID `6815726621`, iOS 1.0 in
      *Prepare for Submission*. The app name is exactly 30 characters, which
      is the field maximum.

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
5. **Create the app record. Done, app ID `6815726621`.**
   Kept for the record, and because it has to be redone if the app is ever
   recreated.
   1. In Apple Developer, create or confirm bundle ID `com.mike0264.localpoker`.
   2. In App Store Connect, go to **My Apps**.
   3. Click **+**.
   4. Choose **New App**.
   5. Platform: **iOS**.
   6. Name: `LocalPoker: Poker with Friends`.
   7. Primary language: choose the app's primary localization, likely English (U.S.).
   8. Bundle ID: `com.mike0264.localpoker`.
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
    3. Run `npx eas-cli@latest build --platform ios --profile production`.
    4. Install the build on a real iPhone or simulator-supported release channel and smoke-test age gate, local play, online room creation, stats, legal links, and ad behavior.
11. **Submit the binary.**
    1. Follow `docs/store/EAS-SUBMIT.md`. Set `EXPO_APPLE_ID`, set `EXPO_APPLE_APP_SPECIFIC_PASSWORD` if using app-specific password auth, and let interactive EAS prompt for missing ASC values.
    2. For non-interactive submit, add `ascAppId` and, if needed, `appleTeamId` as a local one-line `eas.json` edit at submit time, then do not commit that edit.
    3. Run `npx eas-cli@latest submit --platform ios --profile production`.
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

## TestFlight

TestFlight is how the app gets onto a real device, including your own, before
it is public. It is worth doing: several of this app's risk areas, notably the
Firebase room sync and the age gate, behave differently on device than in a
simulator.

TestFlight is **not a shortcut around the paid membership**. It distributes an
uploaded build, and uploading needs a Distribution certificate, which needs the
Apple Developer Program. Steps 0 through 11 of the runbook all still apply. The
only part TestFlight lets you skip is App Review's *full* review, and only for
internal testers.

Once a build has finished processing in App Store Connect:

1. Open the app record, then the **TestFlight** tab.
2. Complete **Test Information**: feedback email, and for this app a short note
   that it is play-money only with an 18+ gate.
3. **Internal testers**, up to 100 people. They must be members of your App
   Store Connect team with an Apple ID, added under **Users and Access**. No
   review is needed, so builds appear within minutes.
4. **External testers**, up to 10,000 people. These need a short Beta App
   Review, usually a day. Because this app carries a 17+ simulated-gambling
   rating, expect external review to look at the same things full review does.
5. Testers install the **TestFlight** app from the App Store and accept the
   invite sent to their Apple ID.

About `maskndafi@gmail.com` specifically: being the *developer* account does
not automatically make it a tester. To receive builds on a device it has to be
added under **Users and Access** and then selected in an internal tester group,
exactly like anyone else. Builds expire after 90 days.

