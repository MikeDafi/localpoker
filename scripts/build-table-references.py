"""Build the reference findings page.

Samples the felt colour from each (visually verified) reference screenshot,
compares it against LocalPoker's own theme tokens, and writes a self-contained
HTML report next to the images.
"""
import colorsys
import json
import re
from PIL import Image

BASE = "docs/research/table-refs"

# Boxes below were verified by eye against a contact sheet — each sits on bare
# felt, clear of hands, chips and cards.
REFS = [
    {
        "slug": "prominence-poker",
        "game": "Prominence Poker",
        "studio": "Pipeworks Studios / 505 Games",
        "year": "2016",
        "file": "prominence-poker-2.jpg",
        "store": "https://store.steampowered.com/app/384180/",
        "box": (700, 618, 770, 640),
        "read": "Near-black felt with a cool violet cast, gold line-art inlay, and a thick black padded rail over a wooden base.",
        "takeaways": [
            "Felt is essentially black — the colour comes from the lighting, not the cloth.",
            "Ornament lives in a single metallic accent (gold) on an otherwise dead-flat surface.",
            "A wide matte rail separates the felt from the room and grounds the table.",
        ],
    },
    {
        "slug": "poker-club",
        "game": "Poker Club",
        "studio": "Ripstone",
        "year": "2020",
        "file": "poker-club-3.jpg",
        "store": "https://store.steampowered.com/app/1174460/",
        "box": (1500, 450, 1850, 650),
        "read": "Matte desaturated navy felt carrying a tonal suit-pattern watermark, lit evenly with no specular sheen.",
        "takeaways": [
            "Texture is tonal — the suit motif is only a few percent lighter than the base.",
            "Blue reads as 'premium casino' without the toy-green association.",
            "Cards and chips are the only saturated objects; the cloth never competes.",
        ],
    },
    {
        "slug": "pure-holdem",
        "game": "Pure Hold'em",
        "studio": "VooFoo Studios",
        "year": "2015",
        "file": "pure-holdem-1.jpg",
        "store": "https://store.steampowered.com/app/322950/",
        "box": (1150, 780, 1500, 950),
        "read": "Warm near-black charcoal felt with a visible fabric weave and a subtle damask swirl, lit by a single warm overhead source.",
        "takeaways": [
            "Visible cloth weave at close range is what sells 'felt' rather than 'flat colour'.",
            "One warm light source with a strong falloff creates all the depth.",
            "The darker the cloth, the more the cards pop as the focal point.",
        ],
    },
]

# LocalPoker's current tokens (src/theme/theme.ts)
OURS = [
    ("feltLight", "#1E2C27", "lit top of the table"),
    ("felt", "#16211D", "table surface"),
    ("feltDeep", "#111A17", "shaded bottom"),
    ("feltRail", "#161D1A", "rail"),
    ("feltRoom", "#080C0B", "room around the table"),
]


def hsl(rgb):
    h, l, s = colorsys.rgb_to_hls(*[v / 255 for v in rgb])
    return round(h * 360), round(s * 100), round(l * 100)


