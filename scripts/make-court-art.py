"""Download, measure, and rasterise the CC0 English-pattern court figures.

This script uses tooling that is intentionally not a project dependency. macOS
system Python refuses direct installs (PEP 668), so create a throwaway venv from
the repo root and run through system Python with PYTHONPATH:

    python3 -m venv .venv-tools
    ./.venv-tools/bin/pip install cairosvg svgelements pillow
    PYTHONPATH="$(echo .venv-tools/lib/python*/site-packages)" \\
      python3 scripts/make-court-art.py

It fetches Commons metadata and SVG bodies through Node's built-in fetch because
curl is blocked in this sandbox. SVG downloads are rate-limited and validated
before writing so an HTTP 429 HTML response cannot become a corrupt source SVG.
"""

from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import xml.etree.ElementTree as ET

import cairosvg
from PIL import Image, ImageDraw, ImageFont
from svgelements import SVG, Shape


ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "docs/design/cards/ref/court"
ASSET_DIR = ROOT / "assets/cards/court"
SHEET_PATH = ROOT / "docs/design/cards/court-sheet.png"

CARD_W = 360.0
CARD_H = 540.0
INDEX_COLUMN_FRAC = 0.16
BORDER_THRESHOLD = 0.95
SOURCE_PAD_UNITS = 1.0
RENDER_WIDTH = 400
OUTPUT_WIDTH = 200
PALETTE_COLORS = 256
MAX_RECOMMENDED_TOTAL_BYTES = 600 * 1024
API_TO_FILE_SLEEP = 5.2
BETWEEN_DOWNLOAD_SLEEP = 8.0

USER_AGENT = "LocalPokerAssetBot/0.1 (asset generation; contact: maskndaf@users.noreply.github.com)"
COMMONS_API = (
    "https://commons.wikimedia.org/w/api.php"
    "?action=query&format=json&prop=imageinfo&iiprop=url|extmetadata&titles="
)

NODE_FETCH = r"""
const url = process.argv[1];
fetch(url, {
  headers: {
    'User-Agent': process.env.COURT_ART_USER_AGENT || 'LocalPoker',
    'Accept': 'image/svg+xml,application/json,text/plain,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://commons.wikimedia.org/',
  },
})
  .then(async response => {
    const body = await response.text();
    if (!response.ok) {
      console.error(`HTTP ${response.status} ${response.statusText} for ${url}`);
      console.error(body.slice(0, 500));
      process.exit(1);
    }
    process.stdout.write(body);
  })
  .catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exit(1);
  });
"""

RANKS = [
    ("J", 11, "jack"),
    ("Q", 12, "queen"),
    ("K", 13, "king"),
]

SUITS = [
    ("c", "clubs"),
    ("d", "diamonds"),
    ("h", "hearts"),
    ("s", "spades"),
]


def source_name(rank_name: str, suit_name: str) -> str:
    return f"English pattern {rank_name} of {suit_name}.svg"


CARDS = [
    {
        "label": f"{rank_code}-{suit_code}",
        "rank_code": rank_code,
        "rank_value": rank_value,
        "rank_name": rank_name,
        "suit_code": suit_code,
        "suit_name": suit_name,
        "source_name": source_name(rank_name, suit_name),
    }
    for rank_code, rank_value, rank_name in RANKS
    for suit_code, suit_name in SUITS
]


