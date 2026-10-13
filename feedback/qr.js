// A QR code of a link, as an SVG drawn on the phone (no service). Used by the page editor's and the feedback button's
// Share: import('/feedback/qr.js') then qrSvg(link, label). The generator is feedback/vendor/qrcode.js (MIT).
import qrcode from './vendor/qrcode.js';

export function qrSvg(text, label) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount(), q = 4;
  let d = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + q},${r + q}h1v1h-1z`;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n + 2 * q} ${n + 2 * q}`);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label || 'QR code of the link');
  const bg = document.createElementNS(ns, 'rect');
  bg.setAttribute('width', '100%'); bg.setAttribute('height', '100%'); bg.setAttribute('fill', '#fff');
  const p = document.createElementNS(ns, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', '#000');
  svg.append(bg, p);
  return svg;
}
