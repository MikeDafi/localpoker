"""
Build the App Store screenshot set.

Composition notes, since several of these were arrived at the hard way:

Type is sized as a fraction of canvas height, because that is what survives the
store shrinking the image to a search thumbnail. Open-source compositors
converge on roughly 4.5 to 5 percent for the headline and 2.5 to 3 percent for
the subcaption; an earlier version here used 3.6 and 1.6 percent, which looked
fine at full size and went soft in a thumbnail.

The device bleeds off the bottom edge rather than floating as a card. A fully
contained, shadowed rectangle reads as a picture of a phone. Letting it run out
of frame reads as the app itself, and it buys roughly 300px of extra device at
the same canvas height.

Depth comes from the app's own materials: the real felt weave texture and the
real court-card artwork, both at low opacity. Invented gradients and glows are
the usual way these slides start looking generic.

Backgrounds are sampled from each screenshot, so every slide is tinted by the
content it carries and the set still feels like one family.

Output sizes are accepted App Store portrait sizes, RGB with no alpha. Both are
asserted before writing, because App Store Connect rejects either quietly.

Every measurement is a fraction of the canvas rather than a pixel constant, so
one layout serves both the 6.9-inch iPhone (1320 x 2868, aspect 0.46) and the
13-inch iPad (2064 x 2752, aspect 0.75). Type is the one thing that cannot key
off a single edge: scaled by height it goes timid on the much wider iPad
canvas, scaled by width it eats the whole slide. It is keyed to the canvas
diagonal instead, which tracks how large the type reads once the store shrinks
the image to fit a thumbnail box. The fractions are set so the iPhone numbers
come out exactly where they were tuned by hand.

Run: python3 scripts/build-store-images.py
"""
import colorsys
import math
import os
import sys

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, "docs/store/screenshots")
FONT_DIR = os.path.join(ROOT, "node_modules/@expo-google-fonts/fredoka")
FELT_TEX = os.path.join(ROOT, "assets/textures/felt-weave.png")
COURT_DIR = os.path.join(ROOT, "assets/cards/court")

WHITE = (255, 255, 255)

TITLE_LEAD = 1.10


class Device:
    """One App Store display size, and the layout derived from it."""

    def __init__(self, key, size, raw, out, corner):
        self.key = key
        self.W, self.H = size
        self.raw = os.path.join(SHOTS, raw)
        self.out = os.path.join(SHOTS, out)
        diag = math.hypot(self.W, self.H)

        self.MARGIN = round(self.W * 0.076)
        self.TITLE_PT = round(diag * 0.04181)
        self.SUB_PT = round(diag * 0.02376)
        self.TITLE_TOP = round(self.H * 0.055)
        # Proximity does the grouping. The headline and its subcaption have to
        # read as one block, so the gap inside the block is kept under a third
        # of the subcaption's size and the gap out to the device is about six
        # times that. An earlier version used 68px and 158px, a ratio of
        # 1:2.3, which let the eye read the three elements as one evenly
        # spaced cascade instead of two groups.
        self.SUB_GAP = round(self.SUB_PT * 0.30)
        self.DEVICE_GAP = round(self.SUB_GAP * 6.0)

        # Hardware corner radius differs between the two: relative to its own
        # width an iPad's corner is far tighter than an iPhone's, and reusing
        # the phone value made the tablet look like a rounded coaster.
        self.CORNER = corner
        self.SHADOW_BLUR = round(self.W * 0.0303)
        self.SHADOW_DROP = round(self.W * 0.0197)
        self.HAIRLINE = max(2, round(self.W * 0.00227))

    @property
    def missing(self):
        return [s for _, _, s, _, _ in SLIDES
                if not os.path.exists(os.path.join(self.raw, s))]


DEVICES = [
    Device("6.9", (1320, 2868), "raw", "felt", 0.072),
    Device("13", (2064, 2752), "raw-ipad", "felt-ipad", 0.040),
]


