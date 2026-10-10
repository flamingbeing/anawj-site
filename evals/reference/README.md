# APMES workplace-based assessment reference

Reference material for the evaluations app and other APMES tools, transcribed from programme documents the user supplied on 2026-10-10:

- **Evaluations_Tracking_TemplateAY2023.xlsx**: which DOPS, Mini-CEX and EBD assessments each resident must complete, and by which residency year. Transcribed in full, cell by cell, into [`apmes-requirements.json`](apmes-requirements.json) and summarised below.
- **RESIDENT GUIDE FOR LOGGING DOPS & MINI CEX UNDER MEDHUB (ver 19 Jul 2023)**: how residents trigger these assessments in MedHub today. The workflow and fields are described below.
- **Three MedHub app screenshots of the evaluator's side** (EBD, Mini-CEX, DOPS): transcribed question by question into [`apmes-forms.json`](apmes-forms.json) and summarised below.

The original files are not in this repository, which is public. The guide's screenshots show real faculty names, and both documents are programme-internal. Keep the originals with the programme. If a newer template comes out, re-transcribe it here and say which version it is.

## Assessment types

| Code | Name | Who assesses | What it is |
|---|---|---|---|
| DOPS | Direct Observation of Procedural Skills | Physician faculty | A procedure the resident does under observation (airway, lines, neuraxial and regional blocks). |
| MiniCEX | Mini Clinical Evaluation Exercise | Physician faculty | Observed management of a whole clinical encounter. Several items include an entrustment discussion on a crisis. |
| EBD | Entrustment-Based Discussion | Physician faculty co-managing the case | A case-based discussion of a case the faculty member co-managed. |

## Requirements by year

The template's columns are "To complete by R1", "To complete by R2" and "To complete by R3". The second sheet ("R4-R5") is headed "To be completed by R5". In the JSON, `byYear` is the year it is due by, and `id` is `R{year}-{type}-{nn}` (for example `R1-DOPS-03`).

| Due by | DOPS | Mini-CEX | EBD | Total |
|---|---|---|---|---|
| R1 | 5 | 3 | 5 | 13 |
| R2 | 6 | 5 | 9 | 20 |
| R3 | 9 | 7 | 13 | 29 |
| R5 | 1 | 0 | 7 | 8 |
| **All** | **21** | **15** | **34** | **70** |

How to read the template:

- **Each item is one assessment.** Where the template lists numbered repeats ("Central venous catheter insertion 1 / 2 / 3", "Difficult airway intubation 1 / 2 / 3", "Labour epidural / CSE 1 / 2 / 3"), each repeat is its own item. Their group label carries the minimum count ("MiniCEX (min 3)", "DOPS (min 3)", "DOPS (3)"), stored as `groupMin`.
- **The three R1 airway DOPS** (mask holding and bag ventilation, LMA insertion, endotracheal intubation) are to be completed **within the first 2 months**.
- **Paediatric limit:** the R3 EBD "MRI suite" and the R5 EBD "Interventional radiology suite" may discuss at most 1 paediatric patient.
- **Central venous catheter insertion is a Mini-CEX at R2** in the template, not a DOPS. This is kept as written.
- **Two difficult-airway items:** the R3 DOPS on difficult airway intubation must use three different types of laryngoscope blade (curved, hyperangulated, straight) and/or different models of videolaryngoscope. The R5 EBD on difficult airway must cover alternative intubation approaches such as awake intubation +/- front of neck access.
- **Typos fixed:** "A\wake flexible bronchoscopy" became "Awake …". Bullet characters and line breaks were flattened. Wording is otherwise as in the template.

The full item list, with exact wording, is in [`apmes-requirements.json`](apmes-requirements.json).

## How residents trigger an assessment in MedHub today

On the web: **Procedures → Log New Procedure/Case**. In the app: **Procedures → New Case Log**. One log can hold one or more procedures. Each procedure is one assessment, and submitting the log sends it to the evaluator to complete.

| Field | MedHub | Notes |
|---|---|---|
| Procedure date | Required | |
| Location | Required. "OTHER – Specify…" plus free text, e.g. the posting site | The app has All / Recent / Write-in. |
| Supervisor (evaluator) | Picked from the faculty list, or Search, or Other | The app has All / Recent / Write-in. |
| Encounter ID | Patient **initials** only | MedHub: "do not use patient name". |
| Patient gender, patient age | Dropdowns | |
| Procedure | Picked from the standard list, at least 1 per log | Named with a type prefix: `[DOPS] …`, `[MiniCEX] …`, `[EBD] …`, matching the items above, e.g. "[DOPS] IA Line", "[DOPS] Awake Fibreoptic Bronchoscopy Guided Endotracheal Intubation", "[MiniCEX] GA/IPPV case, ASA 2-3, age 3-5 years". |
| Role | Performed / Assisted / Observed | Per procedure. |
| Diagnosis, complications | Free text | |
| Procedure notes | Free text | Shown to the supervisor ("Notes to your supervisor"). |

