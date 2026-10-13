// Hand surgery workplace-based assessment data: procedures (DOPS), Mini-CEX cases, rating scale and form domains.

export const PROCEDURES = [
  // Tendon
  { id: 'flexor-tendon-repair-zone-2', name: 'Flexor tendon repair (zone II)', group: 'Tendon' },
  { id: 'flexor-tendon-repair-other-zone', name: 'Flexor tendon repair (other zones)', group: 'Tendon' },
  { id: 'extensor-tendon-repair', name: 'Extensor tendon repair', group: 'Tendon' },
  { id: 'mallet-finger-management', name: 'Mallet finger management (splint or fixation)', group: 'Tendon' },
  { id: 'tendon-transfer', name: 'Tendon transfer', group: 'Tendon' },
  { id: 'de-quervain-release', name: "De Quervain's release", group: 'Tendon' },
  // Nerve
  { id: 'digital-nerve-repair', name: 'Digital nerve repair', group: 'Nerve' },
  { id: 'carpal-tunnel-release', name: 'Carpal tunnel release', group: 'Nerve' },
  { id: 'cubital-tunnel-release', name: 'Cubital tunnel release', group: 'Nerve' },
  { id: 'major-nerve-repair', name: 'Median or ulnar nerve repair at wrist', group: 'Nerve' },
  // Bone
  { id: 'k-wire-phalanx', name: 'K-wiring of phalangeal fracture', group: 'Bone' },
  { id: 'k-wire-metacarpal', name: 'K-wiring of metacarpal fracture', group: 'Bone' },
  { id: 'orif-metacarpal', name: 'ORIF metacarpal or phalanx (plate/screws)', group: 'Bone' },
  { id: 'orif-distal-radius', name: 'ORIF distal radius', group: 'Bone' },
  { id: 'scaphoid-fixation', name: 'Scaphoid fixation', group: 'Bone' },
  { id: 'mua-fracture-dislocation', name: 'Manipulation under anaesthesia (fracture or dislocation)', group: 'Bone' },
  // Soft tissue
  { id: 'trigger-finger-release', name: 'Trigger finger release', group: 'Soft tissue' },
  { id: 'dupuytren-fasciectomy', name: "Dupuytren's fasciectomy", group: 'Soft tissue' },
  { id: 'ganglion-excision', name: 'Ganglion excision', group: 'Soft tissue' },
  { id: 'nail-bed-repair', name: 'Nail bed repair', group: 'Soft tissue' },
  { id: 'fingertip-local-flap', name: 'Fingertip injury / local flap', group: 'Soft tissue' },
  { id: 'flexor-sheath-washout', name: 'Washout of flexor sheath', group: 'Soft tissue' },
  { id: 'abscess-drainage', name: 'Drainage of hand abscess or paronychia', group: 'Soft tissue' },
  { id: 'amputation-revision', name: 'Revision amputation of digit', group: 'Soft tissue' },
  { id: 'wound-debridement-closure', name: 'Hand wound exploration, debridement and closure', group: 'Soft tissue' },
  // Anaesthesia & basics
  { id: 'digital-block', name: 'Digital nerve block', group: 'Anaesthesia & basics' },
  { id: 'walant', name: 'WALANT (wide-awake local anaesthesia, no tourniquet)', group: 'Anaesthesia & basics' },
  { id: 'wrist-block', name: 'Wrist block', group: 'Anaesthesia & basics' },
  { id: 'bier-block', name: "Bier's block (IV regional anaesthesia)", group: 'Anaesthesia & basics' },
  { id: 'tourniquet-application', name: 'Tourniquet application', group: 'Anaesthesia & basics' },
  { id: 'hand-splinting-pop', name: 'Hand splinting / plaster of Paris', group: 'Anaesthesia & basics' },
];

