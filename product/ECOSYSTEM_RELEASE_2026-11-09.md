# Ecosystem hardening release

Date: November 9, 2026 (Asia/Shanghai). User requested fixes and publication.
Release artifacts: JS SDK **0.3.0**, Vercel AI adapter **0.3.0**, Python **0.3.1**.
The API version remains **0.3.0**; no Worker route/database migration is required.
Deployment identifiers are appended after verified publication.

## Scope and completed implementation

- Reject external HTTP, URL credentials/query/fragment/control characters and
  malformed supplied keys in the base JS SDK. The console explicitly uses its
  browser origin; cookie-based authentication does not embed a bearer key.
- Replace raw service error messages with bounded validated error codes and safe
  messages. Invalid codes map to `request_failed`; no automatic HTTP retry.
- Include all 22 formerly source-only user methods in the installed JS package.
  Standalone v0.3 declarations do not import private Worker source. The generated
  OpenAPI remains the documented core subset, not a complete v0.3 specification.
- Preserve scope/filter/cancellation in JS pagination; add corresponding sync
  and async Python page iterators/collection helpers. Malformed or repeating
  cursors fail, and traversal is bounded to 1,000 continuing cursors.
- Add Python list/export filters and timestamp options. Socket timeout errors
  now classify as `timeout`, matching JS.
- Add `AsyncSixteenMemory` using optional HTTPX **0.28.1**. It uses native async
  sockets, an overall deadline, cancellation cleanup and async context management,
  not a background-thread wrapper. Sync installs remain standard-library only.
- Ship four complete, executable lifecycle examples: JS, sync Python, async
  Python and Vercel AI. The Vercel deletion is an explicit shared-SDK application
  operation, not a model tool. Update website/Quickstart/download guides.

Cancelling a request cannot undo a server-accepted write. Reconcile request IDs
and returned versions before a deliberate retry. Pagination is not a snapshot;
collection helpers accumulate all rows, while page iterators bound application
memory. Sync Python still has socket rather than total-request timeout semantics.

## Verification and actual limits

Observed verification: 37 product unit/transport tests, 29 product runtime groups,
25 Vercel framework/handler tests, 8 knowledge groups, 7 component groups,
43 homepage checks, plus both installed-language runs and package/type checks.
Python has 4 synchronous and 5 async/transport test methods on each interpreter.
Existing SDK/API/product/adapter tests were rerun. New checks exercise unsafe
configuration, error sanitation, cancellation, timeout, all new JS methods'
pre-abort behavior, Python native-async method coverage and pagination loops.
Installed archive/wheel tests run on Python **3.9.6** and **3.11.15**, Node
**24.10.0**, current Worker **0.3.0**, `ai@7.0.165` and `zod@4.6.7`.

The installed-package test compares JS/Python user-method names (excluding the
intentional JS admin/session helpers), then exercises shared memory/export
**50+1**, conversation **50+1**, message **32+32+1**, sync and async lifecycle,
filters, cross-user rejection, deletion and the actual shipped examples.
It also runs the official MCP client against all seven current read-only tool
schemas. Temporary SQLite retained zero memory/history/evidence/vector/
conversation/message/Wiki/edge rows and zero active synthetic keys at completion.

The tests use synthetic local keys and prohibit provider traffic. No paid model
call or customer-data read is needed. The official AI SDK mock supports framework
checks; it is not a model-quality benchmark. No independent new-user usability
or completion-time claim is established. Tests do not certify every runtime or
all methods' successful provider-dependent behavior.

An initial Python 3.9 offline dependency install correctly failed because its
wheel cache lacked `exceptiongroup`; the cache was completed and installation
rerun. A console module test exposed its missing simulated browser origin after
URL hardening; the fixture now supplies and verifies that origin. Neither issue
was hidden by skipping the affected suite.

## Deferred, not silently enabled

**MCP OAuth and controlled-write tools are not implemented in this release.**
They require a resource/authorization-server design, issuer/audience validation,
PKCE/state, token lifecycle/revocation, consent and replay-safe approval semantics.
The current user-scoped bearer-key read-only endpoint remains unchanged. No new
write tool, admin bypass, OAuth placeholder or weakened scope check was added.
Production model/extraction/embedding flags remain disabled.

No npm/PyPI publication, repository visibility change, account recharge, DNS
change, or provider credential change is authorized by or required for this
versioned website delivery. Only SDK/adapter archives, Python wheel and approved
examples/guides are distributable; private source, tests, `.local`, databases,
credentials and model output are excluded.

## Reproduce locally

Prepare existing locked JS dependencies and Python build tooling in an isolated
environment. Runtime tests use no external providers. Dependency preparation
uses the public registry; cached archives are then installed offline.

```sh
npm run build:product
npm --prefix product/integrations/vercel-ai run build
python -m build --no-isolation product/sdk-python
python product/sdk-python/test_package.py
npm run check:integration

# Build an approved local wheel cache (including dependencies for Python 3.9):
python -m pip download --index-url https://pypi.org/simple --python-version 3.9 \
  --only-binary=:all: --dest product/.local/async-wheels \
  'httpx==0.28.1' 'exceptiongroup>=1.0.2' 'sniffio>=1.1'
PYTHON_BIN=python3 \
ASYNC_WHEELHOUSE="$PWD/product/.local/async-wheels" \
ECOSYSTEM_REPORT="$PWD/output/ecosystem-hardening.json" \
npm run check:ecosystem
npm --prefix homepage run deploy:check
```

`check:ecosystem` installs the exact archives and wheel into temporary clean
environments, runs sync/async tests and all four examples, and tears everything
down. Its success explicitly leaves MCP OAuth/write work deferred. Existing
`check:integration` still means the JS/API/Vercel suite; use both commands.
Hosted CI, recurring paid jobs and production load tests were not added.

## Distribution

Website `/downloads/manifest.json` contains hashes for the JS/adapter archives,
Python wheel, types, four runnable examples and guides. The website delivery
script does not publish to registries. It requires the adapter and Python wheel
to be built first and fails rather than supplying a nonexistent artifact.
