// APMES case log categories and targets.
// Labels match the old Google Form exactly (the importer matches on the leading code, e.g. "20iii").
// Targets are cumulative numbers due by the end of each residency year, from the APMES
// "Summary of Experience" table (R3 and R5 columns; R2 and R4 only for blocks).
// EPA tags come from that table, plus EPA 3/4/5/6/12 inferred from the EPA guidebook.

export const CATEGORIES = [
  { code: '01', name: 'Cardiac surgery with CPB', label: '01) Cardiac surgery with CPB (10 | 15)', targets: { R3: 10, R5: 15 }, epa: 10 },
  { code: '02', name: 'Cardiac surgery off CPB', label: '02) Cardiac surgery off CPB (10 | 20)', targets: { R3: 10, R5: 20 }, epa: 10 },
  { code: '03', name: 'Thoracic surgery', label: '03) Thoracic Surgery (10 | 10)', targets: { R3: 10 }, epa: 2 },
  { code: '04', name: 'Head and neck surgery', label: '04) Head and neck surgery (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '05', name: 'Upper GI surgery', label: '05) Upper gastrointestinal surgery (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '06', name: 'Emergency GI surgery', label: '06) Emergency gastrointestinal surgery (1 | 10)', targets: { R3: 1, R5: 10 } },
  { code: '07', name: 'One lung ventilation', label: '07) Surgery requiring one lung ventilation (10 | 10)', targets: { R3: 10 }, epa: 2 },
  { code: '08', name: 'Laparoscopic surgery', label: '08) Laparoscopic surgery (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '09', name: 'Eye', label: '09) Eye (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '10', name: 'ENT', label: '10) ENT (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '11', name: 'Shared airway surgery', label: '11) Shared airway surgery (5 | 10)', targets: { R3: 5, R5: 10 }, epa: 4 },
  { code: '12', name: 'Challenging airway', label: '12) Challenging airway management (1 | 5)', targets: { R3: 1, R5: 5 }, epa: 4 },
  { code: '13', name: 'General surgery', label: '13) General Surgery (20 | 20)', targets: { R3: 20 } },
  { code: '14', name: 'Gynaecology', label: '14) Gynaecology (5 | 5)', targets: { R3: 5 } },
  { code: '15', name: 'Neurosurgical procedure', label: '15) Neurosurgical procedure (15 | 15)', targets: { R3: 15 }, epa: 2 },
  { code: '15i', name: 'Emergency neurosurgery', label: '15i) Emergency neurosurgery (10 | 10)', targets: { R3: 10 }, epa: 2, parent: '15' },
  { code: '15ii', name: 'Other neurosurgery', label: '15ii) Other neurosurgery', parent: '15', retired: true },
  { code: '16', name: 'LSCS', label: '16) Lower Segment Caesarean Section (10 | 20)', targets: { R3: 10, R5: 20 }, epa: '7b' },
  { code: '17', name: 'Obstetric spinal/epidural/CSE', label: '17) Obstetrics Spinal/ Epidural/ CSE (10 | 40)', targets: { R3: 10, R5: 40 }, epa: '7a' },
  { code: '18', name: 'Orthopaedic surgery', label: '18) Orthopaedic Surgery (20 | 20)', targets: { R3: 20 } },
  { code: '19', name: 'Outpatient surgery', label: '19) Outpatient Surgery (20 | 20)', targets: { R3: 20 } },
  { code: '20', name: 'Paediatric surgery', label: '20) Paediatric Surgery (125 | 155)', targets: { R3: 125, R5: 155 }, epa: 9 },
  { code: '20i', name: 'Age 3 months or less', label: '20i) Age <3+ months (5 | 5)', targets: { R3: 5 }, epa: 9, parent: '20' },
  { code: '20ii', name: 'Age 4 months to 3 years', label: '20ii) Age 4 months to 3+ years (20 | 20)', targets: { R3: 20 }, epa: 9, parent: '20' },
  { code: '20iii', name: 'Age 4 to 12 years', label: '20iii) Age 4 to 12 years (100 | 100)', targets: { R3: 100 }, epa: 9, parent: '20' },
  { code: '20iv', name: 'Age over 12 years', label: '20iv) Age >12 years', parent: '20', retired: true },
  { code: '21', name: 'Geriatric (65+)', label: '21) Geriatric patients undergoing surgery (30 | 30)', targets: { R3: 30 }, epa: 2 },
  { code: '22', name: 'Morbidly obese', label: '22) Morbidly obese patients (10 | 10)', targets: { R3: 10 }, epa: 2 },
  { code: '23', name: 'Bariatric surgery', label: '23) Bariatric surgery (2 | 2)', targets: { R3: 2 } },
  { code: '24', name: 'Spine surgery', label: '24) Spine surgery (2 | 5)', targets: { R3: 2, R5: 5 } },
  { code: '25', name: 'Neurophysiological monitoring', label: '25) Intraoperative neurophysiological monitoring (5 | 5)', targets: { R3: 5 }, epa: 2 },
  { code: '26', name: 'Peripheral nerve blocks', label: '26) Peripheral nerve blocks (R2=10 | R3=20 | R4=30 | R5=40)', targets: { R2: 10, R3: 20, R4: 30, R5: 40 }, epa: 3 },
  { code: '26i', name: 'Upper limb blocks', label: '26i) Upper limb blocks (10 | 10)', targets: { R3: 10 }, epa: 3, parent: '26' },
  { code: '26ii', name: 'Lower limb blocks', label: '26ii) Lower limb blocks (10 | 10)', targets: { R3: 10 }, epa: 3, parent: '26' },
  { code: '26iii', name: 'Truncal blocks', label: '26iii) Truncal blocks (5 | 5)', targets: { R3: 5 }, epa: 3, parent: '26' },
  { code: '26iv', name: 'Other blocks', label: '26iv) Other blocks', parent: '26', retired: true },
  { code: '27', name: 'Epidural/caudal', label: '27) Epidural/ caudal (R2=10 | R3=20 | R4=30 | R5=40)', targets: { R2: 10, R3: 20, R4: 30, R5: 40 }, epa: 3 },
  { code: '28', name: 'Subarachnoid blocks', label: '28) Subarachnoid blocks (R2=10 | R3=20 | R4=30 | R5=40)', targets: { R2: 10, R3: 20, R4: 30, R5: 40 }, epa: 3 },
  { code: '29', name: 'Nerve block with catheter', label: '29) Peripheral nerve block with catheter (1 | 5)', targets: { R3: 1, R5: 5 }, epa: 3 },
  { code: '30', name: 'New patient with pain', label: '30) Assessment/ management of new patient with pain (20 | 25)', targets: { R3: 20, R5: 25 }, epa: 11 },
  { code: '31', name: 'Chronic pain patient', label: '31) Chronic pain patient (0 | 1)', targets: { R5: 1 }, epa: 12 },
  { code: '32', name: 'Plastic surgery', label: '32) Plastic Surgery (5 | 5)', targets: { R3: 5 } },
  { code: '33', name: 'Interventional radiology/MRI', label: '33) Interventional radiology/ MRI (5 | 10)', targets: { R3: 5, R5: 10 }, epa: 8 },
  { code: '34', name: 'Urology', label: '34) Urology (5 | 10)', targets: { R3: 5, R5: 10 } },
  { code: '35', name: 'Vascular surgery', label: '35) Vascular Surgery (0 | 5)', targets: { R5: 5 } },
  { code: '36', name: 'Emergency trauma surgery', label: '36) Emergency trauma surgery (4 | 8)', targets: { R3: 4, R5: 8 }, epa: 5 },
  { code: '37', name: 'Transplant surgery (optional)', label: '37) Transplant surgery (Optional)' },
  { code: '38', name: 'ICU cases', label: '38) ICU cases (1 | 5)', targets: { R3: 1, R5: 5 }, epa: 6 },
  { code: '99', name: 'Others', label: '99) Others' },
];

