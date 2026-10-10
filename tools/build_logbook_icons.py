"""Draws the APMES Logbook app icons (a white open book with a tick on a blue square).

    python3 tools/build_logbook_icons.py

Writes logbook/icons/: icon-192.png, icon-512.png (rounded), maskable-512.png (full bleed,
artwork inside the 80% safe zone), apple-touch-icon.png (180, square: iOS rounds it) and favicon-32.png.
Needs Pillow. No fonts used, so the output is the same on any machine.
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / 'logbook' / 'icons'
BLUE = (0, 47, 108, 255)  # NUHS navy
WHITE = (255, 255, 255, 255)
SS = 4  # supersampling


def art(size, rounded, scale):
    """size: output px; rounded: corner radius as a fraction; scale: artwork size as a fraction."""
    S = size * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * rounded), fill=BLUE)
    else:
        d.rectangle([0, 0, S, S], fill=BLUE)
    c = S / 2
    u = S * scale / 100  # artwork units: 100 = the whole artwork box
    # open book: two pages meeting at a spine, slightly lifted at the outer edges
    top, bot = c - 30 * u, c + 26 * u
    for side in (-1, 1):
        outer = c + side * 40 * u
        inner = c + side * 3 * u
        d.polygon([(inner, top + 4 * u), (outer, top), (outer, bot - 4 * u), (inner, bot)], fill=WHITE)
    # text lines on the left page
    for i in range(4):
        y = top + (12 + i * 9) * u
        d.line([(c - 32 * u, y - 1 * u), (c - 10 * u, y + 0.5 * u)], fill=BLUE, width=max(1, int(3.2 * u)))
    # tick on the right page
    d.line([(c + 11 * u, c - 2 * u), (c + 19 * u, c + 7 * u), (c + 33 * u, c - 14 * u)], fill=BLUE,
           width=max(1, int(6 * u)), joint='curve')
    return im.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    art(192, 0.22, 0.86).save(OUT / 'icon-192.png')
    art(512, 0.22, 0.86).save(OUT / 'icon-512.png')
    art(512, 0, 0.62).save(OUT / 'maskable-512.png')
    art(180, 0, 0.74).convert('RGB').save(OUT / 'apple-touch-icon.png')
    art(32, 0.2, 0.92).save(OUT / 'favicon-32.png')
    print('wrote', sorted(p.name for p in OUT.iterdir()))


if __name__ == '__main__':
    main()
