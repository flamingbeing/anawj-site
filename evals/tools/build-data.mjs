// Builds evals/js/catalogue.js and evals/js/forms.js from the reference transcriptions.
// Run from anywhere: node evals/tools/build-data.mjs
// With --check it writes nothing and exits 1 if the committed outputs differ from a fresh build.
// Sources: reference/apmes-epas.json (EPA Guidebook v8, the source of truth for items),
// reference/apmes-forms.json (the three evaluator forms) and reference/guidebook/epa-01-06.md and
// epa-07-12.md (suggested entrustment questions). The outputs are committed; re-run after editing a source.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const EPAS_JSON = JSON.parse(read('reference/apmes-epas.json'));
const FORMS_JSON = JSON.parse(read('reference/apmes-forms.json'));
const GUIDE = ['epa-01-06.md', 'epa-07-12.md'].map(f => read('reference/guidebook/' + f)).join('\n');

const TOOLS = { DOPS: { tool: 'DOPS', formId: 'dops', idTool: 'DOPS' }, 'Mini-CEX': { tool: 'MiniCEX', formId: 'minicex', idTool: 'MINICEX' }, EBD: { tool: 'EBD', formId: 'ebd', idTool: 'EBD' } };
const pad = n => String(n).padStart(2, '0');
const fail = msg => { throw new Error('build-data: ' + msg); };

// ---------- item wording ----------
// Guidebook wording is kept; these only make an item readable on its own (no "Minimum 1 DOPS for",
// bullets joined, context added where the guidebook relies on a table heading).
const TEXT = {
  'DOPS-2-04': 'Mask holding and bag ventilation in a morbidly obese patient',
  'DOPS-2-05': 'Successful endotracheal intubation in a morbidly obese patient',
  'DOPS-3-02': 'Upper limb block (single shot): brachial plexus',
  'DOPS-4-01': 'Awake flexible bronchoscopy guided intubation',
  'DOPS-4-02': 'Difficult airway intubation using three different types of laryngoscope blades (curved, hyper-angulated, straight) and/or different models of video-laryngoscopes',
  'DOPS-6-01': 'Intra-arterial (IA) line',
  'DOPS-6-02': 'Dialysis vascular access catheter insertion',
  'MINICEX-7b-01': 'Lower segment Caesarean section, to include discussion on management of GA for LSCS in a pre-eclamptic patient',
  'MINICEX-11-01': 'Acute pain: pain assessment and acute pain management (PACU/ pain rounds)',
  'MINICEX-12-01': 'Assessing chronic pain: history and physical examination',
  'EBD-7a-03': 'Labour epidural/ CSE: hypotension',
  'EBD-7a-04': 'Labour epidural/ CSE: high/total spinal block',
  'EBD-7a-05': 'Labour epidural/ CSE: inadvertent dural puncture',
  'EBD-7b-01': 'LSCS under GA in which the patient develops obstetric haemorrhage',
  'EBD-8-01': 'Anaesthesia in the MRI suite',
  'EBD-8-02': 'Anaesthesia in the interventional radiology suite',
  'EBD-11-01': 'Acute pain: blue letter referral setting',
  'EBD-12-01': 'Complex chronic pain patient coming in for surgery: pain management for opioid tolerant patient',
};
const tidy = t => t
  .replace(/\s*Any one of the following blocks:?\s*•\s*/i, ', any one of: ')
  .replace(/\s*,?\s*•\s*/g, ', ')
  .replace(/\s+/g, ' ').trim();

const NOTES = {
  'DOPS-2-01': 'Mask holding is assessed on the same form as LMA insertion or intubation.',
  'DOPS-2-02': 'Mask holding and LMA insertion are assessed on one form.',
  'DOPS-2-03': 'Mask holding and intubation are assessed on one form.',
  'DOPS-2-04': 'Same patient can be used for the EPA 1 obese EBD.',
  'DOPS-2-05': 'Same patient can be used for the EPA 1 obese EBD.',
  'DOPS-4-02': 'Three DOPS, each with a different blade type or video-laryngoscope model.',
  'EBD-8-01': 'At most 1 paediatric patient across the EPA 8 EBDs.',
  'EBD-8-02': 'At most 1 paediatric patient across the EPA 8 EBDs.',
};
for (const id of ['DOPS-3-01', 'DOPS-3-02', 'DOPS-3-03', 'DOPS-3-04', 'DOPS-3-05'])
  NOTES[id] = 'The same case may be used for the EPA 3 EBD (separate forms).';

