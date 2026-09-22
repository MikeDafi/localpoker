"""Measure reference playing cards: pip columns and rows as card fractions.

Checks the layout table in src/game/cardFace.ts against a real deck, so the pip
positions are measured rather than recalled. The measured values are asserted
in src/game/__tests__/cardFace.test.ts; this script is how they were obtained
and how they can be re-derived.

Needs `svgelements`, which is not a project dependency and which macOS's system
Python refuses to install into (PEP 668). Set up a throwaway environment:

    python3 -m venv .venv-tools
    ./.venv-tools/bin/pip install svgelements
    PYTHONPATH="$(echo .venv-tools/lib/python*/site-packages)" \\
      python3 scripts/measure-ref-card.py docs/design/cards/ref/*.svg \\
              docs/design/icon-final/ref/10H.svg docs/design/icon-final/ref/2S.svg
"""
import sys
from svgelements import SVG, Shape

for f in sys.argv[1:]:
    svg = SVG.parse(f)
    W, H = float(svg.width), float(svg.height)
    pips = []
    for el in svg.elements():
        if not isinstance(el, Shape):
            continue
        bb = el.bbox()
        if bb is None:
            continue
        x0, y0, x1, y1 = bb
        w, h = (x1 - x0) / W, (y1 - y0) / H
        # Body pips are exactly 1/6 W across and 1/6 H tall in this artwork;
        # everything else is the border, a rank glyph, or the half-scale
        # index pip.
        if abs(w - 1.0 / 6) < 0.01 and abs(h - 1.0 / 6) < 0.01:
            pips.append(((x0 + x1) / 2 / W, (y0 + y1) / 2 / H))
    pips.sort(key=lambda p: (round(p[1], 3), p[0]))
    print('%-12s %2d pips' % (f.split('/')[-1], len(pips)))
    for cx, cy in pips:
        col = {0.25: 'L', 0.5: 'C', 0.75: 'R'}.get(round(cx, 2), '?%.3f' % cx)
        print('    %s  row %5.2f/18   (cy=%.4f)' % (col, cy * 18, cy))
