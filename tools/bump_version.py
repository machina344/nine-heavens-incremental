"""Set the game's version everywhere it appears.

Usage:
    python tools/bump_version.py 0.5.1    # set an exact version
    python tools/bump_version.py patch    # 0.5.0 -> 0.5.1
    python tools/bump_version.py minor    # 0.5.0 -> 0.6.0
    python tools/bump_version.py major    # 0.5.0 -> 1.0.0

Updates js/version.js and the ?v= cache stamps on every script and stylesheet link,
so browsers load matching files after an update. Versions may only go up.
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VERSION_FILE = os.path.join(ROOT, 'js', 'version.js')
PAGES = [os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'tests', 'index.html')]


def read(path):
    with io.open(path, encoding='utf-8') as f:
        return f.read()


def write(path, text):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def parse(version):
    parts = version.split('.')
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        sys.exit(f'"{version}" is not a version like 1.2.3')
    return tuple(int(p) for p in parts)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    current = re.search(r"WD\.VERSION = '([^']+)'", read(VERSION_FILE)).group(1)
    major, minor, patch = parse(current)
    arg = sys.argv[1]
    if arg == 'patch':
        new = (major, minor, patch + 1)
    elif arg == 'minor':
        new = (major, minor + 1, 0)
    elif arg == 'major':
        new = (major + 1, 0, 0)
    else:
        new = parse(arg)
    if new <= (major, minor, patch):
        sys.exit(f'{".".join(map(str, new))} is not higher than the current {current}')
    version = '.'.join(map(str, new))

    write(VERSION_FILE, re.sub(r"WD\.VERSION = '[^']+'", f"WD.VERSION = '{version}'", read(VERSION_FILE)))
    for page in PAGES:
        text = re.sub(r'\.(js|css)\?v=[^"]+"', lambda m: f'.{m.group(1)}?v={version}"', read(page))
        write(page, text)
    print(f'{current} -> {version}')


if __name__ == '__main__':
    main()
