---
name: table-layout
description: "How the poker table sizes itself: the felt oval, the community lane, the board and the showdown rows. Use when changing the board card size, the showdown reveal, seat positions, or anything that complains the cards are too small, too big, overlapping, or leaving empty felt. Explains which constraint actually binds, and which three plausible-looking changes are traps."
---

# The table's geometry

Everything on the felt is sized from three measurements and a lot of hard-won
arithmetic. The pure parts live in `src/game/showdownLayout.ts` and are tested;
`src/screens/TableScreen.tsx` measures and renders.

## The vocabulary

| Name | What it is |
|---|---|
| `stageH` | Height of the table area, `winH * 0.46` (0.38 on short screens), clamped to 210..470 |
| `clothOval` | The felt inside the rail: `area.w - 2 * (FELT_INSET + FELT_RAIL)` |
| `laneTop` | `lowestSeatTop + podH + 6`, so the lane starts clear of the pods |
| `laneBottom` | `heroPodH + 6` |
| `sdCardSize` | The board's card size, solved not divided |

## Width is a function of height

The felt is an **oval**, so a row nearer the middle is wider than one below it.
`feltWidthAt(y, oval)` solves the ellipse. Every row must be measured where it
actually sits. Sizing the winning hands against the board's width is what drew
cards over the rail: they sit lower, where the oval has already narrowed.

## The board is solved, not divided

Card size and row position depend on each other: a bigger card pushes the row
lower, and lower is narrower. `fitBoardCard` walks down from a ceiling and
takes the first size whose own row fits.

**Do not** compute this from the measured `boardBox` instead. That puts the
answer inside its own question, and the row oscillates between two sizes
forever.

## Which constraint binds

Three can, and which one it is changes with the seat count:

- **Width**, from the oval at the row's height.
- **Lane height**, mid-hand: `laneH - POT_BLOCK_H`.
- **The showdown stack**: at a showdown the board, an 8pt gap and the winning
  hands all have to fit between the board's top edge and the hero's pod, so
  `boardMaxH` is that run divided by `1 + REVEAL_SHRINK`.

Log it before changing anything. Six-handed the pods are tall and the lane is
short; four-handed the width binds instead.

## Three traps

1. **High-water marks that start at a guess.** `podH` and `heroH` only ever
   grow, which is deliberate: it stops the lane jumping when a bet chip comes
   and goes. But `heroH` used to *start* at 96, so the guess became a floor the
   table could never get back under and the board paid for forty points of felt
   nobody was standing on. It starts from the first real measurement now. If
   you add another tracked height, do the same.

2. **Legibility floors that cannot yield.** `MIN_REVEAL_CARD` used to be
   absolute, so six hands held at 24pt ran a 340pt row across 320pt of felt and
   drew cards past the rail. A card too small to read is a poor outcome; a card
   off the table is a broken one. Width wins when they disagree.

3. **Unit tests that bless the arithmetic.** Thirty-one tests passed on a
   split pot that had collapsed both hands to the legibility floor, because
   they asserted the stacking formula rather than whether anything was
   readable. Assert the outcome, and then look at it: see
   `.github/skills/verify-on-simulator/`.

## Current shape

The board is always **five** cells. It grew to seven at showdown once so the
winner's cards had somewhere to land; seven across a phone makes every pip
uncountable, and it charged the board for showing two more. The winning hands
get their own row underneath instead, **side by side rather than stacked**,
because the lane is about one card tall and stacking halved nothing, it
collapsed everything.

Four cards (two hands) are narrower than a five card board, so an ordinary
split costs the cards nothing. Past that the row runs wider than the board and
out toward the rail, shrinking the gaps between hands before it shrinks the
cards.
