// Teaching content for the CMCJ trainer.
// Plain data so it can be reviewed and edited by clinicians without touching the 3D code.

export const STAGES = [
  {
    id: 0, short: 'Normal', title: 'Normal joint',
    eaton: 'Normal trapeziometacarpal joint.',
    badia: '—',
    findings: [
      'Smooth, glistening hyaline cartilage on both saddle surfaces',
      'Congruent, reciprocal saddle with even joint space',
      'Thin, pale synovium; no loose bodies',
      'MC1 base centred on the trapezium',
    ],
    treatment: 'No treatment. Use this stage to learn the normal arthroscopic appearance.',
  },
  {
    id: 1, short: 'Eaton I', title: 'Eaton–Littler stage I',
    eaton: 'Normal or slightly widened joint space (synovitis/effusion). Articular contours normal. Possible lax capsule: < ⅓ subluxation on stress.',
    badia: 'Badia arthroscopic stage I: intact cartilage, synovial hypertrophy, attenuated/lax ligaments (particularly the volar ligaments).',
    findings: [
      'Synovitis: hypertrophic, hyperaemic villous synovium',
      'Early surface softening and fibrillation, no full-thickness loss',
      'No osteophytes',
      'Ligamentous laxity rather than fixed subluxation',
    ],
    treatment: 'Splint, analgesia, injection, hand therapy. If refractory: arthroscopic debridement and synovectomy ± thermal capsulorrhaphy (Badia I).',
  },
  {
    id: 2, short: 'Eaton II', title: 'Eaton–Littler stage II',
    eaton: 'Slight joint space narrowing. Osteophytes / loose bodies < 2 mm. STT joint normal.',
    badia: 'Badia arthroscopic stage II: focal full-thickness cartilage loss (eburnation) on the ulnar third of the MC1 base and the central third of the trapezium.',
    findings: [
      'Focal eburnation: central–palmar trapezium and palmar-ulnar MC1 base',
      'Fibrillated cartilage around the lesion',
      'Marginal osteophytes < 2 mm',
      'Early dorsoradial translation of MC1',
    ],
    treatment: 'Arthroscopic debridement/synovectomy ± MC1 extension osteotomy, or arthroscopic partial trapeziectomy ± interposition (Badia II).',
  },
  {
    id: 3, short: 'Eaton III', title: 'Eaton–Littler stage III',
    eaton: 'Marked joint space narrowing, subchondral sclerosis/cysts, osteophytes > 2 mm, ≥ ⅓ dorsoradial subluxation. STT joint spared.',
    badia: 'Badia arthroscopic stage III: widespread full-thickness cartilage loss on both trapezium and MC1 base.',
    findings: [
      'Diffuse eburnation on both surfaces',
      'Peri-trapezial osteophytes > 2 mm, including the ulnar trapezial osteophyte',
      'Loose bodies in the recesses',
      'Dorsoradial subluxation of MC1',
    ],
    treatment: 'Arthroscopic hemitrapeziectomy ± interposition, or open trapeziectomy ± LRTI / suspensionplasty, implant arthroplasty or arthrodesis depending on patient factors.',
  },
  {
    id: 4, short: 'Eaton IV', title: 'Eaton–Littler stage IV',
    eaton: 'Pantrapezial arthritis: stage III changes plus scaphotrapezial (STT) joint involvement.',
    badia: 'Beyond Badia staging — STT disease makes isolated CMC arthroscopic procedures inappropriate.',
    findings: [
      'All stage III features',
      'STT joint narrowing and osteophytes',
      'Fixed adduction / dorsoradial subluxation',
    ],
    treatment: 'Usually complete trapeziectomy (± LRTI / suspensionplasty) addressing the STT joint. Arthroscopic CMC-only procedures are not indicated.',
  },
];

