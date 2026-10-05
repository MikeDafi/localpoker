# Third-party assets & pattern sources

Everything here was pulled from a permissively licensed source rather than drawn
by hand. Regenerate the texture with `scripts/make-weave-tile.py`.

---

## `felt-weave.png`: woven cloth texture

| | |
|---|---|
| **Source** | Poly Haven, "Stretch Poplin" fabric texture (`stretch_poplin`, 1K diffuse) |
| **URL** | https://polyhaven.com/a/stretch_poplin |
| **Authors** | colormass, Rico Cilliers |
| **License** | **CC0 1.0 Universal (public domain)**, https://polyhaven.com/license |

> "Our assets are all licensed as CC0, which is effectively Public Domain even in
> jurisdictions that do not support the Public Domain."

CC0 imposes no attribution requirement; credited here as a courtesy and so the
asset can be traced and regenerated.

**Processing** (`scripts/make-weave-tile.py`): the seamless 1K photo is converted
to greyscale, auto-contrasted, resized whole to 256×256 (never cropped, which
would break tiling), then re-encoded as an RGBA mask, each pixel is black or
white with alpha proportional to how far that thread deviates from the cloth's
mean tone. Composited with normal alpha blending it darkens and lightens like a
real weave without shifting the felt's hue.

Other CC0 candidates evaluated and rejected: `velour_velvet` (reads as speckled
noise on a dark felt), `rough_linen` (weave too coarse), `poly_wool_herringbone`
(directional pattern fights the table shape).

**Also reused for the casino carpet** (`src/components/CasinoFloor.tsx`): the same
CC0 tile is laid over the room background at a higher opacity and tinted with the
warm `floor*` theme colours, so the floor reads as carpet pile. One licensed
source, two surfaces, no second download, and the CC0 grant covers both uses.

---

## Suit watermark glyphs: `src/components/FeltSurface.tsx`

| | |
|---|---|
| **Source** | Bootstrap Icons `suit-spade-fill`, `suit-heart-fill`, `suit-diamond-fill`, `suit-club-fill` |
| **URL** | https://icons.getbootstrap.com/ |
| **Version** | 1.11.3 |
| **License** | **MIT** |