def fetch_text(url: str, description: str, retries: int = 6) -> str:
    env = {**os.environ, "COURT_ART_USER_AGENT": USER_AGENT}
    for attempt in range(1, retries + 1):
        result = subprocess.run(
            ["node", "-e", NODE_FETCH, url],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout
        if attempt == retries:
            sys.stderr.write(result.stderr)
            raise RuntimeError(f"failed to fetch {description}")
        wait = [10.0, 30.0, 60.0, 120.0, 180.0][attempt - 1]
        print(f"Fetch failed for {description}; retrying in {wait:.1f}s")
        if result.stderr:
            print(result.stderr.splitlines()[0])
        time.sleep(wait)
    raise AssertionError("unreachable")


def commons_metadata(card: dict[str, object]) -> dict[str, object]:
    title = "File:" + str(card["source_name"])
    url = COMMONS_API + subprocess.run(
        [
            "node",
            "-e",
            "process.stdout.write(encodeURIComponent(process.argv[1]))",
            title,
        ],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    data = json.loads(fetch_text(url, f"Commons API metadata for {title}"))
    pages = data.get("query", {}).get("pages", {})
    if not pages:
        raise RuntimeError(f"Commons returned no page for {title}")
    page = next(iter(pages.values()))
    if "missing" in page:
        raise RuntimeError(f"Commons page missing: {title}")
    infos = page.get("imageinfo", [])
    if not infos:
        raise RuntimeError(f"Commons returned no imageinfo for {title}")
    return infos[0]


def metadata_value(metadata: dict[str, object], key: str) -> str:
    value = metadata.get("extmetadata", {}).get(key, {})  # type: ignore[union-attr]
    if isinstance(value, dict):
        return str(value.get("value", ""))
    return ""


def download_sources() -> None:
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    verified = False
    for index, card in enumerate(CARDS):
        out = SOURCE_DIR / f"{card['label']}.svg"
        existing = out.exists() and is_svg_text(out.read_text(encoding="utf-8", errors="replace"))
        info = commons_metadata(card) if (not verified or not existing) else None
        if not verified:
            if info is None:
                info = commons_metadata(card)
            license_short = metadata_value(info, "LicenseShortName")
            usage_terms = metadata_value(info, "UsageTerms")
            artist = metadata_value(info, "Artist")
            license_url = metadata_value(info, "LicenseUrl")
            print("Verified Commons metadata for", card["source_name"])
            print("  LicenseShortName:", license_short)
            print("  UsageTerms:", usage_terms)
            print("  LicenseUrl:", license_url)
            print("  Artist:", artist)
            if "CC0" not in license_short and "Creative Commons Zero" not in usage_terms:
                raise RuntimeError("court card metadata is not CC0")
            if "Dmitry" not in artist and "Дмитрий" not in artist:
                raise RuntimeError("court card author metadata did not match Dmitry Fomin")
            verified = True

        if existing:
            print(f"Reusing validated source {out.relative_to(ROOT)}")
            continue

        if info is None:
            info = commons_metadata(card)
        image_url = str(info["url"])
        print(f"Waiting before SVG download for {card['label']}...")
        time.sleep(API_TO_FILE_SLEEP)
        svg_text = fetch_text(image_url, f"SVG for {card['source_name']}")
        if not is_svg_text(svg_text):
            stripped = svg_text.lstrip("\ufeff \t\r\n")
            raise RuntimeError(
                f"{card['label']} download did not start with XML/SVG; first bytes: "
                f"{stripped[:80]!r}"
            )
        out.write_text(svg_text, encoding="utf-8")
        print(f"Saved {out.relative_to(ROOT)} ({len(svg_text.encode('utf-8')):,} bytes)")

        if index != len(CARDS) - 1:
            print("Waiting before next card...")
            time.sleep(BETWEEN_DOWNLOAD_SLEEP)


def is_svg_text(text: str) -> bool:
    stripped = text.lstrip("\ufeff \t\r\n")
    return stripped.startswith("<?xml") or stripped.startswith("<svg")


def shape_bboxes(path: Path) -> tuple[set[str], list[tuple[str, tuple[float, float, float, float]]]]:
    svg = SVG.parse(str(path))
    width = float(svg.width or CARD_W)
    height = float(svg.height or CARD_H)
    if not math.isclose(width, CARD_W, abs_tol=0.01) or not math.isclose(height, CARD_H, abs_tol=0.01):
        raise RuntimeError(f"{path.name} has unexpected size {width}×{height}")

    excluded_ids: set[str] = set()
    kept: list[tuple[str, tuple[float, float, float, float]]] = []
    left_limit = INDEX_COLUMN_FRAC * width
    right_limit = (1.0 - INDEX_COLUMN_FRAC) * width
    for element in svg.elements():
        if not isinstance(element, Shape):
            continue
        bbox = element.bbox()
        if bbox is None:
            continue
        x0, y0, x1, y1 = (float(v) for v in bbox)
        bw = x1 - x0
        bh = y1 - y0
        element_id = str(getattr(element, "id", "") or "")
        if bw >= BORDER_THRESHOLD * width or bh >= BORDER_THRESHOLD * height:
            if element_id:
                excluded_ids.add(element_id)
            continue
        if x1 <= left_limit or x0 >= right_limit:
            if element_id:
                excluded_ids.add(element_id)
            continue
        kept.append((element_id, (x0, y0, x1, y1)))

    if not kept:
        raise RuntimeError(f"no central figure shapes measured in {path}")
    return excluded_ids, kept


def union_box(boxes: list[tuple[float, float, float, float]]) -> tuple[float, float, float, float]:
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def measure_panels() -> tuple[
    dict[str, tuple[float, float, float, float]],
    dict[str, set[str]],
    tuple[float, float, float, float],
]:
    measured: dict[str, tuple[float, float, float, float]] = {}
    excluded: dict[str, set[str]] = {}
    for card in CARDS:
        path = SOURCE_DIR / f"{card['label']}.svg"
        excluded_ids, kept = shape_bboxes(path)
        box = union_box([bbox for _, bbox in kept])
        cx = (box[0] + box[2]) / 2.0 / CARD_W
        height_frac = (box[3] - box[1]) / CARD_H
        if not (0.44 <= cx <= 0.56 and height_frac >= 0.55):
            raise RuntimeError(
                f"{card['label']} measured bbox failed sanity check: "
                f"center={cx:.4f}, height={height_frac:.4f}"
            )
        measured[str(card["label"])] = box
        excluded[str(card["label"])] = excluded_ids

    final = union_box(list(measured.values()))
    final = (
        max(0.0, final[0] - SOURCE_PAD_UNITS),
        max(0.0, final[1] - SOURCE_PAD_UNITS),
        min(CARD_W, final[2] + SOURCE_PAD_UNITS),
        min(CARD_H, final[3] + SOURCE_PAD_UNITS),
    )
    return measured, excluded, final


def remove_elements_by_id(root: ET.Element, ids: set[str]) -> None:
    if not ids:
        return
    parent_map = {child: parent for parent in root.iter() for child in list(parent)}
    for element in list(root.iter()):
        element_id = element.attrib.get("id")
        if element_id in ids and element in parent_map:
            parent_map[element].remove(element)


def cropped_svg_bytes(path: Path, background_ids: set[str], crop: tuple[float, float, float, float]) -> bytes:
    tree = ET.parse(path)
    root = tree.getroot()
    remove_elements_by_id(root, background_ids)
    x0, y0, x1, y1 = crop
    crop_w = x1 - x0
    crop_h = y1 - y0
    root.set("viewBox", f"{x0:.6f} {y0:.6f} {crop_w:.6f} {crop_h:.6f}")
    root.set("width", str(RENDER_WIDTH))
    root.set("height", str(round(RENDER_WIDTH * crop_h / crop_w)))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def rasterise_pngs(
    excluded_shape_ids: dict[str, set[str]],
    final_box: tuple[float, float, float, float],
) -> tuple[int, int]:
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    crop_w = final_box[2] - final_box[0]
    crop_h = final_box[3] - final_box[1]
    render_w = RENDER_WIDTH
    render_h = round(render_w * crop_h / crop_w)
    out_w = OUTPUT_WIDTH
    out_h = round(out_w * crop_h / crop_w)

    for card in CARDS:
        label = str(card["label"])
        source_path = SOURCE_DIR / f"{label}.svg"
        out_path = ASSET_DIR / f"{label}.png"
        svg_bytes = cropped_svg_bytes(source_path, excluded_shape_ids[label], final_box)
        png_bytes = cairosvg.svg2png(
            bytestring=svg_bytes,
            output_width=render_w,
            output_height=render_h,
            background_color=None,
        )
        if png_bytes is None:
            raise RuntimeError(f"CairoSVG returned no PNG bytes for {label}")

        with Image.open(io.BytesIO(png_bytes)) as image:
            rgba = image.convert("RGBA")
            if rgba.size != (out_w, out_h):
                rgba = rgba.resize((out_w, out_h), Image.Resampling.LANCZOS)
            quantized = rgba.quantize(
                colors=PALETTE_COLORS,
                method=Image.Quantize.FASTOCTREE,
                dither=Image.Dither.NONE,
            )
            quantized.save(out_path, "PNG", optimize=True)
        print(f"Wrote {out_path.relative_to(ROOT)}")

    return out_w, out_h


def nontransparent_fraction(path: Path) -> float:
    with Image.open(path) as image:
        rgba = image.convert("RGBA")
        alpha = rgba.getchannel("A")
        opaqueish = sum(1 for value in alpha.tobytes() if value > 0)
        return opaqueish / float(alpha.width * alpha.height)


def validate_pngs() -> dict[str, float]:
    expected_size: tuple[int, int] | None = None
    hashes: dict[str, str] = {}
    fractions: dict[str, float] = {}
    for card in CARDS:
        label = str(card["label"])
        path = ASSET_DIR / f"{label}.png"
        if not path.exists() or path.stat().st_size == 0:
            raise RuntimeError(f"missing or empty PNG: {path}")
        data = path.read_bytes()
        digest = hashlib.sha256(data).hexdigest()
        if digest in hashes:
            raise RuntimeError(f"{label} is byte-identical to {hashes[digest]}")
        hashes[digest] = label

        with Image.open(path) as image:
            has_alpha = "A" in image.getbands() or (
                image.mode == "P" and "transparency" in image.info
            )
            if not has_alpha:
                raise RuntimeError(f"{label} has no alpha channel")
            alpha_range = image.convert("RGBA").getchannel("A").getextrema()
            if alpha_range is None or alpha_range[0] >= 255:
                raise RuntimeError(f"{label} has no transparent pixels")
            if expected_size is None:
                expected_size = image.size
            elif image.size != expected_size:
                raise RuntimeError(f"{label} has dimensions {image.size}, expected {expected_size}")
        fraction = nontransparent_fraction(path)
        if fraction < 0.05:
            raise RuntimeError(f"{label} appears blank: alpha fraction {fraction:.4f}")
        fractions[label] = fraction
    return fractions


def make_contact_sheet(dimensions: tuple[int, int]) -> None:
    panel_w, panel_h = dimensions
    margin = 24
    label_h = 24
    cell_w = panel_w + margin * 2
    cell_h = panel_h + margin * 2 + label_h
    sheet = Image.new("RGBA", (cell_w * 3, cell_h * 4), (128, 128, 128, 255))
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for row, (suit_code, _) in enumerate(SUITS):
        for col, (rank_code, _, _) in enumerate(RANKS):
            label = f"{rank_code}-{suit_code}"
            path = ASSET_DIR / f"{label}.png"
            with Image.open(path) as image:
                panel = image.convert("RGBA")
            x = col * cell_w + margin
            y = row * cell_h + margin + label_h
            draw.text((col * cell_w + margin, row * cell_h + margin), label, fill=(255, 255, 255, 255), font=font)
            sheet.alpha_composite(panel, (x, y))

    SHEET_PATH.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(SHEET_PATH, "PNG", optimize=True)
    print(f"Wrote {SHEET_PATH.relative_to(ROOT)}")


def total_asset_size() -> int:
    return sum((ASSET_DIR / f"{card['label']}.png").stat().st_size for card in CARDS)


def frac_box(box: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    return (box[0] / CARD_W, box[1] / CARD_H, box[2] / CARD_W, box[3] / CARD_H)


def main() -> None:
    download_sources()
    measured, excluded_shape_ids, final_box = measure_panels()

    print("\nMeasured central figure bboxes (fractions x0 y0 x1 y1):")
    for card in CARDS:
        label = str(card["label"])
        print(" ", label, " ".join(f"{value:.5f}" for value in frac_box(measured[label])))
    print("Final union crop with pad:", " ".join(f"{value:.5f}" for value in frac_box(final_box)))

    dimensions = rasterise_pngs(excluded_shape_ids, final_box)
    fractions = validate_pngs()
    make_contact_sheet(dimensions)

    total = total_asset_size()
    aspect = dimensions[0] / dimensions[1]
    print(f"\nPNG dimensions: {dimensions[0]}×{dimensions[1]} px")
    print(
        f"Rendered at {RENDER_WIDTH}px wide, downscaled to {OUTPUT_WIDTH}px wide, "
        f"then quantized to a {PALETTE_COLORS}-color PNG palette with alpha"
    )
    print(f"PNG aspect: {aspect:.8f}")
    print(f"Total court PNG size: {total:,} bytes")
    if total > MAX_RECOMMENDED_TOTAL_BYTES:
        print(
            "WARNING: total exceeds ~600 KB; lower RENDER_WIDTH and regenerate "
            "if this is too large."
        )
    print("Non-transparent pixel fractions:")
    for card in CARDS:
        label = str(card["label"])
        print(f"  {label}: {fractions[label]:.4f}")


if __name__ == "__main__":
    main()
