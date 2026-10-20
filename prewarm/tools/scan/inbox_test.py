"""python3 inbox_test.py  (fake photos only): the upload inbox's rules, directly and over a real local connection."""
import json, os, tempfile, threading, urllib.request, urllib.error
from http.server import ThreadingHTTPServer
import inbox

JPG = b'\xff\xd8\xff\xe0' + b'x' * 50
PNG = b'\x89PNG\r\n\x1a\n' + b'y' * 50
ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
d = tempfile.mkdtemp()
r = lambda m, p, b=b'', u='member@example.com': inbox.route(d, m, p, lambda: b, u)

assert r('POST', f'/scan-api/upload/{ID}/4', JPG) == (200, {'ok': True, 'pages': ['4']})
assert r('POST', f'/scan-api/upload/{ID}/x', PNG)[1]['pages'] == ['4', 'x']
assert os.path.exists(os.path.join(d, ID, 'page-4.jpg')) and os.path.exists(os.path.join(d, ID, 'page-x.png'))
assert json.load(open(os.path.join(d, ID, 'meta.json')))['by'] == 'member@example.com'
# a resend replaces the page, whatever its format
assert r('POST', f'/scan-api/upload/{ID}/4', PNG)[1]['pages'] == ['4', 'x']
assert os.path.exists(os.path.join(d, ID, 'page-4.png')) and not os.path.exists(os.path.join(d, ID, 'page-4.jpg'))
assert r('GET', f'/scan-api/status/{ID}') == (200, {'scan': ID, 'pages': ['4', 'x'], 'state': 'received'})
assert r('GET', '/scan-api/status/ffffffff-0000')[0] == 404
# refusals
assert r('POST', f'/scan-api/upload/{ID}/1', b'')[0] == 400
assert r('POST', f'/scan-api/upload/{ID}/1', b'GIF89a....')[0] == 415
assert r('POST', f'/scan-api/upload/{ID}/1', JPG + b'0' * inbox.MAX_PHOTO)[0] == 413
assert r('POST', f'/scan-api/upload/{ID}/0', JPG)[0] == 404
assert r('POST', f'/scan-api/upload/{ID}/15', JPG)[0] == 404
assert r('POST', f'/scan-api/upload/{ID}/010', JPG)[0] == 404
assert r('POST', '/scan-api/upload/short/1', JPG)[0] == 404
assert r('POST', '/scan-api/upload/..%2f..%2fx/1', JPG)[0] == 404
assert r('POST', f'/scan-api/upload/{ID}/../1', JPG)[0] == 404
assert r('DELETE', f'/scan-api/status/{ID}')[0] == 404
assert r('GET', '/other')[0] == 404
assert not os.path.exists(os.path.join(d, 'short'))
# no more than MAX_PAGES files per scan
ID2 = 'b1b2c3d4-e5f6-7890-abcd-ef1234567890'
for p in [*map(str, range(1, 15)), 'x']: assert r('POST', f'/scan-api/upload/{ID2}/{p}', JPG)[0] == 200, p
assert len(inbox.pages_of(os.path.join(d, ID2))) == 15
# over a real connection
srv = ThreadingHTTPServer(('127.0.0.1', 0), inbox.make_handler(d)); threading.Thread(target=srv.serve_forever, daemon=True).start()
u = f'http://127.0.0.1:{srv.server_address[1]}/scan-api'
req = urllib.request.Request(f'{u}/upload/{ID}/2', data=JPG, method='POST', headers={'X-Scan-User': 'a@b.c'})
assert json.load(urllib.request.urlopen(req))['pages'] == ['2', '4', 'x']
assert json.load(urllib.request.urlopen(f'{u}/status/{ID}'))['state'] == 'received'
try: urllib.request.urlopen(f'{u}/status/nope-nope-nope'); assert False
except urllib.error.HTTPError as e: assert e.code == 404
srv.shutdown()
print('inbox tests passed')
