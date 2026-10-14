"""Read photographed paper-form pages into a scan.json for the review screen.

  python3 scan.py --form-dir <dir with blank.pdf, fieldmap.json, fields.json> --out <dir> [photo1.jpg ...

Photos can come in any order; each is matched to its page. Writes <out>/scan.json (crops embedded, one file for the
review screen). Real scans and outputs stay out of git (the repo is public)."""
import argparse, base64, glob, json, os, subprocess, sys
import cv2, numpy as np
import align, boxes, ticks, readers, plausible

NEVER_SEND = {'text', 'date', 'word'}      # IDs, dates, names and free text are typed in the review screen, never sent anywhere
MIN_ALIGN = 0.80                            # below this, the photo is rejected: retake it
LEAK_WARN = 8.0                             # printed-ink leakage per 1000 px outside the fields (to be tuned on real pages)
CHECK_ALIGN = 0.90                          # between the two, the page is read but flagged 'check the crops line up'
JUMP = {'core': 1.0, 'chest': 6.0, 'arm': 6.0, 'thigh': 6.0, 'calf': 6.0}   # °C between neighbouring readings


def has_writing(ink):
    """Handwriting, not a leftover sliver of a printed line or a table edge: strokes with real size and shape."""
    n, _, st, _ = cv2.connectedComponentsWithStats(ink.astype(np.uint8), connectivity=8)
    area = 0
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a < 12 or max(w, h) < 8:
            continue
        if min(w, h) <= 4 and max(w, h) / max(1, min(w, h)) > 6:   # a thin straight line
            continue
        area += a
    return area >= 40


def templates(form_dir):
    files = sorted(glob.glob(f'{form_dir}/page-*.png'), key=lambda f: int(f.rsplit('-', 1)[1][:-4]))
    if not files:
        subprocess.run(['pdftoppm', '-r', '200', '-png', f'{form_dir}/blank.pdf', f'{form_dir}/page'], check=True)
        files = sorted(glob.glob(f'{form_dir}/page-*.png'), key=lambda f: int(f.rsplit('-', 1)[1][:-4]))
    return [cv2.imread(f, cv2.IMREAD_GRAYSCALE) for f in files]


def crop_rect(rect, cells, shape):
    """(outer, inner): inner is where handwriting is looked for; outer is a little bigger, so digits that overrun the
    cell are not cut off in the crop."""
    x0, y0, x1, y1 = rect; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    inside = [c for c in cells if c[0] <= cx <= c[2] and c[1] <= cy <= c[3] and c[2] - c[0] < 500]
    if inside:
        c = min(inside, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]))
        inner = (c[0] + 3, c[1] + 3, c[2] - 3, c[3] - 3)
        grow = (5, 5)       # 2 px beyond the cell: enough that an overrunning digit isn't cut, too little to pull in the row above
    else:
        inner = (x0 - 20, y0 - 20, x1 + 60, y1 + 20)
        grow = (4, 8)
    clamp = lambda r: (max(0, r[0]), max(0, r[1]), min(shape[1], r[2]), min(shape[0], r[3]))
    return clamp((inner[0] - grow[0], inner[1] - grow[1], inner[2] + grow[0], inner[3] + grow[1])), clamp(inner)


def png(img):
    return cv2.imencode('.png', img)[1].tobytes()


