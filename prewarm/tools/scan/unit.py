"""python3 unit.py  (no LibreOffice or photos needed): the small rules, on made-up values."""
import cv2, numpy as np
import plausible as p, scan, ticks

F = lambda id, type, **k: dict(id=id, type=type, **k)
YN = [[0, 'No'], [1, 'Yes']]; TH = [[-3, '−3 Cold'], [0, '0 Neutral'], [3, '+3 Hot']]
# numbers: whole, decimal, 3-digit temperature, wide skin range, minus signs
assert p.clean(F('age', 'int'), '68') == (68, [])
assert p.clean(F('prewarm_0_core', 'num'), '365') == (36.5, [])
assert p.clean(F('iotemp_base_chest', 'num'), '25.9') == (25.9, [])                 # cold theatre skin is fine
assert p.clean(F('prewarm_0_core', 'num'), '45')[1] == ['outside 30-42']
assert p.clean(F('io_ebl', 'int'), '500') == (500, [])
assert p.clean(F('age', 'int'), '6.5')[1] == ['should be a whole number']
assert p.clean(F('prewarm_0_ts', 'code', opts=TH), '−3') == (-3, [])
assert p.clean(F('prewarm_0_ts', 'code', opts=TH), '+3') == (3, [])
assert p.clean(F('prewarm_0_ts', 'code', opts=TH), '5')[1][0].startswith('not one of')
# written Y / N
assert p.clean(F('iotemp_5_gown', 'code', opts=YN), 'Y') == (1, [])
assert p.clean(F('iotemp_5_gown', 'code', opts=YN), 'n') == (0, [])
assert p.clean(F('iotemp_5_gown', 'code', opts=YN), 'X')[1]
# times
assert p.clean(F('pw_gown', 'time'), '0820') == ('08:20', [])
assert p.clean(F('pw_gown', 'time'), '8:20') == ('08:20', [])
assert p.clean(F('pw_gown', 'time'), '25:00')[1] == ['not a 24-hour time']
# arrows and blanks
assert p.clean(F('iotemp_5_room', 'num'), 'ARROW') == (None, ['arrow or ditto: same as the reading above?'])
assert p.clean(F('iotemp_5_room', 'num'), '') == (None, [])
# ticks: a slash through the box that runs past its corners, an empty box, a stray speck
ink = np.zeros((200, 200), np.uint8)
cv2.line(ink, (28, 70), (62, 36), 1, 3)          # slash through the box (40,40)-(60,60), tail outside
ink[150, 150] = 1                                  # speck near an empty box
r = ticks.read_ticks(ink, [dict(rect=(40, 40, 60, 60)), dict(rect=(140, 140, 160, 160))])
assert [x['state'] for x in r] == ['ticked', 'empty'], r
# stacked boxes (30 px apart): a slash through the lower box whose tail runs up into the upper one
ink2 = np.zeros((200, 200), np.uint8)
cv2.line(ink2, (25, 112), (70, 52), 1, 3)          # from below-left of the lower box (40,80)-(60,100) up to the upper (40,40)-(60,60)
r2 = ticks.read_ticks(ink2, [dict(rect=(40, 40, 60, 60)), dict(rect=(40, 80, 60, 100))])
assert r2[1]['center'] >= 0.6 and r2[0]['center'] <= 0.15, r2    # the middle tells them apart even when both have ink
# handwriting present or not: digits yes, a thin leftover line or table edge no
digits = np.zeros((80, 160), np.uint8); cv2.putText(digits, '36.5', (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 1, 3)
line = np.zeros((80, 160), np.uint8); line[40:42, 5:155] = 1
edge = np.zeros((80, 160), np.uint8); edge[:, 3:5] = 1
assert scan.has_writing(digits) and not scan.has_writing(line) and not scan.has_writing(edge)
# arrows: the shaft of a "same as above" arrow runs through the middle of the cell; a printed line sliver sits at its edge
cell = np.zeros((42, 106), np.uint8); cell[:, 52:55] = 1
assert scan.arrow_shaft(cell)
edge2 = np.zeros((42, 106), np.uint8); edge2[:, 1:4] = 1
assert not scan.arrow_shaft(edge2)
short = np.zeros((42, 106), np.uint8); short[10:22, 52:55] = 1
assert not scan.arrow_shaft(short)
# empty cells between arrows are flagged, a genuinely empty column is not
F = {f'iotemp_{p}_room': dict(id=f'iotemp_{p}_room', series='iotemp', col='room', point=p) for p in ('0', '5', '10', '15', '20', '25')}
E = lambda **k: {'value': None, 'flags': [], **k}
out = {'iotemp_0_room': E(), 'iotemp_5_room': E(flags=['arrow or ditto: same as the reading above?']), 'iotemp_10_room': E(),
       'iotemp_15_room': E(flags=['arrow or ditto: same as the reading above?']), 'iotemp_20_room': E(), 'iotemp_25_room': dict(value=18, flags=[])}
scan.arrow_gaps(out, F)
assert out['iotemp_10_room']['flags'] and out['iotemp_20_room']['flags'] and not out['iotemp_0_room']['flags']
# a ticked question where one option also ticks a box further down (No pre-warming also ticks 'Not applicable')
import locate
pick = locate.choose_glyphs({'1': [[154, 257, 182, 287]], '2': [[509, 257, 536, 287]], '3': [[864, 257, 891, 287], [820, 760, 848, 790]]})
assert pick['3'] == [864, 257, 891, 287] and pick['1'] == [154, 257, 182, 287]
print('unit: ok')
