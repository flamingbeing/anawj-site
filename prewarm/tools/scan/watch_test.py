"""python3 watch_test.py  (fake photos only): which folders are read, what is sent, and that nothing is overwritten."""
import json, os, tempfile, time
import watch

d = tempfile.mkdtemp(); S = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
f = os.path.join(d, S); os.makedirs(f)
assert not watch.ready(f, time.time(), 90), 'no photos yet'
open(os.path.join(f, 'page-7.jpg'), 'wb').write(b'x'); open(os.path.join(f, 'page-x.png'), 'wb').write(b'y'); open(os.path.join(f, 'page-2.jpg'), 'wb').write(b'z'); open(os.path.join(f, 'page-12.jpg'), 'wb').write(b'w')
assert [l for l, _ in watch.photos(f)] == ['2', '7', '12', 'x'], 'sorted by number, x last'
os.remove(os.path.join(f, 'page-12.jpg'))
assert [l for l, _ in watch.photos(f)] == ['2', '7', 'x']
now = time.time()
assert not watch.ready(f, now, 90), 'a page just arrived: wait for the rest'
assert watch.ready(f, now + 100, 90)

sj = {'pages': [{'photo': 'page-2.jpg', 'page': 2, 'accepted': True, 'score': 0.9}, {'photo': 'page-7.jpg', 'page': 7, 'accepted': False, 'score': 0.4}],
      'fields': {'age': {'value': '67', 'flags': [], 'crop': 'AAAA', 'label': 'Age'}, 'wt': {'value': None, 'flags': []},
                 'pw_gown': {'value': '07:05', 'flags': ['hard to read']}, 'sex': {'value': None, 'flags': ['two ticks']}}}
doc = watch.build_doc(S, sj, 5)
assert doc['status'] == 'pending' and doc['scan'] == S and doc['createdAt'] == 5
assert doc['fields'] == {'age': {'v': '67', 'flags': []}, 'pw_gown': {'v': '07:05', 'flags': ['hard to read']}, 'sex': {'v': '', 'flags': ['two ticks']}}
assert 'crop' not in json.dumps(doc) and 'AAAA' not in json.dumps(doc) and 'Age' not in json.dumps(doc), 'no crops or labels'
assert doc['pages'][1] == {'page': 7, 'accepted': False, 'score': 0.4}
fv = watch.fs_value(doc)['mapValue']['fields']
assert fv['status'] == {'stringValue': 'pending'} and fv['createdAt'] == {'integerValue': '5'}
assert fv['fields']['mapValue']['fields']['age']['mapValue']['fields']['flags'] == {'arrayValue': {'values': []}}

sent = []
out = watch.process(f, S, 'forms', 'proj', read=lambda *a: sj, send=lambda p, s, doc, t: sent.append((p, s, t, doc['status'])) or 'created', get_token=lambda: 'tok')
assert out == 'created' and sent == [('proj', S, 'tok', 'pending')]
assert json.load(open(os.path.join(f, 'imported.json')))['values'] == 3
assert not watch.ready(f, now + 1000, 90), 'imported folders are not read again'
# a failed read leaves no imported.json, so the folder is tried again
g = os.path.join(d, 'b1b2c3d4-e5f6'); os.makedirs(g); open(os.path.join(g, 'page-1.jpg'), 'wb').write(b'x')
def boom(*a): raise RuntimeError('ollama down')
try: watch.process(g, 'b1b2c3d4-e5f6', 'forms', 'proj', read=boom); assert False
except RuntimeError: pass
assert watch.ready(g, now + 1000, 90) and not os.path.exists(os.path.join(g, 'imported.json'))
print('watch tests passed')
