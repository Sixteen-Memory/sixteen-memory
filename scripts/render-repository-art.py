"""Original README artwork generator; not part of application runtime builds.

Requires Pillow and fonttools in the local Python environment.
Reuses bundled SIL OFL WOFF fonts; performs no network requests.
Run from the repository root: python3 scripts/render-repository-art.py
"""
from pathlib import Path
from tempfile import TemporaryDirectory
import math

from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "docs/assets"
FONT_SOURCE = ROOT / "homepage/public/assets"
WIDTH, HEIGHT, SCALE = 1600, 540, 2


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="sixteen-readme-art-") as tmp:
        def font(name, size, weight=None):
            source = TTFont(FONT_SOURCE / name)
            if weight and "fvar" in source:
                source = instantiateVariableFont(source, {"wght": weight})
            source.flavor = None
            target = Path(tmp) / f"{name}-{weight}.ttf"
            source.save(target)
            return ImageFont.truetype(str(target), round(size * SCALE))

        serif = font("instrument-serif.woff", 84)
        italic = font("instrument-serif-italic.woff", 84)
        headline = font("manrope.woff", 42, 650)
        body = font("manrope.woff", 17, 450)
        micro = font("manrope.woff", 12, 650)
        tiny = font("manrope.woff", 10, 750)
        card_title = font("manrope.woff", 18, 600)
        card_meta = font("manrope.woff", 13, 500)

        image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE))
        pixels = image.load()
        for y in range(HEIGHT * SCALE):
            yf = y / SCALE
            for x in range(WIDTH * SCALE):
                xf = x / SCALE
                glow_a = math.exp(-(((xf - 1220) / 430) ** 2 + ((yf - 195) / 310) ** 2))
                glow_b = math.exp(-(((xf - 240) / 520) ** 2 + ((yf - 470) / 280) ** 2))
                r = int(10 + glow_a * 9 + glow_b * 4)
                g = int(17 + glow_a * 19 + glow_b * 8)
                b = int(30 + glow_a * 12 + glow_b * 9)
                pixels[x, y] = (r, g, b)

        draw = ImageDraw.Draw(image)
        white = "#f4f6fa"
        muted = "#a2b2c5"
        dim = "#566a80"
        lime = "#c6ff2e"
        teal = "#8ee6d8"

        def line(points, fill="#28394c", width=1.0):
            draw.line(
                [(int(x * SCALE), int(y * SCALE)) for x, y in points],
                fill=fill,
                width=max(1, round(width * SCALE)),
            )

        def text(x, y, value, face, fill=white):
            draw.text((x * SCALE, y * SCALE), value, font=face, fill=fill, anchor="lt")

        def rect(box, radius=0, fill=None, outline=None, width=1.0):
            draw.rounded_rectangle(
                tuple(int(v * SCALE) for v in box),
                radius=round(radius * SCALE),
                fill=fill,
                outline=outline,
                width=max(1, round(width * SCALE)),
            )

        # Subtle structural frame hairlines
        rect((24, 22, WIDTH - 24, HEIGHT - 22), 20, outline="#1f2e40", width=1.0)

        # Left column: brand, value proposition, and surface strip
        text(68, 48, "OPEN-SOURCE AGENT MEMORY INFRASTRUCTURE  /  APACHE 2.0", micro, lime)
        text(68, 96, "Sixteen", serif)
        first_width = draw.textlength("Sixteen", font=serif) / SCALE
        text(68 + first_width - 1, 96, "Memory", italic)

        text(70, 220, "Context that continues.", headline)
        text(72, 286, "Source-linked memories, conversations, incremental Wiki,", body, muted)
        text(72, 314, "and scoped MCP access for AI Agents — backed by SQLite.", body, muted)

        line([(72, 382), (838, 382)], "#293b4f", 1.0)
        chips = [
            (72, "TS & PYTHON SDK"),
            (238, "MCP + CODE AGENTS"),
            (436, "INCREMENTAL WIKI"),
            (622, "SQLITE DO"),
        ]
        for idx, (cx, label) in enumerate(chips):
            text(cx, 412, label, micro, white)
            if idx < len(chips) - 1:
                next_x = chips[idx + 1][0]
                sep_x = (cx + draw.textlength(label, font=micro) / SCALE + next_x) / 2 - 3
                text(sep_x, 412, "/", micro, dim)

        rect((72, 452, 248, 488), 18, fill="#1d2e24", outline="#4a683c", width=1.1)
        draw.ellipse((88 * SCALE, 467 * SCALE, 94 * SCALE, 473 * SCALE), fill=lime)
        text(104, 463, "v0.3 OPEN SOURCE", micro, lime)

        rect((262, 452, 494, 488), 18, fill="#132234", outline="#2f455c", width=1.0)
        text(282, 463, "NO EXTERNAL VECTOR DB", micro, muted)

        # Right column: stacked source-linked memory + incremental Wiki cards
        rect((986, 56, 1528, 266), 16, fill="#132233", outline="#364f63", width=1.1)
        rect((964, 74, 1506, 286), 16, fill="#17283a", outline="#557364", width=1.2)
        text(992, 98, "MEMORY / 0016", micro, muted)
        rect((1398, 92, 1478, 120), 14, fill=lime)
        text(1415, 100, "ACTIVE", tiny, "#162015")
        line([(992, 134), (1478, 134)], "#2d4354")
        text(992, 152, "Scoped keys enforce user boundaries", card_title, white)
        text(992, 179, "before any retrieval or write commits.", card_title, white)
        line([(992, 218), (1478, 218)], "#283d4d")
        text(992, 232, "SOURCE", micro, muted)
        text(1134, 231, "conversation / 0042  (verbatim)", card_meta, white)
        text(992, 256, "VERSION", micro, muted)
        text(1134, 255, "v2  ·  history & evidence retained", card_meta, teal)

        # Dependency connector from Memory v2 to Incremental Wiki page
        line([(1235, 286), (1235, 326)], "#6e8e52", 1.5)
        line([(1229, 319), (1235, 326), (1241, 319)], lime, 1.5)
        rect((1252, 294, 1446, 318), 12, fill="#111d2c", outline="#2e4458")
        text(1266, 300, "tracks (source_id, v2)", font("manrope.woff", 11, 600), lime)

        # Lower card: Incremental Source-Linked Wiki + MCP
        rect((964, 328, 1506, 488), 16, fill="#132131", outline="#3c596b", width=1.2)
        text(992, 352, "WIKI / SECURITY-BOUNDARIES", micro, teal)
        rect((1366, 346, 1478, 374), 14, fill="#183238", outline="#4c8a84")
        text(1382, 354, "CITED · LIVE", tiny, teal)
        line([(992, 386), (1478, 386)], "#293e4f")
        text(992, 404, "Selective invalidation: source edits mark only", card_meta, white)
        text(992, 426, "dependent pages stale; conflicts stay visible.", card_meta, white)
        text(992, 456, "READ VIA", micro, muted)
        text(1134, 455, "MCP /v1/mcp  ·  SDK  ·  Console", card_meta, lime)

        # Bridge from left thesis to right ledger
        line([(864, 228), (912, 228), (912, 180), (954, 180)], "#668350", 1.4)
        draw.ellipse((855 * SCALE, 223 * SCALE, 865 * SCALE, 233 * SCALE), fill=lime)
        line([(947, 174), (955, 180), (947, 186)], lime, 1.5)

        image = image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        target = ASSETS / "repository-cover.png"
        image.save(target, optimize=True)
        print(f"Rendered {target.relative_to(ROOT)} ({WIDTH} x {HEIGHT})")


if __name__ == "__main__":
    main()
