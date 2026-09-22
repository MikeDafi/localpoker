#!/usr/bin/env python3
"""The Poker Face — v4.

Keeps v1's face and hair character (the version that was liked) but fixes the
one thing wrong with it: v1's hair was drawn as an arc whose peak sat ~47px
ABOVE the top of the skull, so it floated like a wig. Here the hair reuses the
head's own circle and is clipped to a hairline, so it fits the head exactly.

Also per direction: bigger head, bigger cards, and the hand is now a 10 and a 2
offsuit (one red, one black) with the rank and suit mirrored into opposite
corners the way a real card is printed.

Run: python3 scripts/make-icon-pokerface.py
"""
import pathlib
import re

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "design" / "icon-final"
OUT.mkdir(parents=True, exist_ok=True)

FELT = "#1F2D28"
FELT_LIGHT = "#31443D"
RAIL = "#0A0E0C"
RED = "#C8382B"
INK = "#2B3A45"
SKIN = "#F3C08E"
SKIN_SHADE = "#DCA771"
HAIR = "#4A342B"
MOUTH = "#33241E"

S = 1024

# Bootstrap Icons 1.11.3, MIT (c) The Bootstrap Authors. 16x16 viewBox.
HEART = ("M4 1c2.21 0 4 1.755 4 3.92C8 2.755 9.79 1 12 1s4 1.755 4 3.92c0 3.263-3.234 "
         "4.414-7.608 9.608a.513.513 0 0 1-.784 0C3.234 9.334 0 8.183 0 4.92 0 2.755 1.79 1 4 1")
SPADE = ("M7.184 11.246A3.5 3.5 0 0 1 1 9c0-1.602 1.14-2.633 2.66-4.008C4.986 3.792 6.602 "
         "2.33 8 0c1.398 2.33 3.014 3.792 4.34 4.992C13.86 6.367 15 7.398 15 9a3.5 3.5 0 0 "
         "1-6.184 2.246 20 20 0 0 0 1.582 2.907c.231.35-.02.847-.438.847H6.04c-.419 "
         "0-.67-.497-.438-.847a20 20 0 0 0 1.582-2.907")

# --- head geometry (v1 proportions, scaled up) -------------------------------
CX, CY, R = 512, 436, 300


# --- real card faces ---------------------------------------------------------
# The cards are the actual English-pattern faces by Dmitry Fomin, released CC0
# (public domain) on Wikimedia Commons, kept in docs/design/icon-final/ref/.
# Hand-drawing them was the wrong call: a real 10 has ten pips in a specific
# arrangement, pips are taller than wide, the face is 360x540 (2:3) rather than
# the squarer shape I had guessed, and the index is a condensed "10" whose 1 and
# 0 are separately kerned. Reusing the source artwork gets every one of those
# right by construction.
REF_DIR = pathlib.Path(__file__).resolve().parent.parent / "docs" / "design" / "icon-final" / "ref"

# The reference art carries its own nested translates, which already place the
# card face at 0,0 with a natural size of 360x540 - so it only needs centring.
REF_W, REF_H = 360.0, 540.0


def _ref_face(filename):
    raw = (REF_DIR / filename).read_text()
    inner = raw[raw.index(">", raw.index("<svg")) + 1: raw.rindex("</svg>")]
    inner = re.sub(r"<metadata.*?</metadata>", "", inner, flags=re.S)
    inner = re.sub(r'\s(?:inkscape|sodipodi):[\w-]+="[^"]*"', '', inner)
    # Editor leftovers: <inkscape:path-effect/> elements sit in <defs> and are
    # unreferenced, but an undeclared namespace makes strict parsers reject the
    # whole document.
    inner = re.sub(r'<(?:inkscape|sodipodi):[\w-]+[^>]*/>', '', inner)
    inner = re.sub(r'<(?:inkscape|sodipodi):([\w-]+)[^>]*>.*?</(?:inkscape|sodipodi):\1>',
                   '', inner, flags=re.S)
    return inner


FACES = {"10H": _ref_face("10H.svg"), "2S": _ref_face("2S.svg")}


def card(x, y, rot, face, w=248):
    """Place a real card face, centred on (x, y) and scaled to `w` wide.

    Height follows the card's true 2:3 proportion rather than being chosen."""
    scale = w / REF_W
    # feDropShadow is not honoured by every SVG rasteriser (including the one
    # used to check these), so the shadow is built from stacked translucent
    # rounded rects instead - which every renderer handles.
    shadow = "".join(
        f'<rect x="{-REF_W/2 - g:.1f}" y="{-REF_H/2 - g + dy:.1f}" '
        f'width="{REF_W + 2*g:.1f}" height="{REF_H + 2*g:.1f}" rx="{30 + g:.1f}" '
        f'fill="#000000" opacity="{op}"/>'
        for g, dy, op in ((18, 20, 0.10), (12, 15, 0.11), (7, 10, 0.12), (3, 6, 0.13))
    )
    return (f'<g transform="translate({x} {y}) rotate({rot}) scale({scale:.5f})">'
            f'{shadow}'
            f'<g transform="translate({-REF_W/2:.2f} {-REF_H/2:.2f})">{FACES[face]}</g>'
            f'</g>')


