#!/usr/bin/env python3
"""Tek dosya HTML derleyicisi.

src/ altındaki parçaları, .build/ altındaki kütüphaneleri ve logoyu
tek bir çevrimdışı çalışan HTML dosyasında birleştirir.

Kullanım:  python3 build.py
Çıktı:     takvim-planlayici.html
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).parent
SRC = ROOT / 'src'
BUILD = ROOT / 'vendor'
OUT = ROOT / 'takvim-planlayici.html'

JS_PARTS = ['20_core.js', '30_views.js', '40_editor.js', '50_data.js', '60_ai.js']
VENDOR = ['xlsx.js', 'h2c.js']


def read(p):
    if not p.exists():
        sys.exit(f'Eksik dosya: {p}')
    return p.read_text(encoding='utf-8')


def main():
    logo = read(BUILD / 'logo.txt').strip()

    head = read(SRC / '00_head.html')
    body = read(SRC / '10_body.html').replace('LOGO_DATA_URI', logo)

    vendor = '\n'.join(
        f'<script>/* {name} */\n{read(BUILD / name)}\n</script>' for name in VENDOR)

    app = '\n'.join(read(SRC / name) for name in JS_PARTS)
    app = f'<script>\nconst LOGO = "{logo}";\n{app}\n</script>'

    out = f'{head}\n{body}\n{vendor}\n{app}\n</body>\n</html>\n'
    OUT.write_text(out, encoding='utf-8')

    kb = len(out.encode('utf-8')) / 1024
    print(f'✓ {OUT.name} yazıldı — {kb:.0f} KB')


if __name__ == '__main__':
    main()