export const CASES = [
  { id: 'hand-trauma-assessment', name: 'Acute hand trauma assessment' },
  { id: 'flexor-tendon-injury', name: 'Flexor tendon injury' },
  { id: 'nerve-injury-exam', name: 'Peripheral nerve injury examination' },
  { id: 'scaphoid-fracture', name: 'Suspected scaphoid fracture' },
  { id: 'distal-radius-fracture', name: 'Distal radius fracture' },
  { id: 'flexor-sheath-infection', name: 'Hand infection / flexor sheath infection (Kanavel signs)' },
  { id: 'carpal-tunnel-syndrome', name: 'Carpal tunnel syndrome' },
  { id: 'trigger-finger', name: 'Trigger finger' },
  { id: 'dupuytren', name: "Dupuytren's disease" },
  { id: 'hand-mass-ganglion', name: 'Hand or wrist mass / ganglion' },
  { id: 'rheumatoid-hand', name: 'Rheumatoid hand' },
  { id: 'thumb-cmc-oa', name: 'Thumb CMC joint osteoarthritis' },
  { id: 'compartment-syndrome', name: 'Compartment syndrome of hand or forearm' },
  { id: 'high-pressure-injection', name: 'High-pressure injection injury' },
  { id: 'fingertip-amputation', name: 'Fingertip injury or amputation' },
  { id: 'consent-discussion', name: 'Consent discussion for hand surgery' },
];

export const RATING = [
  { value: 1, label: 'Below expectations (needs direct supervision)' },
  { value: 2, label: 'Borderline' },
  { value: 3, label: 'Meets expectations (indirect supervision)' },
  { value: 4, label: 'Above expectations (independent)' },
];

export const FORMS = {
  dops: {
    id: 'dops',
    title: 'DOPS',
    domains: [
      { id: 'indication', label: 'Indication and anatomy', hint: 'Explains why the procedure is needed and the relevant anatomy at risk.' },
      { id: 'consent', label: 'Consent', hint: 'Explains benefits, risks and alternatives clearly and checks understanding.' },
      { id: 'preparation', label: 'Preparation, positioning and tourniquet', hint: 'Sets up patient, arm table, kit and tourniquet safely before starting.' },
      { id: 'anaesthesia', label: 'Anaesthesia', hint: 'Chooses and gives suitable anaesthesia safely, checking effect before incision.' },
      { id: 'asepsis', label: 'Asepsis', hint: 'Keeps a sterile field throughout and corrects breaches promptly.' },
      { id: 'technical-skill', label: 'Technical skill', hint: 'Performs the key steps fluently, in a logical order, to a sound result.' },
      { id: 'tissue-handling', label: 'Instrument and tissue handling', hint: 'Uses instruments well and handles tissues gently, protecting nerves and vessels.' },
      { id: 'complications', label: 'Awareness of complications', hint: 'Anticipates, recognises and manages problems as they arise.' },
      { id: 'post-op', label: 'Post-op plan and documentation', hint: 'Writes a clear operation note with splintage, therapy and follow-up plan.' },
      { id: 'teamwork', label: 'Communication with team', hint: 'Keeps theatre staff and the patient informed and works calmly with the team.' },
      { id: 'seeks-help', label: 'Seeks help appropriately', hint: 'Knows own limits and asks for help at the right time.' },
    ],
  },
  minicex: {
    id: 'minicex',
    title: 'Mini-CEX',
    domains: [
      { id: 'history', label: 'History taking', hint: 'Takes a focused history including mechanism, hand dominance, occupation and hobbies.' },
      { id: 'examination', label: 'Examination', hint: 'Examines systematically, including neurovascular status and each tendon in turn.' },
      { id: 'communication', label: 'Communication', hint: 'Explains findings and options in plain words and checks understanding.' },
      { id: 'judgement', label: 'Clinical judgement', hint: 'Reaches a sensible diagnosis and differential, and recognises urgency.' },
      { id: 'management', label: 'Management plan', hint: 'Proposes a safe, evidence-based plan including therapy and follow-up.' },
      { id: 'professionalism', label: 'Professionalism', hint: 'Shows respect, consent awareness and honesty about own limits.' },
      { id: 'organisation', label: 'Organisation and efficiency', hint: 'Prioritises well and completes the encounter in reasonable time.' },
    ],
  },
};
