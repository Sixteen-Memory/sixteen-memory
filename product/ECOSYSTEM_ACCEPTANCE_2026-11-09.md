# P1 integration ecosystem acceptance

Date: November 9, 2026.
Product under test: `d408fa6` source tree, Worker **0.3.0**.
Runtime code was not changed in this test-only task.

## Decision

**Core supported integration behavior passed; the proposed P1 scope is not
complete.** Do not equate a green test command with native async Python support,
SDK API parity, MCP OAuth, controlled writes, or independent user onboarding.

Testing was local and isolated: temporary SQLite, synthetic keys/statements,
installed private package archives, and the official AI SDK mock where language
generation was needed. There were **zero production requests and zero paid
model calls**. No deployment, registry publication or production setting change.

## Existing suites rerun

| Area | Observed result | Important boundary |
| --- | --- | --- |
| OpenAPI / JS archive | 17 successful operations; 50+1 pagination; NodeNext/Bundler types; clean offline install | OpenAPI runtime targets the old v0.1 fixture, not all new v0.3 routes; provider answer success is schema-only |
| Product unit / transport | 33 tests passed | Includes fixtures, not real provider-quality acceptance |
| Product runtime | 29 groups passed | Temporary actual Worker/SQLite; intercepted models |
| Vercel adapter / framework / handler | 25 tests passed | Official AI SDK 7 mock; no real model |
| Adapter runtime | Eight checks passed across baseline/current Worker | The old `candidate-v021` test label points at the current bundle; it is not evidence of a distinct tested v0.2.1 build |
| HTTP chat end-to-end | JSON/streaming, isolation, history, conflict and deletion passed | Real local HTTP and storage, mock language model |
| Console API | Cookie-session/API checks passed for both test targets | Not a browser layout or usability test |
| Vercel and JS packaging | Both archives installed offline; ESM and standalone TypeScript checks passed | Authorized checkout/cache, not public npm installation |
| Python transport | Four tests passed on Python 3.9.6 and 3.11.15 | Synchronous client |
| Python local runtime | Memory/conversation operations and deletion passed on both interpreters | Prior runtime test loads source via `PYTHONPATH`; installed-wheel behavior was separately tested below |
| Python packaging | sdist/wheel build, wheel allowlist, clean offline installation passed | Not a PyPI release |
| Existing examples | Vercel offline and end-to-end examples ran | The offline example does not itself show the complete deletion path |

Node.js: **24.10.0**. Adapter dependencies: `ai@7.0.165`, `zod@4.6.7`.
No AI SDK 5/6 or full Node/Python version-matrix compatibility was established.

## Additional installed-package acceptance

The new [ecosystem runtime](test/ecosystem-runtime.mjs) and
[Python probe](test/ecosystem-python.py) passed on Python **3.9.6** and
**3.11.15**, exercising real loopback HTTP:

1. Build archives, install JS SDK/adapter together with cached peer dependencies,
   create a clean virtual environment and install the Python wheel without an
   index. Python uses `-I`, not repository `PYTHONPATH`.
2. JS writes, retrieves, updates and deletes; stale versions, cross-user access,
   read-only writes and a post-delete replay are rejected.
3. JS writes **51** memories; JS and installed Python return identical IDs over
   **50+1** list/export pages without duplicates or missing records.
4. Installed Python completes its own write/search/update/delete lifecycle.
5. Python creates **51** conversations and **65** messages in one conversation.
   Conversation pagination is **50+1**, message pagination **32+32+1**.
   Development-source JS reads those same records/messages in order.
6. Installed Vercel adapter explicitly writes and retrieves; the shared JS SDK
   deletes, and the adapter no longer retrieves the deleted record.
7. The official MCP client lists **seven read-only tools**, retrieves with the
   scoped key and rejects a spoofed `user_id`.
8. Synthetic HTTP error and delayed-response probes compare error classes,
   message exposure and timeout behavior. A pre-aborted JS call starts no request.
9. The repository's customer-continuity example runs against this server and
   deletes its temporary record.
10. Both language clients verify deletion; SQLite counts for memories, history,
    evidence, vectors, conversations/messages and Wiki/edges are zero. The two
    temporary keys are revoked. The temporary installation and database are removed.

