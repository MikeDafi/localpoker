# LocalPoker iOS Simulator QA Report

Date: 2026-09-15  
Device: iPhone 17 Pro simulator (`D832CD41-7428-4488-BE3E-38B636FC06ED`), iOS 26.2  
App runtime: Expo Go SDK 57  
Evidence: screenshots in `docs/qa/` and XCUITest logs `docs/qa/xctest-*.log`

## Tooling / coverage notes

- The `maestro` binary on this machine turned out to be an unrelated internal infrastructure CLI, not mobile Maestro: `maestro hierarchy` failed with `No such command 'hierarchy'`. I used XCUITest + `xcrun simctl io ... screenshot` as the fallback driver.
- Opening the requested `exp://127.0.0.1:8081` reproduced a redbox/launch failure. To inspect the actual app, I later loaded it through a LAN Expo URL and hid the Expo Go floating dev-menu button, which initially covered app UI.
- Journeys covered: login/email/guest flow, home grid, quick play setup, poker table through showdown and next hand, create/join room screens, friends-mode setup/table, Pal Designer tabs/randomize/save, friends list/add attempt, stats, store, settings/account.

## Summary count by severity

| Severity | Count |
|---|---:|
| Blocker | 1 |
| High | 6 |
| Medium | 12 |
| Low | 12 |
| Nit | 5 |
| **Total** | **36** |

## What works well

- The Wii/console-inspired visual direction is cohesive and friendly across login, home, setup, table, store, and settings.
- Guest login, Apple mock login, home navigation, quick-play table start, betting actions, showdown, stats recording, next-hand flow, Pal randomization, and store/settings screens all rendered without app crashes once the Expo URL workaround was used.
- Home correctly avoids showing coins/money in the top-right; the settings gear is the only top-right app control after hiding Expo Go's dev overlay.
- Friends-mode setup correctly hides the opponents-count setting summary and shows `Players: Friends`.
- The table has the required core pieces: felt table, community cards, player pods/Pal avatars, pot display, stats HUD, action bar, bet sizing, showdown result, and win confetti.

---

## Prioritized findings

### QA-001 — Blocker — Launch / Expo loading — `exp://127.0.0.1:8081` redboxes with `404 Not Found`

**What's wrong:** Opening the requested simulator URL produced a React Native redbox containing raw HTML: `<title>404 Not Found</title>`, `<center>nginx/1.27.3</center>`. The app is unusable from the specified launch path until the developer dismisses/reloads or uses a different Expo host.  
**Repro steps:** Boot simulator, install/open Expo Go, run `xcrun simctl openurl booted "exp://127.0.0.1:8081"`, wait for bundle load.  
**Evidence:** `error-404-redbox.png`, `launch-after-openurl.png`.

### QA-002 — High — Game Setup — The advertised ~100 settings are effectively hidden on phone-sized screens

**What's wrong:** The Game Setup hero card consumes almost the entire viewport. The section tabs and ad banner are visible, but the selected section's actual editable rows are not visible after tapping Blinds/Table/Timing or after scrolling tabs. This makes the “101 options” claim feel false and prevents users from discovering most settings.  
**Repro steps:** Home → Quick Play → tap Table/Timing tabs; observe that only summary/tabs/ad are visible, not the editable fields.  
**Evidence:** `03-quickplay-setup-top.png`, `03b-setup-table-tab.png`, `03c-setup-timing-tab.png`, `03d-setup-tabs-scrolled.png`, `quickplay-setup.png`.

### QA-003 — High — Table — HUD overlaps cards/player pods and becomes unreadable

**What's wrong:** The live stats HUD strip sits directly over opponent hole cards and pods. Labels such as Stack/Blinds/Level and the card backs collide visually, making both game state and cards hard to read. This is most obvious at table start and in friends-mode table.  
**Repro steps:** Quick Play → Start Game; also Play with Friends → Configure Table → Start Game.  
**Evidence:** `04-table-start.png`, `20c-friends-table-create.png`, `table-start.png`.

