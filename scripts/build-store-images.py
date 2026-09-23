"""
Build captioned App Store screenshots from raw simulator captures.

The App Store shows the first images at thumbnail size in search results, where
a raw capture of this dark table reads as mush. A short headline above a framed
device shot survives that shrink, which is why nearly every app in the category
does it.

Output is exactly 1320 x 2868, an accepted 6.9-inch iPhone portrait size, in RGB
with no alpha, which is what App Store Connect requires.

Run: python3 scripts/build-store-images.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "docs/store/screenshots/raw")
OUT = os.path.join(ROOT, "docs/store/screenshots")
FONT_DIR = os.path.join(ROOT, "node_modules/@expo-google-fonts/fredoka")

W, H = 1320, 2868

# Pulled from src/theme/theme.ts so the slides match the app rather than
# approximating it.
INK = (14, 22, 19)
FELT_TOP = (31, 45, 40)
FELT_BOTTOM = (11, 16, 14)
WHITE = (255, 255, 255)
BLUE = (47, 159, 212)
MUTED = (150, 170, 162)

# caption, subcaption, source capture
SLIDES = [
    ("Real Texas Hold'em.\nActually free.", "No paywalls, no chip packs, no catch.", "04-action.png"),
    ("Bots that actually\nplay poker.", "Four difficulties, from relaxed to punishing.", "02-difficulty.png"),
    ("Every hand, tracked.", "Win rate, VPIP, aggression, and what they mean.", "06-stats.png"),
    ("Private tables\nwith friends.", "Share a room code and deal everyone in.", "01-home.png"),
    ("Earn coins by playing.", "Every cosmetic is unlocked with chips you win.", "09-store.png"),
    ("Play money only.\nNo cash, ever.", "No deposits, no withdrawals, no real-world value.", "05-showdown.png"),
]


def font(weight, size):
    path = os.path.join(FONT_DIR, weight, "Fredoka_%s.ttf" % weight)
    if not os.path.exists(path):
        raise SystemExit("missing font: %s" % path)
    return ImageFont.truetype(path, size)


def backdrop():
    """Vertical felt gradient with a soft spotlight, echoing the table screen."""
    grad = Image.new("RGB", (1, H))
    px = grad.load()
    for y in range(H):
        t = y / (H - 1)
        px[0, y] = tuple(
            round(FELT_TOP[i] + (FELT_BOTTOM[i] - FELT_TOP[i]) * t) for i in range(3)
        )
    base = grad.resize((W, H), Image.BILINEAR)

    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse((-W // 3, -H // 6, W + W // 3, H // 2), fill=90)
    glow = glow.filter(ImageFilter.GaussianBlur(220))
    return Image.composite(Image.new("RGB", (W, H), (58, 78, 70)), base, glow)


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


def build(caption, sub, src, dest):
    canvas = backdrop()
    draw = ImageDraw.Draw(canvas)

    title_f = font("700Bold", 104)
    sub_f = font("500Medium", 46)

    margin = 96
    y = 168
    for line in wrap(draw, caption, title_f, W - margin * 2):
        draw.text((margin, y), line, font=title_f, fill=WHITE)
        y += 124

    y += 16
    for line in wrap(draw, sub, sub_f, W - margin * 2):
        draw.text((margin, y), line, font=sub_f, fill=MUTED)
        y += 60

    shot = Image.open(os.path.join(RAW, src)).convert("RGB")

    # Fit the whole device by height rather than cropping. An earlier version
    # sized to the full text width and cropped the overflow, which cut the
    # action buttons off the hero shot, exactly the part that sells the app.
    top = y + 84
    avail_h = H - 56 - top
    frame_h = avail_h
    frame_w = round(frame_h * shot.width / shot.height)
    max_w = W - margin * 2
    if frame_w > max_w:
        frame_w = max_w
        frame_h = round(frame_w * shot.height / shot.width)
    shot = shot.resize((frame_w, frame_h), Image.LANCZOS)
    left = (W - frame_w) // 2

    card = rounded(shot, 54)

    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (left, top + 18, left + frame_w, top + frame_h + 18), 54, fill=(0, 0, 0, 150)
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(34))

    canvas = Image.alpha_composite(canvas.convert("RGBA"), shadow)
    canvas.alpha_composite(card, (left, top))

    # Hairline edge, so the dark table screens do not bleed into the backdrop.
    ImageDraw.Draw(canvas).rounded_rectangle(
        (left, top, left + frame_w - 1, top + frame_h - 1),
        54,
        outline=(255, 255, 255, 46),
        width=3,
    )

    accent = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(accent).rounded_rectangle(
        (margin, 104, margin + 118, 114), 6, fill=BLUE + (255,)
    )
    canvas = Image.alpha_composite(canvas, accent)

    canvas.convert("RGB").save(dest, "PNG")


def main():
    missing = [s for _, _, s in SLIDES if not os.path.exists(os.path.join(RAW, s))]
    if missing:
        raise SystemExit("missing raw captures: %s" % missing)

    os.makedirs(OUT, exist_ok=True)
    for old in os.listdir(OUT):
        if old.startswith("localpoker-iphone-6.9") and old.endswith(".png"):
            os.remove(os.path.join(OUT, old))

    for i, (cap, sub, src) in enumerate(SLIDES, start=1):
        name = "localpoker-iphone-6.9-%02d.png" % i
        dest = os.path.join(OUT, name)
        build(cap, sub, src, dest)
        with Image.open(dest) as check:
            assert check.size == (W, H), "%s is %s" % (name, check.size)
            assert check.mode == "RGB", "%s is %s" % (name, check.mode)
        print("%s  %dx%d  %s" % (name, W, H, cap.splitlines()[0]))


if __name__ == "__main__":
    sys.exit(main())
