#!/usr/bin/env python3
"""Generate the five candidate app icons as 1024x1024 SVGs.

Each icon is a distinct artistic point of view rather than a variation on one
idea, so the choice is between *directions*, not details. They all draw from the
shipped palette in src/theme/theme.ts so a winner drops straight into the app.

Run: python3 scripts/make-icons.py
Output: docs/design/icons/*.svg
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "design" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

# --- shipped brand palette (src/theme/theme.ts) ---------------------------
FELT = "#1F2D28"
FELT_LIGHT = "#283833"
FELT_DEEP = "#18231F"
RAIL = "#0D1211"
GOLD = "#D6B45C"
GOLD_DEEP = "#A98A38"
RED = "#D65A4B"
BLUE = "#2F9FD4"
BLUE_DEEP = "#17709E"
BLUE_INK = "#0F5478"
ON_DARK = "#EDF2F0"
INK = "#2B3A45"
CREAM = "#F1E9DA"

S = 1024
HALF = S // 2


def doc(body: str, bg: str = "") -> str:
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" width="{S}" height="{S}">'
        f"{bg}{body}</svg>"
    )


def spade(cx, cy, scale, fill, opacity=1.0):
    """A spade built from primitives rather than a traced glyph, so it stays
    crisp and can be recoloured per design."""
    r = 172 * scale
    lobe_y = cy + 86 * scale
    apex_y = cy - 286 * scale
    half_w = 286 * scale
    stem_top = cy + 150 * scale
    stem_bot = cy + 432 * scale
    stem_half = 150 * scale
    return (
        f'<g fill="{fill}" opacity="{opacity}">'
        f'<polygon points="{cx},{apex_y} {cx-half_w},{lobe_y} {cx+half_w},{lobe_y}"/>'
        f'<circle cx="{cx-114*scale}" cy="{lobe_y}" r="{r}"/>'
        f'<circle cx="{cx+114*scale}" cy="{lobe_y}" r="{r}"/>'
        f'<path d="M {cx-30*scale} {stem_top} '
        f'C {cx-34*scale} {stem_top+150*scale} {cx-stem_half} {stem_bot-56*scale} {cx-stem_half} {stem_bot} '
        f'L {cx+stem_half} {stem_bot} '
        f'C {cx+stem_half} {stem_bot-56*scale} {cx+34*scale} {stem_top+150*scale} {cx+30*scale} {stem_top} Z"/>'
        f"</g>"
    )


# =========================================================================
# 1. Swiss / International Typographic  — Josef Muller-Brockmann
# Reductive geometry on a strict grid. No ornament, no gradient, no depth.
# The suit is *constructed*, not decorated, and one hairline rule does the
# work an illustration would.
# =========================================================================
def swiss():
    bg = f'<rect width="{S}" height="{S}" fill="{FELT}"/>'
    body = (
        # grid rule at the 1/3 line
        f'<rect x="0" y="812" width="{S}" height="26" fill="{GOLD}"/>'
        f'<rect x="0" y="838" width="{S}" height="80" fill="{RED}"/>'
        + spade(512, 392, 0.92, ON_DARK)
    )
    return doc(body, bg)


# =========================================================================
# 2. Art Deco  — A.M. Cassandre / Erte
# Bilateral symmetry, stepped geometry and metallic linework. Casino
# heritage: the Chrysler-building fan, gold on deep green.
# =========================================================================
def deco():
    rays = []
    for i in range(-5, 6):
        ang = i * 8.6
        rays.append(
            f'<polygon points="512,980 {512 + 300*ang/60 - 26},120 {512 + 300*ang/60 + 26},120" '
            f'fill="{GOLD}" opacity="{0.20 if i % 2 else 0.34}" '
            f'transform="rotate({ang} 512 980)"/>'
        )
    bg = (
        f'<defs><linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{FELT_LIGHT}"/><stop offset="1" stop-color="{RAIL}"/>'
        f"</linearGradient></defs>"
        f'<rect width="{S}" height="{S}" fill="url(#dg)"/>'
    )
    steps = "".join(
        f'<rect x="{512 - w//2}" y="{y}" width="{w}" height="14" fill="{GOLD}" opacity="0.9"/>'
        for w, y in ((420, 812), (300, 852), (180, 892))
    )
    body = (
        "".join(rays)
        + f'<circle cx="512" cy="452" r="344" fill="none" stroke="{GOLD}" stroke-width="10"/>'
        + f'<circle cx="512" cy="452" r="316" fill="none" stroke="{GOLD_DEEP}" stroke-width="4"/>'
        + spade(512, 424, 0.78, GOLD)
        + steps
    )
    return doc(body, bg)


# =========================================================================
# 3. Contemporary iOS depth  — Michael Flarup
# One hero object, believable lighting, soft gradients. The thing the icon
# depicts is a physical object you could pick up: a clay chip.
# =========================================================================
def chip():
    bg = (
        f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="{BLUE}"/><stop offset="1" stop-color="{BLUE_INK}"/></linearGradient>'
        f'<radialGradient id="chipface" cx="0.36" cy="0.30" r="0.85">'
        f'<stop offset="0" stop-color="#FFFFFF"/><stop offset="0.55" stop-color="#F0F4F7"/>'
        f'<stop offset="1" stop-color="#C9D6DF"/></radialGradient>'
        f'<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#FFFFFF" stop-opacity="0.55"/>'
        f'<stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></linearGradient>'
        f"</defs>"
        f'<rect width="{S}" height="{S}" fill="url(#sky)"/>'
    )
    notches = "".join(
        f'<rect x="496" y="132" width="32" height="96" rx="16" fill="{RED}" '
        f'transform="rotate({a} 512 512)"/>'
        for a in range(0, 360, 45)
    )
    body = (
        # cast shadow grounds the object
        f'<ellipse cx="512" cy="862" rx="286" ry="46" fill="#000000" opacity="0.28"/>'
        f'<circle cx="512" cy="512" r="380" fill="{BLUE_DEEP}" opacity="0.55"/>'
        f'<circle cx="512" cy="500" r="380" fill="url(#chipface)"/>'
        + notches
        + f'<circle cx="512" cy="500" r="286" fill="none" stroke="{RED}" stroke-width="20" opacity="0.9"/>'
        f'<circle cx="512" cy="500" r="250" fill="{FELT}"/>'
        f'<circle cx="512" cy="500" r="250" fill="none" stroke="{GOLD}" stroke-width="10"/>'
        + spade(512, 468, 0.52, ON_DARK)
        # specular arc: the highlight that sells the material
        + f'<path d="M 300 300 A 300 300 0 0 1 724 300" fill="none" stroke="url(#gloss)" '
        f'stroke-width="54" stroke-linecap="round" opacity="0.7"/>'
    )
    return doc(body, bg)


# =========================================================================
# 4. Character-led  — the friendly, social read
# The product is "Poker with Friends", so the hero is a face, not a suit.
# Reads warm at a glance and differentiates hard from every dark-green
# poker icon on the store.
# =========================================================================
def pal():
    bg = (
        f'<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#5FC2E8"/><stop offset="1" stop-color="{BLUE_DEEP}"/>'
        f"</linearGradient></defs>"
        f'<rect width="{S}" height="{S}" fill="url(#pg)"/>'
    )
    # two fanned cards behind the face
    card = (
        f'<g>'
        f'<rect x="-150" y="-210" width="300" height="420" rx="34" fill="#FFFFFF"/>'
        f'</g>'
    )
    body = (
        f'<g transform="translate(300 690) rotate(-19)">{card}'
        f'<text x="-96" y="-116" font-family="Helvetica,Arial,sans-serif" font-size="128" '
        f'font-weight="bold" fill="{RED}">A</text></g>'
        f'<g transform="translate(724 690) rotate(19)">{card}'
        f'<text x="26" y="-116" font-family="Helvetica,Arial,sans-serif" font-size="128" '
        f'font-weight="bold" fill="{INK}">K</text></g>'
        # face
        f'<circle cx="512" cy="430" r="250" fill="#F6C89B"/>'
        f'<path d="M 262 400 A 250 250 0 0 1 762 400 L 762 356 A 250 250 0 0 0 262 356 Z" fill="#3B2B25"/>'
        f'<circle cx="512" cy="330" r="252" fill="#3B2B25" opacity="0"/>'
        # hair cap
        f'<path d="M 268 408 A 244 244 0 0 1 756 408 A 244 190 0 0 0 268 408 Z" fill="#4A342B"/>'
        f'<circle cx="418" cy="446" r="34" fill="#2B2320"/>'
        f'<circle cx="606" cy="446" r="34" fill="#2B2320"/>'
        f'<circle cx="428" cy="436" r="11" fill="#FFFFFF"/>'
        f'<circle cx="616" cy="436" r="11" fill="#FFFFFF"/>'
        f'<path d="M 440 546 Q 512 606 584 546" fill="none" stroke="#2B2320" '
        f'stroke-width="22" stroke-linecap="round"/>'
        # sunglasses glint / poker face accent
        f'<circle cx="336" cy="506" r="30" fill="{RED}" opacity="0.30"/>'
        f'<circle cx="688" cy="506" r="30" fill="{RED}" opacity="0.30"/>'
    )
    return doc(body, bg)


# =========================================================================
# 5. Bauhaus / Constructivist  — Herbert Bayer, El Lissitzky
# Flat primaries, hard diagonal, shapes doing the talking. Loud on a
# crowded home screen precisely because it refuses realism.
# =========================================================================
def bauhaus():
    bg = f'<rect width="{S}" height="{S}" fill="{CREAM}"/>'
    body = (
        # constructivist diagonal band
        f'<polygon points="0,1024 1024,0 1024,300 0,1024" fill="{BLUE}"/>'
        f'<polygon points="0,1024 0,760 1024,0 1024,60" fill="{RED}" opacity="0.92"/>'
        # black circle anchor
        f'<circle cx="372" cy="382" r="268" fill="{INK}"/>'
        # gold square, rotated - the "chip"
        f'<rect x="596" y="580" width="268" height="268" fill="{GOLD}" '
        f'transform="rotate(18 730 714)"/>'
        # the suit sits in negative space on the circle
        + spade(372, 358, 0.70, CREAM)
        # hard rule
        + f'<rect x="0" y="700" width="1024" height="22" fill="{INK}"/>'
    )
    return doc(body, bg)


ICONS = {
    "01-swiss": swiss,
    "02-deco": deco,
    "03-chip": chip,
    "04-pal": pal,
    "05-bauhaus": bauhaus,
}

if __name__ == "__main__":
    for name, fn in ICONS.items():
        path = OUT / f"{name}.svg"
        path.write_text(fn(), encoding="utf-8")
        print(f"wrote {path.relative_to(OUT.parent.parent.parent)}")
