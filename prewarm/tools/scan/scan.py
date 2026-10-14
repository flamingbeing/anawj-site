"""Read photographed paper-form pages into a scan.json for the review screen.

  python3 scan.py --form-dir <dir with blank.pdf, fieldmap.json, fields.json> --out <dir> [photo1.jpg ...

Photos can come in any order; each is matched to its page. Writes <out>/scan.json (crops embedded, one file for the
review screen). Real scans and outputs stay out of git (the repo is public)."""
import argparse, base64, glob, json, os, subprocess, sys
import cv2, numpy as np
import align, boxes, ticks, readers, plausible

NEVER_SEND = {'text', 'date', 'word'}      # IDs, dates, names and free text are typed in the review screen, never sent anywhere
MIN_ALIGN = 0.85                            # below this, the photo is rejected: retake it
MIN_INK = 25                                # pixels of handwriting before a cell counts as filled


def templates(form_dir):
    files = sorted(glob.glob(f'{form_dir}/page-*.png'), key=lambda f: int(f.rsplit('-', 1)[1][:-4]))
    if not files:
        subprocess.run(['pdftoppm', '-r', '200', '-png', f'{form_dir}/blank.pdf', f'{form_dir}/page'], check=True)
        files = sorted(glob.glob(f'{form_dir}/page-*.png'), key=lambda f: int(f.rsplit('-', 1)[1][:-4]))
    return [cv2.imread(f, cv2.IMREAD_GRAYSCALE) for f in files]


def crop_rect(rect, cells, shape):
    x0, y0, x1, y1 = rect; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    inside = [c for c in cells if c[0] <= cx <= c[2] and c[1] <= cy <= c[3] and c[2] - c[0] < 500]
    if inside:
        c = min(inside, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]))
        return max(0, c[0] + 2), max(0, c[1] + 2), min(shape[1], c[2] - 2), min(shape[0], c[3] - 2)
    return max(0, x0 - 20), max(0, y0 - 12), min(shape[1], x1 + 60), min(shape[0], y1 + 12)


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
        if loc['options']:
            res = {o: ticks.read_ticks(ink, [dict(rect=r, label=o)])[0] for o, r in loc['options'].items()}
            on = [o for o, r in res.items() if r['state'] == 'ticked']
            unsure = [o for o, r in res.items() if r['state'] == 'unsure']
            flags = [f'unsure tick: {o}' for o in unsure] + (['more than one ticked'] if len(on) > 1 else [])
            r0 = next(iter(loc['options'].values()))
            cx0, cy0, cx1, cy1 = crop_rect([min(r[0] for r in loc['options'].values()), r0[1], max(r[2] for r in loc['options'].values()), r0[3]], cells, flat.shape)
            out[fid] = dict(kind='tick', value=on[0] if len(on) == 1 else None, flags=flags, inks={o: r['ink'] for o, r in res.items()},
                            crop=png(flat[cy0:cy1, cx0:cx1]))
            continue
        x0, y0, x1, y1 = crop_rect(loc['rect'], cells, flat.shape)
        crop, cink = flat[y0:y1, x0:x1], ink[y0:y1, x0:x1]
        filled = int(cink.sum()) >= MIN_INK
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


def series_checks(fields_out, fields):
    """Things a nurse's pen can get wrong that a rule can spot: a temperature jumping, BP upside down, time going back."""
    by = {}
    for fid, e in fields_out.items():
        f = fields[fid]
        if f.get('series') and e.get('value') not in (None, 'NA') and f['col'] in ('core', 'chest', 'arm', 'thigh', 'calf'):
            by.setdefault((f['series'], f['col']), []).append((fid, f['point'], e['value']))
    for (_, _), pts in by.items():
        pts.sort(key=lambda p: (not p[1].isdigit(), int(p[1]) if p[1].isdigit() else 0))
        for (a, _, va), (b, _, vb) in zip(pts, pts[1:]):
            try:
                if abs(float(va) - float(vb)) > 1.5:
                    for k in (a, b): fields_out[k]['flags'].append('jumps >1.5 °C from the neighbouring reading')
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


def main(argv=None, reader=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--form-dir', required=True); ap.add_argument('--out', required=True)
    ap.add_argument('photos', nargs='+')
    a = ap.parse_args(argv)
    fmap = json.load(open(f'{a.form_dir}/fieldmap.json'))
    fields = {f['id']: f for f in json.load(open(f'{a.form_dir}/fields.json'))}
    tpls = templates(a.form_dir)
    reader = reader or readers.AnthropicReader()  # tests pass their own reader
    result, pages = {}, []
    for ph in a.photos:
        img = cv2.imread(ph)
        pg, _ = align.guess_page(img, tpls)
        flat, score = align.align_page(img, tpls[pg])
        pages.append(dict(photo=os.path.basename(ph), page=pg + 1, score=round(score, 3), accepted=score >= MIN_ALIGN))
        if score < MIN_ALIGN:
            print(f'{ph}: page {pg + 1} did not line up (score {score:.2f}): retake the photo', file=sys.stderr); continue
        result.update(process_page(pg, flat, tpls[pg], fmap, fields, boxes.cells(f'{a.form_dir}/blank.pdf', pg), reader))
    series_checks(result, fields)
    for fid, e in result.items():
        e['label'] = fields[fid]['label']; e['type'] = fields[fid]['type']
        e['opts'] = fields[fid].get('opts'); e['unit'] = fields[fid].get('unit')
        e['crop'] = base64.b64encode(e['crop']).decode()
    os.makedirs(a.out, exist_ok=True)
    json.dump(dict(pages=pages, fields=result), open(f'{a.out}/scan.json', 'w'))
    print(f'{len(result)} fields from {sum(p["accepted"] for p in pages)} of {len(pages)} photos; '
          f'{sum(bool(e["flags"]) for e in result.values())} flagged')
    return result


if __name__ == '__main__':
    main()
