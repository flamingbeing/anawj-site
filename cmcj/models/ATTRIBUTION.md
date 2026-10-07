# cmcj.glb — attribution and licence

`cmcj.glb` is derived from the **Z-Anatomy** models
(https://www.z-anatomy.com/, https://github.com/LluisV/Z-Anatomy, FBX files under
`Z-Anatomy PC/Assets/Models/1.0 Models/`). Z-Anatomy builds on BodyParts3D
(© The Database Center for Life Science).

Licence: **CC BY-SA 4.0** — https://creativecommons.org/licenses/by-sa/4.0/

Changes made for this derivative:

- Extracted the right-hand bones, distal radius/ulna (cut 48 mm proximal to the CMC1 joint),
  carpometacarpal and STT ligaments, and the thumb-base tendons, muscles, vessels and nerves
  (clipped to a sphere around the joint).
- Re-centred on the trapeziometacarpal joint and rescaled to millimetres.
- Subdivided (Catmull–Clark) — trapezium and MC1 at level 2, others at level 1.
- Added per-vertex distance attributes: `_JD` (trapezium↔MC1, scaphoid→trapezium) and `_JS`
  (trapezium→scaphoid), used to place simulated cartilage, osteophytes and STT changes.

This file is shared under the same CC BY-SA 4.0 licence. The script that produced it is
`tools/export_cmcj_from_z_anatomy.py`.
