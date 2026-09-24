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