# headline, subcaption, capture, the court-card flourish, and which end of the
# capture must survive the bottom bleed.
#
# The flourish is placed per slide rather than pasted at one fixed spot on all
# six. A novelty element repeated mechanically stops registering by the third
# slide; varying which figure appears, which way it faces, how big it is and
# which edge it bleeds off keeps it reading as a considered choice. Each one is
# anchored to the empty quadrant that slide's headline leaves behind, so it
# fills dead space instead of competing with the type.
#
# court:  (art file, height as a fraction of canvas, x centre, y top, mirrored)
# anchor: "top" keeps the status bar and lets the bottom run off the canvas.
#         "bottom" does the reverse, for a screen whose payload is at the
#         bottom. The reactions sheet is the case that forced this: anchored to
#         the top it sliced the quick-line chips in half and cut the message
#         row off entirely, under a subcaption promising "quick lines".
SLIDES = [
    ("Real Texas Hold'em.\nActually free.",
     "No paywalls, no chip packs, no catch.",
     "04-action.png", ("K-s.png", 0.52, 0.86, 0.015, False), "top"),
    ("Heads up with\na friend.",
     "Share one code. Just the two of you.",
     "21-headsup.png", ("Q-h.png", 0.44, 0.14, 0.035, True), "top"),
    ("Bots that actually\nplay poker.",
     "Four difficulties, from relaxed to punishing.",
     "02-difficulty.png", ("J-c.png", 0.58, 0.90, 0.055, False), "top"),
    ("Every hand, tracked.",
     "Win rate, VPIP, aggression, and what they mean.",
     "06-stats.png", ("K-d.png", 0.40, 0.88, 0.010, False), "top"),
    ("Say something.",
     "GIFs, stickers, emoji and quick lines, built in.",
     "22-reactions.png", ("Q-s.png", 0.46, 0.84, 0.005, True), "bottom"),
    ("Your table, your Pal.",
     "Build an avatar that sits down with you.",
     "08-pal.png", ("J-h.png", 0.50, 0.12, 0.030, True), "top"),
]


def font(weight, size):
    path = os.path.join(FONT_DIR, weight, "Fredoka_%s.ttf" % weight)
    if not os.path.exists(path):
        raise SystemExit("missing font: %s" % path)
    return ImageFont.truetype(path, size)