// ---------- groups ----------
// One group per guidebook item group, except: EPA 2's obese-airway and DLT rows share one
// "Minimum 4" count (repeats count); EPA 4's awake-scope and difficult-airway DOPS are counted
// separately (min 1 and min 3). Default minimum = 1 of each item; overrides below.
const GROUP_MIN = { 'EPA2-DOPS-B': 4, 'EPA4-DOPS-B': 3, 'EPA7a-DOPS-A': 3, 'EPA7a-EBD-A': 1, 'EPA10-DOPS-A': 3 };
const GROUP_LABEL = {
  'EPA2-DOPS-A': 'Airway management skills',
  'EPA2-DOPS-B': 'Airway skills: morbidly obese patient and DLT',
  'EPA3-DOPS-A': 'Neuraxial block', 'EPA3-DOPS-B': 'Limb blocks', 'EPA3-DOPS-C': 'Truncal block', 'EPA3-DOPS-D': 'Block with catheter',
  'EPA4-DOPS-A': 'Awake scope intubation', 'EPA4-DOPS-B': 'Difficult airway intubation (3 blades)',
  'EPA7a-DOPS-A': 'Labour epidural / CSE (3)',
  'EPA7a-EBD-A': 'One of 5 scenarios',
  'EPA10-DOPS-A': 'Central venous catheter (3)',
};
const TOOL_SHORT = { DOPS: 'DOPS', MiniCEX: 'Mini-CEX', EBD: 'EBD' };

const normBy = s => {
  if (!s) return null;
  const t = String(s).trim().replace(/^end of /i, 'end ');
  return /^R\d$/.test(t) ? 'end ' + t : t;
};
const yearOf = s => { const m = String(s || '').match(/R(\d)/); return m ? +m[1] : null; };

