#!/usr/bin/env python3
"""Five variations on the character + poker direction.

These are deliberately five *different relationships* between the character and
the game (peeking, bluffing, showing, competing, emblem) rather than five
re-colourings of one layout.

Run: python3 scripts/make-icons-character.py
Output: docs/design/icons-character/*.svg
"""
import pathlib

OUT = pathlib.Path(__file__).resolve().parent.parent / "docs" / "design" / "icons-character"
OUT.mkdir(parents=True, exist_ok=True)

FELT = "#1F2D28"
FELT_LIGHT = "#283833"
RAIL = "#0D1211"
GOLD = "#D6B45C"
GOLD_DEEP = "#A98A38"
RED = "#D65A4B"
BLUE = "#2F9FD4"
BLUE_DEEP = "#17709E"
BLUE_INK = "#0F5478"
ON_DARK = "#EDF2F0"
INK = "#2B3A45"
SKIN = "#F3C08E"
SKIN_SHADE = "#DCA771"
HAIR = "#4A342B"
HAIR_DARK = "#33241E"

S = 1024


def doc(body, defs=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" '
            f'width="{S}" height="{S}">{defs}{body}</svg>')


def grad(gid, c0, c1, vertical=True):
    x2, y2 = ("0", "1") if vertical else ("1", "0")
    return (f'<linearGradient id="{gid}" x1="0" y1="0" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="{c0}"/><stop offset="1" stop-color="{c1}"/>'
            f"</linearGradient>")


def card(x, y, rot, w=250, h=350, label="", label_fill=INK, pip=""):
    """A playing card. Label sits top-left like a real index."""
    inner = ""
    if label:
        inner += (f'<text x="{-w/2+26}" y="{-h/2+92}" font-family="Helvetica,Arial,sans-serif" '
                  f'font-size="86" font-weight="bold" fill="{label_fill}">{label}</text>')
    if pip:
        inner += (f'<text x="{-w/2+24}" y="{-h/2+168}" font-family="Helvetica,Arial,sans-serif" '
                  f'font-size="76" fill="{label_fill}">{pip}</text>')
    return (f'<g transform="translate({x} {y}) rotate({rot})">'
            f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="30" fill="#FFFFFF"/>'
            f'<rect x="{-w/2}" y="{-h/2}" width="{w}" height="{h}" rx="30" fill="none" '
            f'stroke="rgba(0,0,0,0.10)" stroke-width="3"/>{inner}</g>')


