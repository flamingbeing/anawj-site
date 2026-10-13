// The roster sheet as an image (for WhatsApp and the like), drawn from the same layout as the
// .xlsx and the PDF onto a canvas. Returns the canvas; the caller turns it into a PNG.
import { COL_WIDTHS } from './layout.js';

const hex = argb => '#' + String(argb).slice(-6);

export function buildRosterCanvas(layout, width = 1400) {
  const colW = COL_WIDTHS.map(w => (w * 7 + 5) * 0.75);
  const rowH = r => layout.heights[r] || 13;
  const first = 2, margin = 16;
  const totalW = colW.reduce((a, b) => a + b, 0);
  let totalH = 0;
  for (let r = first; r <= layout.rows; r++) totalH += rowH(r);
  const k = (width - 2 * margin) / totalW;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.ceil(totalH * k + 2 * margin);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const xAt = c => margin + colW.slice(0, c - 1).reduce((a, b) => a + b, 0) * k;
  const yAt = r => { let y = margin; for (let i = first; i < r; i++) y += rowH(i) * k; return y; };
  const font = (bold, px) => { ctx.font = `${bold ? 'bold ' : ''}${px}px Arial, Helvetica, sans-serif`; };

  for (const c of layout.cells) {
    if (c.r < first) continue;
    const x = xAt(c.c1), y = yAt(c.r);
    const w = xAt(c.c2 + 1) - x, h = yAt(c.r2 + 1) - y;
    if (c.fill) { ctx.fillStyle = hex(c.fill); ctx.fillRect(x, y, w, h); }
    if (c.box) { ctx.strokeStyle = '#000000'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1); }
    const runs = c.runs || (c.text ? [{ text: String(c.text) }] : []);
    if (!runs.length) continue;
    let size = c.sz * k * 1.15;
    const pad = (c.pad ? 6 : 2) * k;
    ctx.textBaseline = 'alphabetic';
    if (c.runs) {
      // one line of coloured runs, shrunk to fit the cell
      const width = s => runs.reduce((t, r) => { font(c.bold, r.sup ? s * 0.65 : s); return t + ctx.measureText(r.text).width; }, 0);
      while (size > 4 && width(size) > w - 2 * pad) size -= 0.25;
      let tx = c.align === 'left' ? x + pad : c.align === 'right' ? x + w - pad - width(size) : x + (w - width(size)) / 2;
      const ty = c.valign === 'top' ? y + pad + size : y + h / 2 + size * 0.35;
      for (const r of runs) {
        const s = r.sup ? size * 0.65 : size;
        font(c.bold, s);
        ctx.fillStyle = r.color ? hex(r.color) : c.color ? hex(c.color) : '#000000';
        ctx.fillText(r.text, tx, r.sup ? ty - size * 0.35 : ty);
        tx += ctx.measureText(r.text).width;
      }
      continue;
    }
    font(c.bold, size);
    ctx.fillStyle = c.color ? hex(c.color) : '#000000';
    const wrap = c.c2 < 12;
    const split = (text, max) => {
      const out = [];
      for (const para of String(text).split('\n')) {
        if (!wrap) { out.push(para); continue; }
        let line = '';
        for (const word of para.split(/\s+/)) {
          const next = line ? line + ' ' + word : word;
          if (line && ctx.measureText(next).width > max) { out.push(line); line = word; } else line = next;
        }
        out.push(line);
      }
      return out;
    };
    let lines = split(c.text, w - 2 * pad);
    while (wrap && size > 4 && lines.length * size * 1.15 > h - pad) { size -= 0.25; font(c.bold, size); lines = split(c.text, w - 2 * pad); }
    const lh = size * 1.15;
    let ty = c.valign === 'top' ? y + pad + size : y + h / 2 - (lines.length - 1) * lh / 2 + size * 0.35;
    for (const l of lines) {
      const tw = ctx.measureText(l).width;
      const tx = c.align === 'left' || !wrap ? x + pad : c.align === 'right' ? x + w - pad - tw : x + (w - tw) / 2;
      ctx.fillText(l, tx, ty);
      ty += lh;
    }
  }
  return canvas;
}