### QA-004 — High — Play with Friends / Table — Friends table starts with bots instead of an empty/friends-only private room

**What's wrong:** Friends-mode setup shows `Players: Friends`, but starting the table immediately fills seats with bot names (`Ravi`, `Mika`, `Jules`, `Nina`, `Theo`) and bot action flow. That contradicts the private-room promise and makes room creation feel fake/broken.  
**Repro steps:** Home → Play with Friends → Configure Table → Start Game.  
**Evidence:** `20b-friends-setup-create.png`, `20c-friends-table-create.png`.

### QA-005 — High — Login — Primary guest CTA and email form are clipped below the fold

**What's wrong:** On iPhone 17 Pro, the login screen initially cuts off the large blue `Play as Guest` button; the legal text is also offscreen. After revealing email sign-in, the form continues below the viewport, leaving the display-name field and continue/error area partially hidden. A first-time user may not see the fastest path into the app.  
**Repro steps:** Fresh/logout state → view login; tap `Sign in with Email`.  
**Evidence:** `login-screen.png`, `18-login-logged-out.png`, `18b-email-form.png`.

### QA-006 — High — Accessibility / automation — Many custom controls expose as generic `Other`, causing missed taps and poor assistive semantics

**What's wrong:** Home tiles, Wii buttons, and many custom Pressables are not consistently exposed as buttons with stable labels/test IDs. XCUITest logs show repeated `MISS tap contains` events for visible controls (`Play with Friends`, `Join Room`, `Start Game`, `My Pal`, `Hair`, `Randomize`, `Log out`). This hurt automation reliability and likely impacts VoiceOver discoverability.  
**Repro steps:** Run automated journeys through `xctest-all.log` / `xctest-remaining.log`; inspect debug hierarchy. Home tiles appear as `Other` with composite labels rather than buttons.  
**Evidence:** `xctest-all.log`, `xctest-remaining.log`, `xctest-home-debug.log`, `02-home.png`, `19-pal-face.png`, `22-settings-account-visible.png`.

### QA-007 — High — Home — Settings tile is partially hidden behind the bottom ad / viewport edge

**What's wrong:** The seventh `Settings` channel tile is clipped at the bottom of the home grid and partly obscured by the banner-ad region. The top-right gear offers an alternate path, but the tile itself looks broken/incomplete.  
**Repro steps:** Login as guest → Home; scroll/grid rests at default position.  
**Evidence:** `02-home.png`, `home-screen.png`, `18c-email-empty-error.png`.

### QA-008 — Medium — Table — Bottom action bar is crowded against the ad and safe area

**What's wrong:** Fold/Call/Raise controls sit immediately above the banner ad with very little breathing room. On the table, this makes critical poker actions feel cramped and increases the risk of accidental ad/action taps.  
**Repro steps:** Quick Play → Start Game; wait for human action.  
**Evidence:** `04-table-start.png`, `04c-table-next-hand.png`, `20c-friends-table-create.png`.

### QA-009 — Medium — Table — Leave-table alert is visually low-contrast and blends into the felt

**What's wrong:** The leave confirmation appears as a translucent green/blur panel over green felt. The destructive `Leave` action is red text on a muted green pill, not a clear destructive button. This reduces confidence on a high-impact navigation action.  
**Repro steps:** From a table, tap the back arrow.  
**Evidence:** `05-home-returned.png`, `home-after-leave.png`, `05-friends-create-room.png`.

### QA-010 — Medium — Table / Timing — No visible turn timer despite Timing settings

**What's wrong:** Setup exposes timing/turn-timer controls, but the table UI does not show a countdown or timebank near the current player/action bar. Users cannot tell how much time remains or whether timing settings took effect.  
**Repro steps:** Quick Play → Game Setup → Timing tab → Start Game; wait for player turn.  
**Evidence:** `03c-setup-timing-tab.png`, `04-table-start.png`, `20c-friends-table-create.png`.

### QA-011 — Medium — Play with Friends / Join — Join button looks enabled for incomplete room codes