// ---------- synonyms ----------
const OBS = ['obstetric', 'obs'];
const SYN = {
  'DOPS-2-01': ['bag mask', 'BMV', 'mask ventilation', 'facemask', 'airway'],
  'DOPS-2-02': ['LMA', 'laryngeal mask', 'SGA', 'supraglottic', 'i-gel', 'airway'],
  'DOPS-2-03': ['ETT', 'intubation', 'laryngoscopy', 'RSI', 'rapid sequence', 'airway'],
  'DOPS-2-04': ['obese', 'obesity', 'bariatric', 'BMV', 'mask ventilation', 'airway'],
  'DOPS-2-05': ['obese', 'obesity', 'bariatric', 'ETT', 'intubation', 'RSI', 'airway'],
  'DOPS-2-06': ['DLT', 'double lumen', 'OLV', 'one lung ventilation', 'thoracic', 'FOB', 'bronchoscopy'],
  'DOPS-3-01': ['spinal', 'SAB', 'subarachnoid', 'neuraxial', 'regional', 'RA'],
  'DOPS-3-02': ['PNB', 'nerve block', 'brachial plexus', 'interscalene', 'supraclavicular', 'infraclavicular', 'axillary', 'upper limb', 'regional', 'RA', 'ultrasound', 'USG', 'US guided'],
  'DOPS-3-03': ['PNB', 'nerve block', 'FICB', 'fascia iliaca', 'femoral', 'popliteal', 'sciatic', 'lower limb', 'regional', 'RA', 'ultrasound', 'USG', 'US guided'],
  'DOPS-3-04': ['PNB', 'nerve block', 'truncal', 'ESP', 'erector spinae', 'rectus sheath', 'TAP', 'transversus abdominis', 'ilioinguinal', 'iliohypogastric', 'regional', 'RA', 'ultrasound', 'USG', 'US guided'],
  'DOPS-3-05': ['PNB', 'nerve block catheter', 'continuous nerve block', 'CPNB', 'catheter', 'regional', 'RA', 'ultrasound', 'USG', 'US guided'],
  'DOPS-4-01': ['FOI', 'AFOI', 'awake FOI', 'awake fibreoptic', 'awake fiberoptic', 'awake intubation', 'scope assisted', 'bronchoscope', 'difficult airway'],
  'DOPS-4-02': ['difficult airway', 'VL', 'videolaryngoscope', 'video laryngoscope', 'C-MAC', 'GlideScope', 'McGrath', 'hyperangulated', 'Macintosh', 'Miller', 'straight blade', 'blades'],
  'DOPS-6-01': ['art line', 'arterial line', 'IA line', 'a-line', 'radial', 'ICU', 'ultrasound', 'USG', 'US guided'],
  'DOPS-6-02': ['vascath', 'dialysis catheter', 'HD catheter', 'CRRT', 'CVVH', 'ICU', 'ultrasound', 'USG', 'US guided'],
  'DOPS-7a-01': ['epidural', 'CSE', 'combined spinal epidural', 'labour', 'labor', 'neuraxial', ...OBS],
  'DOPS-10-01': ['CVC', 'central line', 'central venous', 'IJ', 'internal jugular', 'cardiac', 'ultrasound', 'USG', 'US guided'],
  'MINICEX-1-01': ['PEC', 'preop', 'pre-op clinic', 'PAC', 'pre-anaesthetic', 'ward', 'preoperative'],
  'MINICEX-2-01': ['GA', 'ETT', 'intubation', 'RSI', 'extubation', 'TIVA', 'crisis', 'hypoxia', 'ventilation'],
  'MINICEX-2-02': ['GA', 'LMA', 'anaphylaxis', 'MH', 'malignant hyperthermia', 'crisis'],
  'MINICEX-3-01': ['PNB', 'nerve block', 'sedation', 'regional', 'RA', 'MAC'],
  'MINICEX-4-01': ['difficult airway', 'airway', 'ENT'],
  'MINICEX-4-02': ['shared airway', 'ENT', 'airway', 'microlaryngoscopy', 'MLB'],
  'MINICEX-6-01': ['ICU outreach', 'outreach', 'triage', 'ICU', 'referral'],
  'MINICEX-7b-01': ['LSCS', 'caesarean', 'cesarean', 'C-section', 'pre-eclampsia', 'PET', 'GA', ...OBS],
  'MINICEX-9-01': ['paeds', 'paediatric', 'pediatric', 'child', 'spontaneous ventilation', 'GA/SR'],
  'MINICEX-9-02': ['paeds', 'paediatric', 'pediatric', 'child', 'IPPV', 'GA'],
  'MINICEX-11-01': ['acute pain', 'APS', 'pain rounds', 'PCA', 'PCEA', 'epidural review', 'PACU', 'recovery'],
  'MINICEX-12-01': ['chronic pain', 'pain clinic'],
  'EBD-1-01': ['PEC', 'preop', 'respiratory', 'COPD', 'asthma'],
  'EBD-1-02': ['PEC', 'preop', 'cardiac', 'IHD', 'cardiovascular'],
  'EBD-1-03': ['PEC', 'preop', 'diabetes', 'DM', 'endocrine', 'thyroid', 'steroids'],
  'EBD-1-04': ['PEC', 'preop', 'elderly', 'frailty', 'geriatric'],
  'EBD-1-05': ['PEC', 'preop', 'obese', 'obesity', 'OSA', 'bariatric'],
  'EBD-2-01': ['crisis', 'cardiac arrest', 'arrhythmia', 'haemodynamic', 'GA'],
  'EBD-2-02': ['ASA 3', 'ASA 4', 'high risk', 'cardiac', 'GA'],
  'EBD-2-03': ['elderly', 'geriatric', 'GA'],
  'EBD-2-04': ['obese', 'obesity', 'bariatric', 'GA'],
  'EBD-2-05': ['IONM', 'neuromonitoring', 'SSEP', 'MEP', 'spine'],
  'EBD-2-06': ['OLV', 'DLT', 'thoracic', 'VATS', 'one lung ventilation'],
  'EBD-2-07': ['neuro', 'neurosurgery', 'craniotomy'],
  'EBD-3-01': ['MAC', 'eye', 'ophthalmic', 'cataract', 'sedation'],
  'EBD-3-02': ['spinal', 'SAB', 'RA'],
  'EBD-3-03': ['spinal', 'SAB', 'PNB', 'nerve block', 'RA'],
  'EBD-3-04': ['PNB', 'nerve block catheter', 'catheter', 'continuous nerve block', 'RA'],
  'EBD-3-05': ['PNB', 'nerve block catheter', 'catheter', 'continuous nerve block', 'RA'],
  'EBD-4-01': ['difficult airway', 'FOI', 'awake intubation', 'FONA', 'eFONA', 'cricothyroidotomy'],
  'EBD-5-01': ['trauma', 'head injury', 'TBI', 'neck'],
  'EBD-5-02': ['trauma', 'chest', 'thoracic', 'abdominal', 'laparotomy'],
  'EBD-5-03': ['trauma', 'pelvis', 'pelvic', 'femur', 'orthopaedic'],
  'EBD-6-01': ['ICU', 'SICU', 'surgical ICU'],
  'EBD-6-02': ['ICU', 'NICU', 'neuro ICU'],
  'EBD-6-03': ['ICU', 'MICU', 'medical'],
  'EBD-7a-01': ['epidural', 'failed epidural', 'breakthrough pain', 'labour', ...OBS],
  'EBD-7a-02': ['foetal distress', 'fetal distress', 'CTG', 'labour', ...OBS],
  'EBD-7a-03': ['hypotension', 'spinal', 'labour', ...OBS],
  'EBD-7a-04': ['high spinal', 'total spinal', 'labour', ...OBS],
  'EBD-7a-05': ['dural puncture', 'wet tap', 'ADP', 'labour', ...OBS],
  'EBD-7a-06': ['PDPH', 'post dural puncture headache', 'neurological deficit', 'blood patch', ...OBS],
  'EBD-7b-01': ['LSCS', 'caesarean', 'C-section', 'PPH', 'haemorrhage', 'hemorrhage', 'GA', ...OBS],
  'EBD-8-01': ['MRI', 'NORA', 'remote', 'non-OT'],
  'EBD-8-02': ['IR', 'interventional radiology', 'angiography', 'NORA', 'remote', 'non-OT'],
  'EBD-9-01': ['paeds', 'paediatric', 'pediatric', 'child', 'trauma'],
  'EBD-9-02': ['paeds', 'paediatric', 'pediatric', 'child', 'special needs', 'autism'],
  'EBD-10-01': ['CPB', 'bypass', 'cardiac surgery', 'CABG', 'valve'],
  'EBD-11-01': ['blue letter', 'acute pain', 'referral', 'APS'],
  'EBD-12-01': ['chronic pain', 'opioid tolerant', 'opioids'],
};

