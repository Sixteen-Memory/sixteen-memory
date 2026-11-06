# Website deployment boundaries

The website builds into `dist/`; its configured Cloudflare Pages project is `sixteenmemory-homepage`. This repository contains no login credentials or deployment tokens. Historical deployment receipts remain in the original workspace and were not imported with the source.

```sh
npm ci
npm run deploy:check
```

This runs website checks and builds without publishing. Run `npm run deploy` only after explicit current publication approval. Deployment uploads static website assets only; it does not change the product Worker, data, model settings, DNS, or email. A GitHub push is not release approval. There is no automatic deployment workflow.

After an approved release, check the actual hosting behavior for the main domain, individual pages, assets, language switching, and 404 responses. If publication fails or its result is unclear, inspect remote deployment state before uploading again.