```
The MIT License (MIT)

Copyright (c) 2019-2024 The Bootstrap Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

The raw `d` path data is embedded in `FeltSurface.tsx` so the app takes no
runtime dependency on the icon package.

---

## Design references (not shipped)

`docs/research/table-refs/` holds publisher promotional screenshots from
Prominence Poker, Poker Club and Pure Hold'em, fetched from each game's Steam
store listing. They are **internal design reference only**, are not bundled into
the app, and all rights remain with their respective owners.

---

## App-icon and suit-pip playing cards: `docs/design/icon-final/ref/*.svg`

| | |
|---|---|
| **Source** | Wikimedia Commons, "English pattern 10 of hearts", "English pattern 2 of spades", "English pattern 2 of clubs", and "English pattern 2 of diamonds" |
| **Author** | Дмитрий Фомин (Dmitry Fomin) |
| **License** | **CC0 1.0 Universal (public domain dedication)** |

The 10 of hearts and 2 of spades faces in the app-icon concepts are used
unmodified and placed/scaled by `scripts/make-icon-pokerface.py`. They are
reproduced exactly: a render of the extracted face was diffed against the source
and matched with a maximum channel delta of 0.

The 2 of clubs and 2 of diamonds were additionally downloaded from the same CC0
set. The normalised suit pip paths in `src/game/suitPaths.ts` are derived from
the large body pips in these four SVGs.

Drawing the cards by hand was tried first and was wrong in ways that are hard to
eyeball: a 10 needs ten pips in a specific arrangement (not one central pip,
that is how an *ace* is printed), card faces are 360×540 (2:3) rather than the
squarer shape guessed, pips are taller than wide, and the "10" index is
condensed with separately kerned digits. Using the source artwork gets all of
that right by construction.

---

## Court-card figure panels: `assets/cards/court/*.png`

| | |
|---|---|
| **Source** | Wikimedia Commons, "English pattern {jack,queen,king} of {clubs,diamonds,hearts,spades}" |
| **Author** | Дмитрий Фомин (Dmitry Fomin) |
| **License** | **CC0 1.0 Universal (public domain dedication)** |

The source SVGs are saved in `docs/design/cards/ref/court/`. Commons metadata is
fetched through the API by `scripts/make-court-art.py`; the script verifies the
deck's CC0 metadata before downloading and rasterising.

Processing: each SVG is parsed with `svgelements`, dropping the full-card
background/border and the corner index columns. The measured central court-panel
bounds from all 12 cards are unioned so every figure is cropped at the same
scale and position. `cairosvg` renders that transparent crop at 400 px wide; the
result is downscaled to 200×319 and saved as an optimised 256-colour PNG with
alpha. `docs/design/cards/court-sheet.png` is the generated review contact
sheet.

These are shipped as PNGs rather than inline vectors because each court SVG is
roughly 140–200 KB of dense Bezier artwork. Bundling and rendering all 12 as
runtime SVG paths would add about 1.9 MB of vector source and make
`react-native-svg` draw hundreds of paths for a tiny card face; rasterising once
keeps the cards sharp at app sizes with a much smaller runtime cost.

---

## Card-layout reference deck: `docs/design/cards/ref/*.svg`

| | |
|---|---|
| **Source** | Wikimedia Commons, "English pattern {3,4,5,6,7,8,9} of hearts" |
| **Author** | Дмитрий Фомин (Dmitry Fomin) |
| **License** | **CC0 1.0 Universal (public domain dedication)** |

Not shipped, and not used to draw anything. These exist so the pip layout table
in `src/game/cardFace.ts` can be *checked* against a real deck instead of
recalled, with `scripts/measure-ref-card.py`. Every rank's columns and rows are
asserted against the measured positions in `cardFace.test.ts`.

Measuring them settled two things that guessing had got wrong. The pip grid is
startlingly regular, three columns at ¼, ½ and ¾ of card width, rows on odd
eighteenths of card height, and a **seven is genuinely not symmetric**: its odd
pip sits between the top and middle rows, in the upper half only. An earlier
test asserted that every rank was symmetric about its centre and was simply
wrong about how a seven is printed.

CC0 imposes no attribution requirement; credited here so the asset can be traced.

## Bet and check sound effects: `assets/sounds/chip.wav`, `assets/sounds/chipCall*.wav`, `assets/sounds/chipRaise*.wav`, `assets/sounds/check.wav`

The synthesised versions generated by `scripts/gen-sounds.js` were rejected as not
good enough. These replace them with real recordings, trimmed by hand, then
re-edited by `scripts/make-chip-sounds.py` for the call and raise variants.

### `chip.wav`: a clay poker chip landing on a stack

| | |
|---|---|
| **Source** | OpenGameArt.org, "54 Casino sound effects (cards, dice, chips)", file `Audio/chips-stack-2.ogg` from `kenney_casino-audio.zip` |
| **URL** | https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips |
| **Author** | Kenney Vleugels (kenney.nl) |
| **License** | **CC0 1.0 Universal (public domain dedication)**, https://creativecommons.org/publicdomain/zero/1.0/ |

The OpenGameArt page lists the license as CC0 and the `License.txt` bundled inside
the zip itself says the same thing in full:

> "License (Creative Commons Zero, CC0) ... You may use these assets in personal
> and commercial projects. Credit (Kenney or www.kenney.nl) would be nice but is
> not mandatory."

Kenney is a well known, prolific source of CC0 game assets, and the pack is
explicitly a set of real casino sound recordings (card, dice and chip handling),
not a stock library requiring a paid tier. CC0 imposes no attribution requirement;
credited here as a courtesy and so the asset can be traced.

**Processing**: the pack ships 19 chip related takes (`chip-lay-*`,
`chips-stack-*`, `chips-collide-*`). Each was decoded and its amplitude envelope
measured in 2 to 4ms bins to find the one with the least leading silence and a
single sharp transient with no secondary rattle. `chips-stack-2.ogg` won: attack
at 12ms, decayed to near silence by 150ms, no second hit in the tail.
`chip-lay-3.ogg` and `chips-collide-2.ogg` were close seconds but had a longer
decay tail that read as more of a clink than a hit. The winner was trimmed with
`ffmpeg -i chips-stack-2.ogg -af "atrim=start=0.010:end=0.150,asetpts=PTS-STARTPTS,afade=t=out:st=0.125:d=0.015" -ar 44100 -ac 1 -c:a pcm_s16le chip.wav`,
cutting the 10ms of leading near-silence so the hit is immediate and fading the
last 15ms out so the cut at 150ms is not audible as a click. Final file is mono,
44.1kHz, 16-bit PCM, 140ms, 12KB.

### `chipCall.wav`, `chipRaise.wav`, and the styled call and raise cues

All styled cues are deterministic edits of the same CC0 real chip recording used
by `chip.wav`. `chipCall.wav` and `chipRaise.wav` are retained for older builds
and are written byte-for-byte identical to `chipCall-toss.wav` and
`chipRaise-toss.wav`.

The three styles are:

| Style | Intent | Files |
|---|---|---|
| toss | The existing liked cue, a small tossed handful | `chipCall-toss.wav`, `chipRaise-toss.wav` |
| splash | A bigger, wetter scatter with more chips and a longer tail | `chipCall-splash.wav`, `chipRaise-splash.wav` |
| riffle | A tighter, drier stack landing with regular spacing | `chipCall-riffle.wav`, `chipRaise-riffle.wav` |

**Re-edited** (`scripts/make-chip-sounds.py`). The first versions of the call and
raise cues were a byte copy of the single `chip.wav` transient, and three
identical copies of it. Measured, both sat at a spectral centroid near 6kHz with
a 0.92 peak, while every other cue in the app peaks between 0.16 and 0.39, so
the betting sounds were the brightest and loudest things on the table and were
built from one unvarying click. That is a user interface tick, not money.

The variants are now clusters of the same CC0 hit at several pitches, with fixed
onsets, a one pole low pass, and levels well below the raw transient:

| File | Duration | Peak | Spectral centroid |
|---|---:|---:|---:|
| `chipCall-toss.wav` | 210ms | 0.420 | 5694Hz |
| `chipRaise-toss.wav` | 306ms | 0.460 | 6053Hz |
| `chipCall-splash.wav` | 339ms | 0.380 | 5477Hz |
| `chipRaise-splash.wav` | 459ms | 0.390 | 5734Hz |
| `chipCall-riffle.wav` | 201ms | 0.340 | 5952Hz |
| `chipRaise-riffle.wav` | 224ms | 0.370 | 6086Hz |

The pitch variation is the important part: identical repeats read as a machine,
and no two real chips land on the same note. Deterministic, the offsets and
gains are a fixed table rather than a random number generator, so regenerating
produces identical bytes.

### `check.wav`: synthesised knuckles rapping on a wooden table

No third-party sound recording is shipped for this cue. The previous public
domain wood-knock recording was replaced after measurement showed a persistent
low partial instead of a dry table rap.

**Processing** (`scripts/make-chip-sounds.py`): the cue is now two deterministic
filtered-noise impacts at fixed offsets. The synthesis deliberately avoids
modal resonators because even short sine modes reintroduced the exact pitched
ring the cue is meant to remove. Each impact has a broadband attack, a short
mid-frequency wood-body noise burst, and no reverb tail. The result is written
as mono, 44.1kHz, 16-bit PCM, 225ms, with a 0.40 peak.

| File | Peak | Spectral centroid | Final-rap decay |
|---|---:|---:|---:|
| original ringing `check.wav` | 0.550 | 483Hz | 165ms |
| first generated `check.wav` | 0.380 | 6937Hz | 75ms |
| final generated `check.wav` | 0.400 | 2156Hz | 65ms |

---

## Card backs

Nothing to credit, deliberately.

The backs in `src/game/cardBackPattern.ts` are generated from geometry: a
seamless diagonal lattice and a guilloche rosette, both plain trigonometry.
No artwork was traced, downloaded or shipped.

This was a decision, not an accident. The obvious reference is the Bicycle
Rider Back, which is **registered trade dress owned by the US Playing Card
Company**, and the stock images of it are licensed, not free. Several decks on
Wikimedia are CC0 for their *faces* only and have no back design at all.
Generating the pattern sidesteps all of that, costs nothing at any resolution,
and means a new back is a palette rather than an asset.

### A note on levels

`check.wav` is normalised to a 0.40 peak by `scripts/make-chip-sounds.py`,
putting it in the same range as the other action cues. The lower, less bright
spectrum lets it sit at that peak without reading louder than the chip cues.
The gain is flat with no limiting, and nothing clips.
