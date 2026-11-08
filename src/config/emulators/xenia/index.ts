import { baseName, dirName, joinPath, shared } from '../savepaths.ts'
import type { EmulatorDescriptor } from '../types.ts'

/**
 * Xenia Canary — an Xbox 360 emulator, the actively developed fork of Xenia.
 *
 *  - It is **not on Flathub**. Its Linux build is an AppImage attached to every
 *    release of the main repository, so it is found by looking for a file.
 *  - It covers **exactly one system**, which is what the per-system pin in
 *    `settings.systemEmulators` is for.
 *  - It needs **no BIOS**: it reimplements the console's kernel rather than
 *    running a dump, so `dirs.bios` names nothing.
 *  - Its saves are keyed by **profile and title id** rather than by ROM name,
 *    and the title id sits inside the game's executable header. The content
 *    tree is therefore reported as shared, the same answer EmuDeck's Xenia
 *    gives.
 *
 * Outside portable mode it keeps everything under `$XDG_DATA_HOME/Xenia`, which
 * is `~/.local/share/Xenia` — see `GetUserFolder` in its
 * `base/filesystem_posix.cc`. An AppImage is not sandboxed, so that is the
 * real folder. Portable mode needs a `portable.txt` beside the executable,
 * which inside a read-only AppImage mount cannot be there.
 */
export const xenia: EmulatorDescriptor = {
  id: 'xenia',
  name: 'Xenia Canary',
  dispatch: 'rommix',
  install: [
    { kind: 'binary', names: ['xenia_canary', 'xenia-canary'] },
    {
      kind: 'appimage',
      patterns: ['xenia*.appimage'],
      release: {
        // The main repository, not `xenia-canary-releases`: that one carries
        // the older tarball builds, and only the main one attaches an AppImage.
        api: 'https://api.github.com/repos/xenia-canary/xenia-canary/releases',
        // Named in full because the Windows build sits beside it as a `.7z`.
        asset: /^xenia_canary_linux\.AppImage$/i
      }
    }
  ],
  homepage: 'https://github.com/xenia-canary/xenia-canary',
  systems: ['xbox360'],
  // One Xbox 360 emulator, one way to run a game.
  variants: undefined,
  ownsLibrary: false,
  esde: undefined,
  dirs: {
    // Xenia has no ROM folder and no game list: a game is opened by path.
    // RomMix's own folder is therefore the honest answer.
    roms: { base: 'rommix', path: 'roms' },
    saves: { base: 'data', path: 'Xenia/content' }
    // No `states`: Xenia has no save states. No `bios`: it needs no firmware.
  },
  // Fixed by the XDG layout, with nothing user-selectable and no configuration
  // file to read them from.
  layout: undefined,
  /**
   * A Games on Demand title is a directory — a header file beside a `.data`
   * folder of parts — and Xenia opens it by that header, so it keeps one.
   */
  flatLibrary: false,
  // Xenia is handed each game by path and scans no folder.
  needsRomFolders: false,
  /**
   * `content/<profile>/<title id>/00000001/`, one tree for every game. The
   * title id is inside the XEX header — itself inside an ISO or a container —
   * so nothing here can name one game's folder, and the tree is skipped rather
   * than uploaded under one game's id.
   */
  saves: (ctx) => ({
    saves: ctx.paths.saves ? shared(ctx.paths.saves) : null,
    states: null,
    unsyncableReason: 'saves.xenia'
  }),
  bios: undefined,
  biosStagingNote: undefined,
  // Xenia is one emulator, not a core loader.
  core: undefined,
  setupNotes: [],
  env: undefined,
  // `exec` alone opens an empty Xenia window with its File menu.
  open: undefined,
  /**
   * The ROM, or the header of a Games on Demand package.
   *
   * `chooseLaunchFile` nominates the largest file, which for a GoD package is
   * one of the `Data0000` parts in `<header>.data/`. Xenia opens the package
   * through its header, the small file named like that folder without the
   * suffix, so the path is turned back into that.
   */
  launch: ({ exec, romPath }) => {
    const folder = dirName(romPath)
    const name = baseName(folder)
    const game = name.toLowerCase().endsWith('.data')
      ? joinPath(dirName(folder), name.slice(0, -'.data'.length))
      : romPath
    return [...exec, '--fullscreen', game]
  }
}
