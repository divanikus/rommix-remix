"""Optional Linux input snapshots. Standard library only; no grabs or writes.

Query current evdev state rather than assuming Chromium exposed every gamepad.
Only nodes with BTN_GAMEPAD capabilities are opened. A snapshot covers every
such node or is unavailable; the renderer never mixes it with Chromium input.
"""

import errno
import json
import os
from pathlib import Path
import re
import struct
import sys
import time


BUTTONS = {
    0x130: 0, 0x131: 1, 0x133: 2, 0x134: 3,
    0x136: 4, 0x137: 5, 0x13A: 8, 0x13B: 9, 0x13C: 16,
    0x220: 12, 0x221: 13, 0x222: 14, 0x223: 15,
}
AXES = (0, 1, 0x10, 0x11)


def capability_bits(text, word_bits=struct.calcsize('L') * 8):
    return sum(int(word, 16) << (i * word_bits)
               for i, word in enumerate(reversed(text.split())))


def ior(number, size):
    # Linux asm-generic ioctl layout, used by supported x86_64/aarch64 hosts.
    return (2 << 30) | (size << 16) | (ord('E') << 8) | number


def normalize(info):
    value, minimum, maximum = info[:3]
    if maximum <= minimum:
        return 0.0
    return max(-1.0, min(1.0, 2 * (value - minimum) / (maximum - minimum) - 1))


def read_pad(fd, index, name, ioctl, vendor=0):
    keys = int.from_bytes(ioctl(fd, ior(0x18, 96), bytes(96)), 'little')
    buttons = [False] * 17
    # xpad/Steam virtual Xbox use historical BTN_X/BTN_Y aliases. Sony's
    # hid-playstation uses positional BTN_WEST (square)/BTN_NORTH (triangle).
    mapping = dict(BUTTONS)
    if vendor == 0x054C:
        mapping.update({0x133: 3, 0x134: 2})
    for code, button in mapping.items():
        buttons[button] = bool(keys & (1 << code))
    axes = {}
    for code in AXES:
        try:
            axes[code] = struct.unpack('=6i', ioctl(fd, ior(0x40 + code, 24), bytes(24)))
        except OSError as error:
            if error.errno != errno.EINVAL:
                raise
    for code, negative, positive in ((0x10, 14, 15), (0x11, 12, 13)):
        if code in axes:
            buttons[negative] |= axes[code][0] < 0
            buttons[positive] |= axes[code][0] > 0
    return {
        'index': index, 'name': name, 'buttons': buttons,
        'axes': [normalize(axes[code]) if code in axes else 0.0 for code in (0, 1)],
    }


class Reader:
    def __init__(self, sysfs=Path('/sys/class/input'), device_root=Path('/dev/input')):
        self.sysfs = sysfs
        self.device_root = device_root
        self.devices = {}
        self.next_index = 0
        self.complete = False

    def scan(self):
        paths = set()
        complete = True
        try:
            entries = list(self.sysfs.iterdir())
        except OSError:
            entries = []
            complete = False
        for entry in entries:
            if not re.fullmatch(r'event\d+', entry.name):
                continue
            try:
                bits = capability_bits((entry / 'device/capabilities/key').read_text())
                if not bits & (1 << 0x130):
                    continue
                paths.add(entry.name)
                if entry.name not in self.devices:
                    name = (entry / 'device/name').read_text().strip()[:200]
                    vendor = int((entry / 'device/id/vendor').read_text().strip(), 16)
                    fd = os.open(self.device_root / entry.name, os.O_RDONLY | os.O_NONBLOCK)
                    self.devices[entry.name] = (fd, self.next_index, name, vendor)
                    self.next_index += 1
            except (OSError, ValueError):
                complete = False
        for name in list(self.devices):
            if name not in paths:
                os.close(self.devices.pop(name)[0])
        self.complete = complete

    def snapshot(self, ioctl):
        pads = []
        for node, (fd, index, name, vendor) in list(self.devices.items()):
            try:
                pads.append(read_pad(fd, index, name, ioctl, vendor))
            except OSError:
                os.close(fd)
                del self.devices[node]
                self.complete = False
        available = self.complete and bool(pads)
        return {'available': available, 'pads': pads if available else []}

    def close(self):
        for device in self.devices.values():
            os.close(device[0])
        self.devices.clear()


def main():
    if sys.platform != 'linux':
        raise SystemExit('Linux only')
    import fcntl
    import select

    reader = Reader()
    last_scan = last_send = -10.0
    previous = None
    try:
        while True:
            # The parent owns stdin. EOF also stops us if Electron is killed.
            if select.select([sys.stdin], [], [], 0)[0] and not sys.stdin.buffer.read(1):
                break
            now = time.monotonic()
            if now - last_scan >= 1:
                reader.scan()
                last_scan = now
            snapshot = json.dumps(reader.snapshot(fcntl.ioctl), separators=(',', ':'))
            if snapshot != previous or now - last_send >= 0.25:
                print(snapshot, flush=True)
                previous, last_send = snapshot, now
            time.sleep(0.008)
    except (BrokenPipeError, KeyboardInterrupt):
        pass
    finally:
        reader.close()


if __name__ == '__main__':
    main()
