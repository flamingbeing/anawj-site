#!/usr/bin/env python3
"""Mine the old APMES Google Form responses for words that predict case categories.

Usage:
  python3 tools/build_logbook_keywords.py <responses.xlsx> [out.js] [--holdout=0.2 --test-out=rows.json] [--by-resident]

Reads the "Case" tab (Resident | Date | Initials, Case Details | Category | 3 sub-category
columns | Timestamp | Email) and writes logbook/js/keywords.js: for each kept token or bigram,
the smoothed P(category | token) for the categories it predicts.

Privacy: the output must never carry patient or staff identifiers. Tokens are kept only if
used by >= 5 distinct residents and in >= 20 cases, and we drop initials, NRIC fragments,
digit-heavy tokens, resident name parts, and words that mostly follow "dr"/"prof" (surgeons).
Always eyeball the printed list before committing.

--holdout keeps a stable pseudo-random fraction of cases out of training and dumps them (with
their true categories) to --test-out, for evaluation with node; never write that file into the repo.
"""
import collections
import hashlib
import json
import math
import os
import re
import sys

import openpyxl

MIN_RESIDENTS = 5
MIN_CASES = 20
MAX_TOKENS = 1500
SMOOTH = 4.0          # pseudo-counts spread by the prior
MIN_P = 0.25          # store only P(code|token) at least this
SECOND = 0.35         # weight of the runner-up word for a category (mirrors suggest.js)
CODE_RE = re.compile(r'(?:^|,\s*)(\d{2}[ivx]*)\)', re.I)
TOKEN_RE = re.compile(r'[a-z0-9&]+')
INITIALS_RE = re.compile(r'^\s*[A-Z]{2,4}\b')
STOP = set('''a an the and or of to for in on at by with w from as is was were be been are am pm
it its this that these those has had have he she his her him pt patient patients not no yes nil
case cases done did do under via also then than so but if into over post pre per s p x c t i
r l ii iii iv kg cm mg ml mcg hr hrs min mins day days yr yrs year years old yo y o m f male female
asa bmi hx bg pmh pmhx nkda dda allergy allergies plan kiv will may can given'''.split())
# Single words that are too general to suggest anything on their own (still allowed in bigrams).
WEAK = set('ga lma ett right left bilateral elective emergency'.split())
ROMAN = re.compile(r'^(?:i|ii|iii|iv)$')


def cats_of(row):
    text = ', '.join(str(c) for c in row[3:7] if c)
    return sorted(set(m.group(1).lower() for m in CODE_RE.finditer(text)))


def tokens_of(details):
    """Lowercase tokens, minus leading patient initials and junk."""
    s = str(details or '')
    s = INITIALS_RE.sub(' ', s, count=1)        # "ABC Left TKR" -> " Left TKR"
    out = []
    for t in TOKEN_RE.findall(s.lower()):
        t = t.strip('&')
        if len(t) < 2 or t in STOP or ROMAN.match(t):
            out.append(None)                     # keeps bigrams from spanning stop words
            continue
        digits = sum(ch.isdigit() for ch in t)
        if digits and (digits * 2 >= len(t) or re.search(r'\d{3}', t) or len(t) < 3):
            out.append(None)                     # numbers, doses, NRIC fragments like 123a
            continue
        if digits > 1:
            out.append(None)
            continue
        out.append(t)
    return out


def grams_of(details):
    toks = tokens_of(details)
    grams = set(t for t in toks if t)
    for a, b in zip(toks, toks[1:]):
        if a and b and a != b:
            grams.add(a + ' ' + b)
    return grams


