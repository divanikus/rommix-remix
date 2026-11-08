#!/usr/bin/env python3
"""Opt-in ES-DE enrichment. No shell execution, scraping, or library discovery."""
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
from xml.dom import minidom, Node
from xml.parsers import expat


class EnrichmentError(ValueError):
    """Stable UI code plus technical detail for the main-process log."""
    def __init__(self, code, detail):
        super().__init__(detail)
        self.code = code


def shell_value(raw, values, home):
    """Read literal shell assignments; never evaluate commands or expansion operators."""
    result, quote, index = '', None, 0
    if raw.startswith('~/'):
        result, index = str(home), 1
    while index < len(raw):
        char = raw[index]
        if char in ('"', "'") and quote is None:
            quote = char
        elif char == quote:
            quote = None
        elif quote is None and char.isspace():
            rest = raw[index:].strip()
            return result if not rest or rest.startswith('#') else None
        elif char == '$' and quote != "'":
            match = re.match(r'\$(?:\{(\w+)\}|(\w+))', raw[index:])
            if not match or (match[1] or match[2]) not in values:
                return None
            result += values[match[1] or match[2]]
            index += len(match[0]) - 1
        elif quote is None and char in ';|&<>':
            return None
        else:
            result += char
        index += 1
    return result if quote is None else None


def settings_values(path, home):
    values = {"HOME": str(home)}
    for line in path.read_text().splitlines():
        match = re.match(r"^(?:export\s+)?([A-Za-z_]\w*)=(.*)$", line.strip())
        if not match:
            continue
        key, raw = match.groups()
        if any(x in raw for x in ("`", "$(", "${!", "\\")):
            continue
        value = shell_value(raw, values, home)
        if value is not None and "$" not in value:
            values[key] = value
    return values


def parse_xml(data):
    if len(data) > 64 * 1024 * 1024:
        raise EnrichmentError('xml', 'Gamelist is too large')
    # Let the XML parser recognize encodings, including UTF-16. A byte search
    # misses declarations with NUL separators and permits entity expansion.
    def reject_doctype(*_args):
        raise EnrichmentError('xml', 'XML declarations with entities are not supported')
    parser = expat.ParserCreate()
    parser.StartDoctypeDeclHandler = reject_doctype
    try:
        parser.Parse(data, True)
        return minidom.parseString(data)
    except expat.ExpatError as error:
        raise EnrichmentError('xml', str(error)) from error


def parse_gamelist(data):
    """ES-DE also writes a UTF-8 alternativeEmulator sibling before gameList."""
    try:
        doc = parse_xml(data)
        fragment = False
    except EnrichmentError as error:
        cause = error.__cause__
        if not isinstance(cause, expat.ExpatError) or cause.code != expat.errors.codes[expat.errors.XML_ERROR_JUNK_AFTER_DOC_ELEMENT]:
            raise
        try:
            text = data.decode('utf-8-sig')
        except UnicodeDecodeError as decode_error:
            raise EnrichmentError('xml', 'ES-DE gamelist fragments must be UTF-8') from decode_error
        text = re.sub(r'\A<\?xml\s[^?]*\?>', '', text, count=1)
        doc = parse_xml(('<esdeFragment>' + text + '</esdeFragment>').encode('utf-8'))
        fragment = True
    roots = [n for n in doc.documentElement.childNodes if n.nodeType == Node.ELEMENT_NODE] if fragment else [doc.documentElement]
    games = [n for n in roots if n.tagName == 'gameList']
    if (len(games) != 1 or sum(n.tagName == 'alternativeEmulator' for n in roots) > 1
            or any(n.tagName not in ('gameList', 'alternativeEmulator') for n in roots)):
        raise EnrichmentError('xml', 'Not an unambiguous ES-DE gamelist')
    return doc, games[0], fragment


