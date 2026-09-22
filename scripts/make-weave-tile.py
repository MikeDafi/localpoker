"""Turn a CC0 Poly Haven fabric photo into a tiny, tileable weave overlay.

The output is an RGBA PNG where each pixel is black or white with an alpha
proportional to how far that thread deviates from the cloth's average tone. Laid
over the felt with normal alpha blending it darkens and lightens exactly like a
real weave, without shifting the felt's hue.

Poly Haven assets are CC0 (public domain) — https://polyhaven.com/license
"""
import sys
from PIL import Image, ImageOps, ImageStat

SRC = sys.argv[1]
DST = sys.argv[2]
SIZE = int(sys.argv[3]) if len(sys.argv) > 3 else 256
# how strongly the weave shows through (max alpha of the most deviant thread)
STRENGTH = int(sys.argv[4]) if len(sys.argv) > 4 else 70

im = Image.open(SRC).convert("L")
# The source tile is already seamless, so resize the whole thing (never crop,
# which would break the tiling).
im = im.resize((SIZE, SIZE), Image.LANCZOS)
im = ImageOps.autocontrast(im, cutoff=1)

mean = ImageStat.Stat(im).mean[0]
px = im.load()

out = Image.new("RGBA", (SIZE, SIZE))
op = out.load()
peak = max(abs(px[x, y] - mean) for y in range(SIZE) for x in range(SIZE)) or 1

for y in range(SIZE):
    for x in range(SIZE):
        d = px[x, y] - mean
        a = int(min(1.0, abs(d) / peak) * STRENGTH)
        op[x, y] = (255, 255, 255, a) if d > 0 else (0, 0, 0, a)

out.save(DST, optimize=True)
print(f"{DST}  {SIZE}x{SIZE}  mean={mean:.0f} peak={peak:.0f}  max_alpha={STRENGTH}")