def rel_luminance(rgb):
    def ch(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (ch(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


# White headline on this background has to clear 7:1 (WCAG AAA), because the
# store shrinks these to search thumbnails and anything softer disappears.
# Solving 1.05 / (L + 0.05) >= 7 gives L <= 0.10; the margin below leaves room
# for the felt texture and the court flourish, which both lighten what sits
# under the type.
MAX_BG_LUMINANCE = 0.085


def sampled_tone(shot):
    """Pick a background tone from the screenshot's own dominant hue.

    Each slide is then tinted by what it actually shows, which keeps the set
    coherent without every slide being the same flat green. Saturation and
    value are clamped hard: the background has to stay a background, and a
    saturated one would fight the screenshot sitting on top of it.
    """
    small = shot.convert("RGB").resize((64, 140), Image.LANCZOS)
    pixels = list(small.getdata())  # noqa: deprecated in Pillow 14, fine here
    best_h, best_s, best_w = 0.42, 0.18, 0.0
    buckets = {}
    for r, g, b in pixels:
        h, s, v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
        if s < 0.12 or v < 0.12:
            continue
        key = round(h * 24)
        entry = buckets.setdefault(key, [0, 0.0, 0.0])
        entry[0] += 1
        entry[1] += h
        entry[2] += s
    for key, (count, hsum, ssum) in buckets.items():
        if count > best_w:
            best_w, best_h, best_s = count, hsum / count, ssum / count

    sat_top = min(0.46, max(0.26, best_s * 0.80))
    # Light-mode captures (the stats and setup screens) yield a bright hue, so
    # the value is walked down until the headline is guaranteed to clear AAA
    # rather than trusting one clamp to suit every screenshot.
    val = 0.30
    while val > 0.06:
        top = colorsys.hsv_to_rgb(best_h, sat_top, val)
        if rel_luminance(tuple(c * 255 for c in top)) <= MAX_BG_LUMINANCE:
            break
        val -= 0.01
    top = colorsys.hsv_to_rgb(best_h, sat_top, val)
    bottom = colorsys.hsv_to_rgb(best_h, min(0.52, sat_top * 1.18), val * 0.28)
    return (
        tuple(round(c * 255) for c in top),
        tuple(round(c * 255) for c in bottom),
    )


def felt_overlay(size):
    """Tile the app's real felt weave, very faint, for physical texture."""
    tex = Image.open(FELT_TEX).convert("L")
    tile = Image.new("L", size)
    for y in range(0, size[1], tex.height):
        for x in range(0, size[0], tex.width):
            tile.paste(tex, (x, y))
    return tile


def court_watermark(spec, size, tone):
    """One huge court figure, bled off an edge, debossed into the background.

    This is the app's own public-domain court artwork rather than stock
    decoration, so the slide carries a piece of the product even in its
    background.

    It is tinted *darker* than the base tone, not lighter. Lit from above it
    looked better in isolation, but it sits directly behind the headline on
    several slides and lifting the backdrop there cost real contrast (slide 3
    measured 6.1:1, under AAA). Darkening can only ever help white type, so the
    flourish and the legibility floor stop competing.
    """
    name, scale, x_frac, y_frac, mirror = spec
    path = os.path.join(COURT_DIR, name)
    if not os.path.exists(path):
        return None
    art = Image.open(path).convert("RGBA")
    target_h = round(size[1] * scale)
    k = target_h / art.height
    art = art.resize((round(art.width * k), target_h), Image.LANCZOS)
    if mirror:
        art = art.transpose(Image.FLIP_LEFT_RIGHT)

    flat = Image.new("RGBA", art.size, tone + (255,))
    flat.putalpha(art.split()[3])
    left = round(size[0] * x_frac) - art.width // 2
    return flat, (left, round(size[1] * y_frac))


def rounded_mask(size, radius, open_bottom=False):
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius, fill=255)
    if open_bottom:
        # Square off the bottom so the device reads as running past the edge
        # rather than as a card that happens to be cropped.
        d.rectangle((0, size[1] - radius - 2, size[0], size[1]), fill=255)
    return mask


def wrap(draw, text, f, limit):
    lines = []
    for para in text.split("\n"):
        cur = ""
        for word in para.split():
            trial = ("%s %s" % (cur, word)).strip()
            if draw.textlength(trial, font=f) <= limit or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        lines.append(cur)
    return lines


def balanced_wrap(draw, text, f, limit):
    """Wrap to the fewest lines, then even them out.

    Greedy wrapping fills each line to the margin and pushes the remainder
    down, which is what left "no chip packs, no / catch." and "Just the two of
    / you." hanging a single word on their own line. Narrowing the measuring
    width as far as it will go without adding a line spreads the words evenly
    instead, the same thing CSS `text-wrap: balance` does.
    """
    target = len(wrap(draw, text, f, limit))
    if target < 2:
        return wrap(draw, text, f, limit)
    lo, hi = 1, limit
    while lo < hi:
        mid = (lo + hi) // 2
        if len(wrap(draw, text, f, mid)) <= target:
            hi = mid
        else:
            lo = mid + 1
    return wrap(draw, text, f, lo)


def build(dev, headline, sub, src, court, anchor, dest):
    W, H = dev.W, dev.H
    shot = Image.open(os.path.join(dev.raw, src)).convert("RGB")
    top_tone, bottom_tone = sampled_tone(shot)

    grad = Image.new("RGB", (1, H))
    px = grad.load()
    for y in range(H):
        t = y / (H - 1)
        # Ease the ramp so the darkening gathers behind the device rather than
        # marching evenly down the canvas.
        e = t * t * (3 - 2 * t)
        px[0, y] = tuple(
            round(top_tone[i] + (bottom_tone[i] - top_tone[i]) * e) for i in range(3)
        )
    canvas = grad.resize((W, H), Image.BILINEAR).convert("RGBA")

    wm = court_watermark(court, (W, H), tuple(round(c * 0.42) for c in top_tone))
    if wm is not None:
        art, at = wm
        layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer.paste(art, at, art)
        layer = layer.filter(ImageFilter.GaussianBlur(1.2))
        alpha = layer.split()[3].point(lambda a: round(a * 0.55))
        layer.putalpha(alpha)
        canvas = Image.alpha_composite(canvas, layer)

    texture = felt_overlay((W, H))
    tex_rgb = Image.merge("RGB", (texture, texture, texture)).convert("RGBA")
    canvas = Image.blend(canvas, ImageChops.overlay(canvas.convert("RGB"), tex_rgb.convert("RGB")).convert("RGBA"), 0.16)

    draw = ImageDraw.Draw(canvas)
    title_f = font("700Bold", dev.TITLE_PT)
    sub_f = font("500Medium", dev.SUB_PT)

    y = dev.TITLE_TOP
    for line in wrap(draw, headline, title_f, W - dev.MARGIN * 2):
        draw.text((dev.MARGIN, y), line, font=title_f, fill=WHITE)
        y += round(dev.TITLE_PT * TITLE_LEAD)

    y += dev.SUB_GAP
    sub_fill = tuple(min(255, round(c * 0.35 + 190)) for c in top_tone)
    for line in balanced_wrap(draw, sub, sub_f, W - dev.MARGIN * 2):
        draw.text((dev.MARGIN, y), line, font=sub_f, fill=sub_fill)
        y += round(dev.SUB_PT * 1.28)

    # Device: pinned to the same margin as the headline, so one vertical line
    # runs from the first letter down the left edge of the phone. It was
    # centred on the canvas before, which put it 2px off the text and set up a
    # second alignment system competing with the first.
    top = y + dev.DEVICE_GAP
    frame_w = W - dev.MARGIN * 2
    frame_h = round(frame_w * shot.height / shot.width)
    shot_r = shot.resize((frame_w, frame_h), Image.LANCZOS)
    left = dev.MARGIN
    visible_h = H - top
    if frame_h > visible_h:
        if anchor == "bottom":
            shot_r = shot_r.crop((0, frame_h - visible_h, frame_w, frame_h))
        else:
            shot_r = shot_r.crop((0, 0, frame_w, visible_h))
        frame_h = visible_h

    radius = round(frame_w * dev.CORNER)
    card = shot_r.convert("RGBA")
    card.putalpha(rounded_mask((frame_w, frame_h), radius, open_bottom=True))

    # One shadow, one light source, straight down. At 65% alpha this read as a
    # pasted-on sticker rather than a phone sitting in space; ambient occlusion
    # at this canvas size wants roughly 28% with a generous blur.
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (left + 10, top + dev.SHADOW_DROP, left + frame_w - 10, top + frame_h),
        radius, fill=(0, 0, 0, 72),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(dev.SHADOW_BLUR))
    canvas = Image.alpha_composite(canvas, shadow)
    canvas.alpha_composite(card, (left, top))

    # Hairline, so a dark screenshot does not merge into a dark backdrop.
    edge = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(edge).rounded_rectangle(
        (left, top, left + frame_w - 1, top + frame_h + radius),
        radius, outline=(255, 255, 255, 40), width=dev.HAIRLINE,
    )
    canvas = Image.alpha_composite(canvas, edge)

    canvas.convert("RGB").save(dest, "PNG")


def headline_contrast(dev, path):
    """Measured contrast of the white headline against what sits behind it.

    Sampled from the right of the title band, which is the emptiest part of it
    and therefore where the felt texture and the court flourish have the most
    influence on the backdrop.
    """
    box = (round(dev.W * 0.682), round(dev.H * 0.052),
           round(dev.W * 0.985), round(dev.H * 0.146))
    with Image.open(path) as im:
        bg = im.crop(box).resize((1, 1), Image.LANCZOS).getpixel((0, 0))
    lo = rel_luminance(bg)
    return 1.05 / (lo + 0.05)


def build_set(dev):
    os.makedirs(dev.out, exist_ok=True)
    for old in os.listdir(dev.out):
        if old.endswith(".png"):
            os.remove(os.path.join(dev.out, old))

    seen = set()
    for i, (head, sub, src, court, anchor) in enumerate(SLIDES, start=1):
        assert len(head.split()) <= 7, "headline too long: %r" % head
        assert src not in seen, "capture reused inside the set: %s" % src
        seen.add(src)

        name = "localpoker-%s-%02d.png" % (dev.key, i)
        dest = os.path.join(dev.out, name)
        build(dev, head, sub, src, court, anchor, dest)
        with Image.open(dest) as check:
            assert check.size == (dev.W, dev.H), "%s is %s" % (name, check.size)
            assert check.mode == "RGB", "%s is %s" % (name, check.mode)
        cr = headline_contrast(dev, dest)
        assert cr >= 7.0, "%s headline contrast %.1f:1, below AAA" % (name, cr)
        print("%-24s %-38s  %-18s  %.1f:1" % (name, head.replace("\n", " "), src, cr))


def main():
    # The iPhone set is the one that ships, so a missing capture there is a
    # hard failure. The iPad set is built opportunistically: its captures come
    # from a separate simulator run, and the app is iPhone-only today, so the
    # set is staged rather than required.
    built = 0
    for dev in DEVICES:
        if dev.missing:
            if dev is DEVICES[0]:
                raise SystemExit("missing captures: %s" % dev.missing)
            print("skipping %s: no captures for %s" % (dev.key, dev.missing))
            continue
        print("--- %s  %dx%d" % (dev.key, dev.W, dev.H))
        build_set(dev)
        built += 1
    return 0 if built else 1


if __name__ == "__main__":
    sys.exit(main())
