// Gestión de banca: criterio de Kelly (tesis Millassón, pto. 4 — éxito económico
// medido por bankroll management). La idea: NO apostar el marcador que dice el
// mercado, sino donde el MODELO discrepa del mercado a tu favor. Si tu prob. p es
// mayor que la prob. implícita de la cuota, hay valor (+EV) y Kelly dice qué
// fracción de la banca arriesgar para maximizar el crecimiento geométrico.
//
// Se usa la prob. del MODELO PURO (sin anclar al mercado) vs la cuota cruda de la
// casa; anclar el modelo al mercado borraría justamente el edge que buscamos.

export type Outcome = "home" | "draw" | "away";

export interface ValueBet {
  outcome: Outcome;
  prob: number; // prob. del modelo
  odds: number; // mejor cuota decimal disponible
  book?: string; // casa que ofrece esa cuota
  edge: number; // p*odds - 1  (valor esperado por unidad apostada)
  kelly: number; // fracción de banca según Kelly (ya escalada por `fraction`)
}

/**
 * Fracción de Kelly para una apuesta binaria: f* = (b·p − q) / b, con b = cuota−1
 * y q = 1−p. Negativa (sin valor) -> 0. No apliques Kelly completo en la práctica:
 * es muy volátil; se usa una fracción (p. ej. 0.25–0.5) vía `fraction`.
 */
export function kellyFraction(p: number, decimalOdds: number, fraction = 1): number {
  const b = decimalOdds - 1;
  if (b <= 0) return 0;
  const f = (b * p - (1 - p)) / b;
  return f > 0 ? f * fraction : 0;
}

export interface KellyOptions {
  /** fracción de Kelly aplicada (Kelly fraccional). Default 0.25 (conservador). */
  fraction?: number;
  /** edge mínimo para considerar la apuesta (filtra ruido). Default 0.05 = 5%. */
  minEdge?: number;
}

/**
 * Dadas las probabilidades del modelo y las mejores cuotas por resultado,
 * devuelve las apuestas con valor (edge ≥ minEdge) ordenadas por edge desc.
 * `oddsByOutcome` debe traer la MEJOR (mayor) cuota disponible entre casas.
 */
export function valueBets(
  probs: { home: number; draw: number; away: number },
  oddsByOutcome: { home?: { odds: number; book?: string }; draw?: { odds: number; book?: string }; away?: { odds: number; book?: string } },
  opts: KellyOptions = {},
): ValueBet[] {
  const fraction = opts.fraction ?? 0.25;
  const minEdge = opts.minEdge ?? 0.05;
  const out: ValueBet[] = [];
  for (const oc of ["home", "draw", "away"] as Outcome[]) {
    const q = oddsByOutcome[oc];
    if (!q) continue;
    const p = probs[oc];
    const edge = p * q.odds - 1;
    if (edge < minEdge) continue;
    out.push({ outcome: oc, prob: p, odds: q.odds, book: q.book, edge, kelly: kellyFraction(p, q.odds, fraction) });
  }
  return out.sort((a, b) => b.edge - a.edge);
}
