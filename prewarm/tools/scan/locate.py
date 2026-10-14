"""python3 locate.py <dir from locate.mjs>: render the one-field-at-a-time forms and find where each field's text landed.
Writes fieldmap.json: { fields: { id: { page, rect:[x0,y0,x1,y1] (px at 200 dpi), options: { value: rect },
written: true when the options are written letters/numbers rather than ticked boxes } }, unplaced: [ {key, why} ] }.
A character that is new compared with the same form without that field is the field's mark.
Rendering and reading the PDFs use all CPU cores (set LOCATE_JOBS to change). RENDERER=word renders with Microsoft Word
(docx2pdf) instead of LibreOffice, so the layout matches the printed paper exactly."""
import concurrent.futures as cf, glob, json, os, subprocess, sys, tempfile
from pathlib import Path
import pdfplumber

PT = 200 / 72
TICKS = set('☒☑✓✔✗✘')     # ballot-box X, ballot-box check, check marks, crosses
JOBS = int(os.environ.get('LOCATE_JOBS') or os.cpu_count() or 2)
d = sys.argv[1]


def convert_chunk(files):
    profile = Path(tempfile.mkdtemp()).as_uri()      # its own LibreOffice profile, so several can run side by side
    subprocess.run(['soffice', f'-env:UserInstallation={profile}', '--headless', '--convert-to', 'pdf', '--outdir', d, *files],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)


def convert():
    if os.environ.get('RENDERER') == 'word':   # Microsoft Word itself (pip install docx2pdf; Windows or Mac): the layout of the printed paper
        subprocess.run([sys.executable, '-m', 'docx2pdf', d], check=False)
        return
    todo = [f for f in sorted(glob.glob(f'{d}/*.docx')) if not os.path.exists(f[:-5] + '.pdf')]
    chunks = [todo[i::JOBS] for i in range(JOBS) if todo[i::JOBS]]
    with cf.ThreadPoolExecutor(len(chunks) or 1) as ex:
        list(ex.map(convert_chunk, chunks))


def chars(name):
    """Every printed character as a small tuple: (page, x0, top, text, x1, bottom)."""
    try:
        with pdfplumber.open(f'{d}/{name}.pdf') as pdf:
            return name, [(pi, round(c['x0'], 1), round(c['top'], 1), c['text'], c['x1'], c['bottom']) for pi, p in enumerate(pdf.pages) for c in p.chars]
    except Exception as e:  # a form that failed to render
        return name, str(e)


def new_marks(variant, base):
    seen = {}
    for pi, x, y, t, *_ in base:
        seen[(pi, x, y, t)] = seen.get((pi, x, y, t), 0) + 1
    out = []
    for c in variant:
        k = c[:4]
        if seen.get(k, 0): seen[k] -= 1
        else: out.append(c)
    return out


if __name__ == '__main__':
    convert()
    meta = json.load(open(f'{d}/variants.json', encoding='utf-8'))
    names = sorted({v['name'] for v in meta['variants']} | {v['base'] for v in meta['variants']})
    with cf.ProcessPoolExecutor(JOBS) as ex:
        cache = dict(ex.map(chars, names, chunksize=8))
    unplaced = [dict(key=k, why='the form has no place for it (the filled form was identical)') for k in meta['unplaced']]
    found = []
    for v in meta['variants']:
        a, b = cache[v['name']], cache[v['base']]
        if isinstance(a, str) or isinstance(b, str):
            unplaced.append(dict(key=v['field'] + (':' + v['option'] if v.get('option') is not None else ''), why='did not render: ' + str(a if isinstance(a, str) else b)))
            continue
        found.append((v, new_marks(a, b)))
    # marks that turn up in most fills are the header (Subject ID, Date of Entry) or page furniture, not this field's own
    freq, on_page = {}, {}
    for v, marks in found:
        for pi in {m[0] for m in marks}: on_page[pi] = on_page.get(pi, 0) + 1
        for k in {m[:4] for m in marks}: freq[k] = freq.get(k, 0) + 1
    common = {k for k, n in freq.items() if on_page[k[0]] >= 4 and n > 0.25 * on_page[k[0]]}
    fmap, ticked = {}, {}
    for v, marks in found:
        key = v['field'] + (':' + v['option'] if v.get('option') is not None else '')
        own = [m for m in marks if m[:4] not in common]
        if not own:
            unplaced.append(dict(key=key, why='no new characters' if not marks else f'its {len(marks)} new characters look like page furniture (seen in most fills)'))
            continue
        page = own[0][0]
        ms = [m for m in own if m[0] == page]
        rect = [round(min(m[1] for m in ms) * PT), round(min(m[2] for m in ms) * PT), round(max(m[4] for m in ms) * PT), round(max(m[5] for m in ms) * PT)]
        f = fmap.setdefault(v['field'], dict(page=page, options={}))
        if v.get('option') is not None:
            f['options'][v['option']] = rect
            ticked[v['field']] = ticked.get(v['field'], False) or any(m[3] in TICKS for m in ms)
        else:
            f['rect'] = rect
    for fid, f in fmap.items():
        if f['options'] and not ticked.get(fid):
            f['written'] = True      # the option's mark is a letter or number (Y/N, thermal sensation), not a ticked box
    json.dump(dict(fields=fmap, unplaced=sorted(unplaced, key=lambda u: u['key'])), open(f'{d}/fieldmap.json', 'w', encoding='utf-8'), indent=1)
    by_why = {}
    for u in unplaced: by_why[u['why'].split(' (')[0][:60]] = by_why.get(u['why'].split(' (')[0][:60], 0) + 1
    print(len(fmap), 'fields placed;', len(unplaced), 'variants not placed:', by_why)
