"""The study computer's reader: python watch.py  (run on Firetop, next to inbox.py).

Every received scan folder (SCAN_INBOX/<scan>/page-<n>.jpg|png, from inbox.py) that has stopped changing is read with
scan.py --reader ollama (a local vision model: nothing leaves this computer), and the values and flags it found go to
Firestore as scanImports/<scan> in prewarm-study (status "pending"). An admin approves them in the app before anything
reaches a patient (firestore.rules). Photos, crops and the scan.json stay in the folder: only values and flags are sent.

Needs: gcloud signed in as the owner (the REST call uses its token, which bypasses the rules: no app user can create an
import), the form data from setup-form.sh (SCAN_FORM_DIR), Ollama running.
Settings (environment): SCAN_INBOX (default inbox), SCAN_FORM_DIR (default form-data), SCAN_PROJECT (default prewarm-study),
SCAN_QUIET (seconds a folder must be unchanged, default 90), SCAN_EVERY (poll seconds, default 30), SCAN_MODEL.
A folder gets imported.json when its import is saved, or import-error.txt (and a retry on the next start after 3 tries is
not made: delete the file to try again). Nothing here is run on a phone or in the cloud.
"""
import json, os, re, subprocess, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = re.compile(r'^page-([1-9x])\.(jpg|png)$')
MAX_TRIES = 3


def photos(folder):
    """-> [(label, path)] sorted by label (x last)"""
    out = [(m.group(1), os.path.join(folder, f)) for f in os.listdir(folder) if (m := PAGE.match(f))]
    return sorted(out, key=lambda x: (x[0] == 'x', x[0]))


def ready(folder, now, quiet):
    """A folder is ready when it has photos, no result yet, and nothing changed for `quiet` seconds."""
    if not os.path.isdir(folder) or not photos(folder): return False
    if any(os.path.exists(os.path.join(folder, f)) for f in ('imported.json', 'import-error.txt')): return False
    newest = max(os.path.getmtime(os.path.join(folder, f)) for f in os.listdir(folder))
    return now - newest >= quiet


def build_doc(scan, scan_json, now_ms):
    """scan.json -> the import document. Values and flags only: no crops, no photos, no labels."""
    fields = {}
    for fid, e in scan_json.get('fields', {}).items():
        v = e.get('value')
        flags = [str(x)[:200] for x in e.get('flags', [])][:10]
        if (v is None or str(v) == '') and not flags: continue
        fields[fid] = {'v': '' if v is None else str(v)[:200], 'flags': flags}
    pages = [{'page': p.get('page'), 'accepted': bool(p.get('accepted')), 'score': p.get('score')} for p in scan_json.get('pages', [])]
    return {'scan': scan, 'createdAt': now_ms, 'status': 'pending', 'pages': pages, 'fields': fields}


def fs_value(x):
    """a Python value -> Firestore REST typed value"""
    if x is None: return {'nullValue': None}
    if isinstance(x, bool): return {'booleanValue': x}
    if isinstance(x, int): return {'integerValue': str(x)}
    if isinstance(x, float): return {'doubleValue': x}
    if isinstance(x, str): return {'stringValue': x}
    if isinstance(x, list): return {'arrayValue': {'values': [fs_value(i) for i in x]}}
    if isinstance(x, dict): return {'mapValue': {'fields': {k: fs_value(v) for k, v in x.items()}}}
    raise TypeError(type(x))


def token():
    return subprocess.run(['gcloud', 'auth', 'print-access-token'], capture_output=True, text=True, check=True, shell=(os.name == 'nt')).stdout.strip()


def post(project, scan, doc, tok):
    """create scanImports/<scan> (409 if it exists: never overwrite an import an admin may be reviewing)"""
    url = f'https://firestore.googleapis.com/v1/projects/{project}/databases/(default)/documents/scanImports?documentId={scan}'
    body = json.dumps({'fields': {k: fs_value(v) for k, v in doc.items()}}).encode()
    req = urllib.request.Request(url, data=body, method='POST', headers={'Authorization': 'Bearer ' + tok, 'Content-Type': 'application/json'})
    try: urllib.request.urlopen(req, timeout=60).read()
    except urllib.error.HTTPError as e:
        if e.code == 409: return 'exists'
        raise RuntimeError(f'Firestore said {e.code}')
    return 'created'


def run_scan(folder, form_dir, model=None):
    """scan.py on the folder's photos -> its scan.json (dict)"""
    ph = photos(folder)
    cmd = [sys.executable, os.path.join(HERE, 'scan.py'), '--form-dir', form_dir, '--out', os.path.join(folder, 'read'), '--reader', 'ollama']
    if model: cmd += ['--model', model]
    if all(l != 'x' for l, _ in ph): cmd += ['--pages', ','.join(l for l, _ in ph)]   # labels from the phone; an "x" page is worked out from the photo
    subprocess.run(cmd + [p for _, p in ph], check=True, capture_output=True, text=True)
    return json.load(open(os.path.join(folder, 'read', 'scan.json'), encoding='utf-8'))


def process(folder, scan, form_dir, project, read=run_scan, send=post, get_token=token, model=None):
    """read one folder and file its import. Returns 'created' / 'exists'. Raises on failure."""
    sj = read(folder, form_dir, model)
    doc = build_doc(scan, sj, int(time.time() * 1000))
    if not doc['fields'] and not any(p['accepted'] for p in doc['pages']):
        doc['note'] = 'No photo lined up: retake and send again.'
    out = send(project, scan, doc, get_token())
    json.dump({'at': int(time.time()), 'result': out, 'values': len(doc['fields'])}, open(os.path.join(folder, 'imported.json'), 'w'))
    return out


def main():
    inbox = os.environ.get('SCAN_INBOX', 'inbox'); form = os.environ.get('SCAN_FORM_DIR', 'form-data')
    project = os.environ.get('SCAN_PROJECT', 'prewarm-study'); quiet = float(os.environ.get('SCAN_QUIET', '90'))
    every = float(os.environ.get('SCAN_EVERY', '30')); tries = {}
    print(f'scan reader: inbox {os.path.abspath(inbox)}, form {os.path.abspath(form)}, project {project}', file=sys.stderr)
    while True:
        for scan in sorted(os.listdir(inbox)) if os.path.isdir(inbox) else []:
            folder = os.path.join(inbox, scan)
            if not ready(folder, time.time(), quiet) or tries.get(scan, 0) >= MAX_TRIES: continue
            tries[scan] = tries.get(scan, 0) + 1
            try: print(scan[:8], process(folder, scan, form, project, model=os.environ.get('SCAN_MODEL')), file=sys.stderr)
            except Exception as e:      # never print values or paths from the scan; the type and a short message only
                msg = f'{type(e).__name__}: {str(e)[:300]}'
                print(scan[:8], 'failed', msg, file=sys.stderr)
                if tries[scan] >= MAX_TRIES: open(os.path.join(folder, 'import-error.txt'), 'w').write(msg)
        time.sleep(every)


if __name__ == '__main__':
    main()