This is scripted onboarding by the implementation assistant, **not an observed
first-time external user's completion time or usability score**.

## Gaps reproduced or confirmed

| Priority | Gap | Evidence and required follow-up |
| --- | --- | --- |
| P0 security-hardening follow-up | Base JS SDK copies a server error message and unvalidated error code into its exception | A synthetic `PRIVATE_SENTINEL` survives in JS `error.message`; Python and Vercel adapter sanitize it. No real secret leak was tested. Adopt bounded allowlisted codes and safe default messages before encouraging generic error logging. |
| P0 security-hardening follow-up | Base JS constructor accepts external HTTP URLs | Constructed without sending any request. Python and the Vercel adapter reject this configuration. Align HTTPS/loopback and credential validation. |
| P1 | No native async Python client or cancellation | No async export/coroutine methods; directly invoking the sync client stalls the event loop in the delayed-response test. An application-managed thread is not native async cancellation. |
| P1 | Installed JS/Python feature surfaces differ | After normalizing method names, the JS 0.2.0 archive lacks 22 user-facing methods present in Python, including `context` and conversations; private-source JS has all 22. The six JS-only admin/session methods are a separate intentional scope difference. Name matching does not prove parameter/response parity. Align versioned public exports and types. |
| P1 | Python list/export options are narrower | Python rejects `filter=` with `TypeError`; source JS filter returns the expected 26 records. Search options are not the same as list/export options. |
| P1 | Timeout categories differ | A delayed loopback response yields JS `timeout`, Python `network_error`. JS caller abort is supported; Python has no analogous per-call cancellation. |
| P1 | Pagination is manual | Current cursor APIs work across tested boundaries; no shared auto-pagination iterator/helper is provided. Lists are not transactional snapshots. |
| P1 | Documentation does not demonstrate complete onboarding uniformly | Python README shows `context`, not write/search/delete; JS install/feature documentation mixes legacy and newer service status. A complete Python lifecycle was authored for this test, not copied from its README. |
| Later P1 | MCP OAuth and controlled-write tools absent | Current source accepts user-scoped bearer keys and exposes only read tools. OAuth discovery/token flow, consent and write approval were not implemented or tested. |
| Later P1 | Coverage orchestration incomplete | Existing root `check:integration` omits Python and this cross-language probe; the new `check:ecosystem` is a separate command with explicit build/install prerequisites. Neither command is a verified hosted CI pipeline. |

The base JS message and URL findings are not hidden by the passing functional
assertions. The runtime emits observed capability gaps separately and reports
`behavioral_checks_passed_p1_not_certified`.

## Reproduce

Use an authorized checkout, the existing dependency lockfiles and an environment
with Node.js 24, Python 3.9+ plus build tooling (`build`, `setuptools>=77`, `wheel`).
Do not paste production keys. The tests create local synthetic keys themselves.
Install approved development dependencies before testing; runtime network access
to model providers is blocked.

```sh
# Existing complete JS/Vercel/API suite:
npm run check:integration

# Python source/runtime checks:
npm --prefix product run test:python
npm --prefix product run test:python:runtime

# Prepare the exact current artifacts:
npm run build:product
npm --prefix product/integrations/vercel-ai run build
python -m build --no-isolation product/sdk-python
python product/sdk-python/test_package.py

# Fresh offline packages -> loopback actual Worker -> both clients:
PYTHON_BIN=python3 \
PYTHON_WHEEL="$PWD/product/sdk-python/dist/sixteen_memory-0.3.0-py3-none-any.whl" \
ECOSYSTEM_REPORT="$PWD/output/ecosystem-acceptance.json" \
npm run check:ecosystem
```

The fresh JS install uses `--offline`, so missing cached npm peer dependencies
produce an explicit prerequisite failure; it must not silently fetch or substitute
versions. Python's wheel is installed without dependencies/index access.
No command publishes a package, enables a provider or contacts the production API.

## Recommended next patch

First align JS validation/error sanitation and Python timeout classification,
then implement a cancellation-aware async Python transport and versioned JS
exports. Add pagination helpers and complete side-by-side lifecycle examples
with the installed-package test as their backing contract. Keep read-only MCP
as the default until OAuth and approval-gated write semantics have their own
negative tests. This task did not implement those product changes.