**What's wrong:** The join form copy asks for a 6-character code, but with a single `A` typed the `Join Table` CTA remains visually enabled. Validation appears deferred to an alert instead of disabling the CTA or showing inline feedback.  
**Repro steps:** Home → Play with Friends → Join Room → type `A`.  
**Evidence:** `12b-friends-join-room.png`.

### QA-012 — Medium — Friends — Add Friend did not add/clear during the automated run

**What's wrong:** After typing `QA Buddy` and tapping `Add`, the input still shows `QA Buddy`, the counts remain `2 online / 4 friends`, and no new row appears. The control looked tappable and no automation miss was logged for this second Add tap, so the user-visible result is no feedback/no addition.  
**Repro steps:** Home → Friends → type `QA Buddy` → tap Add.  
**Evidence:** `14c-friends-added.png`, `xctest-remaining.log`.

### QA-013 — Medium — Friends — Offline friends still have active `Invite` buttons

**What's wrong:** Offline entries (`Mika`, `Nina`) show the same green `Invite` CTA as online friends. The UI implies a real-time invite can be sent to offline users without explaining whether it becomes a notification, queue, or disabled state.  
**Repro steps:** Home → Friends; compare Online and Offline sections.  
**Evidence:** `14-friends-list.png`, `12c-friends-setup.png`.

### QA-014 — Medium — Pal Designer — Fixed ad/action dock hides most controls in each tab

**What's wrong:** The Pal Designer's bottom dock (ad + Randomize/Reset/Save) consumes a large portion of the screen. Only the first control in a group is fully visible; the next card peeks from behind the ad/dock, making the designer feel cramped and scroll-heavy.  
**Repro steps:** Home → My Pal; switch Face/Hair/Extras/Style.  
**Evidence:** `19-pal-face.png`, `19b-pal-hair.png`, `19d-pal-extras.png`, `19e-pal-style.png`.

### QA-015 — Medium — Settings — Account and later preferences are buried in a very long scroll

**What's wrong:** Settings contains many controls with no section index, sticky section nav, search, or jump links. The account/logout area took many swipes to reach and is easy to miss.  
**Repro steps:** Home → gear → Settings → attempt to find Account/Log out.  
**Evidence:** `17-settings-top.png`, `17b-settings-prefs.png`, `21-settings-account-bottom.png`, `22-settings-account-visible.png`.

### QA-016 — Medium — Stats — Chart is decorative but not interpretable

**What's wrong:** The stack-history chart has no axis labels, tick values, hand numbers, or exact values. It confirms direction but not magnitude or timing, limiting usefulness for poker stats.  
**Repro steps:** Play one or more hands → Home → My Stats.  
**Evidence:** `15-stats.png`, `08-stats.png`.

### QA-017 — Medium — Store — Repeated `Buy` buttons lack context and are easy to confuse

**What's wrong:** Multiple coin packs and cosmetics use identical `Buy` labels. Without nearby price/pack context in the button label, users and screen readers cannot distinguish which purchase is being activated.  
**Repro steps:** Home → Store; scroll through Coin Packs/Cosmetics.  
**Evidence:** `16-store-top.png`, `09b-store-mid.png`, `16c-store-cosmetics.png`.

### QA-018 — Medium — Cross-screen ads — Placeholder ad banner crowds or clips content on core screens

**What's wrong:** The placeholder `Your banner ad here · AdMob 320×50` appears on nearly every screen and often takes priority over product content. It clips home Settings, hides Pal controls, crowds table actions, and truncates friends list bottom content.  
**Repro steps:** Visit Home, Game Setup, Table, Pal Designer, Friends, Store.  
**Evidence:** `02-home.png`, `03-quickplay-setup-top.png`, `04-table-start.png`, `19-pal-face.png`, `14-friends-list.png`, `16c-store-cosmetics.png`.

### QA-019 — Medium — Create Room — End-user copy exposes implementation details and says sync is stubbed

**What's wrong:** The create-room note says `(Local demo — real-time sync via Firebase is stubbed.)`. This is useful for developers but undermines trust for users and directly contradicts the private-room flow.  
**Repro steps:** Home → Play with Friends → Create Room.  
**Evidence:** `12-friends-create-room.png`, `20-room-create.png`.