export const BY_CODE = Object.fromEntries(CATEGORIES.map(c => [c.code, c]));
export const ACTIVE = CATEGORIES.filter(c => !c.retired);
export const R_YEARS = ['R1', 'R2', 'R3', 'R4', 'R5'];

// "20iii) Age 4 to 12 years (100 | 100)" -> "20iii"
export function codeOf(label) {
  const m = String(label || '').trim().match(/^(\d{2}[ivx]*)\)/i);
  return m && BY_CODE[m[1].toLowerCase()] ? m[1].toLowerCase() : null;
}

export const TIPS = {
  '17': 'A CSE can also be logged as both 27 (epidural) and 28 (subarachnoid). Obstetric neuraxial blocks may count under 27/28 too.',
  '26': 'Blocks count cumulatively: once the number is reached, it counts whenever it was done.',
};

// Case reflections: 96 in total across 26 headings (APMES training portfolio, Section 2).
// jr: number that must be done in junior residency (R1–R3). Headings without jr allow at most 1 in JR.
// subs: required sub-types within the heading.
export const REFLECTION_HEADINGS = [
  { id: 'thyroid', section: 'General Surgery', name: 'Thyroid / Head and Neck Operations', min: 3 },
  { id: 'bariatric', section: 'General Surgery', name: 'Bariatric Surgery', min: 3, jr: 1 },
  { id: 'geriatric', section: 'General Surgery', name: 'Geriatric Patients presenting for surgery', min: 3, jr: 1 },
  { id: 'ugi', section: 'General Surgery', name: 'Elective Upper Gastrointestinal Operations', min: 3, jr: 1 },
  { id: 'egi', section: 'General Surgery', name: 'Emergency Gastrointestinal Operations', min: 3, jr: 1 },
  { id: 'lap', section: 'General Surgery', name: 'Laparoscopic Surgery', min: 3 },
  { id: 'thoracic', section: 'General Surgery', name: 'Thoracic surgery', min: 3 },
  { id: 'polytrauma', section: 'Trauma', name: 'Holistic management of polytrauma patients (EPA 5)', min: 4 },
  { id: 'cabg', section: 'Cardiovascular', name: 'Coronary Bypass Surgery-on pump and off-pump', min: 2, subs: [{ id: 'on', name: 'On pump', min: 1 }, { id: 'off', name: 'Off pump', min: 1 }] },
  { id: 'cardiac', section: 'Cardiovascular', name: 'Other cardiac procedures e.g., Valve surgery, AICD insertions, pacemakers insertion, pericardial window etc.', min: 3 },
  { id: 'vascular', section: 'Cardiovascular', name: 'Vascular e.g., repair of AAA, grafts to aorta, femoral-popliteal bypass etc', min: 3 },
  { id: 'regional', section: 'Regional Anaesthesia', name: 'Regional Blocks of Various Anatomies', min: 8, subs: [{ id: 'ul', name: 'Upper limb block', min: 1 }, { id: 'll', name: 'Lower limb block', min: 1 }, { id: 'truncal', name: 'Truncal block', min: 1 }, { id: 'epidural', name: 'Non-obstetric epidural', min: 1 }, { id: 'chronic', name: 'Intervention for chronic pain', min: 1 }] },
  { id: 'spine', section: 'Spine', name: 'Spine Surgery', min: 3, jr: 1, hint: 'JR case with neuromonitoring' },
  { id: 'urology', section: 'Urology', name: 'Urology surgery', min: 3, subs: [{ id: 'prostate', name: 'Prostate', min: 1 }, { id: 'kidney', name: 'Kidney', min: 1 }] },
  { id: 'shared', section: 'Airway', name: 'Shared airway surgery e.g., dental, ENT, airway instrumentation, airway tumour', min: 3, jr: 1 },
  { id: 'airway', section: 'Airway', name: 'Challenging airway management in the hospital (in OT or outside OT such as management of difficult airway for elective surgery and the emergency compromised airway)', min: 5 },
  { id: 'eye', section: 'Ophthalmology', name: 'Ophthalmology', min: 3, subs: [{ id: 'ga', name: 'Under GA', min: 1 }] },
  { id: 'neuro', section: 'Neurosurgery', name: 'Neurosurgery', min: 3, jr: 1, hint: 'JR case should be an emergency' },
  { id: 'challenging', section: 'Challenging cases', name: 'Challenging cases and additional special experience (e.g., long surgeries, massive blood transfusion)', min: 3 },
  { id: 'lscs', section: 'Obstetrics', name: 'Caesarean sections', min: 5, jr: 1, hint: 'e.g. pre-eclampsia, placenta praevia major, cardiac disease in pregnancy' },
  { id: 'labour', section: 'Obstetrics', name: 'Labour analgesia', min: 5, jr: 1, hint: 'Challenging labour epidural / CSE' },
  { id: 'paeds', section: 'Paediatrics', name: 'Paediatrics', min: 6, jr: 2 },
  { id: 'remote', section: 'Remote locations', name: 'Anaesthesia in Remote Locations (EPA 8) e.g., MRI, Angiography (Interventional and Diagnostic procedures), cardiovascular lab', min: 5, jr: 1 },
  { id: 'acute', section: 'Pain Medicine', name: 'Pain Medicine (acute) (EPA 11)', min: 5, jr: 1 },
  { id: 'chronic', section: 'Pain Medicine', name: 'Pain Medicine (chronic)', min: 1, jr: 1 },
  { id: 'icu', section: 'Intensive Care', name: 'Intensive Care Unit', min: 5 },
];

export const REFLECTION_SECTIONS = [
  { id: 'description', name: 'Case description', hint: 'Demographics, history, examination, investigations, preparation, procedure, monitoring, management, significant events and outcome.' },
  { id: 'thoughts', name: 'Thoughts and feelings', hint: 'Your thoughts, reaction and feelings about the case management.' },
  { id: 'evaluation', name: 'Evaluation', hint: 'What went well and what didn’t.' },
  { id: 'analysis', name: 'Analysis', hint: 'Make sense of what happened using experience, knowledge, reading or discussion. What could have been done differently?' },
  { id: 'conclusions', name: 'Conclusions', hint: 'What you learnt, what can be done better, what skills or knowledge you need.' },
  { id: 'action', name: 'Action plan', hint: 'Your commitment for next time: knowledge, skill, preparation.' },
  { id: 'further', name: 'Further reflection as SR', hint: 'Optional, for a JR reflection: would you approach it differently now?', optional: true },
];
