"""Where things are on the template page, read from the blank form's PDF (so it works on the real form too)."""
import pdfplumber

PT = 200 / 72  # PDF points -> pixels at 200 dpi


def tick_boxes(pdf_path, page_no):
    """Rectangles (x0, y0, x1, y1 in template pixels) of every tick box glyph, with the text that follows each."""
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        chars = pdf.pages[page_no].chars
    for i, c in enumerate(chars):
        if c['text'] in '☐□':
            label = ''.join(x['text'] for x in chars[i + 1:i + 40]).split('☐')[0].strip()
            out.append(dict(rect=tuple(round(v * PT) for v in (c['x0'], c['top'], c['x1'], c['bottom'])), label=label))
    return out


def cells(pdf_path, page_no):
    """Table cells as pixel rectangles, in reading order."""
    with pdfplumber.open(pdf_path) as pdf:
        tables = pdf.pages[page_no].find_tables()
    return [tuple(round(v * PT) for v in c) for t in tables for c in sorted(t.cells, key=lambda c: (round(c[1]), c[0]))]
