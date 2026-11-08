# Arcade launchers

RomMix 0.24 already chooses an integration per system and a runner within that
integration. An installed game's **Run with** button appears when more than one
runner is available. Its choice is remembered for the whole system within that
integration. There is no separate per-game override.

EmuDeck now offers MAME Standalone and the current MAME RetroArch core for
`arcade` and `mame`. The existing first choices and saved identifiers remain:
FBNeo for `arcade`, MAME 2003-Plus for `mame`. The separate `fbneo` system keeps
its FBNeo runner. Standalone appears only when EmuDeck's `mame.sh` is present;
core choices use its existing `retroarch.sh` check. This does not audit installed
core binaries or guarantee that their versions match the ROM set.

## Files and launch

For configured romset systems, a bundle's program ZIP or 7z takes precedence
over CHD images and playlists. When several archives exist, the archive matching
the game directory name wins; otherwise a single archive is accepted. Multiple
unmatched archives are ambiguous and are not ranked by size. A BIOS archive can
be larger than the game. Non-archive alternatives such as `.neo` keep working.

Both download methods preserve relative BIOS and CHD paths. The actual file list
also identifies multifile packages when RomM's `has_multiple_files` summary is
false but a ZIP has nested disk companions. For example:

```text
arcade/kinst2/
  kinst2.zip
  kinst2/kinst2.chd
```

The game is launched with `kinst2.zip`. Existing directory entries are inspected
again at launch, so a previously recorded CHD, M3U or BIOS target can be corrected
without renaming, removing or rewriting any game file. Ambiguous sets report a
translated error. The Files tab shows the installed entry's local path.

With ES-DE enrichment enabled in emulator storage, a fresh package whose program
archive matches its directory name becomes one ES-DE entry:

```text
arcade/kinst2.zip/
  kinst2.zip
  kinst2/kinst2.chd
```

Both frontends launch the inner archive. The gamelist addresses `./kinst2.zip`
and media uses that directory name, for example `covers/kinst2.zip.png`.
The integration declares supported directory extensions; matching ZIP and 7z
packages are enabled. Single archives remain ordinary files. Other layouts and
existing destination collisions keep their original folders. A lost index can
rediscover the matching package; removal stays confined to that package.
Existing installs and owner XML/artwork are not migrated or deleted automatically.

EmuDeck's standalone MAME launcher forwards a per-launch `-rompath` containing
the program archive's directory and the paths from `~/.mame/mame.ini`. When that
file declares no ROM path, discovered EmuDeck ROM and BIOS directories provide
the fallback. Configuration files are read, never rewritten. This reads EmuDeck's
base configuration, not every possible custom MAME INI override. Literal
semicolons in the game directory cannot be represented in MAME's path list and
are rejected. Standalone save discovery uses the machine's own NVRAM and state
directories under EmuDeck's configured save root.

## Verification

Automated fixtures cover a single ZIP, ZIP plus larger BIOS, ZIP plus CHD and an
existing playlist, both download methods, stale launch targets, launcher
availability, configured search paths and per-machine save ownership. Fixtures
contain synthetic bytes; they do not prove ROM compatibility or emulator boot.

A device check must use a compatible emulator and ROM set, download each shape
from RomM, select the intended runner, and verify launch and in-game controls.
Automatic ROM audits, emulator version matching, emulator installation and
per-game runner overrides are outside this change.

## References

- [EmuDeck MAME launcher](https://github.com/dragoonDorise/EmuDeck/blob/main/tools/launchers/mame.sh)
  and [MAME configuration](https://github.com/dragoonDorise/EmuDeck/blob/main/functions/EmuScripts/emuDeckMAME.sh).
- [MAME search paths and command-line options](https://docs.mamedev.org/commandline/commandline-all.html)
  and [ROM and disk image search](https://docs.mamedev.org/usingmame/assetsearch.html).
- [Flycast NAOMI ZIP and CHD layout](https://docs.libretro.com/library/flycast/#how-to-play-naomi-games).
- [ES-DE directories interpreted as files](https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md#directories-interpreted-as-files)
  and [launch path expansion](https://gitlab.com/es-de/emulationstation-de/-/blob/master/es-app/src/FileData.cpp).

These are behavior references; no source code was copied from them.