def read_cell(reader, f, crop_gray):
    a = reader.read(png(crop_gray), f, 0)
    big = cv2.resize(crop_gray, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    b = reader.read(png(big), f, 1)
    return [a, b]


def process_page(page_no, flat, tpl, fmap, fields, cells, reader):
    ink = align.ink_layer(flat, tpl)
    out = {}
    for fid, loc in fmap['fields'].items():
        if loc['page'] != page_no:
            continue
        f = fields[fid]
        top = min([r[1] for r in loc['options'].values()] + ([loc['rect'][1]] if loc.get('rect') else []))
        if top < fmap.get('header_bottom', {}).get(str(page_no), 0):   # the page header: Subject ID and Date of Entry are identifiers, never cropped or sent
            out[fid] = dict(kind='text', value=None, flags=['in the page header: not read'], crop=b'', reads=[])
            continue
        if loc['options'] and (loc.get('written') or f.get('col') == 'ts'):   # Y/N columns and thermal sensation are written, not ticked
            rs = list(loc['options'].values())
            loc = dict(loc, options={}, rect=[min(r[0] for r in rs), min(r[1] for r in rs), max(r[2] for r in rs), max(r[3] for r in rs)])
        if loc['options']:
            res = {o: ticks.read_ticks(ink, [dict(rect=r, label=o)])[0] for o, r in loc['options'].items()}
            on = [o for o, r in res.items() if r['state'] == 'ticked']
            unsure = [o for o, r in res.items() if r['state'] == 'unsure']
            flags = [f'unsure tick: {o}' for o in unsure] + (['more than one ticked'] if len(on) > 1 else [])
            r0 = next(iter(loc['options'].values()))
            (cx0, cy0, cx1, cy1), _ = crop_rect([min(r[0] for r in loc['options'].values()), r0[1], max(r[2] for r in loc['options'].values()), r0[3]], cells, flat.shape)
            out[fid] = dict(kind='tick', value=on[0] if len(on) == 1 else None, flags=flags, inks={o: r['ink'] for o, r in res.items()},
                            crop=png(flat[cy0:cy1, cx0:cx1]))
            continue
        (x0, y0, x1, y1), (ix0, iy0, ix1, iy1) = crop_rect(loc['rect'], cells, flat.shape)
        crop, cink = flat[y0:y1, x0:x1], ink[iy0:iy1, ix0:ix1]
        filled = has_writing(cink)
        e = dict(kind='text', value=None, flags=[], crop=png(crop), reads=[])
        if filled and f['type'] in NEVER_SEND:
            e['flags'].append('type this in (not sent anywhere)')
        elif filled:
            reads = read_cell(reader, f, crop)
            e['reads'] = [r['text'] for r in reads]
            vals = [plausible.clean(f, r['text']) for r in reads]
            if not all(r['legible'] for r in reads): e['flags'].append('hard to read')
            if str(vals[0][0]) != str(vals[1][0]): e['flags'].append('two reads disagree')
            e['value'] = vals[0][0]
            e['flags'] += sorted({p for _, ps in vals for p in ps})
        out[fid] = e
    return out


def leak_ratio(ink, fmap, page_no):
    """Ink far from every field is printed text the template failed to cancel (a template that doesn't match the paper's
    layout: different fonts or row heights). Share of such ink per 1000 page pixels; high = don't trust this page's ticks."""
    mask = np.zeros(ink.shape, np.uint8)
    for loc in fmap['fields'].values():
        if loc['page'] != page_no: continue
        for r in ([loc['rect']] if loc.get('rect') else []) + list(loc['options'].values()):
            mask[max(0, r[1] - 40):r[3] + 40, max(0, r[0] - 60):r[2] + 60] = 1
    return float(ink[mask == 0].sum()) / max(1, (mask == 0).sum()) * 1000


def series_checks(fields_out, fields):
    """Things a nurse's pen can get wrong that a rule can spot: a temperature jumping, BP upside down, time going back."""
    by = {}
    for fid, e in fields_out.items():
        f = fields[fid]
        if f.get('series') and e.get('value') not in (None, 'NA') and f['col'] in ('core', 'chest', 'arm', 'thigh', 'calf'):
            by.setdefault((f['series'], f['col']), []).append((fid, f['point'], e['value']))
    for (_, col), pts in by.items():
        pts.sort(key=lambda p: (not p[1].isdigit(), int(p[1]) if p[1].isdigit() else 0))
        for (a, _, va), (b, _, vb) in zip(pts, pts[1:]):
            try:
                if abs(float(va) - float(vb)) > JUMP[col]:
                    for k in (a, b): fields_out[k]['flags'].append(f'jumps >{JUMP[col]:g} °C from the neighbouring reading')
            except (TypeError, ValueError):
                pass
    for fid, e in fields_out.items():
        if fid.endswith('_sbp'):
            d = fields_out.get(fid[:-4] + '_dbp', {})
            try:
                if float(e['value']) <= float(d['value']):
                    for k in (fid, fid[:-4] + '_dbp'): fields_out[k]['flags'].append('systolic not above diastolic')
            except (TypeError, ValueError, KeyError):
                pass


def aligned(img, tpl, tables):
    """Align the photo to the page, then pull each printed table onto the template's rows and columns; keep whichever
    fits the printed lines better."""
    flat, score = align.align_page(img, tpl)
    if tables:
        fine, n = align.refine_tables(flat, tpl, tables)
        if n:
            s2 = align.line_score(fine, tpl)
            if s2 > score: return fine, s2
    return flat, score


def best_page(img, tpls, tables_of, forced=None):
    """Align the photo to its most likely pages and keep the best fit: page look-alikes (big tables) fool a quick guess."""
    if forced:
        flat, score = aligned(img, tpls[forced - 1], tables_of(forced - 1)); return forced - 1, flat, score
    _, guess = align.guess_page(img, tpls)
    best = None
    for pg in sorted(range(len(tpls)), key=lambda i: -guess[i])[:3]:
        flat, score = aligned(img, tpls[pg], tables_of(pg))
        if best is None or score > best[2]: best = (pg, flat, score)
    return best


def main(argv=None, reader=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--form-dir', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('--pages', help='page number of each photo, in order, e.g. 7,9,1 (otherwise worked out from the photo)')
    ap.add_argument('--export-crops', metavar='DIR', help='no reading: write the handwritten crops to DIR for someone to read')
    ap.add_argument('--readings', metavar='FILE', help='use readings made from the exported crops, as {field id: text}, instead of the API')
    ap.add_argument('photos', nargs='+')
    a = ap.parse_args(argv)
    fmap = json.load(open(f'{a.form_dir}/fieldmap.json', encoding='utf-8'))
    fields = {f['id']: f for f in json.load(open(f'{a.form_dir}/fields.json', encoding='utf-8'))}
    tpls = templates(a.form_dir)
    forced = [int(x) for x in a.pages.split(',')] if a.pages else [None] * len(a.photos)
    if len(forced) != len(a.photos): ap.error('--pages needs one page number per photo')
    reader = reader or (readers.CropExporter(a.export_crops) if a.export_crops else readers.FileReader(a.readings) if a.readings else readers.AnthropicReader())
    _tables = {}
    tables_of = lambda pg: _tables.setdefault(pg, boxes.tables(f'{a.form_dir}/blank.pdf', pg))
    result, pages = {}, []
    for ph, fp in zip(a.photos, forced):
        img = cv2.imread(ph)
        pg, flat, score = best_page(img, tpls, tables_of, fp)
        ok = score >= MIN_ALIGN
        pages.append(dict(photo=os.path.basename(ph), page=pg + 1, score=round(score, 3), accepted=ok, check_alignment=ok and score < CHECK_ALIGN))
        if not ok:
            print(f'{ph}: best fit is page {pg + 1} but it did not line up (score {score:.2f}): retake the photo, or say which page it is with --pages', file=sys.stderr); continue
        if score < CHECK_ALIGN:
            print(f'{ph}: page {pg + 1} lined up only moderately (score {score:.2f}): check the crops in the review screen', file=sys.stderr)
        leak = leak_ratio(align.ink_layer(flat, tpls[pg]), fmap, pg)
        pages[-1]['leak'] = round(leak, 1)
        if leak > LEAK_WARN:
            pages[-1]['template_mismatch'] = True
            print(f'{ph}: page {pg + 1}: printed text is leaking into the ink layer ({leak:.0f}); the template does not match the paper layout (fonts / row heights): ticks on this page are less reliable', file=sys.stderr)
        result.update(process_page(pg, flat, tpls[pg], fmap, fields, boxes.cells(f'{a.form_dir}/blank.pdf', pg), reader))
    series_checks(result, fields)
    for fid, e in result.items():
        e['label'] = fields[fid]['label']; e['type'] = fields[fid]['type']
        e['opts'] = fields[fid].get('opts'); e['unit'] = fields[fid].get('unit')
        e['crop'] = base64.b64encode(e['crop']).decode()
    os.makedirs(a.out, exist_ok=True)
    json.dump(dict(pages=pages, fields=result), open(f'{a.out}/scan.json', 'w', encoding='utf-8'))
    print(f'{len(result)} fields from {sum(p["accepted"] for p in pages)} of {len(pages)} photos; '
          f'{sum(bool(e["flags"]) for e in result.values())} flagged')
    return result


if __name__ == '__main__':
    main()