def running(proc=Path('/proc')):
    for process in proc.iterdir():
        if not process.name.isdigit():
            continue
        try:
            names = [process.joinpath('comm').read_text().strip().lower()]
            names += [Path(x.decode(errors='replace')).name.lower()
                      for x in process.joinpath('cmdline').read_bytes().split(b'\0')[:1]]
        except FileNotFoundError:
            continue
        except PermissionError:
            # Other users' processes cannot write this user's ES-DE library.
            if process.stat().st_uid == os.getuid():
                return True
            continue
        if any(n in ('es-de', 'emulationstation', 'emulationstation-de') or
               n.startswith(('es-de.', 'emulationstation-de.')) for n in names):
            return True
    return False


def resolve_value(value, home):
    value = value.replace('${HOME}', str(home)).replace('$HOME', str(home))
    if value.startswith('~/'):
        value = str(home / value[2:])
    if not value or '$' in value or '%' in value or not Path(value).is_absolute():
        raise EnrichmentError('paths', 'ES-DE paths must be explicitly configured and absolute')
    return Path(value).resolve(strict=True)


def discover(home, integration):
    home = Path(home).resolve(strict=True)
    sources = [home / path for path in integration['settings']]
    found = [settings_values(p, home) for p in sources if p.is_file()]
    roms_key, tools_key = integration['romsKey'], integration['toolsKey']
    roots = {resolve_value(v[roms_key], home) for v in found if v.get(roms_key)}
    if len(roots) != 1:
        raise EnrichmentError('roms', 'A unique configured ROM path could not be verified')
    roms = roots.pop()
    if not any(v.get(tools_key) and (resolve_value(v[tools_key], home) / integration['launcherDirectory']).is_dir()
               for v in found):
        raise EnrichmentError('launchers', 'The configured launcher directory is missing')
    # The integration declares its standard data location, including symlinks.
    # An installation using --home elsewhere is deliberately not guessed.
    data = (home / integration['dataDirectory']).resolve(strict=True)
    config = data / 'settings/es_settings.xml'
    # ES-DE's settings file is an XML fragment with several top-level elements.
    fragment = re.sub(br'<\?xml[^?]*\?>', b'', config.read_bytes(), count=1)
    doc = parse_xml(b'<settings>' + fragment + b'</settings>')
    values = {n.getAttribute('name'): n.getAttribute('value') for n in doc.getElementsByTagName('string')}
    if any(n.getAttribute('name') == 'LegacyGamelistFileLocation' and n.getAttribute('value') == 'true'
           for n in doc.getElementsByTagName('bool')):
        raise EnrichmentError('legacy', 'Legacy ES-DE gamelist locations are not supported')
    if resolve_value(values.get('ROMDirectory', ''), home) != roms:
        raise EnrichmentError('mismatch', 'ES-DE and the integration use different ROM directories')
    media = resolve_value(values.get('MediaDirectory', ''), home)
    if not roms.is_dir() or not media.is_dir() or not (data / 'gamelists').is_dir():
        raise EnrichmentError('directories', 'ES-DE ROM, media or gamelist directory is missing')
    for p in (data / 'gamelists', media):
        if not os.access(p, os.W_OK):
            raise EnrichmentError('writable', 'ES-DE metadata directory is not writable')
    # Refuse a custom system path rather than publish into the wrong library.
    return {'roms': str(roms), 'data': str(data), 'media': str(media)}


def inside(path, root):
    result = Path(path).resolve()
    if result == root or root not in result.parents:
        raise EnrichmentError('outside', 'Path leaves the verified directory')
    return result


def text_of(node):
    return ''.join(n.data for n in node.childNodes if n.nodeType in (Node.TEXT_NODE, Node.CDATA_SECTION_NODE))


def children(node, tag):
    return [n for n in node.childNodes if n.nodeType == Node.ELEMENT_NODE and n.tagName == tag]


