# SixteenMemory website

[Repository home](../README.md) · [Quickstart](../docs/QUICKSTART.md) · [Architecture](../docs/ARCHITECTURE.md)

Independent React/Vite website for `www.sixteenmemory.com`.
This project publishes only the homepage static build, not the product service,
workspace prototype, planning documents or credentials.

## Develop and check

```sh
npm ci
npm run dev -- --port 4180
npm run deploy:check
```

`deploy:check` prepares the SDK download from `../product/sdk/index.mjs`, runs
the website checks, then TypeScript and the Vite production build. It does not
replace responsive browser and link checks. No new runtime dependencies were added.

## Site structure

- Original video cover and bilingual navigation, including a mobile menu.
- Eight independent product pages: memory, retrieval, integrations, docs,
  security, deployment, access/usage and product availability.
- Developer entry: JavaScript/REST examples and direct console/Quickstart links.
- API and tools: REST, docs, downloadable SDK source, console, request records,
  and MCP marked as planned, with no connection URL.
- Inline reference for the online v0.1 core API and its interface limits.
- Product lifecycle, customer-support use case, access/deployment information,
  current product status and contact.

The route pages share one content model, navigation and footer. Production builds
write Chinese static HTML and metadata for each route plus `sitemap.xml`; Chinese
pages hydrate with React, while `?lang=en` renders English client-side. Internal
links retain the selected language without cookies or browser storage.
Internal content-page links and canonical URLs use trailing slashes so the
hosting platform serves the matching `index.html` directly.
Public copy distinguishes online v0.1.0,
local v0.2.1 work and planned features.

```text
/                    Existing video homepage
/product/memory      Memory lifecycle and sources
/product/retrieval   Lexical retrieval and development features
/integrations        REST, SDK source, console and planned tools
/docs                Core API examples, fields and errors
/security            Access, data flow and deletion boundaries
/deployment          Current hosting paths and responsibilities
/usage               Access, usage boundaries and contact
/status              Online / development / planned capabilities
```

Page content, navigation and route metadata are in `src/site-pages.mjs`.
`src/SiteDocument.tsx` supplies the shared page layout and interactions.
`scripts/build-routes.mjs` renders the static route files after Vite builds.
Existing fonts, poster, video, artwork and security headers are unchanged.

Historical deployment evidence remains in the original workspace, not this repository.
Vite preview falls back to the React application with HTTP 200 for unknown paths;
the packaged `404.html` is for the hosting platform's 404 response.

Developer links point to `console.sixteenmemory.com`, not the separate legacy
API experiment. Current online product health reports v0.1.0, lexical retrieval,
explicit writes and no configured answer model. Never treat a health response as
proof of workload capacity, customer outcomes or complete business-route coverage.

The stable download is packaged from `product/sdk/client.mjs` with generated
types and OpenAPI. The legacy single-file download bundles `index.mjs`; its
experimental methods are not enabled online. The webpage examples use only
core endpoints. This branch prepares SDK 0.2.0 artifacts but does not publish
them. The recorded website release still has SDK 0.1.0 until separately approved.

## Assets and accessibility

The existing native MP4, poster, licensed local fonts and transparent roundtable SVG
remain unchanged. Native progressive video playback starts without a full-file JavaScript fetch. The one-viewport cover scrolls normally into the developer section.
There is no sticky space, scroll-driven seeking or recording timeline. Video loops
while visible and pauses offscreen. Visibility, reduced-motion behavior and retry fallback remain.
The cover four-step overlay is removed; the product lifecycle section remains. Lower sections use native Web Animations.
Code tabs support arrow/Home/End navigation; copy failure is reported visibly.

## Publish

```sh
npm run deploy
```

Publication requires explicit user approval. Only `dist/` uploads to the existing
`sixteenmemory-homepage` Pages project on branch `main`. DNS, mail, product Workers,
credentials and database storage are outside this deployment.

See `DEPLOYMENT.md` for the actual deployment and verification results.