export const NOTES = {
  anatomy: `
<h3>Shape of the joint</h3>
<p>The trapeziometacarpal (CMC1) joint is a <b>biconcave saddle</b>. The trapezium is concave in the dorsopalmar plane and convex radioulnarly; the MC1 base is the reciprocal. The surfaces are only partly congruent, which permits flexion–extension, abduction–adduction and the coupled axial rotation of opposition.</p>
<h3>Stabilisers</h3>
<p>Up to 16 ligaments have been described. The <b>dorsoradial ligament (DRL)</b> is the main restraint to dorsoradial subluxation in most biomechanical studies; the <b>anterior oblique ("beak") ligament (AOL)</b> runs from the palmar trapezial tubercle to the palmar beak of MC1 and acts as a pivot. <b>APL</b> inserts onto the radial MC1 base and is a dynamic deforming force. In the model these appear in the Z-Anatomy dorsal and palmar carpometacarpal ligament groups.</p>
<h3>Load</h3>
<p>Compressive load across the joint is many times the pinch force at the tip (around 12× in classic studies). The palmar compartment takes most of it in key pinch, which is why wear starts there.</p>
<h3>Neighbours that matter surgically</h3>
<ul>
<li><b>Radial artery</b> crosses the snuffbox dorsally over the scaphoid and trapezium, then dives between MC1 and MC2 bases. It lies close to the 1-U and D-2 portals.</li>
<li><b>Superficial radial nerve</b> branches run over the first dorsal compartment and near every dorsal portal.</li>
<li><b>FCR</b> runs in a groove on the palmar trapezium; it is at risk during trapeziectomy.</li>
<li>The trapezium also articulates with the <b>scaphoid, trapezoid and MC2</b>, so check the STT joint before planning surgery.</li>
</ul>
<p class="muted">Tip: use the <i>Trapezium surface</i> and <i>MC1 base</i> views, or the distraction slider, to see each saddle face-on.</p>`,
  oa: `
<h3>Pathomechanics</h3>
<p>CMC1 osteoarthritis is common in post-menopausal women. Ligament laxity (AOL degeneration, DRL attenuation) lets MC1 translate <b>dorsoradially</b> under load. Wear starts in the <b>palmar compartment</b>: the central–palmar trapezium and the palmar beak/ulnar MC1 base.</p>
<h3>Radiographs</h3>
<p>Use a true AP (Robert) and a true lateral of the CMC joint. Stage using joint space, osteophyte size, subluxation and STT involvement (Eaton–Littler). Radiographic stage often matches symptoms and arthroscopic findings poorly.</p>
<h3>Clinical</h3>
<ul>
<li>Basal thumb pain with pinch and grip; grind test, lever test</li>
<li>Adduction contracture of the first web; MCP hyperextension (Z-deformity) later on</li>
<li>Exclude De Quervain's, FCR tendinitis, STT OA and scaphoid pathology</li>
</ul>
<p class="muted">In the model, cartilage loss, osteophytes, subluxation, synovitis and loose bodies are <b>simulated</b> on the normal Z-Anatomy geometry. Patterns follow published descriptions but this is not patient data.</p>`,
  arthro: `
<h3>Set-up</h3>
<p>Supine, arm on hand table or traction tower; single finger trap on the thumb with about 2–4 kg (5–8 lb) of traction. 1.9–2.7 mm 30° scope, 2.0–2.9 mm shaver and burr. Mark the APL and EPB tendons and the joint line, then distend the joint with saline before making portals.</p>
<h3>Portals</h3>
<ul>
<li><b>1-R</b>: just radial (palmar) to APL at the joint line. Good view of the DRL, the posterior oblique ligament and the ulnar ligaments.</li>
<li><b>1-U</b>: just ulnar to EPB. Good view of the AOL and the radial collateral ligament. Close to the radial artery and SRN branches.</li>
<li><b>D-2</b>: dorsal, ulnar to EPL, between MC1 and MC2 bases. Watch the radial artery.</li>
<li><b>Thenar</b>: through the thenar muscles, palmar to 1-R. Useful as a working portal.</li>
</ul>
<h3>Systematic examination</h3>
<p>Synovium → ligaments (DRL, POL, UCL, AOL) → trapezial surface → MC1 base → recesses for loose bodies. Probe the cartilage for softening and fibrillation. Note where the full-thickness loss is.</p>
<h3>Stage-directed treatment (Badia)</h3>
<ul>
<li><b>I</b>: synovectomy, debridement ± thermal capsular shrinkage</li>
<li><b>II</b>: debridement ± extension osteotomy, or partial trapeziectomy ± interposition</li>
<li><b>III</b>: hemitrapeziectomy (often around 3–5 mm of the distal trapezium) ± interposition, or convert to open surgery</li>
</ul>
<h3>Controls</h3>
<p class="muted">Use the toolbar at the bottom left of the scope view. <b>In / out</b>: hold <b>+</b> / <b>−</b>, pinch with two fingers, scroll, or <kbd>W</kbd>/<kbd>S</kbd>. <b>Aim</b>: with <b>Scope</b> selected, drag in the view; with an instrument selected, drag with two fingers or the right mouse button. The scope pivots around its portal. <b>Lens</b>: ⟲ / ⟳ or <kbd>Q</kbd>/<kbd>E</kbd> rotate the 30° view. <b>Instruments</b> enter through the working portal: press and hold on a surface to use them. The scope stops at bone; burr bone away to make room.</p>`,
};

