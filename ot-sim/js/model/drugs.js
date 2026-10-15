// Drug catalogue (MODEL.md section 2): data, no logic. Each drug names its PK model (pk.js MODELS) and the units
// its amounts and concentrations are kept in. Amounts are in `amount` (mg or mcg) and concentrations in `amount`
// per litre, so mg/L reads as mcg/mL and mcg/L as ng/mL (the units the papers use).
//
// Later PRs add presentations for the pump (M1.2), the neuromuscular drugs (M1.3), vasoactive drugs (M2.3) and the
// scenario drugs (M4.0).

export const DRUGS = {
  propofol:     { name: 'Propofol',     amount: 'mg',  conc: 'mcg/mL', model: 'schnider', haemo: true },   // [V] Schnider 1998, 1999
  remifentanil: { name: 'Remifentanil', amount: 'mcg', conc: 'ng/mL',  model: 'minto' },                   // [V] Minto 1997
  fentanyl:     { name: 'Fentanyl',     amount: 'mcg', conc: 'ng/mL',  model: 'shafer' },                  // [V] Shafer 1990; ke0 owner question 8
  alfentanil:   { name: 'Alfentanil',   amount: 'mcg', conc: 'ng/mL',  model: 'maitre' },                  // [V] Maitre 1987
  midazolam:    { name: 'Midazolam',    amount: 'mcg', conc: 'ng/mL',  model: 'albrecht' },                // [V] Albrecht 1999
  ketamine:     { name: 'Ketamine',     amount: 'mg',  conc: 'mcg/mL', model: 'domino' },                  // PK [S] Domino 1982; ke0 [D]
};

// mass units relative to a microgram
const MASS = { g: 1e6, mg: 1e3, mcg: 1, ng: 1e-3 };

// a dose in the unit given ('mg', 'mcg', 'mg/kg', 'mcg/kg') as an amount in the drug's own unit
export function doseAmount(drug, dose, unit, weightKg) {
  const d = DRUGS[drug];
  if (!d) throw new Error(`unknown drug ${drug}`);
  const [mass, per] = unit.split('/');
  if (!(mass in MASS) || (per && per !== 'kg')) throw new Error(`unknown dose unit ${unit}`);
  return (dose * (per ? weightKg : 1) * MASS[mass]) / MASS[d.amount];
}

// an infusion rate ('mg/h', 'mcg/min', 'mg/kg/h', 'mcg/kg/min', ...) as the drug's own amount per minute
export function rateAmount(drug, rate, unit, weightKg) {
  const d = DRUGS[drug];
  if (!d) throw new Error(`unknown drug ${drug}`);
  const parts = unit.split('/'), mass = parts[0], time = parts[parts.length - 1], perKg = parts.length === 3 && parts[1] === 'kg';
  if (!(mass in MASS) || !(time === 'h' || time === 'min') || (parts.length === 3 && !perKg) || parts.length > 3) throw new Error(`unknown rate unit ${unit}`);
  return (rate * (perKg ? weightKg : 1) * MASS[mass]) / MASS[d.amount] / (time === 'h' ? 60 : 1);
}
