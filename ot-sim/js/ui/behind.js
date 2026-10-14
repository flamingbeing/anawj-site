// "Behind the monitor" (DESIGN.md, "Screens"): what a real monitor cannot show. The pump's predicted levels beside
// this patient's true ones, so the trainee sees that the same model does not fit every patient. Later PRs add MAC,
// cardiac output, SVR, PaO2 and the response-surface probabilities.

import { DRUGS } from '../model/drugs.js';
import { cp, ce } from '../model/pk.js';
import { pumpView } from '../model/pump.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const f = x => (x == null ? '–' : x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2));

export function behindHtml(state) {
  const ids = Object.keys(state.pk.d);
  if (!ids.length) return '<p class="hint">No drugs given yet.</p>';
  const rows = ids.map(id => {
    const v = pumpView(state, id);
    return `<tr><th scope="row">${esc(DRUGS[id].name)}</th><td>${f(v && v.predCp)}</td><td>${f(v && v.predCe)}</td><td>${f(cp(state, id))}</td><td>${f(ce(state, id))}</td><td>${esc(DRUGS[id].conc)}</td></tr>`;
  }).join('');
  return `<table class="behind"><caption class="sr">Predicted and true drug levels</caption>
<thead><tr><th scope="col">Drug</th><th scope="col">Pump Cp</th><th scope="col">Pump Ce</th><th scope="col">True Cp</th><th scope="col">True Ce</th><th scope="col">Unit</th></tr></thead>
<tbody>${rows}</tbody></table>
<p class="hint">Cp is the plasma level, Ce the effect site (the brain). The pump knows only its published model; this patient differs, as real patients do.</p>`;
}
