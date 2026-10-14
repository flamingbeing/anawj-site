"""python3 locate.py <dir from locate.mjs>: render the one-field-at-a-time forms and find where each field's text landed.
Writes fieldmap.json: { fieldId: { page, rect:[x0,y0,x1,y1] (px at 200 dpi), options: { value: rect } } }.
A character that is new compared with the same form without that field is the field's mark."""
import glob, json, os, subprocess, sys
import pdfplumber

PT = 200 / 72
d = sys.argv[1]


def convert():
    files = sorted(glob.glob(f'{d}/*.docx'))
    todo = [f for f in files if not os.path.exists(f[:-5] + '.pdf')]
    for i in range(0, len(todo), 100):  # one soffice start per 100 files
        subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', d, *todo[i:i + 100]],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def chars(pdf_path):
    with pdfplumber.open(pdf_path) as pdf:
        return [(pi, round(c['x0'], 1), round(c['top'], 1), c['text'], c) for pi, p in enumerate(pdf.pages) for c in p.chars]


def new_marks(variant, base):
    seen = {}
    for pi, x, y, t, _ in base:
        seen[(pi, x, y, t)] = seen.get((pi, x, y, t), 0) + 1
    out = []
    for pi, x, y, t, c in variant:
        if seen.get((pi, x, y, t), 0): seen[(pi, x, y, t)] -= 1
        else: out.append((pi, c))
    return out


convert()
meta = json.load(open(f'{d}/variants.json'))
cache, fmap = {}, {}
get = lambda name: cache.setdefault(name, chars(f'{d}/{name}.pdf'))
found = []
for v in meta['variants']:
    try:
        found.append((v, new_marks(get(v['name']), get(v['base']))))
    except Exception as e:  # a form that failed to render
        print('render failed', v['name'], v['field'], e)
# marks that turn up in most fills are the header (Subject ID, Date of Entry) or page furniture, not this field's own
freq, on_page = {}, {}
for v, marks in found:
    for pi in {pi for pi, _ in marks}: on_page[pi] = on_page.get(pi, 0) + 1
    for k in {(pi, round(c['x0'], 1), round(c['top'], 1), c['text']) for pi, c in marks}: freq[k] = freq.get(k, 0) + 1
common = {k for k, n in freq.items() if on_page[k[0]] >= 4 and n > 0.25 * on_page[k[0]]}
for v, marks in found:
    marks = [(pi, c) for pi, c in marks if (pi, round(c['x0'], 1), round(c['top'], 1), c['text']) not in common]
    if not marks:
        meta['unplaced'].append(v['field'] + (':' + v['option'] if v.get('option') else '')); continue
    page = marks[0][0]
    ms = [c for pi, c in marks if pi == page]
    rect = [round(min(c['x0'] for c in ms) * PT), round(min(c['top'] for c in ms) * PT),
            round(max(c['x1'] for c in ms) * PT), round(max(c['bottom'] for c in ms) * PT)]
    f = fmap.setdefault(v['field'], dict(page=page, options={}))
    if v.get('option') is not None: f['options'][v['option']] = rect
    else: f['rect'] = rect
json.dump(dict(fields=fmap, unplaced=sorted(set(meta['unplaced']))), open(f'{d}/fieldmap.json', 'w'), indent=1)
print(len(fmap), 'fields placed;', len(set(meta['unplaced'])), 'not on the form')
