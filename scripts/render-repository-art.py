"""Optional original README artwork generator; not part of app builds.

Requires Pillow and fonttools in the local Python environment.
Reuses already licensed local WOFF fonts; performs no network requests.
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
WIDTH, HEIGHT, SCALE = 1600, 510, 2


def main():
    ASSETS.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="sixteen-readme-art-") as tmp:
        def font(name, size, weight=None):
            source = TTFont(FONT_SOURCE / name)
            if weight and "fvar" in source:
                source = instantiateVariableFont(source, {"wght": weight})
            source.flavor = None
            target = Path(tmp) / (name + str(weight) + ".ttf")
            source.save(target)
            return ImageFont.truetype(str(target), round(size * SCALE))

        serif = font("instrument-serif.woff", 81)
        italic = font("instrument-serif-italic.woff", 81)
        headline = font("manrope.woff", 45, 650)
        body = font("manrope.woff", 17, 400)
        micro = font("manrope.woff", 13, 600)
        medium = font("manrope.woff", 20, 550)
        image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE))
        pixels = image.load()
        for y in range(HEIGHT * SCALE):
            for x in range(WIDTH * SCALE):
                glow = math.exp(-(((x / SCALE - 1240) / 440) ** 2
                                  + ((y / SCALE - 210) / 330) ** 2))
                pixels[x, y] = (int(13 + glow * 8), int(21 + glow * 17), int(36 + glow * 10))
        draw = ImageDraw.Draw(image)
        white, muted, lime = "#f4f6fa", "#a5b4c7", "#c6ff2e"

        def line(points, fill="#314255", width=1):
            draw.line([(int(x * SCALE), int(y * SCALE)) for x, y in points],
                      fill=fill, width=round(width * SCALE))

        def text(x, y, value, face, fill=white):
            draw.text((x * SCALE, y * SCALE), value, font=face, fill=fill, anchor="lt")

        def rect(box, radius=0, fill=None, outline=None, width=1):
            draw.rounded_rectangle(tuple(int(v * SCALE) for v in box),
                                   radius=round(radius * SCALE), fill=fill,
                                   outline=outline, width=round(width * SCALE))

        text(68, 44, "MEMORY INFRASTRUCTURE / APACHE 2.0", micro, lime)
        text(68, 98, "Sixteen", serif)
        first_width = draw.textlength("Sixteen", font=serif) / SCALE
        text(68 + first_width - 1, 98, "Memory", italic)
        text(70, 226, "Context that continues.", headline)
        text(72, 299, "Keep what matters. Find it again. Know where it came from.", body, muted)
        line([(72, 377), (768, 377)])
        text(72, 412, "MEMORY API", micro)
        text(236, 412, "/", micro, "#52677d")
        text(270, 412, "CONSOLE", micro)
        text(407, 412, "/", micro, "#52677d")
        text(442, 412, "SDK + DOCS", micro)
        rect((636, 399, 814, 437), 19, fill="#203026", outline="#48613c")
        draw.ellipse((652*SCALE, 415*SCALE, 658*SCALE, 421*SCALE), fill=lime)
        text(670, 411, "OPEN SOURCE", micro, lime)

        # Original memory-ledger illustration: sources remain attached to the current record.
        for offset, color in [(0, "#304456"), (22, "#3a5161")]:
            rect((1018-offset, 76+offset, 1504-offset, 378+offset), 17,
                 fill="#152334", outline=color)
        rect((968, 131, 1454, 433), 17, fill="#192a38", outline="#567363", width=1.2)
        text(999, 158, "MEMORY / 0016", micro, muted)
        rect((1335, 149, 1422, 179), 15, fill="#c6ff2e")
        text(1350, 157, "ACTIVE", font("manrope.woff", 10, 750), "#192218")
        line([(999, 199), (1422, 199)], "#3a505c")
        text(999, 230, "Important context,", medium)
        text(999, 261, "ready for the next task.", medium)
        for yy, left, right in [(322, "SOURCE", "conversation / 0042"),
                                 (369, "VERSION", "v2 / history retained")]:
            line([(999, yy-13), (1422, yy-13)], "#334a55")
            text(999, yy, left, micro, muted)
            text(1160, yy, right, micro)
        line([(842, 277), (888, 277), (888, 282), (955, 282)], "#668052", 1.4)
        draw.ellipse((833*SCALE, 272*SCALE, 843*SCALE, 282*SCALE), fill=lime)
        line([(947, 276), (955, 282), (947, 288)], lime, 1.5)

        image = image.resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS)
        target = ASSETS / "repository-cover.png"
        image.save(target, optimize=True)
        print(f"Rendered {target.relative_to(ROOT)} ({WIDTH} × {HEIGHT})")


if __name__ == "__main__":
    main()
