"""What a value on this form can sensibly be. Used to flag readings for the review screen, never to fix them."""
import re

# (field id pattern, low, high); first match wins
RANGES = [
    (r'^(prewarm|iotemp)_\w+_(core|chest|arm|thigh|calf)$|^pacu_temp$', 30, 42),
    (r'^(prewarm)_\w+_set$', 30, 50),
    (r'^iotemp_\w+_room$', 15, 30),
    (r'_sbp$', 40, 260), (r'_dbp$', 20, 160), (r'_map$', 30, 200), (r'_hr$', 20, 220), (r'_bis$', 0, 100),
    (r'^age$', 16, 110), (r'^wt$', 30, 250), (r'^ht$', 120, 220), (r'^bmi$', 12, 70),
    (r'^pre_hb$', 3, 20), (r'^pre_wbc$', 0.5, 80), (r'^pre_plt$', 5, 1500), (r'^pre_inr$', 0.5, 10), (r'^pacu_pain$', 0, 10),
]


def normalise_temp(s):
    t = str(s).strip().replace(',', '.')
    if re.fullmatch(r'\d{3}', t) and 25 <= int(t) / 10 <= 45:
        return str(int(t) / 10)
    return t


def clean(f, text):
    """(value, problems) for the text read from a field of this type; value None when it can't be used."""
    text = (text or '').strip()
    if text == '':
        return None, []
    kind = f['type']
    if kind == 'time':
        m = re.fullmatch(r'(\d{1,2})\s*[:.]?\s*(\d{2})', text)
        if not m or int(m[1]) > 23 or int(m[2]) > 59:
            return text, ['not a 24-hour time']
        return f'{int(m[1]):02d}:{m[2]}', []
    if kind in ('num', 'int', 'code'):
        if text.upper() == 'NA':
            return 'NA', []
        t = normalise_temp(text) if kind == 'num' else text
        try:
            n = float(t)
        except ValueError:
            return text, ['not a number']
        if kind == 'int' and n != int(n):
            return text, ['should be a whole number']
        probs = []
        for pat, lo, hi in RANGES:
            if re.search(pat, f['id']):
                if not lo <= n <= hi:
                    probs.append(f'outside {lo}-{hi}')
                break
        else:
            probs.append('no range known: check')
        return (int(n) if kind == 'int' else n), probs
    return text, []
