import errno
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('linux_gamepad', Path(__file__).with_name('linux-gamepad.py'))
gamepad = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gamepad)


class Snapshots(unittest.TestCase):
    def test_analog_triggers_rest_released_and_press_on_signed_or_unsigned_ranges(self):
        for minimum, maximum in ((0, 255), (-32768, 32767)):
            state = gamepad.read_pad(7, 0, 'fixture', self.ioctl(axes={
                2: (minimum, minimum, maximum), 5: (maximum, minimum, maximum)}))
            self.assertEqual(state['buttons'][6:8], [False, True])
            state = gamepad.read_pad(7, 0, 'fixture', self.ioctl(axes={
                2: (maximum, minimum, maximum), 5: (minimum, minimum, maximum)}))
            self.assertEqual(state['buttons'][6:8], [True, False])

    def test_digital_triggers_and_select_without_analog_axes(self):
        state = gamepad.read_pad(7, 0, 'fixture', self.ioctl(keys=(0x138, 0x139, 0x13A)))
        self.assertEqual([i for i, down in enumerate(state['buttons']) if down], [6, 7, 8])

    def ioctl(self, keys=(), axes=None):
        bits = sum(1 << key for key in keys)
        def query(fd, request, buffer):
            if request == gamepad.ior(0x18, 96):
                return bits.to_bytes(96, 'little')
            code = (request & 255) - 0x40
            if axes and code in axes:
                return struct.pack('=6i', *axes[code], 0, 0, 0)
            raise OSError(errno.EINVAL, 'unsupported axis')
        return query

    def test_unsigned_bluetooth_axes_rest_at_zero_and_reach_full_range(self):
        state = gamepad.read_pad(7, 2, 'fixture', self.ioctl(axes={0: (32768, 0, 65535), 1: (65535, 0, 65535)}))
        self.assertAlmostEqual(state['axes'][0], 0, places=4)
        self.assertEqual(state['axes'][1], 1)
        self.assertEqual(gamepad.normalize((-32768, -32768, 32767)), -1)
        self.assertEqual(gamepad.normalize((3, 2, 2)), 0)
        self.assertEqual(gamepad.normalize((99999, 0, 65535)), 1)

    def test_face_buttons_guide_and_both_dpad_encodings(self):
        state = gamepad.read_pad(7, 0, 'fixture', self.ioctl(
            keys=(0x130, 0x134, 0x13B, 0x13C, 0x220), axes={0x10: (1, -1, 1)}))
        self.assertEqual([i for i, held in enumerate(state['buttons']) if held], [0, 3, 9, 12, 15, 16])
        self.assertEqual(state['axes'], [0, 0])

    def test_disconnect_is_not_treated_as_missing_axis(self):
        def gone(*args):
            raise OSError(errno.ENODEV, 'gone')
        with self.assertRaises(OSError):
            gamepad.read_pad(7, 0, 'fixture', gone)

    def test_sony_square_and_triangle_match_xbox_x_and_y_positions(self):
        for code, position in ((0x134, 2), (0x133, 3)):
            state = gamepad.read_pad(7, 0, 'fixture', self.ioctl(keys=(code,)), vendor=0x054C)
            self.assertEqual([i for i, down in enumerate(state['buttons']) if down], [position])

    def test_capability_words_match_the_kernel_bit_positions(self):
        bits = 1 << 0x130
        words = ' '.join(f'{(bits >> n) & ((1 << 64) - 1):x}' for n in range(256, -1, -64))
        self.assertEqual(gamepad.capability_bits(words, 64), bits)
        self.assertEqual(gamepad.capability_bits('1 0', 32), 1 << 32)

    def test_scan_ignores_keyboards_handles_hotplug_and_closes_descriptors(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            def device(name, keys):
                base = root / name / 'device'
                (base / 'capabilities').mkdir(parents=True)
                (base / 'id').mkdir()
                (base / 'id/vendor').write_text('0000')
                (base / 'name').write_text('fixture')
                (base / 'capabilities/key').write_text(f'{keys:x}')
            device('event0', 1 << 30)  # keyboard
            device('event1', 1 << 0x130)
            reader = gamepad.Reader(root, root)
            with patch.object(gamepad.os, 'O_NONBLOCK', 2048, create=True), \
                    patch.object(gamepad.os, 'open', return_value=7) as opened, \
                    patch.object(gamepad.os, 'close') as closed:
                reader.scan()
                opened.assert_called_once()
                self.assertEqual(opened.call_args.args[0], root / 'event1')
                first = reader.snapshot(self.ioctl(keys=(0x130,)))
                self.assertTrue(first['available'])
                self.assertTrue(first['pads'][0]['buttons'][0])
                (root / 'event1').rename(root / 'removed')
                reader.scan()
                self.assertEqual(reader.snapshot(self.ioctl()), {'available': False, 'pads': []})
                closed.assert_called_once_with(7)
                (root / 'removed').rename(root / 'event1')
                reader.scan()
                self.assertNotEqual(reader.snapshot(self.ioctl())['pads'][0]['index'], first['pads'][0]['index'])
                reader.close()
                self.assertEqual(closed.call_count, 2)

    def test_partial_permission_failure_never_hides_a_pad_behind_native_mode(self):
        reader = gamepad.Reader()
        reader.devices = {'event1': (7, 0, 'fixture', 0)}
        reader.complete = False
        self.assertEqual(reader.snapshot(self.ioctl()), {'available': False, 'pads': []})


if __name__ == '__main__':
    unittest.main()
