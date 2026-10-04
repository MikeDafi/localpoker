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
unaffected: build 33 is live for internal testers and behind a public link.
`docs/store/SUBMISSION-CHECKLIST.md` has the open items.

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

## Do not

- Trigger an EAS build by pushing. It is opt-in only, see
  `.github/skills/ship-testflight/`.
- Trust layout arithmetic that has not been seen on a screen. It has been
  wrong three times, and the unit tests passed each time.
- Commit a `SHOT` harness or a scratch log. Revert before committing.
