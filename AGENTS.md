# LocalPoker

A free, ad-supported, **play-money** Texas Hold'em game for iOS. React Native
and Expo SDK 57, TypeScript, Firebase Realtime Database, vitest.

Read this before changing anything. The skills in `.github/skills/` cover the
three jobs that have repeatedly cost time:

| Skill | Use it when |
|---|---|
| `verify-on-simulator` | Anything on the table moves a pixel |
| `table-layout` | Board, seats, showdown rows, "cards too small" |
| `ship-testflight` | Make a build, ship to testers, submit |

## Orientation

| | |
|---|---|
| Public repo | `github.com/MikeDafi/localpoker`, remote **`localpoker`**, branch `main` |
| Bundle id | `com.mike0264.localpoker` |
| Checks | `npx tsc --noEmit`, `npm test`, and **`npx eslint . --max-warnings 60`** |
| Rules tests | `npm run test:rules`, needs the Firebase emulator on port 9015 |

**Lint the way CI does, or it will fail after the tests pass.** CI runs
`npx eslint . --max-warnings 60`: the whole repository, not `src`, and with a
warning *budget*. `npx eslint src` reports zero errors while the repo sits at
63 warnings and the build dies at the lint step forty minutes in.

**`origin` is not this project.** It points at an unrelated private repository.
Pushing to `origin` pushes a poker app into somebody else's codebase. Always
name the remote: `git push localpoker HEAD:main`.

**`gh` defaults to a different account.** Run `gh auth switch --user MikeDafi`
before any `gh` command against `localpoker`, and switch back afterwards.

## Layout

```
src/engine/      Pure Texas Hold'em. No React, no Firebase, no time.
src/game/        Pure app logic: layout arithmetic, pacing, settings, bots.
src/components/  Presentational pieces. Cards, seats, chips, buttons.
src/screens/     One file per screen. TableScreen.tsx is ~2000 lines.
src/services/    Firebase, sound, telemetry, notifications.
src/state/       AppContext: settings, profile, friends, saved game.
```

The split that matters: **anything decidable without a device belongs in
`src/engine` or `src/game`**, where it can be tested. Layout arithmetic lives
in `src/game/showdownLayout.ts` for exactly this reason. `TableScreen` should
measure and render; it should not decide.

## The three constraints behind most decisions

1. **Firebase is on the Spark (free) plan, so there are no Cloud Functions.**
   Online play is therefore **host-authoritative**: the host's device deals and
   publishes state, and everyone else reads it. Every rule a table enforces is
   enforced by a phone someone owns. `docs/online/TRUST-MODEL.md` says what
   that does and does not protect.

2. **The engine is deterministic.** `startHand` shuffles from
   `` `${seed}:${handNumber}` ``, so any hand is reproducible from a seed. Use
   that to stage a scenario rather than playing toward it.

3. **It is play money and must stay that way.** No real-money anything, and
   `gamblingSimulated` stays false. That has been asked and declined four
   times; the reasoning is in `docs/store/SUBMISSION-CHECKLIST.md`.

## House style

- **No em dashes**, in prose or in code comments. Commas, colons and full
  stops instead.
- Comments explain **why**, especially why the obvious thing was not done.
  Several of the hardest bugs here were correct-looking arithmetic, and the
  comment saying "do not tighten this" is what stops it coming back.
- Prefer a pure function with tests over a clever expression inside a render.

## Store state

1.0.0 was **rejected** under guideline 2.3.6 and has not shipped. TestFlight is
unaffected: build 38 is live for internal testers and behind a public link,
with beta review approved. `docs/store/SUBMISSION-CHECKLIST.md` has the open
items.

The EAS free plan's iOS build allowance is **spent for October**, and it fails
at the end of the job rather than the start, so a red `ios-release` run is that
before it is anything else. `scripts/build-ios-local.sh` has no quota and is
what produced 37 and 38. A failed cloud build still takes its build number,
which is why 36 does not exist.

## Cosmetics

Anything the in-app store sells is **data keyed by the store item id**, in
`src/game/cosmetics.ts`. Felts, chip sets and card backs all work this way, and
each has a `resolve*` that settles the table setting over the equipped item
over the classic default, refusing anything unowned.

