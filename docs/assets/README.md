# Repository artwork

These assets are original documentation illustrations for this open-source repository,
not screenshots of a connected account or real customer data.

| File | Purpose | Source |
| :--- | :--- | :--- |
| `repository-cover.png` | README brand cover and memory-ledger illustration | [Local drawing script](../../scripts/render-repository-art.py) |
| `architecture.svg` | Current application/service/storage boundaries | Hand-authored SVG; text and shapes only |

The cover reuses the existing, locally hosted Instrument Serif and Manrope fonts.
Their bundled licenses remain in
[Instrument Serif license](../../homepage/public/assets/InstrumentSerif-LICENSE.txt) and
[Manrope license](../../homepage/public/assets/Manrope-LICENSE.txt).

No Mem0 imagery, code, logos or benchmark numbers were copied. No image model,
external badge endpoint or third-party tracking image is required.

Optional regeneration uses Python with Pillow and fonttools:

```sh
python3 scripts/render-repository-art.py
```

These Python packages are not needed to install, build or run the product.
