# Repository artwork

These assets are original documentation illustrations for this open-source repository,
derived from the official transparent SixteenMemory mark/wordmark and bundled SIL OFL
typefaces—never screenshots of customer accounts or external third-party badges.

| File | Purpose | Source |
| :--- | :--- | :--- |
| `hero-lockup-light.png` · `hero-lockup-dark.png` | Transparent GitHub Light/Dark adaptive README brand lockup | [Local generator](../../scripts/render-repository-art.py) |
| `repository-cover.png` | 1280×640 social preview &amp; editorial cover card | [Local generator](../../scripts/render-repository-art.py) |
| `lifecycle-light.svg` · `lifecycle-dark.svg` | Minimalist Light/Dark four-stage provenance &amp; incremental Wiki flow | [Local generator](../../scripts/render-repository-art.py) |
| `architecture-light.svg` · `architecture-dark.svg` · `architecture.svg` | Light/Dark v0.3 client, MCP, Worker, SQLite DO, and opt-in provider architecture | [Local generator](../../scripts/render-repository-art.py) |

Fonts remain locally hosted under their bundled SIL OFL licenses
([Manrope](../../homepage/public/assets/Manrope-LICENSE.txt),
[Inter](../../homepage/public/assets/Inter-LICENSE.txt)).

Regenerate all artwork offline with Python, Pillow, and fonttools:

```sh
python3 scripts/render-repository-art.py
```

These Python packages are not required to install, build, or run the product.
