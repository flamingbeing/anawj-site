// The subsystems in step order (DESIGN.md, "Step order"). With a Jacobi step the order changes no numbers; it is kept
// as the documented order so logs and debugging read naturally. Later PRs add volatile, pd, cardio and the rest.

import { pump } from './pump.js';
import { pk } from './pk.js';
import { vitals } from './vitals.js';
import { monitor } from './monitor.js';

export const SYSTEMS = [pump, pk, vitals, monitor];