// Short descriptions for structures picked in the viewer. Keys are Z-Anatomy object names.
export const INFO = {
  'Trapezium bone': 'Distal carpal bone; saddle-shaped distal surface articulates with the MC1 base. Also articulates with scaphoid (STT), trapezoid and MC2. Palmar tubercle and FCR groove on its palmar surface.',
  'First metacarpal bone': 'Thumb metacarpal. The reciprocal saddle at its base has a palmar "beak" where the anterior oblique ligament attaches. APL inserts on the radial base.',
  'Scaphoid bone': 'Its distal pole articulates with trapezium and trapezoid (STT joint), which is involved in Eaton stage IV.',
  'Trapezoid bone': 'Articulates with trapezium, scaphoid, capitate and MC2.',
  'Second metacarpal bone': 'MC2 base articulates with the trapezium. The intermetacarpal ligament between MC1 and MC2 bases is a CMC1 stabiliser.',
  'Radius': 'Distal radius; radial styloid sits proximal to the snuffbox.',
  'Dorsal carpometacarpal ligaments': 'Z-Anatomy group including the dorsal CMC ligaments. At CMC1 this corresponds to the dorsoradial (DRL) and posterior oblique (POL) ligaments, the main restraints to dorsoradial subluxation.',
  'Palmar carpometacarpal ligaments': 'Z-Anatomy group including the palmar CMC ligaments. At CMC1 this includes the anterior oblique ("beak") ligament from the trapezial tubercle to the palmar MC1 beak.',
  'Scaphotrapeziotrapezoidal ligament': 'Stabilises the STT joint.',
  'Radial collateral ligament of wrist joint': 'From the radial styloid to the scaphoid; sits proximal to the CMC1 portals.',
  'Trapeziotrapezoidal interosseous ligament': 'Links trapezium and trapezoid.',
  'Abductor pollicis longus': 'First dorsal compartment. Inserts on the radial MC1 base (often several slips). Landmark: the 1-R portal is just radial/palmar to it. Its pull drives dorsoradial subluxation.',
  'Extensor pollicis brevis': 'First dorsal compartment, ulnar to APL. Landmark: the 1-U portal is just ulnar to it.',
  'Extensor pollicis longus': 'Ulnar border of the snuffbox (third compartment). The D-2 portal is ulnar to EPL.',
  'Flexor carpi radialis': 'Runs in the trapezial groove to insert on the MC2 (and MC3) base. At risk during trapeziectomy; often used in LRTI.',
  'Flexor pollicis longus': 'Passes through the carpal tunnel to the thumb distal phalanx.',
  'Abductor pollicis brevis': 'Superficial thenar muscle; the thenar portal goes through the thenar muscles.',
  'Opponens pollicis muscle': 'Deep thenar muscle inserting along the radial MC1 shaft.',
  'Superficial head of flexor pollicis brevis': 'Thenar muscle.',
  'Deep head of flexor pollicis brevis': 'Thenar muscle.',
  'Oblique head of adductor pollicis': 'Adductor; contracture contributes to the first web space narrowing in advanced OA.',
  'Transverse head of adductor pollicis': 'Adductor pollicis, transverse head.',
  'Flexor retinaculum of wrist': 'Attaches to the trapezial tubercle and scaphoid tubercle radially.',
  'Extensor retinaculum of wrist': 'Roof of the dorsal compartments.',
  'Tendon sheath - abd. pollicis longus - ext. pollicis brevis': 'First dorsal compartment sheath (De Quervain\'s). Lies over the 1-R / 1-U portal sites.',
  'Tendon sheath of flexor carpi radialis': 'FCR sheath in the trapezial groove.',
  'Tendon sheath of extensor pollicis longus': 'EPL sheath.',
  'Radial artery': 'Crosses the snuffbox floor dorsally over scaphoid and trapezium and enters the first web between the MC1 and MC2 bases. At risk with the 1-U and D-2 portals.',
  'Palmar carpal branch of radial artery': 'Contributes to the palmar carpal arch.',
  'Dorsal carpal anastomosis': 'Dorsal carpal arch.',
  'Superficial branch of radial nerve': 'Sensory branches over the first dorsal compartment and snuffbox. Most common portal complication (neuritis/neuroma): spread the tissue bluntly.',
  'Dorsal digital branches of radial nerve': 'Terminal SRN branches to the thumb and index.',
  '__cartilage': 'Hyaline articular cartilage (simulated). Normal thickness here is set to about 0.7 mm. In OA it softens, fibrillates and is lost, first in the palmar compartment.',
  '__osteophyte': 'Marginal osteophyte (simulated). Peri-trapezial and ulnar trapezial osteophytes block motion and can be removed with a burr.',
  '__synovium': 'Joint capsule / synovium (schematic ellipsoid). Synovitis appears as hyperaemic villous fronds.',
  '__loose': 'Loose body: a detached osteochondral fragment. Remove with a grasper or shaver.',
};