### QA-020 — Low — Game Setup — Horizontal section tabs are truncated and hard to scan

**What's wrong:** Several tabs are clipped/truncated (`Opponents & Difficu...`, partial offscreen tabs), and the tab row sits below the primary Start Game area. Users may not realize there are many sections or that the row scrolls horizontally.  
**Repro steps:** Home → Quick Play → swipe section tabs.  
**Evidence:** `03d-setup-tabs-scrolled.png`, `03b-setup-table-tab.png`.

### QA-021 — Low — Table — Community/player cards and HUD create heavy visual clutter at showdown

**What's wrong:** At showdown, player cards, community cards, HUD chips, result card, and ad all compete in the lower half. The result is readable, but the visual hierarchy is noisy for a key moment.  
**Repro steps:** Quick Play → play/check/call until showdown.  
**Evidence:** `04b-table-showdown.png`, `table-showdown.png`.

### QA-022 — Low — Table — Confetti is subtle/partly hidden behind the result area

**What's wrong:** Win confetti does appear, but much of it is behind or below the result panel and is easy to miss in screenshots. The win moment could feel underwhelming despite the spec calling out confetti.  
**Repro steps:** Win a hand at showdown.  
**Evidence:** `04b-table-showdown.png`, `table-showdown.png`.

### QA-023 — Low — Login — Legal/safety text is not visible without scrolling

**What's wrong:** `Play-money only. 18+. No real gambling.` is below the initial viewport on logout/login. Safety copy should remain visible on a gambling-themed app, especially before entering.  
**Repro steps:** Logout/fresh launch → Login.  
**Evidence:** `18-login-logged-out.png`, `login-screen.png`.

### QA-024 — Low — Login / Expo Go — Dev-menu floating gear can cover app controls in development builds

**What's wrong:** Expo Go's blue dev-menu gear initially appeared over the app near the upper-right, visually competing with or covering the app's own settings area. This is a development-only issue, but it interfered with QA and screenshots until disabled.  
**Repro steps:** Launch in Expo Go with dev menu floating action button enabled.  
**Evidence:** `launch-lan-8084.png`, `reopen-lan-8084.png`, `login-screen.png`.

### QA-025 — Low — Friends — Add-friend placeholder is clipped/oddly spaced

**What's wrong:** The placeholder reads like spaced-out characters and truncates near `co`, making `Friend name or code` harder to parse.  
**Repro steps:** Home → Friends; inspect empty Add Friend field.  
**Evidence:** `14-friends-list.png`, `12c-friends-setup.png`.

### QA-026 — Low — Friends — Remove action is an unlabeled `X`

**What's wrong:** Each friend row has an `X` button. Visually it is ambiguous (close? remove? dismiss?) and does not communicate destructiveness until after interaction.  
**Repro steps:** Home → Friends; inspect friend rows.  
**Evidence:** `14-friends-list.png`.

### QA-027 — Low — Store — Remove Ads copy contradicts the visible persistent ad banner

**What's wrong:** The card says Remove Ads is a premium flag, but also says the screen keeps its sample banner so the layout remains testable. This is confusing product copy and may make purchase value unclear.  
**Repro steps:** Home → Store → scroll to Remove Ads.  
**Evidence:** `16b-store-remove-ads.png`, `09c-store-cosmetics.png`.

### QA-028 — Low — Store — Gold purchase button has weak contrast

**What's wrong:** The gold `Buy $2.99` / `Buy` buttons use gold/yellow styling with dark/gold text and a coin icon, making labels less legible than blue/green CTAs.  
**Repro steps:** Home → Store → view High Roller / Remove Ads / cosmetics purchase buttons.  
**Evidence:** `09b-store-mid.png`, `16b-store-remove-ads.png`, `16c-store-cosmetics.png`.

### QA-029 — Low — Settings — Scroll positions can show clipped panels without section context

