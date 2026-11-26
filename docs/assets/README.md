# Repository artwork

These assets are original documentation illustrations for this open-source repository,
not screenshots of a connected account or real customer data.

| File | Purpose | Source |
| :--- | :--- | :--- |
| `repository-cover.png` | README brand cover with source-linked memory and incremental Wiki ledger | [Local drawing script](../../scripts/render-repository-art.py) |
| `memory-workflow.svg` | Four-stage provenance, versioning, recall, and selective Wiki invalidation flow | Hand-authored SVG; text and shapes only |
| `architecture.svg` | v0.3 client, MCP, Worker, SQLite Durable Object, and opt-in provider boundaries | Hand-authored SVG; text and shapes only |

The cover reuses the locally hosted Instrument Serif and Manrope fonts.
Their bundled licenses remain in
[Instrument Serif license](../../homepage/public/assets/InstrumentSerif-LICENSE.txt) and
[Manrope license](../../homepage/public/assets/Manrope-LICENSE.txt).

No Mem0 imagery, code, logos or benchmark numbers were copied. No image model,
external badge endpoint or third-party tracking image is required.

Optional cover regeneration uses Python with Pillow and fonttools:

```sh
python3 scripts/render-repository-art.py
```

These Python packages are not needed to install, build or run the product.
