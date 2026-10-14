"""python3 e2e.py <form dir with blank.pdf, fieldmap.json, fields.json, page-N.png>
End to end on the made-up fixture form: fill pages from the field map with known answers, photograph them, scan them
(with a stand-in reader that knows the answers, wrong where told), and check what came out and what got flagged."""
import json, os, sys, tempfile
import cv2, numpy as np
import scan, synth, readers

d = sys.argv[1]
rng = np.random.default_rng(11)
fmap = json.load(open(f'{d}/fieldmap.json')); fields = {f['id']: f for f in json.load(open(f'{d}/fields.json'))}
tpls = scan.templates(d)
truth, photos = {}, []
tmp = tempfile.mkdtemp()
for pg, tpl in enumerate(tpls):
    img = cv2.cvtColor(tpl, cv2.COLOR_GRAY2BGR)
    for fid, loc in fmap['fields'].items():
        if loc['page'] != pg: continue
        f = fields[fid]
        if loc['options']:
            o = str(rng.choice(sorted(loc['options']))); synth.cross(img, loc['options'][o], rng); truth[fid] = o
        elif f['type'] in ('num', 'int', 'time', 'text'):
            v = {'num': f'{rng.uniform(34, 38):.1f}', 'int': str(int(rng.integers(30, 90))), 'time': '07:05', 'text': 'AB123'}[f['type']]
            x0, y0, x1, y1 = scan.crop_rect(loc['rect'], [], tpl.shape)
            synth.write_text(img, (x0, y0, x1, y1) if f['type'] != 'num' else loc['rect'], v.replace(':', '') if f['type'] == 'time' else v, rng)
            truth[fid] = v
    p = f'{tmp}/p{pg + 1}.jpg'; cv2.imwrite(p, synth.photograph(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), rng)); photos.append(p)
# the stand-in reader is wrong once: a core temperature read differently the second time (so the two reads disagree)
wrong_id = 'prewarm_5_core'
reader = readers.StubReader({k: v for k, v in truth.items()}, {(wrong_id, 1): '37.9'})
scan.main(['--form-dir', d, '--out', f'{tmp}/out', *photos], reader)
got = json.load(open(f'{tmp}/out/scan.json'))
print('pages', got['pages']); print('scan.json at', f'{tmp}/out/scan.json')
bad = 0
for fid, e in got['fields'].items():
    t = truth.get(fid)
    sure = not e['flags']
    ok = t is None or str(e['value']) == str(t) or (e['value'] is not None and float(e['value']) == float(t) if t.replace('.', '').isdigit() and e['value'] not in (None, 'NA') else False)
    if e['kind'] == 'text' and fields[fid]['type'] in scan.NEVER_SEND: ok = e['value'] is None and e['flags']
    if not ok and sure: bad += 1; print('SILENT ERROR', fid, e['value'], 'truth', t)
    if e['flags']: print('flagged', fid, e['value'], e['flags'])
print(f'{len(got["fields"])} fields, silent errors: {bad}')
sys.exit(1 if bad else 0)
