#!/usr/bin/env python3
"""Make a BLANK APMES portfolio template from a filled portfolio .docx.

  python3 tools/build_portfolio_template.py filled.docx blank-template.docx

Keeps styles, headers/footers, instructions, the official example reflection and every
Section 2 heading/table (header row + the original empty rows as row prototypes), and clears:
cover-page and personal details, Section 1 tables, Section 2 case rows, Section 4 counts,
comments and document properties. The output is APMES's document: upload it on the logbook's
Admin page; never commit it (or the filled portfolio) to the repo.
"""
import re, sys, zipfile
from lxml import etree

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
q = lambda t: '{%s}%s' % (W, t)
RUNISH = {q(t) for t in ('r', 'hyperlink', 'ins', 'del', 'smartTag', 'sdt', 'fldSimple', 'bookmarkStart', 'bookmarkEnd',
                         'commentRangeStart', 'commentRangeEnd', 'proofErr', 'moveFrom', 'moveTo')}


def text(el):
    return ''.join(t.text or '' for t in el.iter(q('t')))


def clear_cell(tc):
    ps = tc.findall(q('p'))
    for p in ps[1:]:
        tc.remove(p)
    for tbl in tc.findall(q('tbl')):
        tc.remove(tbl)
    if not ps:
        etree.SubElement(tc, q('p'))
        return
    for ch in list(ps[0]):
        if ch.tag != q('pPr'):
            ps[0].remove(ch)


def set_para_text(p, s):
    runs = p.findall('.//' + q('r'))
    first = runs[0] if runs else None
    for ch in list(p):
        if ch.tag != q('pPr'):
            p.remove(ch)
    r = etree.SubElement(p, q('r'))
    if first is not None and first.find(q('rPr')) is not None:
        r.append(first.find(q('rPr')))
    t = etree.SubElement(r, q('t'))
    t.text = s
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')


def blank_document(xml):
    root = etree.fromstring(xml)
    body = root.find(q('body'))
    # comments: drop the anchors everywhere
    for tag in ('commentRangeStart', 'commentRangeEnd', 'commentReference'):
        for el in root.iter(q(tag)):
            pass
        for el in list(root.iter(q(tag))):
            parent = el.getparent()
            parent.remove(el)
    section = 0   # 0 cover/contents, 1 general, 2 case reflections, 3 CCC, 4 summary
    seen_contents = False
    stats = {'cover': 0, 's1': 0, 's2': 0, 's4': 0}
    for el in body:
        if el.tag == q('p'):
            t = text(el).strip()
            u = t.upper()
            if u.startswith('CONTENTS'):
                seen_contents = True
            if seen_contents:
                if re.match(r'SECTION 1\s*[-–]', u) and el.find('.//' + q('pStyle')) is not None and section == 0 and 'GENERAL' in u and len(t) < 30:
                    pass
                if re.match(r'^SECTION 1\s*-\s*GENERAL$', u):
                    section = 1
                elif u.startswith('SECTION 2') and 'REFLECTION' in u:
                    section = 2
                elif u.startswith('SECTION 3') and section >= 2:
                    section = 3
                elif u.startswith('SECTION 4') and section >= 3:
                    section = 4
            elif ':' in t and section == 0:
                # cover page "Label : value" lines
                label = t.split(':', 1)[0].rstrip()
                set_para_text(el, label + ' : ' + '_' * 32)
                stats['cover'] += 1
        elif el.tag == q('tbl'):
            rows = el.findall(q('tr'))
            first = text(rows[0]).strip().upper() if rows else ''
            if section == 1 and first.startswith('PERSONAL DETAILS'):
                for tr in rows[1:]:
                    tcs = tr.findall(q('tc'))
                    if len(tcs) >= 3 and '☐' not in text(tcs[-1]):
                        clear_cell(tcs[-1]); stats['s1'] += 1
                    elif len(tcs) >= 3:   # sex checkboxes: reset to unticked
                        for tt in tcs[-1].iter(q('t')):
                            tt.text = (tt.text or '').replace('☒', '☐').replace('■', '☐')
            elif section == 1:
                # Section 1 tables: header row stays (none for "Remarks" boxes)
                start = 1 if first else 0
                for tr in rows[start:]:
                    for tc in tr.findall(q('tc')):
                        clear_cell(tc)
                    stats['s1'] += 1
            elif section == 2 and first.startswith('PATIENT'):
                for tr in rows[1:]:
                    for tc in tr.findall(q('tc')):
                        clear_cell(tc)
                    stats['s2'] += 1
            elif section == 4:
                # minimum numbers (R3 = JR, R5 = SR columns) are APMES's; the resident's own counts go
                for tr in rows[2:]:
                    tcs = tr.findall(q('tc'))
                    if len(tcs) == 7:
                        for i in (1, 2, 4, 6):
                            clear_cell(tcs[i])
                        stats['s4'] += 1
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True), stats


def blank_comments(xml, tag):
    root = etree.fromstring(xml)
    for ch in list(root):
        root.remove(ch)
    return etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)


def main(src, dst):
    zin = zipfile.ZipFile(src)
    zout = zipfile.ZipFile(dst, 'w', zipfile.ZIP_DEFLATED)
    for info in zin.infolist():
        data = zin.read(info.filename)
        n = info.filename
        if n == 'word/document.xml':
            data, stats = blank_document(data)
            print('cleared:', stats)
        elif n in ('word/comments.xml', 'word/commentsExtended.xml'):
            data = blank_comments(data, n)
        elif n == 'docProps/core.xml':
            s = data.decode('utf-8')
            for tag in ('dc:creator', 'cp:lastModifiedBy', 'dc:title', 'dc:subject', 'cp:keywords', 'dc:description'):
                s = re.sub(r'(<%s[^>]*>)[^<]*(</%s>)' % (tag, tag), r'\1\2', s)
            data = s.encode('utf-8')
        zout.writestr(info, data)
    zout.close()


if __name__ == '__main__':
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
