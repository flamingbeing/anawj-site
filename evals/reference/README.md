# APMES workplace-based assessment reference

Reference material for the evaluations app and other APMES tools, transcribed from two programme documents the user supplied on 2026-10-10:

- **Evaluations_Tracking_TemplateAY2023.xlsx**: which DOPS, Mini-CEX and EBD assessments each resident must complete, and by which residency year. Transcribed in full, cell by cell, into [`apmes-requirements.json`](apmes-requirements.json) and summarised below.
- **RESIDENT GUIDE FOR LOGGING DOPS & MINI CEX UNDER MEDHUB (ver 19 Jul 2023)**: how residents trigger these assessments in MedHub today. The workflow and fields are described below.

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

**Not in either document:** the evaluator's side of the form (rating scales, entrustment levels, comment boxes). The app needs it. Get a copy of the DOPS, Mini-CEX and EBD evaluation forms as faculty see them in MedHub.