def head(cx, cy, r, hair=True, hair_fill=HAIR):
    """Face base: skull, hair cap, ears."""
    out = (f'<circle cx="{cx-r*0.96}" cy="{cy+r*0.12}" r="{r*0.20}" fill="{SKIN_SHADE}"/>'
           f'<circle cx="{cx+r*0.96}" cy="{cy+r*0.12}" r="{r*0.20}" fill="{SKIN_SHADE}"/>'
           f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{SKIN}"/>')
    if hair:
        # cap that follows the skull, thicker at the crown
        out += (f'<path d="M {cx-r} {cy-r*0.18} '
                f'A {r} {r} 0 0 1 {cx+r} {cy-r*0.18} '
                f'A {r*0.99} {r*0.62} 0 0 0 {cx-r} {cy-r*0.18} Z" fill="{hair_fill}"/>')
    return out


def eyes(cx, cy, r, spread=0.40, size=0.115, look=0.0):
    ex = r * spread
    er = r * size
    off = er * 0.30 * look
    return (f'<circle cx="{cx-ex}" cy="{cy}" r="{er}" fill="{HAIR_DARK}"/>'
            f'<circle cx="{cx+ex}" cy="{cy}" r="{er}" fill="{HAIR_DARK}"/>'
            f'<circle cx="{cx-ex+off}" cy="{cy-er*0.33}" r="{er*0.34}" fill="#FFFFFF"/>'
            f'<circle cx="{cx+ex+off}" cy="{cy-er*0.33}" r="{er*0.34}" fill="#FFFFFF"/>')


def brows(cx, cy, r, raise_=0.0):
    ex = r * 0.40
    w = r * 0.20
    return (f'<path d="M {cx-ex-w} {cy+raise_*r*0.05} Q {cx-ex} {cy-r*0.06} {cx-ex+w} {cy}" '
            f'fill="none" stroke="{HAIR_DARK}" stroke-width="{r*0.055}" stroke-linecap="round"/>'
            f'<path d="M {cx+ex-w} {cy} Q {cx+ex} {cy-r*0.06} {cx+ex+w} {cy+raise_*r*0.05}" '
            f'fill="none" stroke="{HAIR_DARK}" stroke-width="{r*0.055}" stroke-linecap="round"/>')


def smile(cx, cy, r, curve=0.42):
    w = r * 0.30
    return (f'<path d="M {cx-w} {cy} Q {cx} {cy+r*curve} {cx+w} {cy}" fill="none" '
            f'stroke="{HAIR_DARK}" stroke-width="{r*0.075}" stroke-linecap="round"/>')


def shades(cx, cy, r):
    """Wayfarer-style: wide lenses under a continuous brow bar. The earlier
    version used narrow lenses plus a floating bridge, which read as a VR
    headset rather than sunglasses."""
    lh = r * 0.46
    gap = r * 0.09
    top = cy - lh * 0.52
    left = cx - r * 0.98
    lw = (r * 1.96 - gap * 2) / 2
    return (f'<rect x="{left}" y="{top-r*0.10}" width="{r*1.96}" height="{r*0.14}" '
            f'rx="{r*0.06}" fill="{INK}"/>'
            f'<rect x="{left}" y="{top}" width="{lw}" height="{lh}" rx="{lh*0.30}" fill="{INK}"/>'
            f'<rect x="{left+lw+gap*2}" y="{top}" width="{lw}" height="{lh}" rx="{lh*0.30}" fill="{INK}"/>'
            f'<rect x="{left+lw}" y="{top+lh*0.16}" width="{gap*2}" height="{r*0.09}" fill="{INK}"/>')


# =====================================================================
# A. The Peek: only the eyes clear the top of the hand.
# The single most recognisable gesture in poker.
# =====================================================================
def peek():
    defs = f"<defs>{grad('bgA', FELT_LIGHT, RAIL)}</defs>"
    body = (f'<rect width="{S}" height="{S}" fill="url(#bgA)"/>'
            + head(512, 430, 250)
            + brows(512, 372, 250, raise_=1.0)
            + eyes(512, 452, 250, size=0.125)
            # hand of cards held up, hiding everything below the eyes
            # the hand must actually cover the lower face - that is the gesture
            + card(356, 792, -15, 310, 470, "A", RED, "&#9830;")
            + card(512, 812, 0, 310, 470, "K", INK, "&#9824;")
            + card(668, 792, 15, 310, 470, "Q", RED, "&#9829;")
            )
    return doc(body, defs)


# =====================================================================
# B. The Poker Face: shades, deadpan, cards reflected in the lenses.
# =====================================================================
def pokerface():
    defs = f"<defs>{grad('bgB', '#5FC2E8', BLUE_INK)}</defs>"
    body = (f'<rect width="{S}" height="{S}" fill="url(#bgB)"/>'
            + card(300, 812, -20, 250, 350, "A", RED, "&#9829;")
            + card(724, 812, 20, 250, 350, "A", INK, "&#9824;")
            + head(512, 448, 262)
            + shades(512, 440, 262)
            # flat, unreadable mouth: the whole point of a poker face
            + f'<rect x="{512-262*0.24}" y="{448+262*0.44}" width="{262*0.48}" '
              f'height="{262*0.06}" rx="{262*0.03}" fill="{HAIR_DARK}"/>'
            )
    return doc(body, defs)


# =====================================================================
# C. The Reveal: grinning, laying down the winning hand.
# The emotional payoff moment rather than the tense one.
# =====================================================================
def reveal():
    defs = f"<defs>{grad('bgC', FELT_LIGHT, RAIL)}</defs>"
    fan = "".join(
        card(512 + dx, 846 + abs(dx) * 0.09, rot, 224, 320, lbl, fill, pip)
        for dx, rot, lbl, fill, pip in (
            (-286, -26, "10", INK, "&#9824;"),
            (-146, -13, "J", RED, "&#9829;"),
            (0, 0, "Q", INK, "&#9824;"),
            (146, 13, "K", RED, "&#9830;"),
            (286, 26, "A", INK, "&#9824;"),
        )
    )
    body = (f'<rect width="{S}" height="{S}" fill="url(#bgC)"/>'
            # gold burst behind the head = "winner"
            + "".join(
                f'<polygon points="512,400 {512-22},{400-372} {512+22},{400-372}" '
                f'fill="{GOLD}" opacity="0.26" transform="rotate({a} 512 400)"/>'
                for a in range(15, 360, 45))
            + f'<circle cx="512" cy="392" r="290" fill="{GOLD}" opacity="0.14"/>'
            + head(512, 392, 238)
            + brows(512, 330, 238, raise_=1.4)
            + eyes(512, 404, 238, size=0.12)
            + smile(512, 470, 238, curve=0.52)
            + fan
            )
    return doc(body, defs)


# =====================================================================
# D. Head to Head: two players, one pot. The "with friends" read.
# =====================================================================
def headtohead():
    defs = f"<defs>{grad('bgD', FELT_LIGHT, RAIL)}</defs>"
    body = (f'<rect width="{S}" height="{S}" fill="url(#bgD)"/>'
            # felt oval between them
            + f'<ellipse cx="512" cy="580" rx="486" ry="330" fill="{FELT}"/>'
            + f'<ellipse cx="512" cy="580" rx="486" ry="330" fill="none" '
              f'stroke="{GOLD}" stroke-width="16" opacity="0.9"/>'
            + head(258, 420, 178, hair_fill=HAIR)
            + eyes(258, 436, 178, size=0.13)
            + smile(258, 488, 178, curve=0.46)
            + head(766, 420, 178, hair_fill="#6B4A3A")
            + eyes(766, 436, 178, size=0.13)
            + smile(766, 488, 178, curve=0.46)
            # the pot between them
            + f'<circle cx="512" cy="648" r="162" fill="{ON_DARK}"/>'
            + f'<circle cx="512" cy="648" r="162" fill="none" stroke="{RED}" stroke-width="24"/>'
            + f'<circle cx="512" cy="648" r="106" fill="{FELT}"/>'
            + f'<text x="512" y="694" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" '
              f'font-size="132" font-weight="bold" fill="{GOLD}">&#9824;</text>'
            + card(512, 916, -8, 236, 320, "A", RED, "&#9829;")
            )
    return doc(body, defs)


# =====================================================================
# E. The Medallion: the character as an emblem inside a chip, with the
# hand fanned behind it. Borrows the chip's strong circular silhouette.
# =====================================================================
def medallion():
    defs = f"<defs>{grad('bgE', '#5FC2E8', BLUE_INK)}{grad('chipE', '#F0D79A', GOLD_DEEP)}</defs>"
    notches = "".join(
        f'<rect x="498" y="188" width="28" height="64" rx="14" fill="{FELT}" opacity="0.55" '
        f'transform="rotate({a} 512 512)"/>' for a in range(0, 360, 30))
    body = (f'<rect width="{S}" height="{S}" fill="url(#bgE)"/>'
            + card(316, 452, -30, 244, 348, "A", RED, "&#9829;")
            + card(708, 452, 30, 244, 348, "K", INK, "&#9824;")
            + f'<ellipse cx="512" cy="852" rx="248" ry="38" fill="#000000" opacity="0.26"/>'
            + f'<circle cx="512" cy="512" r="318" fill="url(#chipE)"/><circle cx="512" cy="512" r="318" fill="none" stroke="{GOLD_DEEP}" stroke-width="8"/>'
            + notches
            + f'<circle cx="512" cy="512" r="232" fill="{FELT}"/>'
            + f'<circle cx="512" cy="512" r="232" fill="none" stroke="{GOLD}" stroke-width="12"/>'
            + head(512, 508, 168)
            + eyes(512, 520, 168, size=0.13)
            + smile(512, 570, 168, curve=0.48)
            )
    return doc(body, defs)


ICONS = {
    "A-peek": peek,
    "B-pokerface": pokerface,
    "C-reveal": reveal,
    "D-headtohead": headtohead,
    "E-medallion": medallion,
}

if __name__ == "__main__":
    for name, fn in ICONS.items():
        (OUT / f"{name}.svg").write_text(fn(), encoding="utf-8")
        print(f"wrote docs/design/icons-character/{name}.svg")