def merge(data, relative, fields, system_root=None):
    doc, root, fragment = parse_gamelist(data or b'<gameList/>')
    matches = []
    for game in children(root, 'game'):
        paths = children(game, 'path')
        same = False
        if len(paths) == 1:
            candidate = text_of(paths[0])
            same = os.path.normpath(candidate) == os.path.normpath(relative)
            if system_root is not None:
                same = (system_root / candidate).resolve() == (system_root / relative).resolve()
        if same:
            matches.append(game)
    if len(matches) > 1:
        raise EnrichmentError('duplicates', 'Ambiguous duplicate ES-DE entry')
    game = matches[0] if matches else doc.createElement('game')
    changed = not matches
    if not matches:
        root.appendChild(game)
        fields = {'path': relative, **fields}
    allowed = {'path', 'name', 'desc', 'rating', 'releasedate', 'developer', 'publisher', 'genre', 'players'}
    for key, value in fields.items():
        if key not in allowed or not isinstance(value, str) or not value.strip():
            continue
        nodes = children(game, key)
        if nodes and (len(nodes) != 1 or text_of(nodes[0]).strip() or nodes[0].attributes.length):
            continue
        target = nodes[0] if nodes else doc.createElement(key)
        if not nodes:
            game.appendChild(target)
        # Retain comments, processing instructions and unknown nested elements.
        if any(n.nodeType == Node.ELEMENT_NODE for n in target.childNodes):
            continue
        target.appendChild(doc.createTextNode(value))
        changed = True
    if not changed:
        return data
    if fragment:
        # Keep the owner's sibling nodes in their original order. The temporary
        # parser container is never written to ES-DE's file.
        return b'<?xml version="1.0" encoding="utf-8"?>' + b''.join(
            node.toxml(encoding='utf-8') for node in doc.documentElement.childNodes)
    return doc.toxml(encoding='utf-8')


IMAGE_EXTENSIONS = ('.png', '.jpg', '.webp')
MEDIA = {k: IMAGE_EXTENSIONS for k in ('covers', 'screenshots', 'fanart', 'marquees', 'backcovers',
                                      '3dboxes', 'physicalmedia', 'titlescreens', 'miximages')}
MEDIA['manuals'] = ('.pdf',)
MEDIA['videos'] = ('.mp4', '.mkv', '.avi', '.wmv', '.mov', '.webm', '.m4v')


def media_destination(paths, system, launch, system_root, kind, extension):
    if kind not in MEDIA or extension not in MEDIA[kind]:
        raise EnrichmentError('mediaType', 'Unsupported ES-DE media type')
    root = Path(paths['media'])
    relative = launch.relative_to(system_root)
    # ES-DE retains the extension of a directory interpreted as a file.
    stem = relative if launch.is_dir() else relative.with_suffix('')
    destination = inside(root / system / kind / (str(stem) + extension), root)
    existing = MEDIA[kind] + (('.jpeg',) if kind not in ('videos', 'manuals') else ())
    if any(destination.with_suffix(ext).exists() for ext in existing):
        return None
    return destination


