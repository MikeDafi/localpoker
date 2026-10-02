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
| Checks | `npx tsc --noEmit`, `npm test` (472 tests), `npx eslint src --ext .ts,.tsx` |
| Rules tests | `npm run test:rules`, needs the Firebase emulator on port 9015 |

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
unaffected: build 27 is live for internal testers and behind a public link.
`docs/store/SUBMISSION-CHECKLIST.md` has the open items.

## Do not

- Trigger an EAS build by pushing. It is opt-in only, see
  `.github/skills/ship-testflight/`.
- Trust layout arithmetic that has not been seen on a screen. It has been
  wrong three times, and the unit tests passed each time.
- Commit a `SHOT` harness or a scratch log. Revert before committing.
