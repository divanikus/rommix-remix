from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import shutil
from xml.dom import minidom
from enrich import EnrichmentError, discover, main, merge, parse_gamelist, publish, settings_values
import io
import json


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name).resolve()
        self.roms = self.home / 'SD card/roms'
        self.media = self.home / 'SD card/media'
        self.data = self.home / 'frontend'
        self.integration = {'emulatorId': 'test-suite', 'settings': ['suite/settings.sh', '.config/suite/settings.sh'],
                            'romsKey': 'libraryPath', 'toolsKey': 'scriptsPath',
                            'launcherDirectory': 'launchers', 'dataDirectory': 'frontend',
                            'directoryExtensions': ['.m3u', '.zip', '.7z']}
        for directory in [self.roms / 'psx', self.media, self.data / 'gamelists',
                          self.data / 'settings', self.home / 'suite', self.home / 'tools/launchers']:
            directory.mkdir(parents=True, exist_ok=True)
        (self.home / 'suite/settings.sh').write_text(
            'emulationPath="$HOME"/"SD card"\nlibraryPath="$emulationPath/roms"\nscriptsPath="$HOME/tools"\n')
        self.config = self.data / 'settings/es_settings.xml'
        self.config.write_text(f'<?xml version="1.0"?>\n<string name="ROMDirectory" value="{self.roms}"/>\n'
                               f'<string name="MediaDirectory" value="{self.media}"/>\n'
                               '<bool name="LegacyGamelistFileLocation" value="false"/>')
        self.game = self.roms / 'psx/Game.cue'
        self.game.write_text('FILE "Game.bin" BINARY')
        self.target = self.data / 'gamelists/psx/gamelist.xml'
        self.job = {'entry': {'emulatorId': 'test-suite', 'system': 'psx', 'launchPath': str(self.game)},
                    'fields': {'name': 'Server name', 'desc': 'A & B <story>', 'genre': 'Action'}}

    def staged(self, kind, extension, data):
        cache = self.home / '.pending'
        cache.mkdir(exist_ok=True)
        file = cache / (kind + extension)
        file.write_bytes(data)
        return {'kind': kind, 'extension': extension, 'source': str(file), 'size': len(data)}

    def test_verified_custom_drive_and_rootless_settings(self):
        self.assertEqual(discover(self.home, self.integration)['roms'], str(self.roms))

    def test_conflicting_sources_do_not_pick_a_library(self):
        alternate = self.home / self.integration['settings'][1]
        alternate.parent.mkdir(parents=True)
        alternate.write_text('libraryPath="$HOME"\nscriptsPath="$HOME/tools"\n')
        with self.assertRaises(EnrichmentError) as error:
            discover(self.home, self.integration)
        self.assertEqual(error.exception.code, 'roms')

    def test_publication_rereads_integration_settings(self):
        discover(self.home, self.integration)
        (self.home / self.integration['settings'][0]).write_text(
            'libraryPath="$HOME"\nscriptsPath="$HOME/tools"\n')
        with self.assertRaises(EnrichmentError) as error:
            publish(self.home, self.job, self.integration, lambda: False)
        self.assertEqual(error.exception.code, 'mismatch')
        self.assertFalse(self.target.exists())

    def test_protocol_returns_codes_and_requires_trusted_configuration(self):
        request = {'action': 'probe', 'home': str(self.home), 'integration': self.integration}
        cases = [(request, 'ready', 'running'),
                 ({'action': 'probe', 'home': str(self.home)}, 'blocked', 'configuration')]
        for payload, state, code in cases:
            output = io.StringIO()
            with patch('enrich.sys.stdin', io.StringIO(json.dumps(payload))), \
                    patch('enrich.sys.stdout', output), patch('enrich.running', return_value=True):
                main()
            result = json.loads(output.getvalue())
            self.assertEqual(result['state'], state)
            self.assertEqual(result['reasonCode'], code)
            self.assertNotIn('reason', result)
        self.assertFalse(self.target.exists())

    def test_does_not_execute_shell_settings(self):
        p = self.home / 'suite/settings.sh'
        p.write_text('libraryPath="$(touch /tmp/not-allowed)"\n')
        self.assertNotIn('libraryPath', settings_values(p, self.home))

    def test_single_quotes_do_not_expand_home(self):
        p = self.home / 'suite/settings.sh'
        p.write_text("libraryPath='$HOME/roms'\nscriptsPath=~/tools # comment\n")
        values = settings_values(p, self.home)
        self.assertNotIn('libraryPath', values)
        self.assertEqual(Path(values['scriptsPath']), self.home / 'tools')

    def test_mismatching_roots_block(self):
        self.config.write_text(self.config.read_text().replace(str(self.roms), str(self.home)))
        with self.assertRaises(ValueError): discover(self.home, self.integration)

    def test_legacy_locations_block(self):
        self.config.write_text(self.config.read_text().replace('value="false"', 'value="true"'))
        with self.assertRaises(ValueError): discover(self.home, self.integration)

    def test_owner_values_unknown_fields_and_comments_survive(self):
        data = b'<gameList><!--keep--><game custom="yes"><path>./Game.cue</path><name>Owner</name><favorite>true</favorite><playcount>12</playcount><altemulator>standalone</altemulator><private><x/></private></game></gameList>'
        result = merge(data, './Game.cue', {**self.job['fields'], 'favorite': 'false', 'playcount': '0'})
        self.assertIn(b'<name>Owner</name>', result)
        self.assertIn(b'<favorite>true</favorite>', result)
        self.assertIn(b'<playcount>12</playcount>', result)
        self.assertIn(b'<altemulator>standalone</altemulator>', result)
        self.assertIn(b'<private><x/></private>', result)
        self.assertIn(b'<!--keep-->', result)
        self.assertIn(b'A &amp; B &lt;story&gt;', result)
        self.assertEqual(merge(result, './Game.cue', self.job['fields']), result)

    def test_duplicate_paths_block_without_writing(self):
        data = b'<gameList><game><path>./Game.cue</path></game><game><path>Game.cue</path></game></gameList>'
        with self.assertRaises(ValueError): merge(data, './Game.cue', self.job['fields'])

    def test_alternative_emulator_sibling_is_preserved_and_publication_is_repeatable(self):
        self.target.parent.mkdir()
        owner = (b'<?xml version="1.0"?>\n<!--owner--><?keep data?>\n'
                 b'<alternativeEmulator custom="yes"><label>Owner runner</label></alternativeEmulator>\n'
                 b'<gameList><game><path>./Game.cue</path><name>Owner name</name>'
                 b'<altemulator>Per-game runner</altemulator></game></gameList>')
        self.target.write_bytes(owner)
        self.assertEqual(publish(self.home, self.job, self.integration, lambda: True)['state'], 'deferred')
        self.assertEqual(self.target.read_bytes(), owner)
        self.assertEqual(publish(self.home, self.job, self.integration, lambda: False)['state'], 'done')
        result = self.target.read_bytes()
        doc, root, fragment = parse_gamelist(result)
        self.assertTrue(fragment)
        self.assertIn(b'<!--owner--><?keep data?>', result)
        self.assertIn(b'<alternativeEmulator custom="yes"><label>Owner runner</label></alternativeEmulator>', result)
        self.assertIn(b'<name>Owner name</name>', result)
        self.assertIn(b'<altemulator>Per-game runner</altemulator>', result)
        self.assertIn(b'A &amp; B &lt;story&gt;', result)
        self.assertNotIn(b'esdeFragment', result)
        self.assertEqual(len(root.getElementsByTagName('game')), 1)
        self.assertFalse(publish(self.home, self.job, self.integration, lambda: False)['changed'])
        self.assertEqual(self.target.read_bytes(), result)

    def test_nested_alternative_emulator_in_newer_format_is_preserved(self):
        data = b'<gameList><alternativeEmulator><label>Owner</label></alternativeEmulator></gameList>'
        result = merge(data, './Game.cue', self.job['fields'])
        doc = minidom.parseString(result)
        self.assertEqual(doc.documentElement.tagName, 'gameList')
        self.assertEqual(doc.getElementsByTagName('label')[0].firstChild.data, 'Owner')

    def test_ambiguous_or_malformed_fragments_report_xml_without_writing(self):
        self.target.parent.mkdir()
        for data in (b'<gameList/><gameList/>',
                     b'<alternativeEmulator/><alternativeEmulator/><gameList/>',
                     b'<other/><gameList/>', b'<alternativeEmulator/><gameList>',
                     b'<alternativeEmulator/><!DOCTYPE gameList [<!ENTITY a "bad">]><gameList>&a;</gameList>'):
            with self.subTest(data=data):
                self.target.write_bytes(data)
                with self.assertRaises(EnrichmentError) as error:
                    publish(self.home, self.job, self.integration, lambda: False)
                self.assertEqual(error.exception.code, 'xml')
                self.assertEqual(self.target.read_bytes(), data)

    def test_external_entities_rejected(self):
        with self.assertRaises(ValueError): merge(b'<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><gameList/>', './Game.cue', {})

    def test_utf16_entity_declarations_are_rejected(self):
        data = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE gameList [<!ENTITY a "expanded">]><gameList><game><path>./Game.cue</path><name>&a;</name></game></gameList>'
        for encoding in ('utf-16', 'utf-16-be', 'utf-16-le'):
            with self.subTest(encoding=encoding), self.assertRaises(ValueError):
                merge(data.encode(encoding), './Game.cue', {})

    def test_only_completed_launch_target_is_published_and_repeat_unchanged(self):
        result = publish(self.home, self.job, self.integration, lambda: False)
        self.assertEqual(result['state'], 'done')
        self.assertIn(b'<path>./Game.cue</path>', self.target.read_bytes())
        self.assertNotIn(b'Game.bin', self.target.read_bytes())
        before = self.target.stat().st_mtime_ns
        self.assertFalse(publish(self.home, self.job, self.integration, lambda: False)['changed'])
        self.assertEqual(before, self.target.stat().st_mtime_ns)

    def test_existing_absolute_path_is_not_duplicated(self):
        self.target.parent.mkdir()
        self.target.write_text(f'<gameList><game><path>{self.game}</path><name>Owner</name></game></gameList>')
        publish(self.home, self.job, self.integration, lambda: False)
        self.assertEqual(len(minidom.parse(str(self.target)).getElementsByTagName('game')), 1)

    def test_running_esde_defers_all_writes(self):
        self.assertEqual(publish(self.home, self.job, self.integration, lambda: True)['state'], 'deferred')
        self.assertFalse(self.target.exists())

    def test_esde_start_before_replace_defers(self):
        calls = iter([False, True])
        self.assertEqual(publish(self.home, self.job, self.integration, lambda: next(calls))['state'], 'deferred')
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.iterdir()), [])

    def test_foreign_emulator_and_missing_launch_are_rejected(self):
        self.job['entry']['emulatorId'] = 'other-suite'
        with self.assertRaises(ValueError): publish(self.home, self.job, self.integration, lambda: False)
        self.job['entry']['emulatorId'] = 'test-suite'
        self.game.unlink()
        with self.assertRaises(ValueError): publish(self.home, self.job, self.integration, lambda: False)

    def test_symlink_escape_is_rejected(self):
        outside = self.home / 'outside.cue'
        outside.write_text('outside')
        self.game.unlink()
        self.game.symlink_to(outside)
        with self.assertRaises(ValueError): publish(self.home, self.job, self.integration, lambda: False)

    def test_custom_system_path_is_rejected(self):
        custom = self.data / 'custom_systems/es_systems.xml'
        custom.parent.mkdir()
        custom.write_text('<systemList><system><name>psx</name><path>/other</path></system></systemList>')
        with self.assertRaises(ValueError): publish(self.home, self.job, self.integration, lambda: False)

    def test_owner_art_is_not_replaced(self):
        cover = self.media / 'psx/covers/Game.jpg'
        cover.parent.mkdir(parents=True)
        cover.write_bytes(b'owner')
        self.job['media'] = [self.staged('covers', '.png', b'server')]
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual(cover.read_bytes(), b'owner')
        self.assertFalse(cover.with_suffix('.png').exists())

    def test_owner_art_arriving_during_copy_is_preserved(self):
        cover = self.media / 'psx/covers/Game.jpg'
        self.job['media'] = [self.staged('covers', '.png', b'server')]
        copy = shutil.copyfileobj
        def concurrent_copy(source, destination, length):
            copy(source, destination, length)
            cover.write_bytes(b'owner')
        with patch('enrich.shutil.copyfileobj', concurrent_copy):
            publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual(cover.read_bytes(), b'owner')
        self.assertFalse(cover.with_suffix('.png').exists())

    def test_new_nested_art_uses_launch_filename(self):
        launch = self.game.parent / 'Bundle/Game.m3u'
        launch.parent.mkdir()
        launch.write_text('disc.cue')
        self.job['entry']['launchPath'] = str(launch)
        self.job['media'] = [self.staged('screenshots', '.png', b'image')]
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual((self.media / 'psx/screenshots/Bundle/Game.png').read_bytes(), b'image')

    def test_playlist_directory_has_one_game_entry_and_directory_media_name(self):
        folder = self.game.parent / 'Game.m3u'
        folder.mkdir()
        launch = folder / 'Game.m3u'
        launch.write_text('Disc 1/Game.cue\nDisc 2/Game.cue\n')
        self.job['entry'].update(path=str(folder), launchPath=str(launch), isDirectory=True)
        self.job['media'] = [self.staged('covers', '.png', b'cover')]
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertIn(b'<path>./Game.m3u</path>', self.target.read_bytes())
        self.assertNotIn(b'Game.m3u/Game.m3u', self.target.read_bytes())
        self.assertEqual((self.media / 'psx/covers/Game.m3u.png').read_bytes(), b'cover')
        before = self.target.read_bytes()
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual(self.target.read_bytes(), before)
        self.assertEqual(len(minidom.parse(str(self.target)).getElementsByTagName('game')), 1)

    def test_playlist_directory_preserves_owner_art_and_waits_for_esde(self):
        folder = self.game.parent / 'Game.m3u'
        folder.mkdir()
        launch = folder / 'Game.m3u'
        launch.write_text('Disc 1.cue\nDisc 2.cue\n')
        self.job['entry'].update(path=str(folder), launchPath=str(launch), isDirectory=True)
        self.job['media'] = [self.staged('covers', '.png', b'server')]
        cover = self.media / 'psx/covers/Game.m3u.jpg'
        cover.parent.mkdir(parents=True)
        cover.write_bytes(b'owner')
        result = publish(self.home, self.job, self.integration, lambda: True, self.home / '.pending')
        self.assertEqual(result['state'], 'deferred')
        self.assertFalse(self.target.exists())
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual(cover.read_bytes(), b'owner')
        self.assertFalse(cover.with_suffix('.png').exists())

    def test_unmatched_directory_as_file_still_blocks(self):
        folder = self.game.parent / 'Wrong.m3u'
        folder.mkdir()
        launch = folder / 'Game.m3u'
        launch.write_text('disc.cue\n')
        self.job['entry'].update(path=str(folder), launchPath=str(launch), isDirectory=True)
        with self.assertRaises(EnrichmentError):
            publish(self.home, self.job, self.integration, lambda: False)
        self.assertFalse(self.target.exists())

    def test_archive_directory_has_one_entry_and_preserves_owner_metadata(self):
        folder = self.game.parent / 'set.zip'
        folder.mkdir()
        launch = folder / 'set.zip'
        launch.write_bytes(b'program')
        (folder / 'set').mkdir()
        (folder / 'set/set.chd').write_bytes(b'disk')
        self.job['entry'].update(path=str(folder), launchPath=str(launch), isDirectory=True)
        self.job['media'] = [self.staged('covers', '.png', b'cover')]
        self.target.parent.mkdir(parents=True)
        self.target.write_text('<gameList><game><path>./set.zip</path><name>Owner name</name>'
                               '<altemulator>Owner runner</altemulator><playcount>7</playcount>'
                               '</game></gameList>')
        before = self.target.read_bytes()
        self.assertEqual(publish(self.home, self.job, self.integration, lambda: True)['state'], 'deferred')
        self.assertEqual(self.target.read_bytes(), before)
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        doc = minidom.parse(str(self.target))
        self.assertEqual(len(doc.getElementsByTagName('game')), 1)
        self.assertIn(b'<path>./set.zip</path>', self.target.read_bytes())
        self.assertIn(b'<name>Owner name</name>', self.target.read_bytes())
        self.assertIn(b'<altemulator>Owner runner</altemulator>', self.target.read_bytes())
        self.assertIn(b'<playcount>7</playcount>', self.target.read_bytes())
        self.assertEqual((self.media / 'psx/covers/set.zip.png').read_bytes(), b'cover')

    def test_directory_extension_requires_integration_support(self):
        folder = self.game.parent / 'set.zip'
        folder.mkdir()
        launch = folder / 'set.zip'
        launch.write_bytes(b'program')
        self.job['entry'].update(path=str(folder), launchPath=str(launch), isDirectory=True)
        self.integration['directoryExtensions'] = ['.m3u']
        with self.assertRaises(EnrichmentError):
            publish(self.home, self.job, self.integration, lambda: False)
        self.assertFalse(self.target.exists())

    def test_video_and_manual_are_copied_completely(self):
        self.job['media'] = [self.staged('videos', '.mp4', b'video' * 300000), self.staged('manuals', '.pdf', b'%PDF-1.7')]
        publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertEqual((self.media / 'psx/videos/Game.mp4').stat().st_size, 1500000)
        self.assertEqual((self.media / 'psx/manuals/Game.pdf').read_bytes(), b'%PDF-1.7')

    def test_incomplete_video_does_not_appear_in_esde(self):
        media = self.staged('videos', '.mp4', b'partial')
        media['size'] = 9000
        self.job['media'] = [media]
        with self.assertRaises(ValueError): publish(self.home, self.job, self.integration, lambda: False, self.home / '.pending')
        self.assertFalse((self.media / 'psx/videos/Game.mp4').exists())


if __name__ == '__main__': unittest.main()
