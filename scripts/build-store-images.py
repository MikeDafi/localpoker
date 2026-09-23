"""
Build captioned App Store screenshot sets from raw simulator captures.

The App Store renders the first images at thumbnail size in search results,
where a raw capture of this dark table is unreadable. A short headline above a
framed device shot survives that shrink.

Four sets ship here, each a different marketing angle with its own colourway, so
they can be tested in App Store Connect rather than guessing which pitch lands.
Every set is self contained: swap a whole set, not individual slides, since the
colourway and the copy are designed together.

Output is exactly 1320 x 2868, an accepted 6.9-inch iPhone portrait size, RGB
with no alpha, which is what App Store Connect requires. The build asserts both
before writing.

Run:  python3 scripts/build-store-images.py            # all sets
      python3 scripts/build-store-images.py sharp      # one set
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "docs/store/screenshots/raw")
OUT = os.path.join(ROOT, "docs/store/screenshots")
FONT_DIR = os.path.join(ROOT, "node_modules/@expo-google-fonts/fredoka")

W, H = 1320, 2868

# Layout expressed as fractions of the canvas, so it holds if the target size
# changes. The title size is the load-bearing one: at roughly 3.6% of canvas
# height it stays legible when the store shrinks the image to a search thumbnail.
MARGIN = round(W * 0.073)
TITLE_PT = round(H * 0.0363)
SUB_PT = round(H * 0.016)
ACCENT_Y = round(H * 0.036)
TITLE_Y = round(H * 0.0586)


class Way(object):
    """A colourway plus the emotional register it is meant to hit."""

    def __init__(self, key, name, top, bottom, glow, title, sub, accent, note):
        self.key = key
        self.name = name
        self.top = top
        self.bottom = bottom
        self.glow = glow
        self.title = title
        self.sub = sub
        self.accent = accent
        self.note = note


WAYS = {
    # Felt green lifted straight from the table screen, so the slide and the
    # product read as the same thing.
    "felt": Way(
        "felt", "Table Felt",
        (31, 45, 40), (11, 16, 14), (58, 78, 70),
        (255, 255, 255), (150, 170, 162), (47, 159, 212),
        "Honest value. Reads as the product itself.",
    ),
    # Warm plum and coral. Deliberately not casino red and gold, which would
    # read as real-money gambling and fight the simulated-gambling rating.
    "night": Way(
        "night", "Game Night",
        (38, 30, 52), (16, 12, 24), (86, 64, 112),
        (255, 250, 245), (186, 170, 200), (255, 158, 102),
        "Social. Friday night with friends, not a casino floor.",
    ),
    # Cool slate and cyan for the skill pitch. Highest text contrast of the four.
    "sharp": Way(
        "sharp", "Sharp",
        (18, 28, 42), (8, 12, 20), (36, 62, 92),
        (247, 251, 255), (144, 166, 192), (86, 204, 242),
        "Mastery. Precision, numbers, getting better.",
    ),
    # Near black with one warm accent. Restrained, craft-forward.
    "craft": Way(
        "craft", "Midnight Craft",
        (20, 20, 22), (8, 8, 9), (44, 44, 48),
        (255, 255, 255), (158, 158, 164), (212, 175, 105),
        "Premium craft. Restraint, real cards, tactile feel.",
    ),
}


# headline, subcaption, source capture. Headlines stay at or under seven words
# so they survive the thumbnail.
SETS = {
    "felt": [
        ("Real Texas Hold'em.\nActually free.", "No paywalls, no chip packs, no catch.", "04-action.png"),
        ("Bots that actually\nplay poker.", "Four difficulties, from relaxed to punishing.", "02-difficulty.png"),
        ("Every hand, tracked.", "Win rate, VPIP, aggression, and what they mean.", "06-stats.png"),
        ("Private tables\nwith friends.", "Share a room code and deal everyone in.", "01-home.png"),
        ("Earn coins by playing.", "Every cosmetic is unlocked with chips you win.", "09-store.png"),
        ("Play money only.\nNo cash, ever.", "No deposits, no withdrawals, no real-world value.", "05-showdown.png"),
    ],
    "night": [
        ("Deal your friends in.", "One invite code. Everyone at the same table.", "10-friends.png"),
        ("No bots at your\nfriends table.", "Private rooms are real people only.", "01-home.png"),
        ("Someone is always\ngoing all in.", "The hand everyone argues about afterwards.", "12-win.png"),
        ("Bust out? Rebuy free.", "Nobody sits out because they ran out of chips.", "05-showdown.png"),
        ("Make the table\nyours.", "Avatars and table styles, earned by playing.", "08-pal.png"),
    ],
    "sharp": [
        ("Bots that actually\nfight back.", "Four tiers. Expert punishes real mistakes.", "12-win.png"),
        ("Find the leak\nin your game.", "VPIP, PFR, aggression, showdown win.", "06-stats.png"),
        ("Your best five,\nhighlighted.", "See exactly which cards made the hand.", "05-showdown.png"),
        ("Size every bet\nyourself.", "Pot fractions, no auto-play, no rails.", "04-action.png"),
        ("Tune the whole table.", "Blinds, stacks, seats, speed. All yours.", "02-difficulty.png"),
    ],
    "craft": [
        ("A real deck,\ndrawn properly.", "Public-domain court art, rebuilt for retina.", "05-showdown.png"),
        ("Peel your cards\nlike the real thing.", "Drag from any edge. The corner lifts and bends.", "04-action.png"),
        ("Chips that move.", "Bets slide in, pots sweep. Nothing teleports.", "04-holecards.png"),
        ("Dress the table\nyour way.", "Cards, felts and chips, earned by playing.", "09-store.png"),
        ("No ads in your way.", "No interstitials, no rewarded video, no pressure.", "01-home.png"),
    ],
}


def font(weight, size):
    path = os.path.join(FONT_DIR, weight, "Fredoka_%s.ttf" % weight)
    if not os.path.exists(path):
        raise SystemExit("missing font: %s" % path)
    return ImageFont.truetype(path, size)


def backdrop(way):
    """Vertical gradient with a soft overhead glow, echoing the table lighting."""
    grad = Image.new("RGB", (1, H))
    px = grad.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(
            round(way.top[i] + (way.bottom[i] - way.top[i]) * t) for i in range(3)
        )
    base = grad.resize((W, H), Image.BILINEAR)

    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-W // 3, -H // 6, W + W // 3, H // 2), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    return Image.composite(Image.new("RGB", (W, H), way.glow), base, glow)


def rounded(img, radius):
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, img.size[0] - 1, img.size[1] - 1), radius, fill=255
    )
    out = img.convert("RGBA")
    out.putalpha(mask)
    return out


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


def build(way, caption, sub, src, dest):
    canvas = backdrop(way)
    draw = ImageDraw.Draw(canvas)

    title_f = font("700Bold", TITLE_PT)
    sub_f = font("500Medium", SUB_PT)

    y = TITLE_Y
    for line in wrap(draw, caption, title_f, W - MARGIN * 2):
        draw.text((MARGIN, y), line, font=title_f, fill=way.title)
        y += round(TITLE_PT * 1.19)

    y += 16
    for line in wrap(draw, sub, sub_f, W - MARGIN * 2):
        draw.text((MARGIN, y), line, font=sub_f, fill=way.sub)
        y += round(SUB_PT * 1.3)

    shot = Image.open(os.path.join(RAW, src)).convert("RGB")

    # Fit the whole device by height. An earlier version sized to the text width
    # and cropped the overflow, which cut the action buttons off the hero shot,
    # exactly the part that sells the app.
    top = y + 84
    frame_h = H - 56 - top
    frame_w = round(frame_h * shot.width / shot.height)
    if frame_w > W - MARGIN * 2:
        frame_w = W - MARGIN * 2
        frame_h = round(frame_w * shot.height / shot.width)
    shot = shot.resize((frame_w, frame_h), Image.LANCZOS)
    left = (W - frame_w) // 2

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (left, top + 18, left + frame_w, top + frame_h + 18), 54, fill=(0, 0, 0, 150)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))

    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(rounded(shot, 54), (left, top))

    # Hairline edge, so dark table screens do not bleed into a dark backdrop.
    ImageDraw.Draw(canvas).rounded_rectangle(
        (left, top, left + frame_w - 1, top + frame_h - 1),
        54, outline=(255, 255, 255, 46), width=3,
    )

    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(accent).rounded_rectangle(
        (MARGIN, ACCENT_Y, MARGIN + 118, ACCENT_Y + 10), 6, fill=way.accent + (255,)
    )
    canvas = Image.alpha_composite(canvas, accent)

    canvas.convert("RGB").save(dest, "PNG")


def build_set(key):
    way = WAYS[key]
    slides = SETS[key]
    missing = [s for _, _, s in slides if not os.path.exists(os.path.join(RAW, s))]
    if missing:
        raise SystemExit("set %s missing captures: %s" % (key, missing))

    out_dir = os.path.join(OUT, key)
    os.makedirs(out_dir, exist_ok=True)
    for old in os.listdir(out_dir):
        if old.endswith(".png"):
            os.remove(os.path.join(out_dir, old))

    print("\n%s  (%s)" % (way.name, way.note))
    for i, (cap, sub, src) in enumerate(slides, start=1):
        name = "localpoker-6.9-%s-%02d.png" % (key, i)
        dest = os.path.join(out_dir, name)
        build(way, cap, sub, src, dest)
        with Image.open(dest) as check:
            assert check.size == (W, H), "%s is %s" % (name, check.size)
            assert check.mode == "RGB", "%s is %s" % (name, check.mode)
        print("  %s  %s" % (name, cap.replace("\n", " ")))


def main(argv):
    keys = argv[1:] or list(SETS.keys())
    for key in keys:
        if key not in SETS:
            raise SystemExit("unknown set %r, choose from %s" % (key, list(SETS)))
        build_set(key)


if __name__ == "__main__":
    sys.exit(main(sys.argv))