**What's wrong:** Mid-scroll settings screenshots start with partial controls/panels cut at the top, while the header only says `Settings`. Users lose context about which section they are editing.  
**Repro steps:** Home → Settings → swipe several times through preferences.  
**Evidence:** `17b-settings-prefs.png`, `17c-settings-account.png`, `21-settings-account-bottom.png`.

### QA-030 — Low — Settings — Horizontal option chips clip offscreen with little affordance

**What's wrong:** Options such as Table Theme extend beyond the right edge (partial `F...` chip visible). Horizontal scrolling is possible, but there is minimal visual affordance and no label telling users more choices are hidden.  
**Repro steps:** Home → Settings → scroll to Appearance/Table Theme.  
**Evidence:** `21-settings-account-bottom.png`.

### QA-031 — Low — Store — Cosmetic tabs are cramped and icon rendering is inconsistent

**What's wrong:** Cosmetic category tabs are tight; the Cards tab shows a small/odd card glyph before `Cards`, and tabs compete for horizontal space.  
**Repro steps:** Home → Store → scroll to Cosmetics.  
**Evidence:** `16c-store-cosmetics.png`, `09c-store-cosmetics.png`.

### QA-032 — Nit — Settings — Typo/spacing: `SFXVolume`

**What's wrong:** The label is missing a space; it should read `SFX Volume`.  
**Repro steps:** Home → Settings → Sound & Haptics.  
**Evidence:** `17-settings-top.png`, `10-settings-top.png`.

### QA-033 — Nit — Stats — `Showdown W` abbreviation is unclear

**What's wrong:** `Showdown W` is not explained in the help section, unlike VPIP/PFR/AF. Consider `Showdown Win %` or add help text.  
**Repro steps:** Home → My Stats.  
**Evidence:** `15-stats.png`, `08-stats.png`.

### QA-034 — Nit — Game Setup — Inconsistent casing/punctuation around `vs`

**What's wrong:** Setup uses `QUICK PLAY VS BOTS`, while Home uses `vs. computer`. The inconsistency is small but visible in the primary flow.  
**Repro steps:** Home → Quick Play.  
**Evidence:** `02-home.png`, `03-quickplay-setup-top.png`.

### QA-035 — Nit — General copy — Several mock/demo labels leak into user-facing UI

**What's wrong:** Phrases like `Mock IAP`, `Your banner ad here`, and `Local demo` are visible throughout. They are acceptable in a prototype but should be hidden, renamed, or gated before broader user testing.  
**Repro steps:** Visit Store, Home, Create Room, Table.  
**Evidence:** `16-store-top.png`, `12-friends-create-room.png`, `04-table-start.png`, `02-home.png`.

### QA-036 — Nit — Room code typography — Some characters are visually ambiguous at a glance

**What's wrong:** Large room codes are attractive, but characters such as `Q/J` in `YBJQML` and the wide tracking may be hard to read aloud quickly. Consider clearer grouping or a copy button.  
**Repro steps:** Home → Play with Friends → Create Room.  
**Evidence:** `20-room-create.png`, `12-friends-create-room.png`.

---

## Top 10 most important fixes

1. Fix the `exp://127.0.0.1:8081` launch/redbox path so the requested simulator URL loads the app reliably.
2. Rework Game Setup layout so section tabs reveal visible editable rows; the 100+ settings must be discoverable on phone screens.
3. Move/resize the table HUD so it does not overlap opponent cards, player pods, or labels.
4. Make Play with Friends start a real friends/private-room experience or clearly label bot-filled demo behavior.
5. Fix login vertical layout so `Play as Guest`, legal text, and email form submit/errors are visible without awkward scrolling.
6. Add proper accessibility roles/labels/test IDs to custom buttons/tiles to improve VoiceOver and automation reliability.
7. Fix Home's clipped Settings tile and bottom grid/ad layout.
8. Improve table safe-area spacing so action buttons are not crowded against the banner ad.
9. Add a visible turn timer/timebank on the table when timing settings are enabled.
10. Make Friends Add actually add/clear with clear success/error feedback, and disable or explain invites for offline friends.