def publish(home, job, integration, is_running=running, cache=None):
    paths = discover(home, integration)
    if is_running():
        return {'state': 'deferred', 'reasonCode': 'running'}
    entry = job['entry']
    if entry.get('emulatorId') != integration['emulatorId'] or not re.fullmatch(r'[a-z0-9_-]+', entry['system']):
        raise EnrichmentError('eligibility', 'The download does not match the configured integration')
    system = entry['system']
    roms = Path(paths['roms'])
    system_root = inside(roms / system, roms)
    launch = inside(entry['launchPath'], system_root)
    if not launch.is_file():
        raise EnrichmentError('launchMissing', 'The completed launch file is missing')
    special = [p for p in launch.parents if p != system_root and system_root in p.parents
               and p.suffix.lower() == launch.suffix.lower()]
    display = launch
    if special:
        if (len(special) != 1 or special[0] != launch.parent
                or launch.suffix.lower() not in integration.get('directoryExtensions', [])
                or launch.parent.name != launch.name or not entry.get('isDirectory')
                or Path(entry.get('path', '')).resolve() != launch.parent):
            raise EnrichmentError('layout', 'Unsupported directory-as-file layout')
        display = launch.parent
    if (system_root / 'flatten.txt').exists():
        raise EnrichmentError('layout', 'Flattened ES-DE layouts require explicit support')
    # Custom systems can override the root, even when ROMDirectory agrees.
    custom = Path(paths['data']) / 'custom_systems/es_systems.xml'
    if custom.is_file():
        custom_doc = parse_xml(custom.read_bytes())
        for node in custom_doc.getElementsByTagName('system'):
            names = children(node, 'name')
            if names and text_of(names[0]) == system and children(node, 'path'):
                raise EnrichmentError('customSystem', 'Custom ES-DE system paths require explicit support')
    target = inside(Path(paths['data']) / 'gamelists' / system / 'gamelist.xml', Path(paths['data']) / 'gamelists')
    before = target.read_bytes() if target.exists() else b''
    relative = './' + display.relative_to(system_root).as_posix()
    after = merge(before, relative, job['fields'], system_root)
    if after != before:
        target.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix='.rommix-remix-', dir=target.parent)
        try:
            with os.fdopen(fd, 'wb') as output:
                output.write(after)
                output.flush()
                os.fsync(output.fileno())
            # Reread immediately before replace; never overwrite a concurrent edit.
            if is_running() or (target.read_bytes() if target.exists() else b'') != before:
                return {'state': 'deferred', 'reasonCode': 'changed'}
            if target.exists():
                os.chmod(temp, target.stat().st_mode & 0o777)
            os.replace(temp, target)
        finally:
            if os.path.exists(temp):
                os.unlink(temp)
    # ES-DE looks up media by the ROM's relative filename, without extension.
    for media in job.get('media', []):
        if is_running():
            return {'state': 'deferred', 'reasonCode': 'running'}
        image_path = media_destination(paths, system, display, system_root, media['kind'], media['extension'])
        if image_path is None:
            continue
        if cache is None:
            raise EnrichmentError('staging', 'Media staging directory is missing')
        source = inside(media['source'], Path(cache).resolve(strict=True))
        size = source.stat().st_size
        if size != media['size'] or size <= 0 or size > 512 * 1024 * 1024:
            raise EnrichmentError('incomplete', 'Incomplete or oversized staged media')
        image_path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp = tempfile.mkstemp(prefix='.rommix-remix-', dir=image_path.parent)
        try:
            with os.fdopen(fd, 'wb') as output, source.open('rb') as input_file:
                shutil.copyfileobj(input_file, output, 1024 * 1024)
                output.flush()
                os.fsync(output.fileno())
            if is_running():
                return {'state': 'deferred', 'reasonCode': 'running'}
            # Curation may have arrived under another extension during the copy.
            if media_destination(paths, system, display, system_root, media['kind'], media['extension']) is None:
                continue
            try:
                # Link is atomic and refuses to replace existing owner artwork.
                os.link(temp, image_path)
            except FileExistsError:
                pass
        finally:
            os.unlink(temp)
    needed = [a['kind'] for a in job.get('artwork', []) if a['kind'] in MEDIA and
              media_destination(paths, system, display, system_root, a['kind'], MEDIA[a['kind']][0]) is not None]
    return {'state': 'done', 'changed': after != before, 'needed': needed, **paths}


def main():
    try:
        request = json.load(sys.stdin)
        if request['action'] == 'probe':
            result = {'state': 'ready', **discover(request['home'], request['integration'])}
            if running():
                result['reasonCode'] = 'running'
        elif request['action'] == 'publish':
            result = publish(request['home'], request['job'], request['integration'], cache=request.get('cache'))
        else:
            raise ValueError('Unknown action')
    except Exception as error:
        result = {'state': 'blocked', 'reasonCode': error.code if isinstance(error, EnrichmentError)
                  else 'configuration', 'detail': str(error)}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
