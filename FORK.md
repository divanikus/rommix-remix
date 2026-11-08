# Working on RomMix-Remix

This is a source fork of [leclercb/rommix](https://github.com/leclercb/rommix),
with the original MIT license and Git history preserved. `main` carries the fork;
an `upstream` remote tracks the original project.

The current source includes upstream **0.24.0** (`7b8fbdb`). The next fork version
is `0.24.0-remix.1`; changing the source version does not publish a release.

## Feature history

The initial fork changes are grouped by feature for review and upstream reuse.

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

## Keeping changes ready for upstream

- Follow the current upstream [CONTRIBUTING.md](CONTRIBUTING.md): emulator rules
  belong in `src/config/`, UI wording in the shared language catalogs, and shared
  behavior in testable modules. Keep its checks intact when adapting a feature.
- Merge upstream release tags into the published fork branch. Preserve its commits
  and release tags; do not rebase published `main` for routine updates.
- Keep each feature or fix with its tests in a separate commit. Keep branding,
  profile defaults, update endpoints and publication workflows separate from them.
- Prepare each upstream PR on a fresh `codex/` branch from the current upstream
  tip. Apply only the relevant feature and its follow-up fixes, adapting any UI
  dependencies explicitly. Do not submit the entire fork diff as one feature.
- Run upstream's checks against that extracted branch. Describe the behavior,
  dependencies and actual test coverage; agree the scope before expanding a PR.

The initial feature map above is a starting point for extraction. Later fixes
remain ordinary commits so an upstream contribution can include them without
pulling in unrelated fork changes.

ES-DE export eligibility and strict discovery paths are declared by the emulator
descriptor in `src/config/`. The helper receives that trusted configuration
separately from queued downloads and verifies the actual files before publishing.
Its diagnostic codes resolve through the shared catalogs before reaching Settings;
technical exception details stay in the log. Keep these boundaries when extracting
the feature for upstream. [Multidisc downloads](docs/multidisc.md) add generic
file-based recognition, runner capabilities and narrowly scoped directory-as-file
export. They introduce no platform allowlist or emulator rules outside configuration.

[Arcade launchers](docs/arcade.md) extend the existing system-wide runner choice
with MAME, select the program archive in ZIP/BIOS/CHD bundles and preserve the
user's emulator configuration. They introduce no per-game runner preference.

## Distribution boundaries

The fork has its own application ID, default data root, config pointer and Chromium
profile. `ROMMIX_HOME` remains an explicit override. Existing isolated input-probe
mode is retained; original profiles and credentials are not automatically copied.
The application keeps the original RomMix icon from `packaging/icon.png`.

Native Linux input is enabled by default. `ROMMIX_NATIVE_GAMEPAD=0` selects Chromium
input. Existing emulator configuration is reused.

The updater targets only `divanikus/rommix-remix`. Release publication requires
`ROMMIX_PUBLISH_RELEASES=true`; Pages requires `ROMMIX_PUBLISH_PAGES=true`. Fork push
builds follow the release opt-in; manual and PR checks are always available.
Rolling canary publication requires a separate `ROMMIX_PUBLISH_CANARY=true` opt-in.
The original website/demo sources are retained.

Release versions use `<upstream version>-remix.<revision>`, starting with
`0.23.0-remix.1`. Increase the final number for fork releases on the same upstream
base, for example `0.23.0-remix.2`. Do not consume upstream's next version number.
These are normal GitHub releases, available through the default updater despite
the SemVer suffix. Use an explicit version with release-it rather than `minor`.
The briefly published `0.24.0` was withdrawn to correct its numbering.

## Checks and remaining work

The 0.23.0-remix.1 Linux candidate passes formatting, lint, both TypeScript projects,
1,451 Node tests, 195 Electron scenarios, 9 input tests, 21 ES-DE tests and AppImage
packaging. The inherited Electron scenarios now use the fork's navigation and
isolate HOME/XDG paths from the host emulator setup. Its release gate remains intact.

See the [code audit](docs/code-audit.md) for earlier fixes and regression evidence.
Eleven browser suites also cover failed-page recovery, controller navigation,
filters and media. Linux remains the supported target; Windows tests retain
host/path/process assumptions and do not qualify a Windows release.

Use the commands in [CONTRIBUTING.md](CONTRIBUTING.md), plus:

```sh
python3 -m unittest discover -s src/main/input -p 'test_*.py'
python3 -m unittest discover -s src/main/esde -p 'test_*.py'
```

Browser regressions in `test/web/` run against `npm run preview:app`. They need a
local Playwright installation and Chrome. Set `PLAYWRIGHT_MODULE` to its module
URL when it is outside this checkout; `PREVIEW_URL` selects the preview server.
They use fixture data and do not qualify real controllers, emulators or save sync.

Manual acceptance covers Steam Deck and Bazzite menus, downloads, game launch and
return, plus Deck gameplay audio and ES-DE metadata/media export. ES-DE enrichment
remains Experimental. Miximage composition belongs to ES-DE's native generator.