def fit(train, names):
    """train: [(row, codes)] -> ({gram: (usefulness, {code: p}, count)}, n)"""
    n = len(train)
    prior = collections.Counter(c for _, cs in train for c in cs)
    tok_n = collections.Counter()
    tok_res = collections.defaultdict(set)
    tok_code = collections.defaultdict(collections.Counter)
    after_title = collections.Counter()          # how often a word follows dr / prof / by
    for r, cs in train:
        grams = grams_of(r[2])
        for g in grams:
            tok_n[g] += 1
            tok_res[g].add(r[0])
            tok_code[g].update(cs)
        words = TOKEN_RE.findall(str(r[2]).lower())
        for a, b in zip(words, words[1:]):
            if a in ('dr', 'prof', 'drs', 'surgeon', 'consultant', 'mr', 'ms', 'mdm', 'sr'):
                after_title[b] += 1
        for a, b, c in zip(words, words[1:], words[2:]):
            if a in ('dr', 'prof'):
                after_title[c] += 1              # "dr david justin": the surname too

    def probs(g):
        k = tok_n[g]
        return {c: (tok_code[g][c] + SMOOTH * prior[c] / n) / (k + SMOOTH) for c in tok_code[g]}

    kept = {}
    for g, k in tok_n.items():
        if k < MIN_CASES or len(tok_res[g]) < MIN_RESIDENTS:
            continue
        parts = g.split(' ')
        if any(p in names for p in parts):
            continue
        if any(after_title[p] >= 3 and after_title[p] >= 0.1 * tok_n.get(p, 1) for p in parts):
            continue
        if len(parts) == 1 and g in WEAK:
            continue
        ps = {c: p for c, p in probs(g).items() if p >= MIN_P and p >= 2 * prior[c] / n}
        if not ps:
            continue
        if len(parts) == 2:
            # a bigram earns its place only if it says something its words don't
            uni = [probs(p) for p in parts]
            if all(ps[c] <= max(u.get(c, 0) for u in uni) + 0.08 for c in ps):
                continue
        # usefulness: how much it lifts the categories it predicts, times how often it occurs
        gain = sum(p - prior[c] / n for c, p in ps.items())
        kept[g] = (gain * math.log(1 + k), ps, k)

    return dict(sorted(kept.items(), key=lambda kv: -kv[1][0])[:MAX_TOKENS]), n


def combine(kept, details):
    """Raw keyword scores, exactly as suggest.js combines them (best word + damped runner-up)."""
    ev = collections.defaultdict(list)
    for g in grams_of(details):
        if g in kept:
            for c, p in kept[g][1].items():
                ev[c].append(p)
    out = {}
    for c, ps in ev.items():
        ps.sort(reverse=True)
        out[c] = 1 - (1 - ps[0]) * (1 - SECOND * (ps[1] if len(ps) > 1 else 0))
    return out


def with_parents(codes):
    return set(codes) | set(re.sub(r'[ivx]+$', '', c) for c in codes)


def calibrate(train, names, folds=5):
    """Cross-validated map from raw keyword score to how often that chip was actually ticked.
    Raw scores run hot: the best of several noisy P(code|word) is biased upward."""
    pairs = []
    for k in range(folds):
        fold = lambda r: int(hashlib.md5(f'{r[0]}|{r[7]}|{r[2]}|cal'.encode()).hexdigest()[:8], 16) % folds
        kept, _ = fit([t for t in train if fold(t[0]) != k], names)
        for r, cs in train:
            if fold(r) != k:
                continue
            truth = with_parents(cs)
            pairs += [(raw, c in truth) for c, raw in combine(kept, r[2]).items()]
    # 0.05-wide bins from 0.25, then pool adjacent violators so the map only goes up
    bins = collections.defaultdict(lambda: [0, 0])
    for raw, ok in pairs:
        b = min(19, int(raw * 20))
        bins[b][0] += ok
        bins[b][1] += 1
    blocks = [[(b + 0.5) / 20, bins[b][0], bins[b][1]] for b in sorted(bins) if bins[b][1]]
    i = 0
    while i < len(blocks) - 1:
        x, s1, n1 = blocks[i]
        y, s2, n2 = blocks[i + 1]
        if s1 / n1 > s2 / n2:
            blocks[i:i + 2] = [[(x * n1 + y * n2) / (n1 + n2), s1 + s2, n1 + n2]]
            i = max(0, i - 1)
        else:
            i += 1
    return [(round(x, 3), round(s / n, 3), n) for x, s, n in blocks]


