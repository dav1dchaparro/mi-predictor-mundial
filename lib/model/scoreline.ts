// Estrategias para elegir UN marcador a jugar a partir de la matriz de
// probabilidades. No hay una "correcta": cada una optimiza algo distinto y el
// reglamento de la polla decide cuál conviene. Diagnóstico que motivó esto: el
// EV-óptimo, con Dixon-Coles fuerte, colapsaba a 1-0/0-1 y predecía ~1.2 goles/pp
// cuando el modelo espera ~2.55 — siempre cortísimo en goles. Ver scripts/strategies.ts.

import type { ScoreMatrix } from "./poisson.js";
import { optimalPick, type PollaRules } from "./polla.js";

export type ScorelineStrategy =
  | "goles-esperados" // round(λH)-round(λA): marcador realista, casa con los goles esperados
  | "ev-optimo"       // maximiza puntos esperados de la polla (tiende a 1-0/0-1)
  | "mas-probable"    // moda de la matriz (tiende a 1-1 por Dixon-Coles)
  | "condicional-1x2"; // resultado 1X2 más probable y, dentro de él, la moda

export interface ScorePick {
  home: number;
  away: number;
  /** probabilidad exacta de ese marcador según la matriz. */
  prob: number;
}

export const STRATEGY_LABELS: Record<ScorelineStrategy, string> = {
  "goles-esperados": "Goles esperados",
  "ev-optimo": "EV-óptimo",
  "mas-probable": "Más probable",
  "condicional-1x2": "Condicional al 1X2",
};

/** Estrategia recomendada por defecto. "Goles esperados" deja de lowballear:
 *  predice marcadores 2-1/1-1/1-2 alineados con los goles que el modelo espera. */
export const DEFAULT_STRATEGY: ScorelineStrategy = "goles-esperados";

const prob = (sm: ScoreMatrix, h: number, a: number) =>
  sm.matrix[h]?.[a] ?? 0;

/** Moda global de la matriz (marcador más probable). */
function modalScore(sm: ScoreMatrix): ScorePick {
  let bh = 0, ba = 0, bp = -1;
  for (let h = 0; h <= sm.maxGoals; h++)
    for (let a = 0; a <= sm.maxGoals; a++)
      if (sm.matrix[h]![a]! > bp) { bp = sm.matrix[h]![a]!; bh = h; ba = a; }
  return { home: bh, away: ba, prob: bp };
}

function outcomeProbs(sm: ScoreMatrix): { hw: number; dr: number; aw: number } {
  let hw = 0, dr = 0, aw = 0;
  for (let h = 0; h <= sm.maxGoals; h++)
    for (let a = 0; a <= sm.maxGoals; a++) {
      const p = sm.matrix[h]![a]!;
      if (h > a) hw += p; else if (h === a) dr += p; else aw += p;
    }
  return { hw, dr, aw };
}

/** Resultado 1X2 más probable y, dentro de ese resultado, la celda modal. */
function conditionalScore(sm: ScoreMatrix): ScorePick {
  const { hw, dr, aw } = outcomeProbs(sm);
  const want = hw >= dr && hw >= aw ? 1 : dr >= aw ? 0 : -1;
  let bh = 0, ba = 0, bp = -1;
  for (let h = 0; h <= sm.maxGoals; h++)
    for (let a = 0; a <= sm.maxGoals; a++) {
      const o = h > a ? 1 : h === a ? 0 : -1;
      if (o !== want) continue;
      if (sm.matrix[h]![a]! > bp) { bp = sm.matrix[h]![a]!; bh = h; ba = a; }
    }
  return { home: bh, away: ba, prob: bp };
}

/** Goles esperados redondeados: round(λ) por equipo, acotado a [0, maxGoals]. */
function expectedGoalsScore(sm: ScoreMatrix): ScorePick {
  const clamp = (x: number) => Math.min(Math.max(Math.round(x), 0), sm.maxGoals);
  const h = clamp(sm.lambdaHome);
  const a = clamp(sm.lambdaAway);
  return { home: h, away: a, prob: prob(sm, h, a) };
}

/** Elige el marcador según la estrategia indicada. */
export function pickScoreline(
  sm: ScoreMatrix,
  rules: PollaRules,
  strategy: ScorelineStrategy = DEFAULT_STRATEGY,
): ScorePick {
  switch (strategy) {
    case "ev-optimo": {
      const { best } = optimalPick(sm, rules);
      return { home: best.home, away: best.away, prob: best.exactProb };
    }
    case "mas-probable":
      return modalScore(sm);
    case "condicional-1x2":
      return conditionalScore(sm);
    case "goles-esperados":
    default:
      return expectedGoalsScore(sm);
  }
}

/** Todas las estrategias a la vez (para mostrar el menú comparativo en la UI). */
export function allScorelines(
  sm: ScoreMatrix,
  rules: PollaRules,
): Record<ScorelineStrategy, ScorePick> {
  return {
    "goles-esperados": pickScoreline(sm, rules, "goles-esperados"),
    "ev-optimo": pickScoreline(sm, rules, "ev-optimo"),
    "mas-probable": pickScoreline(sm, rules, "mas-probable"),
    "condicional-1x2": pickScoreline(sm, rules, "condicional-1x2"),
  };
}