After submitting, the resident sees triggered evaluations under **Procedures → Reports & History → Log History**. MedHub also has summary reports by gender, age, location, procedure and diagnosis.

## The evaluator's forms

Every form opens with an introduction saying it is a **formative** assessment by a faculty member who directly observed the trainee. The case may be chosen by the trainee with the faculty, and the faculty grades on a 9-point scale, comments, documents the entrustment-based discussion and records a supervision level. All three forms end the same way:

- **Entrustment-Based Discussion:** "Please briefly describe what was discussed centered around at least 2 entrustment questions" (required free text).
- **Level of Supervision:** a rating from Level 1 (Observe only), Level 2 (Direct supervision), Level 3 (Indirect supervision), Level 4 (Distant supervision) to Level 5 (Supervise). The question asks the faculty to explain the level and to consider agency, reliability, integrity, capability and humility as well as competency.
- **Comments** on what was done well and what can be improved, including readiness for variations of the case, with a **minimum of 30 characters**.
- **Resident was receptive to feedback** and **Resident demonstrated reflective learning**: dropdowns (Yes / No).

| Form | Questions | What's specific to it |
|---|---|---|
| EBD | 12 | Complexity of case. "Areas for improvement" checkboxes: patient assessment and preparation, preparation of the physical location, clinical management plan, communication with patient/next of kin, communication with healthcare team, technical skills, clinical judgment, organization and efficiency, professionalism, or no obvious areas for improvement; then optional comments. Four milestone ratings: medical knowledge, clinical reasoning, use of evidence-based medicine (N/A allowed), healthcare system awareness (N/A allowed). |
| Mini-CEX | 22 | Clinical setting (blue letter referral for pain, delivery suite, ICU, operating theatre, pain clinic, preop clinic, recovery/PACU, ward) and complexity. Nine 9-point ratings (1–9 or N/A), each with a descriptor: patient assessment/preparation, preparation of physical location, clinical management plan, communication with patient/next of kin, communication with team members (the only optional one), technical skills, clinical judgment, organisation/efficiency, professionalism. Overall clinical care (1–9, no N/A). The same four milestone ratings as EBD. Ends with an optional "Comments (if any)". |
| DOPS | 19 | Complexity of case, and how much guidance was given for the critical portion of the procedure. Eleven 9-point ratings (1–9 or N/A): consent, preprocedural checks, rationale/anatomy/equipment, analgesia/sedation/comfort, monitoring, asepsis and safety, technical ability and troubleshooting, communication with patient, communication with team, situational awareness, post-procedure management. Overall assessment (1–9, no N/A). No milestone ratings. |

**The milestone scale** (EBD and Mini-CEX) has ten points: 0.5 = Not Yet Achieved Level 1, then 1.0 to 5.0 in half-levels, shown alongside 1 to 9 on the 9-point scale (1.0 = 1, 1.5 = 2 … 5.0 = 9). Medical knowledge and clinical reasoning can't be N/A; evidence-based medicine and healthcare system awareness can.

**Forms vary by item in name only, as far as these three show.** MedHub names each form after its EPA, e.g. "(2023) EBD EPA (5): (HeadNeck Trauma)", "(2023) Mini Clinical Evaluation Exercise (CEX) Form - PNB", "(2023) Direct Observation of Procedural Skills (DOPS) Form - (Truncal)". The procedure names carry EPA numbers and sometimes a level ("[DOPS] EPA 3 (Level 3): Single Shot Truncal Block: Transabdominal Plane Block", "[MiniCEX] EPA 3: Manage a patient for surgery under peripheral nerve block and sedation", "[EBD] EPA 5: Mx of head/neck trauma"). The tracking template doesn't have these numbers.

**Still to confirm** (marked `unconfirmed` in the JSON):

- The dropdown options. The screenshots show only the selected or placeholder value: complexity (only "Moderate" seen; Low / Moderate / High assumed), the DOPS guidance question (only "Passive Help (Supervisor assists and follows the lead of the resident)" seen), receptive / reflective (only "Yes" seen; Yes / No assumed).
- Whether the DOPS form continues after question 19; the screenshot ends there.
- In the DOPS screenshot the comments question (17) has no asterisk, so it may be optional there while it is required on the other two.
- The EPA numbering for each tracking-template item.
