// The subsystems in step order (DESIGN.md, "Step order"). With a Jacobi step the order changes no numbers; it is kept
// as the documented order so logs and debugging read naturally. Later PRs add pk, volatile, pd, cardio and the rest.

import { vitals } from './vitals.js';
import { monitor } from './monitor.js';

export const SYSTEMS = [vitals, monitor];