def holdout_of(row, frac, by_resident):
    key = str(row[0]) if by_resident else f'{row[0]}|{row[7]}|{row[2]}'
    return int(hashlib.md5(key.encode()).hexdigest()[:8], 16) / 0xFFFFFFFF < frac


def main(argv):
    args = [a for a in argv[1:] if not a.startswith('--')]
    opts = dict(a[2:].split('=', 1) if '=' in a else (a[2:], '1') for a in argv[1:] if a.startswith('--'))
    if not args:
        sys.exit(__doc__)
    src = args[0]
    out = args[1] if len(args) > 1 else os.path.join(os.path.dirname(__file__), '..', 'logbook', 'js', 'keywords.js')
    frac = float(opts.get('holdout', 0))
    by_res = 'by-resident' in opts

    wb = openpyxl.load_workbook(src, read_only=True, data_only=True)
    rows = [r for r in wb['Case'].iter_rows(min_row=2, values_only=True)
            if r and r[0] and r[2] and str(r[0]).strip().upper() != 'WRONG ENTRY']

    # Name parts of residents (from the Case and Residents tabs) are never kept.
    names = set()
    for r in rows:
        names.update(TOKEN_RE.findall(re.sub(r'\(.*?\)', ' ', str(r[0])).lower()))
    if 'Residents' in wb.sheetnames:
        for r in wb['Residents'].iter_rows(values_only=True):
            if r and r[0] and isinstance(r[0], str) and not r[0].startswith(('AY', 'Res')):
                names.update(TOKEN_RE.findall(r[0].lower()))

    train, test = [], []
    for r in rows:
        cs = cats_of(r)
        if not cs:
            continue
        (test if frac and holdout_of(r, frac, by_res) else train).append((r, cs))

    kept, n = fit(train, names)
    cal = calibrate(train, names) if 'no-cal' not in opts else [(0, 0, 0), (1, 1, 0)]
    best = sorted(kept.items(), key=lambda kv: -kv[1][0])[:MAX_TOKENS]
    best.sort(key=lambda kv: kv[0])
    lines = [
        '// Generated by tools/build_logbook_keywords.py from the old APMES case log. Do not edit by hand.',
        '// token or bigram -> { category code: P(code | token) }, smoothed. Tokens kept only if used by',
        f'// >= {MIN_RESIDENTS} residents in >= {MIN_CASES} cases; no names, initials or identifiers.',
        f'export const KEYWORDS_INFO = {{ cases: {n}, tokens: {len(best)} }};',
        '// words that break bigrams (suggest.js tokenises exactly like the builder)',
        'export const STOP = ' + json.dumps(sorted(STOP)) + ';',
        '// raw keyword score -> share of such chips that residents actually ticked (cross-validated)',
        'export const CALIBRATION = ' + json.dumps([[x, y] for x, y, _ in cal]) + ';',
        'export const KEYWORDS = {',
    ]
    for g, (_, ps, k) in best:
        body = ', '.join(f"'{c}': {p:.2f}" for c, p in sorted(ps.items(), key=lambda kv: -kv[1]))
        lines.append(f"  {json.dumps(g)}: {{ {body} }},")
    lines.append('};')
    with open(out, 'w') as f:
        f.write('\n'.join(lines) + '\n')

    print('calibration (raw -> ticked, n):', cal)
    top = sorted(kept.items(), key=lambda kv: -kv[1][0])[:int(opts.get('show', 60))]
    print(f'{n} training cases, {len(test)} held out, kept {len(best)} of {len(kept)} candidate tokens -> {out}')
    for g, (u, ps, k) in top:
        print(f'  {g:24s} n={k:5d}  ' + ' '.join(f'{c}:{p:.2f}' for c, p in sorted(ps.items(), key=lambda kv: -kv[1])[:4]))
    if frac and opts.get('test-out'):
        with open(opts['test-out'], 'w') as f:
            json.dump([{'rid': str(r[0]), 'details': str(r[2]), 'cats': cs} for r, cs in test], f)


if __name__ == '__main__':
    main(sys.argv)