def build(variant="v4"):
    defs = (
        "<defs>"
        # Hairline: high across the brow, dropping past the temples to frame the
        # face. Clipping the head's own circle guarantees the hair sits ON the
        # skull instead of floating above it like v1's arc did.
        f'<clipPath id="hairclip"><path d="M 0 0 L {S} 0 L {S} 470 '
        f'C 838 470 668 306 512 306 C 356 306 186 470 0 470 Z"/></clipPath>'
        f'<radialGradient id="room" cx="0.5" cy="0.18" r="0.95">'
        f'<stop offset="0" stop-color="{FELT_LIGHT}"/>'
        f'<stop offset="0.55" stop-color="{FELT}"/>'
        f'<stop offset="1" stop-color="{RAIL}"/></radialGradient>'
        f'<linearGradient id="beam" x1="0" y1="0" x2="0" y2="1">'
        f'<stop offset="0" stop-color="#FFF4DC" stop-opacity="0.12"/>'
        f'<stop offset="1" stop-color="#FFF4DC" stop-opacity="0"/></linearGradient>'
        "</defs>"
    )
    bg = (f'<rect width="{S}" height="{S}" fill="url(#room)"/>'
          f'<polygon points="396,0 628,0 940,660 84,660" fill="url(#beam)"/>')

    head = (f'<circle cx="{CX-R*0.96:.1f}" cy="{CY+R*0.12:.1f}" r="{R*0.20:.1f}" fill="{SKIN_SHADE}"/>'
            f'<circle cx="{CX+R*0.96:.1f}" cy="{CY+R*0.12:.1f}" r="{R*0.20:.1f}" fill="{SKIN_SHADE}"/>'
            f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="{SKIN}"/>'
            f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="{HAIR}" clip-path="url(#hairclip)"/>')

    # v1's sunglasses: a brow bar over two wide lenses, joined by a short bridge.
    bar_y = CY - R * 0.345
    bar_h = R * 0.14
    lens_y = bar_y + bar_h * 0.72
    lens_h = R * 0.46
    lens_w = R * 0.89
    face = (f'<rect x="{CX-R*0.98:.1f}" y="{bar_y:.1f}" width="{R*1.96:.1f}" height="{bar_h:.1f}" '
            f'rx="{bar_h*0.43:.1f}" fill="{INK}"/>'
            f'<rect x="{CX-R*0.98:.1f}" y="{lens_y:.1f}" width="{lens_w:.1f}" height="{lens_h:.1f}" '
            f'rx="{lens_h*0.30:.1f}" fill="{INK}"/>'
            f'<rect x="{CX+R*0.98-lens_w:.1f}" y="{lens_y:.1f}" width="{lens_w:.1f}" '
            f'height="{lens_h:.1f}" rx="{lens_h*0.30:.1f}" fill="{INK}"/>'
            f'<rect x="{CX-R*0.09:.1f}" y="{lens_y+lens_h*0.16:.1f}" width="{R*0.18:.1f}" '
            f'height="{R*0.09:.1f}" fill="{INK}"/>'
            # v1's deadpan mouth
            f'<rect x="{CX-R*0.24:.1f}" y="{CY+R*0.44:.1f}" width="{R*0.48:.1f}" '
            f'height="{R*0.06:.1f}" rx="{R*0.03:.1f}" fill="{MOUTH}"/>')

    # 10-2 offsuit: the worst-looking hand a confident player can hold.
    if variant == "v5":
        # v4 had the two cards touching, which read as one wide white slab and
        # hid the 2's left column. Spacing them lets each card own its silhouette
        # and opens a gap on the centre line so the chin and mouth stay visible.
        cards = (card(300, 748, -13, "10H", w=238)
                 + card(724, 748, 13, "2S", w=238))
    else:
        cards = (card(350, 742, -15, "10H")
                 + card(674, 742, 15, "2S"))

    extra = ""
    if variant == "v5":
        # Rim light: the head previously met the dark felt with no separation, so
        # its silhouette dissolved at small sizes. A warm sliver along the lit
        # side reads as the overhead spot catching the edge of the face.
        extra += (f'<circle cx="{CX}" cy="{CY}" r="{R}" fill="none" '
                  f'stroke="#FFE2B8" stroke-width="7" opacity="0.30" '
                  f'stroke-dasharray="{R*1.5:.0f} {R*4.8:.0f}" '
                  f'transform="rotate(-128 {CX} {CY})"/>')
        # A single specular streak across one lens: the only thing that tells you
        # the glasses are glass rather than two black holes.
        extra += (f'<path d="M {CX-R*0.86:.1f} {lens_y+lens_h*0.86:.1f} '
                  f'L {CX-R*0.52:.1f} {lens_y+lens_h*0.14:.1f} '
                  f'L {CX-R*0.36:.1f} {lens_y+lens_h*0.14:.1f} '
                  f'L {CX-R*0.70:.1f} {lens_y+lens_h*0.86:.1f} Z" '
                  f'fill="#FFFFFF" opacity="0.13"/>')

    vignette = ""
    if variant == "v5":
        # Corner falloff concentrates attention on the face and stops the tile
        # reading as a flat rectangle of dark green.
        vignette = (f'<radialGradient id="vig" cx="0.5" cy="0.44" r="0.76">'
                    f'<stop offset="0.55" stop-color="#000000" stop-opacity="0"/>'
                    f'<stop offset="1" stop-color="#000000" stop-opacity="0.55"/>'
                    f'</radialGradient>')

    defs = defs.replace("</defs>", vignette + "</defs>")
    overlay = (f'<rect width="{S}" height="{S}" fill="url(#vig)"/>' if variant == "v5" else "")

    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" '
            f'width="{S}" height="{S}">{defs}{bg}{head}{face}{extra}{cards}{overlay}</svg>')


if __name__ == "__main__":
    for v in ("v4", "v5"):
        (OUT / f"pokerface-{v}.svg").write_text(build(v), encoding="utf-8")
        print(f"wrote docs/design/icon-final/pokerface-{v}.svg")