Two rules, both learned the hard way, and both now locked by tests:

- **An item on sale with no palette is a bug, not a gap.** It takes the coins,
  shows the tick, and changes nothing. This shipped twice, once for felts and
  chip sets and again for card backs.
- **`equipped` is an instruction, not a thing.** Publish it to a room and every
  guest follows it into their own closet. `pinCosmetics` settles it into a real
  id before a room is published, which is what makes a table look the same to
  everyone sitting at it.

A store preview must render the real component rather than an impression of
one. The card back preview was a gradient with two plain views standing in for
the pattern, so the thing on sale and the thing dealt were different pictures.
Each category owns one file in `src/components/storePreview/`, and the switch
in that folder's `index.tsx` is deliberate rather than a lookup, so a new
category without a preview is a type error instead of a blank sheet.

A third failure mode showed up after those two: **a cosmetic can be sold,
have a palette, and still not be reachable.** Outfits had neither palette nor
reader, so `equippedByCategory.outfits` went unread everywhere and six items
priced up to 5,000 coins changed nothing at all. `src/game/outfits.ts` applies
them now, and `src/game/__tests__/cosmeticSettings.test.ts` asserts in both
directions that every palette is offered in Game Setup and nothing is offered
without one.

## Where the arithmetic lives

Layout and policy that can be decided without a device belongs in `src/game`,
because that is the only place it can be tested. The table has been broken by
eyeballed layout four times, so prefer a module and a test over a formula in
`TableScreen`:

| Module | The thing it stops |
|---|---|
| `seatRing.ts` | Seat pods overlapping. Even spacing in *angle* is not even spacing in x, so end pods sat 32pt apart at 76pt wide. The test proves no overlap for 1 to 8 seats on 4 screen sizes. |
| `hostControls.ts` | A host rewriting the stakes mid-game. Only cosmetics and table visibility are changeable; the test asserts every agreed term is refused. |
| `showdownLayout.ts` | Tabled hands colliding with the board. |
| `chipStackLook.ts` | Chip and pot sizing, including the pot size tiers. |
| `purchaseHistory.ts` | Receipts, including the awkward case of items owned before the ledger existed. |
| `reportDelivery.ts` | The report flow hanging. See below. |

## A Firebase write does not fail when you are offline

It queues. The promise settles only once a server acknowledges it, which may
be never, so `await update(...)` is not bounded by anything. This froze the
whole screen when a player reported offensive content, at the worst possible
moment to look broken. Bound anything a person is waiting on, see
`withTimeout` in `src/moderation/reportDelivery.ts`.

## Blocking stops notifications by accident, not by design

A push comes from Expo without passing through the app, so nothing on the
device can filter one. The only thing that stops it is losing the ability to
read the recipient's token, and `pushTokens/$uid` grants that to the owner, a
friend, or someone with a pending request. `blockUser` and `reportUser` both
clear every one of those edges, which is what makes "no notifications from
someone you blocked" true.

It is therefore a safety property that holds as a consequence of the friend
rules rather than because any code says so. `scripts/rules-unit-check.cjs`
pins both halves of it. **If you change the `pushTokens` read rule, you are
changing who can notify a person who blocked them.**

## Security rules are not deployed by anything

`database.rules.json` is the source of truth for the repo and for
`npm run test:rules`, which runs against an emulator. **Nothing deploys it.**
No CI step, no build step. The live database keeps whatever was last pushed by
hand with `npm run deploy:rules`.

This has already cost a release. Build 34 shipped guest rebuys, one card
exposure and the run-it-twice vote, all three of which write to paths the
deployed rules had never heard of, so all three failed with permission denied
while the rules check passed locally. A green rules check says the file is
right, not that the database agrees with it.

**If you add or change a rule, run `npm run deploy:rules` before the build.**

## Do not

- Trigger an EAS build by pushing. It is opt-in only, see
  `.github/skills/ship-testflight/`.
- Trust layout arithmetic that has not been seen on a screen. It has been
  wrong three times, and the unit tests passed each time.
- Commit a `SHOT` harness or a scratch log. Revert before committing.
