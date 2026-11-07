# Working on RomMix-Remix

This is a source fork of [leclercb/rommix](https://github.com/leclercb/rommix),
with the original MIT license and Git history preserved. `main` carries the fork;
an `upstream` remote tracks the original project.

## Feature history

The initial 33 trial patches and subsequent fork changes were regrouped with the
owner's permission on 2026-11-07. Corrections belong to their feature rather than
separate rounds of layout feedback. The five functional commits are followed by
the upstream merge, fork identity, CI policy and public documentation.

| Area     | Commit                                                                                               | Change                                                               |
| -------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Input    | [c0dcf51](https://github.com/divanikus/rommix-remix/commit/c0dcf5135e95243d16deb316c36439e77c868ca3) | Add native Linux controller input and guard held controls on return  |
| Library  | [f90fd4a](https://github.com/divanikus/rommix-remix/commit/f90fd4a4376b45b323bf65df3da3bc2b33618aa8) | Add system browsing, library views and controller navigation         |
| Filters  | [2decbbc](https://github.com/divanikus/rommix-remix/commit/2decbbc2dc20f5f2f0903b3f78c38bce955d9fa3) | Add scoped library filters and recoverable paged browsing            |
| Card     | [acb87b5](https://github.com/divanikus/rommix-remix/commit/acb87b50affd1fcacde09d78f8c2e440dd3e75e9) | Add media-rich game cards with version and collection actions        |
| Esde     | [fd782d2](https://github.com/divanikus/rommix-remix/commit/fd782d2440a715ee58d2f145bbd54262097406e3) | Add opt-in preserving EmuDeck and ES-DE enrichment                   |
| Upstream | [a4b09ba](https://github.com/divanikus/rommix-remix/commit/a4b09ba322e5b418593e28268ba34ee1acfac678) | Merge upstream save sync, RetroArch core and PS3 launch improvements |
| Identity | [167b01e](https://github.com/divanikus/rommix-remix/commit/167b01e60b25b17004bbbe4a34b3ec7f19700ede) | Isolate Remix profiles, input defaults and update channel            |
| Ci       | [72587b2](https://github.com/divanikus/rommix-remix/commit/72587b2d8057369a89a55afb4fb92814e86b0649) | Keep fork builds and publication opt-in                              |

The original history through `7b411da` and all three upstream improvements through
`b5d59c6` remain ancestors. Each grouped code commit passes both TypeScript projects.
UI features build on earlier groups; these are review boundaries, not a promise of
independent cherry-picks. For an upstream PR, extract one feature with its tests
against current upstream and omit fork identity and distribution policy.

This replaces the published tips `181fc60` and `5f1edc1`; existing contributors should reconcile
local work before pulling the rewritten `main`. No upstream branch was rewritten.

## Distribution boundaries

The fork has its own application ID, default data root, config pointer and Chromium
profile. `ROMMIX_HOME` remains an explicit override. Existing isolated input-probe
mode is retained; original profiles and credentials are not automatically copied.
The application keeps the original RomMix icon from `packaging/icon.png`.

Native Linux input is enabled by default. `ROMMIX_NATIVE_GAMEPAD=0` selects Chromium
input. Existing emulator configuration is reused.

The updater targets only `divanikus/rommix-remix`. Release publication requires
`ROMMIX_PUBLISH_RELEASES=true`; Pages requires `ROMMIX_PUBLISH_PAGES=true`. Fork push
builds remain paused until Steam Deck testing; manual and PR checks are available.
The original website/demo sources are retained.

## Checks and remaining work

See the [code audit](docs/code-audit.md) for fixes, regression evidence and current
limits. Formatting, lint, both TypeScript projects, production bundling and 316
targeted Node tests pass on the development host. Eleven browser regression suites
pass, including failed-page recovery, controller navigation, filters and media.

The full Node suite still has 79 failures on Windows in existing host/path/process
assumptions; it is not a green Linux release run. The earlier prepared Linux build
passed 1,441 Node tests, 9 input tests, 19 ES-DE tests and AppImage packaging. That
evidence predates this audit. The upstream Electron end-to-end suite still needs
navigation-fixture migration; its release gate remains intact.

Use the commands in [CONTRIBUTING.md](CONTRIBUTING.md), plus:

```sh
python3 -m unittest discover -s src/main/input -p 'test_*.py'
python3 -m unittest discover -s src/main/esde -p 'test_*.py'
```

Browser regressions in `test/web/` run against `npm run preview:app`. They need a
local Playwright installation and Chrome. Set `PLAYWRIGHT_MODULE` to its module
URL when it is outside this checkout; `PREVIEW_URL` selects the preview server.
They use fixture data and do not qualify real controllers, emulators or save sync.

Steam Deck and new-download ES-DE cover acceptance remain open. ES-DE enrichment
is Experimental. No binary release or device deployment accompanies this audit.
