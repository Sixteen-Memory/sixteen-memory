# Local development guide

[Documentation](README.md) · [SDK](../product/sdk/README.md) · [Examples](../product/examples/README.md)

## 1. Prerequisites

- Node.js 24, npm, and Git.
- Provider credentials are not required for explicit writes or lexical retrieval.

```sh
git clone https://github.com/Sixteen-Memory/sixteen-memory.git
cd sixteen-memory
npm run setup
```

`setup` runs `npm ci` in `product/` and `homepage/`, using their separate lockfiles. It does not create production resources, deploy services, or install optional evaluation dependencies.

## 2. Work on the website

```sh
npm run dev:website -- --port 4180
```

Open `http://127.0.0.1:4180`. The website runs independently of the product API.

```sh
npm run build:website
npm --prefix homepage run preview -- --port 4180
```

Build output goes to `homepage/dist/`. It is ignored by Git and is not automatically uploaded.

## 3. Work on the product

For the fastest product-only install and one-command startup:

```sh
npm run setup:product
npm run quickstart
```

Or run the underlying steps individually:

```sh
npm run prepare:product
npm run build:product
npm run dev:product
```

| Entry point | Address |
| :--- | :--- |
| Console development server (EN / zh-CN) | `http://127.0.0.1:4191` |
| Local API and built application | `http://127.0.0.1:8790` |
| Health endpoint, no key required | `http://127.0.0.1:8790/health` |

`prepare:product` generates a local key in `product/.dev.vars` (see [`product/.dev.vars.example`](../product/.dev.vars.example) for optional OpenAI / Qwen provider variables). Read `ADMIN_KEY` locally to sign in; do not commit or publish it. Applications should use a read/write key bound to a user scope, created by an administrator in the console.

To watch incremental source-linked Wiki invalidation, conflict preservation, and live MCP reads in 5 seconds with zero API keys, run:

```sh
npm run demo
```

`dev:product` runs the local Worker and Vite together. Stop them with `Ctrl+C`. Data lives in the Git-ignored `product/.wrangler/` directory. Deleting it deletes local data; do not treat that as routine cleanup.

## 4. Run a model-free example

Keep the product service running. In another terminal, set the test key and its permitted user scope without writing the key into an example file.

```sh
# SIXTEEN_API_KEY is already set in this terminal.
export SIXTEEN_BASE_URL=http://127.0.0.1:8790
export SIXTEEN_USER_ID=example-user
npm run example:basic
```

The example writes, searches, updates, reads history, and deletes its synthetic record at the end. Use only a local or explicitly approved test environment, never a production administrator key. The example's multilingual sample text is intentional.

## 5. Choose relevant checks

```sh
npm run check:docs
npm run check:website
npm run check:product
```

For one targeted check: `cd product && node --test test/sdk.test.mjs`.
README and ordinary page changes do not require real-model evaluation. `product/eval/` has separate dependencies and authorization requirements.

## Troubleshooting

**Port already in use?** Check whether you started the existing process. Do not terminate unrelated applications. The product has both a proxy and a Worker, so changing only one port is insufficient.

**HTTP 503?** Missing administrator setup and a missing answer-model configuration are different errors. If no model is needed, use explicit writes and `lexical` retrieval.

**An SDK method exists but the live service rejects it?** The SDK includes development methods. Availability depends on the target service version.

**Build succeeded: deploy next?** Not automatically. Pushing, deployment, data migration, and model costs require separate authorization.