export const GROUP_LABEL = {
  bone: 'Bone', ligament: 'Ligament', muscle: 'Muscle / tendon', nv: 'Vessel / nerve',
};

// Viva-style exam questions. `show` sets up the 3D scene to illustrate the answer:
// { mode, stage, view, layers: { name: bool } }. Answers are model answers, not exhaustive.
export const VIVA_TOPICS = { anatomy: 'Anatomy', oa: 'OA & imaging', arthro: 'Arthroscopy', mgmt: 'Management' };
export const VIVA = [
  { topic: 'anatomy', q: 'Describe the articular surfaces of the thumb CMC joint.',
    a: 'Biconcave <b>saddle</b>. Trapezium: concave dorsopalmar, convex radioulnar; MC1 base reciprocal. Only partly congruent, allowing flexion–extension, abduction–adduction and coupled axial rotation (opposition).',
    show: { mode: 'anatomy', view: 'trapezium' } },
  { topic: 'anatomy', q: 'What is the primary restraint to dorsoradial subluxation of MC1?',
    a: 'The <b>dorsoradial ligament (DRL)</b> in most biomechanical studies; thickest and stiffest of the CMC1 ligaments. The posterior oblique ligament helps.',
    show: { mode: 'anatomy', view: 'dorsal', layers: { ligament: true } } },
  { topic: 'anatomy', q: 'Describe the anterior oblique (beak) ligament and its significance.',
    a: 'Runs from the palmar trapezial tubercle to the palmar <b>beak of MC1</b>. Thin, intracapsular; acts as a pivot/guide in opposition. Its degeneration is linked with palmar wear and the start of OA. Reconstructed in Eaton–Littler FCR ligament reconstruction.',
    show: { mode: 'anatomy', view: 'palmar', layers: { ligament: true } } },
  { topic: 'anatomy', q: 'Which tendon is a deforming force at the CMC joint, and why?',
    a: '<b>APL</b> inserts on the radial MC1 base and pulls it proximally and dorsoradially, especially once the DRL/AOL are lax. Adductor pollicis contracture narrows the first web.',
    show: { mode: 'anatomy', view: 'radial', layers: { muscle: true } } },
  { topic: 'anatomy', q: 'Which structures are at risk around the trapezium during surgery?',
    a: '<b>Radial artery</b> (snuffbox, then between MC1/MC2 bases), <b>superficial radial nerve</b> branches, <b>FCR</b> in the trapezial groove (palmar), and the STT/trapezoid articulations.',
    show: { mode: 'anatomy', view: 'dorsal', layers: { nv: true, muscle: true } } },
  { topic: 'anatomy', q: 'What load crosses the CMC joint during pinch?',
    a: 'Roughly <b>12×</b> the tip pinch force (Cooney & Chao), concentrated on the <b>palmar compartment</b> in key pinch — the site of earliest wear.',
    show: { mode: 'oa', stage: 2, view: 'trapezium' } },
  { topic: 'oa', q: 'Give the Eaton–Littler radiographic classification.',
    a: '<b>I</b>: normal/widened joint (synovitis), < ⅓ subluxation. <b>II</b>: slight narrowing, osteophytes/loose bodies < 2 mm. <b>III</b>: marked narrowing, sclerosis, osteophytes > 2 mm, ≥ ⅓ subluxation. <b>IV</b>: stage III + STT (pantrapezial) arthritis.',
    show: { mode: 'oa', stage: 3, view: 'xap' } },
  { topic: 'oa', q: 'Which radiographs would you request?',
    a: 'True <b>AP (Robert)</b> view: forearm maximally pronated, dorsum of thumb on cassette. True <b>lateral</b> of the CMC joint. Optional stress view (Eaton: thumbs pressed together, tip to tip) to show subluxation; Bett view for STT.',
    show: { mode: 'oa', stage: 3, view: 'xlat' } },
  { topic: 'oa', q: 'Where does cartilage wear begin, and why?',
    a: 'Palmar compartment: <b>central–palmar trapezium</b> and <b>palmar-ulnar MC1 base/beak</b>. Laxity of the AOL lets MC1 translate dorsoradially, loading the palmar surfaces in pinch.',
    show: { mode: 'oa', stage: 2, view: 'trapezium', heat: true } },
  { topic: 'oa', q: 'How do you examine a patient with basal thumb pain?',
    a: 'Look: shoulder sign, adduction of MC1, MCP hyperextension (Z-deformity). Feel: tenderness at the joint line. Move: <b>grind test</b> (axial load + rotation), lever test, distraction test; first web span. Differentials: De Quervain\'s (Finkelstein), FCR tendinitis, STT OA, scaphoid pathology, trigger thumb, carpal tunnel (coexists in up to ~40%).',
    show: { mode: 'oa', stage: 3, view: 'radial' } },
  { topic: 'oa', q: 'What are the limitations of the Eaton–Littler classification?',
    a: 'Moderate inter- and intra-observer reliability; correlates poorly with symptoms and with arthroscopic cartilage findings; does not grade the STT joint well. Badia arthroscopic staging describes cartilage directly.',
    show: { mode: 'arthro', stage: 2 } },
  { topic: 'arthro', q: 'Describe the standard CMC arthroscopy portals.',
    a: '<b>1-R</b>: radial (palmar) to APL — view DRL, POL, UCL. <b>1-U</b>: ulnar to EPB — view AOL, RCL; near radial artery/SRN. <b>D-2</b>: ulnar to EPL between MC1/MC2 bases. <b>Thenar</b>: through the thenar muscles, palmar to 1-R.',
    show: { mode: 'arthro', stage: 1 } },
  { topic: 'arthro', q: 'Give the Badia arthroscopic classification and its treatment.',
    a: '<b>I</b>: intact cartilage, synovitis, lax ligaments → synovectomy, debridement ± thermal capsulorrhaphy. <b>II</b>: focal eburnation (ulnar MC1 base, central trapezium) → debridement ± extension osteotomy or partial trapeziectomy ± interposition. <b>III</b>: diffuse loss → hemitrapeziectomy ± interposition or open surgery.',
    show: { mode: 'arthro', stage: 2 } },
  { topic: 'arthro', q: 'What are the complications of CMC arthroscopy?',
    a: '<b>SRN neuritis/neuroma</b> (commonest), radial artery injury, tendon injury (EPB/APL), iatrogenic chondral damage, thermal injury, portal infection, CRPS, persistent pain/conversion to open. Prevent with skin-only incision and blunt spreading.',
    show: { mode: 'arthro', stage: 3 } },
  { topic: 'arthro', q: 'How much trapezium is removed in an arthroscopic hemitrapeziectomy?',
    a: 'Usually <b>3–5 mm</b> of the distal trapezial surface, creating a gap for interposition or haematoma-distraction. Check the full surface is resected evenly, including the ulnar osteophyte.',
    show: { mode: 'arthro', stage: 3 } },
  { topic: 'mgmt', q: 'Outline non-operative management of thumb CMC OA.',
    a: 'Education and activity modification, hand-based thumb spica splint (especially at night), analgesia/topical NSAID, hand therapy (dorsal interossei and opponens strengthening, first web stretch), corticosteroid injection (short-term relief). Most patients are managed this way.',
    show: { mode: 'oa', stage: 1 } },
  { topic: 'mgmt', q: 'What are the surgical options for stage III CMC OA?',
    a: '<b>Trapeziectomy</b> alone or with LRTI / suspensionplasty / haematoma distraction (gold standard; no superior variant proven — Wajon Cochrane review). <b>Arthrodesis</b> (young heavy manual worker; loss of flattening the hand). <b>Implant arthroplasty</b> (dual-mobility, faster recovery; dislocation and loosening). Arthroscopic hemitrapeziectomy ± interposition.',
    show: { mode: 'oa', stage: 3, view: 'dorsal' } },
  { topic: 'mgmt', q: 'Who is a good candidate for CMC arthrodesis, and what are the drawbacks?',
    a: 'Young, high-demand manual worker with isolated CMC disease (no STT). Fuse in about 35–40° palmar abduction, 10–20° radial abduction and slight pronation (closed-fist position). Drawbacks: non-union (up to ~10–15%), inability to flatten the hand, adjacent joint (STT/MCP) degeneration.',
    show: { mode: 'oa', stage: 3, view: 'radial' } },
  { topic: 'mgmt', q: 'How do you manage MCP hyperextension with CMC OA?',
    a: '< 30° hyperextension: usually nothing beyond the CMC procedure. 30–40°: pinning in flexion ± capsulodesis. > 40°: volar plate capsulodesis, sesamoidesis or MCP arthrodesis. Uncorrected hyperextension drives MC1 back into adduction.',
    show: { mode: 'oa', stage: 4, view: 'radial' } },
  { topic: 'mgmt', q: 'Which procedure for Eaton stage IV (pantrapezial) OA?',
    a: '<b>Complete trapeziectomy</b> ± LRTI/suspensionplasty, also excising the proximal trapezium to clear the STT joint (± partial trapezoid excision). CMC arthrodesis and isolated CMC arthroscopy are not appropriate.',
    show: { mode: 'oa', stage: 4, view: 'xap' } },
  { topic: 'mgmt', q: 'What is the role of MC1 extension osteotomy?',
    a: 'Eaton I–II in a younger patient: a ~30° dorsal closing-wedge osteotomy at the MC1 base shifts load from the palmar to the dorsal compartment and tightens the dorsal ligaments, preserving the joint.',
    show: { mode: 'oa', stage: 2, view: 'mc1' } },
];
