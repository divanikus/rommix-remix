# Code audit, 2026-11-07

Compared the fork's additions with upstream `b5d59c6`, starting from published
fork tip `181fc60`. The review covered input/provider boundaries, navigation and
paging, filters, card/media operations, ES-DE publication and fork isolation.
Existing downloads, launch and save services were retained.

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

- Formatting, lint, main/preload and renderer type checks, production bundling
  and whitespace checks pass. Every grouped code-history boundary also passes
  both TypeScript projects.
- 316 targeted Node tests pass, including new queue races/failure isolation and
  concurrent API capability checks, plus input, media, filters, history and paging.
- Eleven browser suites pass: library retry, table, navigation, filters, toolbar
  geometry, game media, focus/collection creation, marks, header focus, utility
  sections and ES-DE settings. The retry suite covers initial and subsequent pages.
- Python: all 9 input checks and 20 of 21 ES-DE checks pass on this Windows host.
  The remaining ES-DE test cannot create its fixture symlink because Windows
  requires a privilege unavailable to this process. It remains enabled for Linux.
- Full Node run: 1,366 pass, 79 fail, 1 skipped. All final failure names were
  already present before the changes; the baseline also had a timing failure in
  connection polling. Linux shell, path, permission and symlink assumptions
  prevent treating this Windows run as release qualification.

Browser tests use the public demo fixture and mocked server operations. No real
library, credentials, save data, controller settings or emulator configuration
was touched. Production bundling on the development host is not Linux packaging.

## Remaining limits

The retained Electron `test:app` suite still refers to old Home/menu selectors;
the earlier Linux setup run passed 7 of 13 tests. Adapt and run it on Linux before
enabling releases. Browser scenarios do not replace its preload/IPC coverage.

ES-DE publication detects ordinary concurrent edits; it is not a transaction
shared with ES-DE. Linux symlink and filesystem acceptance, real controllers,
emulator return, sound, save round trips and Steam Deck tests remain separate.
The earlier save-list retry/deletion-scope findings concern unchanged upstream
code and remain follow-up work, not new restore semantics in this refactor.
