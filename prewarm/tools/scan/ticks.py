"""Tick or no tick for each box, from ink on the aligned page. Anything in between is returned as 'unsure'."""
import numpy as np

CLEAR_TICK, CLEAR_EMPTY = 0.12, 0.02  # share of the box's inner area that is ink


def read_ticks(ink, boxes, pad=2):
    res = []
    for b in boxes:
        x0, y0, x1, y1 = b['rect']
        # look a little outside the glyph too: people tick across the lines, and the glyph box is tight
        patch = ink[max(0, y0 - pad):y1 + pad, max(0, x0 - pad):x1 + pad]
        frac = float(patch.mean()) if patch.size else 0.0
        state = 'ticked' if frac >= CLEAR_TICK else 'empty' if frac <= CLEAR_EMPTY else 'unsure'
        res.append(dict(b, ink=round(frac, 3), state=state))
    return res
