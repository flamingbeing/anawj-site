# Thumb CMC Trainer

Static web app (no build step) for teaching thumb carpometacarpal (trapeziometacarpal) joint
anatomy, osteoarthritis and CMC arthroscopy to hand-surgery trainees. Served at `/cmcj/`.

## Modes

- **Anatomy** — Z-Anatomy bones, ligaments, tendons, vessels and nerves around CMC1; face-on views
  of the trapezial and MC1 saddles; joint distraction; section plane; click-to-identify; quiz.
- **Osteoarthritis** — Normal and Eaton–Littler I–IV, simulated on the normal model: palmar-compartment
  cartilage wear → eburnation, fibrillation, marginal osteophytes (including the ulnar trapezial
  osteophyte), dorsoradial subluxation, joint-space narrowing, STT changes (stage IV), cartilage
  thickness map, and a simulated radiograph.
- **Arthroscopy** — 30° small-joint scope through 1-R / 1-U / D-2 / thenar portals with
  finger-trap traction. Pivot the scope about the portal, advance/withdraw it, rotate the lens. Probe
  (ICRS grading), shaver (synovectomy, chondroplasty), burr (osteophyte excision, hemitrapeziectomy)
  and grasper (loose bodies) through a separate working portal. Live distance from each tract to the
  radial artery and superficial radial nerve, Badia staging, training tasks and iatrogenic-damage
  tracking.

Pathology and instrument behaviour are procedural simulations for teaching, not patient data.

## Files

- `index.html`, `style.css`, `js/app.js` (scene, simulation, UI), `js/content.js` (teaching text —
  edit this to change the clinical wording)
- `models/cmcj.glb` — derived from Z-Anatomy, CC BY-SA 4.0 (see `models/ATTRIBUTION.md`)
- `vendor/three/` — three.js r170 (MIT), vendored so the site has no CDN dependency

## Regenerating the model

```sh
pip install bpy            # Blender as a Python module (5.x)
git clone https://github.com/LluisV/Z-Anatomy
python tools/export_cmcj_from_z_anatomy.py -- "Z-Anatomy/Z-Anatomy PC/Assets/Models/1.0 Models" cmcj/models/cmcj.glb
```

## Running locally

Any static server, e.g. `python3 -m http.server` from the repo root, then open `/cmcj/`.
