# Multidisc downloads

A fresh, completed download can become one M3U launch unit. Recognition uses disc
files, their references and explicit disc numbers; it receives no platform ID.
Runner support is declared by `LaunchVariant.m3u` in `src/config/emulators/`.
Adding support for another runner does not require changing the recognizer.

## Recognition and launch

- CUE and GDI descriptors identify discs; their BIN/RAW tracks are dependencies.
  Every referenced file must exist. CHD, ISO and CDI images can also be discs.
- Disc/Disk/CD numbers in filenames or enclosing folders must identify one family,
  run consecutively from 0 or 1, and agree with any stated total file count.
  Arabic and canonical Roman numbers (I, II, III, IV, etc.) are supported, including
  totals and folder labels. Ordering is numeric; a supplied disc zero stays first.
  Unnumbered or ambiguous bundles, missing tracks, mixed versions and arcade
  ZIP/BIOS/CHD packages keep their existing layout and launch selection.
- The saved runner must support every disc format through M3U. Before a runner
  is selected, every offered option must support those formats. Unknown support
  means no generation. Verified capabilities currently cover selected Libretro
  cores and the DuckStation launcher; other runners need evidence before opting in.
- An existing M3U/M3U8 anywhere in the game is preserved. Adoption and adding files
  to an installed game never generate, extend or reorder a playlist.

Both archive and individual-file downloads converge after completion. Individual
files retain subdirectories from RomM's `file_path`, relative to the exact ROM;
two discs can each contain `track.bin`. Playlist lines are relative UTF-8 paths.
The installed entry includes the playlist in its file list and size, uses it as
the launch target, and records its disc list. Switching to an unsupported runner
produces a translated error instead of passing it an incompatible playlist.

Interrupted downloads remember whether their destination folder was new. Older
pending records without that evidence do not authorize generation into a folder
already on disk. Existing destination directories and playlist files are never
deliberately replaced. No existing library migration or background repair runs.

## ES-DE

When ES-DE enrichment is enabled for a declared integration and downloads use its
emulator folders, the completed unit uses ES-DE's directory-as-file convention:

```text
Game.m3u/
  Game.m3u
  Disc 1/Game.cue
  Disc 1/track.bin
  Disc 2/Game.cue
  Disc 2/track.bin
```

RomMix launches the inner playlist. ES-DE's gamelist entry addresses
`./Game.m3u`, and its media keeps the directory extension, for example
`covers/Game.m3u.png`. The exporter accepts only this exact matching parent/file
layout. Owner XML fields and artwork are preserved; metadata publication waits
while ES-DE is running. Custom roots and flattened libraries retain their existing
restrictions. A normal library gets the playlist inside its original game folder.

Already downloaded games are not renamed. A live trial should download a new
multidisc game, confirm one ES-DE entry with its artwork, launch through both
frontends and switch discs in the emulator. Automated fixtures cover download,
resume, index persistence, adoption after index loss, removal and export; they
do not establish actual emulator disc swapping or controller behavior.

## References

- [ES-DE directories interpreted as files](https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md#directories-interpreted-as-files)
  and [manual media filenames](https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md#manually-copying-game-media-files).
- [Libretro disc images](https://docs.libretro.com/guides/disc-images/),
  [disc swapping](https://github.com/libretro/docs/blob/master/docs/guides/disc-swapping.md)
  and the [core capability files](https://github.com/libretro/libretro-super/tree/master/dist/info).
- [DuckStation M3U reader](https://github.com/stenzek/duckstation/blob/master/src/util/cd_image_m3u.cpp).
- [RomM 5.4.1 file path model](https://github.com/rommapp/romm/blob/5.4.1/backend/models/rom.py).

These are behavior references; no source code was copied from them.
