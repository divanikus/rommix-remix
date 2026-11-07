# Code audit, 2026-11-07

The review compares the fork's additions with upstream `b5d59c6` and covers
input/provider boundaries, navigation and paging, filters, card/media operations,
ES-DE publication and fork isolation. Existing downloads, launch and save services
were retained.

## Corrections

- Failed library lookahead retried continuously. A browser fixture reproduced
  12 requests in 300 ms. Failure now stops automatic lookahead, keeps existing
  games and offers Retry for the failed page, including an initial-page failure.
- A malformed ES-DE job or failed asset blocked subsequent jobs. Failures are
  now isolated per job; deferred ES-DE execution still pauses the queue.
- ES-DE media could publish after storage changed, the worker stopped or the
  installation was removed/replaced during a transfer. Publication now rechecks
  settings, server, installation identity and the queued completion. Complete
  staged media remains available for a valid retry.
- An owner cover arriving under a different extension during a media copy could
  be shadowed by the new file. The writer checks the complete media slot again
  immediately before its non-replacing atomic link.
- The XML declaration byte scan missed UTF-16 DTDs. An encoding-aware parser now
  rejects a doctype before entity expansion. UTF-16 variants have regressions.
- Fork renaming broke the preview's static demo/description/noindex labels.
  Title replacement now accepts the document's title instead of the upstream
  name. The ES-DE browser fixture also respects `PREVIEW_URL`.

## Simplification

Removed the unused embedded game panel, its version callback and tab-action
scope, along with the obsolete pane styles.
Extracted table-row rendering from the library route. The current full-width
table, standalone card, version cancellation and focus behavior remain intact.

Anniversary and filter capability checks now share one server-scoped OpenAPI
cache instead of requesting and caching the same endpoint separately. Media
staging and cleanup share one path calculation. No runtime dependency was added.

## Verification

- The 0.23.0-remix.1 Linux release passes 1,451 Node tests, 195 Electron scenarios,
  9 input tests and 21 ES-DE tests, plus formatting, lint, both TypeScript projects
  and AppImage packaging.
- Node regressions cover queue races/failure isolation, concurrent API capability
  checks, input, media, filters, history and paging.
- Eleven browser suites pass: library retry, table, navigation, filters, toolbar
  geometry, game media, focus/collection creation, marks, header focus, utility
  sections and ES-DE settings. The retry suite covers initial and subsequent pages.
- Electron scenarios cover root/utility navigation, platform browsing, empty
  Search, internal-tab triggers and the current game card. HOME/XDG fixtures isolate
  emulator discovery, and the ES-DE fixture resolves symlinked temporary roots.
- The ES-DE cover test waits for both queue removal and asynchronous staging
  cleanup, avoiding a timing-dependent assertion on ARM64.

Browser tests use the public demo fixture and mocked server operations. Linux is
the supported target; Windows runs do not qualify a release.

## Remaining limits

ES-DE publication detects ordinary concurrent edits; it is not a transaction
shared with ES-DE. Real controllers, emulator return, sound and save round trips
require separate device acceptance; automated checks do not substitute for it.
The earlier save-list retry/deletion-scope findings concern unchanged upstream
code and remain follow-up work, not new restore semantics in this refactor.