// ---------- entrustment questions (EPA 1-12) ----------
// '#### <Tool> — <heading>' then '**Suggested entrustment questions**' and a list. Top-level list
// entries become questions; numbered sub-points and wrapped lines are joined on; italic lines
// (model answers for the assessor), links to the embedded EPA 7a/7b documents and prose before the
// first list entry (a case vignette) are dropped; markdown hard breaks and <sup> are flattened.
function parseEntrust(md) {
  const out = [];
  const blocks = md.split(/^#### /m).slice(1);
  for (const b of blocks) {
    const lines = b.split('\n');
    const m = lines[0].match(/^(DOPS|Mini-CEX|EBD) — (.+)$/);
    if (!m) continue;
    const start = lines.findIndex(l => /^\*\*Suggested entrustment questions\*\*/.test(l));
    const qs = [];
    if (start >= 0) {
      for (const l of lines.slice(start + 1)) {
        if (/^#{1,3} /.test(l) || /^\*\*[^*]+\*\*\s*$/.test(l)) break;
        if (!l.trim()) continue;
        const t = l.trim();
        if (/^(-\s*)?\*[^*]/.test(t) && /\*\s*$/.test(t)) continue; // italic model answer
        if (/^(Click\b|For more entrustment questions)/i.test(t)) continue; // link to an embedded document
        const top = l.match(/^(?:\d+\.|-)\s+(.*)$/);
        const body = s => s.replace(/^[a-z]\.\s+/, '').replace(/<\/?sup>/g, '').replace(/\\$/, '').replace(/\s+/g, ' ').trim();
        if (top) qs.push(body(top[1]));
        else if (qs.length) {
          const sub = t.match(/^(?:\d+\.|-)\s+(.*)$/);
          qs[qs.length - 1] += ' ' + body(sub ? sub[1] : t);
        }
      }
    }
    out.push({ tool: TOOLS[m[1]].tool, heading: m[2].trim(), qs });
  }
  return out;
}
const ENTRUST = parseEntrust(GUIDE);
const ENTRUST_HEADING = {
  'MINICEX-1-01': 'Preoperative assessment of a patient',
  'EBD-1-01': 'Assessment of a patient with pre-existing respiratory', 'EBD-1-02': 'Assessment of a patient with pre-existing cardiovascular',
  'EBD-1-03': 'Assessment of a patient with pre-existing endocrine', 'EBD-1-04': 'Assessment of geriatric', 'EBD-1-05': 'Assessment of morbidly obese',
  'MINICEX-2-01': 'Patient requiring GA with endotracheal', 'MINICEX-2-02': 'Patient requiring GA with LMA',
  'DOPS-2-01': ['Mask holding and LMA', 'Mask holding and ETT'], 'DOPS-2-02': 'Mask holding and LMA', 'DOPS-2-03': 'Mask holding and ETT',
  'DOPS-2-04': ['Mask holding and LMA', 'Mask holding and ETT'], 'DOPS-2-05': 'Mask holding and ETT', 'DOPS-2-06': 'Placement of double lumen',
  'EBD-2-01': 'Management of cardiovascular related', 'EBD-2-02': 'Management of ASA 3 or 4', 'EBD-2-03': 'Management of geriatric',
  'EBD-2-04': 'Management of morbidly obese', 'EBD-2-05': 'Management of patient requiring intraoperative', 'EBD-2-06': 'Management of patient undergoing thoracic',
  'EBD-2-07': 'Management of patient undergoing neurosurgical',
  'MINICEX-3-01': 'Manage a patient for surgery under peripheral', 'DOPS-3-01': 'Spinal/ subarachnoid', 'DOPS-3-02': 'Upper limb block', 'DOPS-3-03': 'Lower limb block',
  'DOPS-3-04': 'Truncal block', 'DOPS-3-05': 'Any peripheral nerve block with catheter',
  'EBD-3-01': 'Management of a patient undergoing ophthalmic', 'EBD-3-02': '=Management of a patient undergoing surgery under subarachnoid block',
  'EBD-3-03': 'Management of a patient undergoing surgery under subarachnoid block/', 'EBD-3-04': 'Management of patient undergoing surgery with a peripheral',
  'EBD-3-05': 'Management of patient undergoing surgery with a peripheral',
  'MINICEX-4-01': 'Anaesthetic management of a patient with anticipated', 'MINICEX-4-02': 'Anaesthetic management of a patient going for surgery with a shared',
  'DOPS-4-01': 'Scope assisted tracheal', 'DOPS-4-02': 'For difficult airway intubation', 'EBD-4-01': 'Airway management of patient with a difficult airway',
  'EBD-5-01': 'Any trauma case (Management of head', 'EBD-5-02': 'Any trauma case (Management of thoracic', 'EBD-5-03': 'Any trauma case (Management of pelvic',
  'MINICEX-6-01': 'Triage', 'DOPS-6-01': 'Arterial line', 'DOPS-6-02': 'Dialysis catheter',
  'EBD-6-01': 'Post general surgery', 'EBD-6-02': 'Neurosurgical critically ill', 'EBD-6-03': 'Critically ill patient with severe',
  'DOPS-7a-01': 'Labour combined spinal epidural',
  'EBD-7a-01': '=Labour combined spinal epidural (CSE)/epidural', 'EBD-7a-02': '=Labour combined spinal epidural (CSE)/epidural',
  'EBD-7a-03': '=Labour combined spinal epidural (CSE)/epidural', 'EBD-7a-04': '=Labour combined spinal epidural (CSE)/epidural',
  'EBD-7a-05': '=Labour combined spinal epidural (CSE)/epidural',
  'MINICEX-7b-01': 'Lower segment Caesarean section', 'EBD-7b-01': 'Lower segment Caesarean section',
  'EBD-8-01': 'MRI', 'EBD-8-02': 'Interventional radiology suite',
  'MINICEX-9-01': 'GA/ SR case', 'MINICEX-9-02': 'GA/IPPV case', 'EBD-9-01': 'Paediatric trauma', 'EBD-9-02': 'Special needs child',
  'DOPS-10-01': 'Central Venous catheter', 'EBD-10-01': 'Patient undergoing cardiac surgery requiring CPB',
  'MINICEX-11-01': 'Pain assessment and acute pain management', 'EBD-11-01': 'Management of Blue letter referral',
  'MINICEX-12-01': 'Assessing chronic pain', 'EBD-12-01': 'Chronic pain patient coming in for surgery',
};
// The guidebook's EBD for EPA 7a SR (postpartum neurological deficit, post dural puncture headache)
// gives only a case vignette in its table; its questions are in the embedded EBD_EPA7A_SR document,
// transcribed in reference/guidebook/epa-07-attachments.md ("**Entrustment question n.** …" lines).
const NO_ENTRUST = new Set();
function attachmentQs(title) {
  const md = read('reference/guidebook/epa-07-attachments.md');
  const start = md.indexOf('## Attachment: ' + title);
  if (start < 0) fail('attachment not found: ' + title);
  const next = md.indexOf('\n## ', start + 1);
  const sec = md.slice(start, next < 0 ? undefined : next);
  return [...sec.matchAll(/^\*\*Entrustment question \d+\.\*\*\s*(.+)$/gm)].map(m => m[1].trim());
}
const ATTACHMENT_ENTRUST = { 'EBD-7a-06': 'EPA 7a (SR)' };
function entrustFor(id, tool) {
  if (ATTACHMENT_ENTRUST[id]) return attachmentQs(ATTACHMENT_ENTRUST[id]);
  const spec = ENTRUST_HEADING[id];
  if (!spec) return [];
  const qs = [];
  for (const s of [].concat(spec)) {
    const exact = s.startsWith('=');
    const key = exact ? s.slice(1) : s;
    const hits = ENTRUST.filter(e => e.tool === tool && (exact ? e.heading === key : e.heading.startsWith(key)));
    if (hits.length !== 1) fail(`entrustment heading for ${id} matched ${hits.length}: ${s}`);
    if (!hits[0].qs.length) fail(`no entrustment questions under ${hits[0].heading}`);
    for (const q of hits[0].qs) if (!qs.includes(q)) qs.push(q);
  }
  return qs;
}

// ---------- catalogue ----------
const EPAS = [], ITEMS = [], GROUPS = [];
for (const e of EPAS_JSON.epas) {
  EPAS.push({ epa: e.epa, title: e.title, levels: e.levels.map(l => ({ level: l.level, by: l.by, scope: l.scope || null })) });
  const seq = {}, letters = {};
  for (const a of e.assessments) {
    const T = TOOLS[a.tool];
    if (!T) continue;
    // split/merge the guidebook's item groups into counting groups
    let raw = a.itemGroups.map(g => ({ completeBy: normBy(g.completeBy), forLevel: g.forLevel, items: [...g.items], note: g.note || null }));
    if (e.epa === '2' && T.tool === 'DOPS' && raw.length === 2) raw = [{ ...raw[0], items: [...raw[0].items, ...raw[1].items] }];
    if (e.epa === '4' && T.tool === 'DOPS') raw = raw[0].items.map(it => ({ ...raw[0], items: [it] }));
    for (const g of raw) {
      letters[T.idTool] = (letters[T.idTool] || 0) + 1;
      const gid = `EPA${e.epa}-${T.idTool}-${String.fromCharCode(64 + letters[T.idTool])}`;
      const byYear = yearOf(g.completeBy) ?? a.byYear;
      const level = g.forLevel ?? null;
      const itemIds = [];
      for (const src of g.items) {
        seq[T.idTool] = (seq[T.idTool] || 0) + 1;
        const id = `${T.idTool}-${e.epa}-${pad(seq[T.idTool])}`;
        const text = TEXT[id] || tidy(src.replace(/^Minimum \d+ (DOPS for )?/i, '').replace(/^\w/, c => c.toUpperCase()));
        ITEMS.push({ id, tool: T.tool, formId: T.formId, epa: e.epa, text, byYear, completeBy: g.completeBy, level, group: gid,
          ...(NOTES[id] ? { note: NOTES[id] } : {}), synonyms: SYN[id] || [], entrustQs: entrustFor(id, T.tool) });
        itemIds.push(id);
      }
      const min = GROUP_MIN[gid] ?? itemIds.length;
      GROUPS.push({ id: gid, epa: e.epa, tool: T.tool, min, each: itemIds.length <= min, byYear, completeBy: g.completeBy, level,
        label: GROUP_LABEL[gid] || `${TOOL_SHORT[T.tool]} by ${g.completeBy}${level ? ` (level ${level})` : ''}`, itemIds });
    }
  }
}
for (const g of GROUPS) for (const id of g.itemIds) ITEMS.find(i => i.id === id).min = g.min;

// sanity checks against PLAN §7 (67 items: DOPS 17, Mini-CEX 12, EBD 38)
const count = t => ITEMS.filter(i => i.tool === t).length;
if (ITEMS.length !== 67 || count('DOPS') !== 17 || count('MiniCEX') !== 12 || count('EBD') !== 38)
  fail(`item counts ${ITEMS.length} (DOPS ${count('DOPS')}, Mini-CEX ${count('MiniCEX')}, EBD ${count('EBD')})`);
for (const id of [...Object.keys(TEXT), ...Object.keys(SYN), ...Object.keys(NOTES), ...Object.keys(ENTRUST_HEADING), ...NO_ENTRUST])
  if (!ITEMS.some(i => i.id === id)) fail('unknown item id in a table: ' + id);
for (const id of [...Object.keys(GROUP_MIN), ...Object.keys(GROUP_LABEL)])
  if (!GROUPS.some(g => g.id === id)) fail('unknown group id: ' + id);
for (const i of ITEMS) {
  if (!i.byYear) fail('no byYear for ' + i.id);
  if (!i.synonyms.length) fail('no synonyms for ' + i.id);
  if (/•|Minimum/.test(i.text)) fail('untidy text ' + i.id + ': ' + i.text);
  if (!i.entrustQs.length !== NO_ENTRUST.has(i.id)) fail('entrustment questions for ' + i.id + ': ' + i.entrustQs.length);
  if (i.entrustQs.some(q => /\\$|<\/?sup>|embedded file|^Click/.test(q))) fail('untidy entrustment question in ' + i.id);
}

// ---------- forms ----------
const FORM_META = {
  DOPS: { id: 'dops', title: 'Direct Observation of Procedural Skills (DOPS)' },
  MiniCEX: { id: 'minicex', title: 'Mini Clinical Evaluation Exercise (Mini-CEX)' },
  EBD: { id: 'ebd', title: 'Entrustment-Based Discussion (EBD)' },
};
const SCALE_TYPES = ['ninePoint', 'milestone', 'supervision'];
const EXCLUSIVE = 'No obvious areas for improvement';
const SCALES = FORMS_JSON.scales;
const FORMS = {};
// The app shortens the entrustment question and lists the item's suggested entrustment questions under it
// (ui-form.js); the official MedHub wording stays in reference/apmes-forms.json as officialLabel.
const ENTRUST_LABEL = 'Please briefly describe what was discussed';
for (const [tool, f] of Object.entries(FORMS_JSON.forms)) {
  const meta = FORM_META[tool] || fail('unknown form ' + tool);
  const sections = f.sections.map(s => ({
    title: s.section || null,
    questions: s.questions.map(q => {
      const out = { n: q.n, key: 'q' + q.n, label: q.label, type: q.type, required: !!q.required, na: !!q.na };
      if (/^Please briefly describe what was discussed centered around/.test(q.label)) Object.assign(out, { label: ENTRUST_LABEL, officialLabel: q.label });
      if (q.type === 'select' || q.type === 'checkboxes') {
        const opts = typeof q.options === 'string' ? (SCALES[q.options] || fail('no scale ' + q.options)).options : q.options;
        if (!Array.isArray(opts) || !opts.every(o => typeof o === 'string')) fail(`options for ${tool} q${q.n}`);
        out.options = opts;
        if (typeof q.options === 'string') out.scaleKey = q.options;
      } else if (SCALE_TYPES.includes(q.type)) out.scaleKey = q.type;
      else if (q.type !== 'text') fail(`unknown type ${q.type}`);
      // The comments questions carry "(minimum 30 characters)" on MedHub; the app drops that minimum
      // (user decision 2026-10-10). The official wording stays in officialLabel.
      out.minLength = null;
      if (/\s*\(minimum 30 characters\)/i.test(out.label)) Object.assign(out, { label: out.label.replace(/\s*\(minimum 30 characters\)/i, ''), officialLabel: q.label, feedback: true });
      out.descriptors = q.descriptors || null;
      if (q.type === 'checkboxes' && q.options.includes(EXCLUSIVE)) out.exclusive = EXCLUSIVE;
      return out;
    }),
  }));
  // EBD q3 "Comments (if any of the areas of improvement are checked)" depends on q2
  const all = sections.flatMap(s => s.questions);
  const ex = all.find(q => q.exclusive);
  if (ex) { const next = all.find(q => q.n === ex.n + 1); if (next && next.type === 'text' && /checked/i.test(next.label)) next.showIf = { key: ex.key, anyExcept: ex.exclusive }; }
  FORMS[meta.id] = { id: meta.id, tool, title: meta.title, introduction: f.introduction, decline: f.decline, sections };
}
const nq = id => FORMS[id].sections.reduce((n, s) => n + s.questions.length, 0);
if (nq('dops') !== 19 || nq('minicex') !== 22 || nq('ebd') !== 12) fail('form question counts');

// ---------- write ----------
const HEADER = src => `// GENERATED by evals/tools/build-data.mjs from ${src}. Do not edit by hand: edit the\n// reference files or the tables in the build script, then run: node evals/tools/build-data.mjs\n`;
const rows = arr => '[\n' + arr.map(x => '  ' + JSON.stringify(x)).join(',\n') + ',\n]';

const catalogue = `${HEADER('reference/apmes-epas.json (EPA Guidebook v8) and reference/guidebook/epa-01-06.md, epa-07-12.md')}
export const CATALOGUE_VERSION = '2024-07-v8';

export const EPAS = ${rows(EPAS)};

// Each item is one assessment form. min = the group's minimum count (repeats of an item count).
export const ITEMS = ${rows(ITEMS)};

// Counting groups. each: every item needs at least 1 before the group is done.
export const GROUPS = ${rows(GROUPS)};

const BY_ID = new Map(ITEMS.map(i => [i.id, i]));
export const itemById = id => BY_ID.get(id) || null;
export const groupById = id => GROUPS.find(g => g.id === id) || null;
export const epaById = epa => EPAS.find(e => e.epa === String(epa)) || null;

// ---------- search ----------
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const TOOL_WORDS = { dops: 'DOPS', minicex: 'MiniCEX', cex: 'MiniCEX', mini: 'MiniCEX', ebd: 'EBD' };
const HAY = new Map(ITEMS.map(i => [i.id, {
  text: ' ' + norm(i.text) + ' ',
  syn: i.synonyms.map(norm),
  all: ' ' + norm([i.text, ...i.synonyms, i.note || ''].join(' ')) + ' ',
}]));

function wordScore(h, item, w) {
  let s = 0;
  if (/^\\d+[ab]?$/.test(w) && item.epa === w) s += 4;
  if (h.syn.includes(w)) s += 4;
  if (h.text.includes(' ' + w + ' ')) s += 3;
  else if (h.text.includes(' ' + w)) s += 2;
  else if (h.all.includes(' ' + w)) s += 1;
  return s;
}

// Ranked search over text, synonyms, EPA number ("epa 3", "7a") and tool ("dops", "mini-cex").
// Every query word must match something ("r1" … "r5" keeps items due by that year; a trailing
// plural "s" is dropped when the word doesn't match as typed). rYear lifts items due this year (then overdue ones).
export function searchItems(q, { rYear } = {}) {
  let words = norm(q).replace(/\\bmini cex\\b/g, 'minicex').replace(/\\bepa (\\d+[ab]?)\\b/g, 'epa$1').split(' ').filter(Boolean);
  const phrase = norm(q);
  const out = [];
  ITEMS.forEach((item, order) => {
    const h = HAY.get(item.id);
    let score = 0;
    for (const w of words) {
      const epa = w.match(/^epa(\\d+[ab]?)$/);
      if (epa) { if (item.epa === epa[1] || (epa[1] === '7' && item.epa.startsWith('7'))) { score += 5; continue; } return; }
      if (TOOL_WORDS[w]) { if (item.tool === TOOL_WORDS[w]) { score += 4; continue; } return; }
      const yr = w.match(/^r([1-5])$/);   // "r1 airway": items due by that year
      if (yr) { if (item.byYear === Number(yr[1])) { score += 3; continue; } return; }
      let s = wordScore(h, item, w);
      if (!s && w.length > 3 && w.endsWith('s')) s = wordScore(h, item, w.slice(0, -1));   // "epidurals"
      if (!s) return;
      score += s;
    }
    if (phrase && words.length > 1) {
      if (h.syn.includes(phrase)) score += 6;
      else if (h.all.includes(' ' + phrase)) score += 3;
    }
    const yr = Number(rYear) || 0;
    if (yr && item.byYear === yr) score += 2;
    else if (yr && item.byYear < yr) score += 1;
    out.push({ item, score, order });
  });
  return out.sort((a, b) => b.score - a.score || a.order - b.order).map(r => r.item);
}
`;

const forms = `${HEADER('reference/apmes-forms.json (the evaluator forms)')}
// Answers are stored as assessment.q{n}. ninePoint: 1..9 or 'NA' (only where na); milestone: the
// scale value 0.5..5.0 or 'NA' (only where na); supervision: 1..5; select: the option string;
// checkboxes: array of option strings; text: string. showIf hides a question until the named
// checkbox question has a tick other than anyExcept.

export const SCALES = ${JSON.stringify(SCALES, null, 1)};

export const FORMS = ${JSON.stringify(FORMS, null, 1)};

// The entrustment-based discussion text box on each form (entrustment question chips go here).
export const ENTRUSTMENT_TEXT_KEY = { dops: 'q15', minicex: 'q13', ebd: 'q4' };
export const formById = id => FORMS[id] || null;
export const questionsOf = form => form.sections.flatMap(s => s.questions);
`;

const OUTPUTS = { 'js/catalogue.js': catalogue, 'js/forms.js': forms };
if (process.argv.includes('--check')) {
  const stale = Object.keys(OUTPUTS).filter(f => { try { return read(f) !== OUTPUTS[f]; } catch { return true; } });
  if (stale.length) { console.error(`build-data: ${stale.join(', ')} out of date; run node evals/tools/build-data.mjs and commit`); process.exit(1); }
  console.log('build-data: generated files up to date');
  process.exit(0);
}
fs.mkdirSync(path.join(ROOT, 'js'), { recursive: true });
for (const [f, text] of Object.entries(OUTPUTS)) fs.writeFileSync(path.join(ROOT, f), text);
console.log(`catalogue.js: ${EPAS.length} EPAs, ${ITEMS.length} items, ${GROUPS.length} groups, ${ITEMS.filter(i => i.entrustQs.length).length} with entrustment questions`);
console.log(`forms.js: ${Object.keys(FORMS).map(k => `${k} ${nq(k)}`).join(', ')}`);