def sample(path, box):
    im = Image.open(path).convert("RGB")
    patch = im.crop(box)
    px = list(patch.getdata())
    n = len(px)
    rgb = (sum(p[0] for p in px) // n, sum(p[1] for p in px) // n, sum(p[2] for p in px) // n)
    # save the swatch crop so the report can show what was measured
    patch.resize((220, 90)).save(f"{BASE}/{'swatch-' + path.split('/')[-1]}")
    return rgb


def hexf(rgb):
    return "#%02X%02X%02X" % rgb


def to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


for r in REFS:
    rgb = sample(f"{BASE}/{r['file']}", r["box"])
    r["hex"] = hexf(rgb)
    r["h"], r["s"], r["l"] = hsl(rgb)
    r["swatch"] = "swatch-" + r["file"]

rows_ours = []
for name, hx, note in OURS:
    h, s, l = hsl(to_rgb(hx))
    rows_ours.append({"name": name, "hex": hx, "h": h, "s": s, "l": l, "note": note})

avg_s = round(sum(r["s"] for r in REFS) / len(REFS))
avg_l = round(sum(r["l"] for r in REFS) / len(REFS))
ours_felt = next(r for r in rows_ours if r["name"] == "felt")

with open(f"{BASE}/../table-references.json", "w") as f:
    json.dump({"references": REFS, "ours": rows_ours}, f, indent=2)


def cards():
    out = []
    for r in REFS:
        tk = "\n".join(f"<li>{t}</li>" for t in r["takeaways"])
        out.append(f"""
      <article class="card">
        <a class="shot" href="table-refs/{r['file']}" target="_blank" rel="noopener">
          <img src="table-refs/{r['file']}" alt="{r['game']} poker table screenshot" loading="lazy">
        </a>
        <div class="body">
          <header>
            <h2>{r['game']}</h2>
            <p class="meta">{r['studio']} &middot; {r['year']}</p>
          </header>
          <p class="read">{r['read']}</p>
          <div class="measure">
            <img class="patch" src="table-refs/{r['swatch']}" alt="felt sample from {r['game']}">
            <div class="vals">
              <span class="chip" style="background:{r['hex']}"></span>
              <code>{r['hex']}</code>
              <span class="hsl">hue {r['h']}&deg; &middot; sat {r['s']}% &middot; light {r['l']}%</span>
            </div>
          </div>
          <ul class="take">{tk}</ul>
          <a class="src" href="{r['store']}" target="_blank" rel="noopener">Official screenshots &rarr; Steam</a>
        </div>
      </article>""")
    return "\n".join(out)


def ours_rows():
    return "\n".join(
        f"""<tr><td><code>{o['name']}</code></td>
        <td><span class="chip sm" style="background:{o['hex']}"></span><code>{o['hex']}</code></td>
        <td>{o['h']}&deg;</td><td>{o['s']}%</td><td>{o['l']}%</td><td class="note">{o['note']}</td></tr>"""
        for o in rows_ours
    )


def ref_rows():
    return "\n".join(
        f"""<tr><td>{r['game']}</td>
        <td><span class="chip sm" style="background:{r['hex']}"></span><code>{r['hex']}</code></td>
        <td>{r['h']}&deg;</td><td>{r['s']}%</td><td>{r['l']}%</td><td class="note">measured from bare felt</td></tr>"""
        for r in REFS
    )


HTML = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Poker table references &mdash; 3 video games</title>
<style>
  :root {{
    --bg: #0B0F0E; --surface: #141A18; --line: rgba(255,255,255,.10);
    --ink: #EDF2F0; --soft: rgba(237,242,240,.78); --muted: rgba(237,242,240,.56);
    --accent: #2F9FD4;
  }}
  * {{ box-sizing: border-box; }}
  body {{
    margin: 0; background: var(--bg); color: var(--ink);
    font: 16px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif;
  }}
  .wrap {{ max-width: 1080px; margin: 0 auto; padding: 48px 24px 72px; }}
  h1 {{ font-size: 30px; line-height: 1.2; margin: 0 0 8px; letter-spacing: -.02em; }}
  .lede {{ color: var(--soft); margin: 0 0 8px; max-width: 70ch; }}
  .note-small {{ color: var(--muted); font-size: 13px; margin: 0 0 36px; max-width: 70ch; }}
  h2 {{ font-size: 19px; margin: 0; letter-spacing: -.01em; }}
  .meta {{ color: var(--muted); font-size: 13px; margin: 2px 0 0; }}
  .card {{
    background: var(--surface); border: 1px solid var(--line); border-radius: 14px;
    overflow: hidden; margin-bottom: 28px;
  }}
  .shot {{ display: block; background: #000; }}
  .shot img {{ width: 100%; height: auto; display: block; }}
  .body {{ padding: 20px 22px 22px; }}
  .read {{ color: var(--soft); margin: 12px 0 16px; }}
  .measure {{ display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    padding: 12px; border: 1px solid var(--line); border-radius: 10px; background: rgba(255,255,255,.02); }}
  .patch {{ width: 220px; height: 90px; object-fit: cover; border-radius: 6px; border: 1px solid var(--line); }}
  .vals {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
  .chip {{ width: 30px; height: 30px; border-radius: 6px; border: 1px solid var(--line); display: inline-block; vertical-align: middle; }}
  .chip.sm {{ width: 16px; height: 16px; border-radius: 4px; margin-right: 8px; }}
  code {{ font: 13px/1 ui-monospace, SFMono-Regular, Menlo, monospace; color: var(--ink); }}
  .hsl {{ color: var(--muted); font-size: 13px; }}
  .take {{ margin: 16px 0 14px; padding-left: 18px; color: var(--soft); }}
  .take li {{ margin: 5px 0; }}
  .src {{ color: var(--accent); text-decoration: none; font-size: 13px; }}
  .src:hover {{ text-decoration: underline; }}
  table {{ width: 100%; border-collapse: collapse; margin: 10px 0 26px; font-size: 14px; }}
  th, td {{ text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); }}
  th {{ color: var(--muted); font-weight: 600; font-size: 12px; text-transform: none; }}
  td.note {{ color: var(--muted); }}
  .panel {{ background: var(--surface); border: 1px solid var(--line); border-radius: 14px; padding: 22px; margin-bottom: 28px; }}
  .panel h2 {{ margin-bottom: 12px; }}
  .verdict li {{ margin: 8px 0; color: var(--soft); }}
  .foot {{ color: var(--muted); font-size: 12.5px; border-top: 1px solid var(--line); padding-top: 18px; }}
</style>
</head>
<body>
<div class="wrap">
  <h1>Poker table references &mdash; 3 video games</h1>
  <p class="lede">
    Official store screenshots for three dedicated poker games, with the felt colour
    measured straight out of each image and compared against LocalPoker's theme tokens.
  </p>
  <p class="note-small">
    Screenshots are the publishers' promotional assets, pulled from each game's Steam store
    listing and kept here purely as internal design reference. All rights remain with their
    respective owners.
  </p>

{cards()}

  <div class="panel">
    <h2>Measured felt vs. ours</h2>
    <table>
      <thead><tr><th>Reference</th><th>Felt</th><th>Hue</th><th>Sat</th><th>Light</th><th></th></tr></thead>
      <tbody>
{ref_rows()}
      </tbody>
    </table>
    <table>
      <thead><tr><th>LocalPoker token</th><th>Value</th><th>Hue</th><th>Sat</th><th>Light</th><th></th></tr></thead>
      <tbody>
{ours_rows()}
      </tbody>
    </table>
  </div>

  <div class="panel">
    <h2>What this tells us</h2>
    <ul class="verdict">
      <li><strong>Dark was the right call.</strong> The three references average
        <strong>{avg_l}% lightness</strong> and <strong>{avg_s}% saturation</strong>.
        Our felt sits at <strong>{ours_felt['l']}%</strong> lightness and
        <strong>{ours_felt['s']}%</strong> saturation &mdash; the same family, slightly darker
        and a little more desaturated than the middle of the pack.</li>
      <li><strong>Not one of them uses a bright green cloth.</strong> They run near-black
        (Prominence, Pure Hold'em) or desaturated navy (Poker Club). The old
        <code>#2FA35E</code> Wii-green had no equivalent in any modern poker title.</li>
      <li><strong>Every felt carries a texture.</strong> A tonal suit watermark, a damask
        swirl, or a visible cloth weave &mdash; always only a few percent off the base colour.
        Ours is still a flat gradient; that is the clearest remaining gap.</li>
      <li><strong>Ornament is a single metallic accent.</strong> Gold line-art on black
        (Prominence) is the only decoration on the surface &mdash; consistent with keeping the
        palette restrained.</li>
      <li><strong>One light source, strong falloff.</strong> All three are lit from above with
        the table edges falling into shadow, which is exactly the room &rarr; rail &rarr; felt
        hierarchy we built.</li>
    </ul>
  </div>

  <p class="foot">
    Generated by <code>scripts/build-table-references.py</code> &middot;
    screenshots fetched via <code>scripts/fetch-steam-refs.mjs</code> from Steam's public
    appdetails API &middot; felt colours averaged from hand-verified crops of bare cloth.
  </p>
</div>
</body>
</html>
"""

with open("docs/research/table-references.html", "w") as f:
    f.write(HTML)

print("references:")
for r in REFS:
    print(f"  {r['game']:<20} {r['hex']}  hue {r['h']:>3}  sat {r['s']:>2}%  light {r['l']:>2}%")
print(f"\naverage: sat {avg_s}%  light {avg_l}%")
print(f"ours   : {ours_felt['hex']}  hue {ours_felt['h']}  sat {ours_felt['s']}%  light {ours_felt['l']}%")
print("\nwrote docs/research/table-references.html")
