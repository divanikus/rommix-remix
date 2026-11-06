from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import shutil
from xml.dom import minidom
from enrich import discover, merge, publish, settings_values


class EnrichmentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.home = Path(self.temp.name)
        self.roms = self.home / 'SD card/roms'
        self.media = self.home / 'SD card/media'
        self.data = self.home / 'ES-DE'
        for directory in [self.roms / 'psx', self.media, self.data / 'gamelists',
                          self.data / 'settings', self.home / 'emudeck', self.home / 'tools/launchers']:
            directory.mkdir(parents=True, exist_ok=True)
        (self.home / 'emudeck/settings.sh').write_text(
            'emulationPath="$HOME"/"SD card"\nromsPath="$emulationPath/roms"\ntoolsPath="$HOME/tools"\n')
        self.config = self.data / 'settings/es_settings.xml'
        self.config.write_text(f'<?xml version="1.0"?>\n<string name="ROMDirectory" value="{self.roms}"/>\n'
                               f'<string name="MediaDirectory" value="{self.media}"/>\n'
                               '<bool name="LegacyGamelistFileLocation" value="false"/>')
        self.game = self.roms / 'psx/Game.cue'
        self.game.write_text('FILE "Game.bin" BINARY')
        self.target = self.data / 'gamelists/psx/gamelist.xml'
        self.job = {'entry': {'emulatorId': 'emudeck', 'system': 'psx', 'launchPath': str(self.game)},
                    'fields': {'name': 'Server name', 'desc': 'A & B <story>', 'genre': 'Action'}}

    def staged(self, kind, extension, data):
        cache = self.home / '.pending'
        cache.mkdir(exist_ok=True)
        file = cache / (kind + extension)
        file.write_bytes(data)
        return {'kind': kind, 'extension': extension, 'source': str(file), 'size': len(data)}

    def test_verified_custom_drive_and_rootless_settings(self):
        self.assertEqual(discover(self.home)['roms'], str(self.roms))

    def test_does_not_execute_shell_settings(self):
        p = self.home / 'emudeck/settings.sh'
        p.write_text('romsPath="$(touch /tmp/not-allowed)"\n')
        self.assertNotIn('romsPath', settings_values(p, self.home))

    def test_single_quotes_do_not_expand_home(self):
        p = self.home / 'emudeck/settings.sh'
        p.write_text("romsPath='$HOME/roms'\ntoolsPath=~/tools # comment\n")
        values = settings_values(p, self.home)
        self.assertNotIn('romsPath', values)
        self.assertEqual(Path(values['toolsPath']), self.home / 'tools')

    def test_mismatching_roots_block(self):
        self.config.write_text(self.config.read_text().replace(str(self.roms), str(self.home)))
        with self.assertRaises(ValueError): discover(self.home)

    def test_legacy_locations_block(self):
        self.config.write_text(self.config.read_text().replace('value="false"', 'value="true"'))
        with self.assertRaises(ValueError): discover(self.home)

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

    def test_external_entities_rejected(self):
        with self.assertRaises(ValueError): merge(b'<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><gameList/>', './Game.cue', {})

    def test_utf16_entity_declarations_are_rejected(self):
        data = '<?xml version="1.0" encoding="UTF-16"?><!DOCTYPE gameList [<!ENTITY a "expanded">]><gameList><game><path>./Game.cue</path><name>&a;</name></game></gameList>'
        for encoding in ('utf-16', 'utf-16-be', 'utf-16-le'):
            with self.subTest(encoding=encoding), self.assertRaises(ValueError):
                merge(data.encode(encoding), './Game.cue', {})

    def test_only_completed_launch_target_is_published_and_repeat_unchanged(self):
        result = publish(self.home, self.job, lambda: False)
        self.assertEqual(result['state'], 'done')
        self.assertIn(b'<path>./Game.cue</path>', self.target.read_bytes())
        self.assertNotIn(b'Game.bin', self.target.read_bytes())
        before = self.target.stat().st_mtime_ns
        self.assertFalse(publish(self.home, self.job, lambda: False)['changed'])
        self.assertEqual(before, self.target.stat().st_mtime_ns)

    def test_existing_absolute_path_is_not_duplicated(self):
        self.target.parent.mkdir()
        self.target.write_text(f'<gameList><game><path>{self.game}</path><name>Owner</name></game></gameList>')
        publish(self.home, self.job, lambda: False)
        self.assertEqual(len(minidom.parse(str(self.target)).getElementsByTagName('game')), 1)

    def test_running_esde_defers_all_writes(self):
        self.assertEqual(publish(self.home, self.job, lambda: True)['state'], 'deferred')
        self.assertFalse(self.target.exists())

    def test_esde_start_before_replace_defers(self):
        calls = iter([False, True])
        self.assertEqual(publish(self.home, self.job, lambda: next(calls))['state'], 'deferred')
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.iterdir()), [])

    def test_foreign_emulator_and_missing_launch_are_rejected(self):
        self.job['entry']['emulatorId'] = 'retrodeck'
        with self.assertRaises(ValueError): publish(self.home, self.job, lambda: False)
        self.job['entry']['emulatorId'] = 'emudeck'
        self.game.unlink()
        with self.assertRaises(ValueError): publish(self.home, self.job, lambda: False)

    def test_symlink_escape_is_rejected(self):
        outside = self.home / 'outside.cue'
        outside.write_text('outside')
        self.game.unlink()
        self.game.symlink_to(outside)
        with self.assertRaises(ValueError): publish(self.home, self.job, lambda: False)

    def test_custom_system_path_is_rejected(self):
        custom = self.data / 'custom_systems/es_systems.xml'
        custom.parent.mkdir()
        custom.write_text('<systemList><system><name>psx</name><path>/other</path></system></systemList>')
        with self.assertRaises(ValueError): publish(self.home, self.job, lambda: False)

    def test_owner_art_is_not_replaced(self):
        cover = self.media / 'psx/covers/Game.jpg'
        cover.parent.mkdir(parents=True)
        cover.write_bytes(b'owner')
        self.job['media'] = [self.staged('covers', '.png', b'server')]
        publish(self.home, self.job, lambda: False, self.home / '.pending')
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
            publish(self.home, self.job, lambda: False, self.home / '.pending')
        self.assertEqual(cover.read_bytes(), b'owner')
        self.assertFalse(cover.with_suffix('.png').exists())

    def test_new_nested_art_uses_launch_filename(self):
        launch = self.game.parent / 'Bundle/Game.m3u'
        launch.parent.mkdir()
        launch.write_text('disc.cue')
        self.job['entry']['launchPath'] = str(launch)
        self.job['media'] = [self.staged('screenshots', '.png', b'image')]
        publish(self.home, self.job, lambda: False, self.home / '.pending')
        self.assertEqual((self.media / 'psx/screenshots/Bundle/Game.png').read_bytes(), b'image')

    def test_video_and_manual_are_copied_completely(self):
        self.job['media'] = [self.staged('videos', '.mp4', b'video' * 300000), self.staged('manuals', '.pdf', b'%PDF-1.7')]
        publish(self.home, self.job, lambda: False, self.home / '.pending')
        self.assertEqual((self.media / 'psx/videos/Game.mp4').stat().st_size, 1500000)
        self.assertEqual((self.media / 'psx/manuals/Game.pdf').read_bytes(), b'%PDF-1.7')

    def test_incomplete_video_does_not_appear_in_esde(self):
        media = self.staged('videos', '.mp4', b'partial')
        media['size'] = 9000
        self.job['media'] = [media]
        with self.assertRaises(ValueError): publish(self.home, self.job, lambda: False, self.home / '.pending')
        self.assertFalse((self.media / 'psx/videos/Game.mp4').exists())


if __name__ == '__main__': unittest.main()
