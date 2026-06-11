// La mejora de mayor impacto según la investigación: no elegir el marcador MÁS
// PROBABLE, sino el que maximiza los puntos esperados bajo el reglamento de TU
// polla. A veces conviene apostar 2-1 en vez de 1-0 porque "cubre" mejor.

import type { ScoreMatrix } from "./poisson.js";

export interface PollaRules {
  /** puntos por acertar el marcador exacto. */
  exactScore: number;
  /** puntos por acertar solo el resultado 1X2 (sin el marcador exacto). */
  correctResult: number;
  /** puntos extra por acertar la diferencia de goles (opcional). */
  goalDifference?: number;
}

export interface PollaPick {
  home: number;
  away: number;
  expectedPoints: number;
  /** probabilidad de clavar el marcador exacto de este pick. */
  exactProb: number;
}

function outcome(h: number, a: number): -1 | 0 | 1 {
  return h > a ? 1 : h === a ? 0 : -1;
}

/**
 * Calcula los puntos esperados de apostar (pickH, pickA) integrando sobre toda
 * la matriz de resultados reales posibles.
 */
export function expectedPoints(
  sm: ScoreMatrix,
  pickH: number,
  pickA: number,
  rules: PollaRules,
): number {
  const pickOutcome = outcome(pickH, pickA);
  const pickDiff = pickH - pickA;
  let ep = 0;

  for (let h = 0; h <= sm.maxGoals; h++) {
    for (let a = 0; a <= sm.maxGoals; a++) {
      const p = sm.matrix[h]![a]!;
      if (p === 0) continue;

      if (h === pickH && a === pickA) {
        // Marcador exacto incluye resultado y diferencia: se lleva el máximo.
        let pts = rules.exactScore;
        ep += p * pts;
        continue;
      }
      let pts = 0;
      if (outcome(h, a) === pickOutcome) pts += rules.correctResult;
      if (rules.goalDifference && h - a === pickDiff && pickDiff !== 0) {
        pts += rules.goalDifference;
      }
      ep += p * pts;
    }
  }
  return ep;
}

/**
 * Devuelve el pick óptimo (máximos puntos esperados) y el ranking completo de
 * candidatos para poder mostrar el porqué en la UI.
 */
export function optimalPick(sm: ScoreMatrix, rules: PollaRules): {
  best: PollaPick;
  ranking: PollaPick[];
} {
  const picks: PollaPick[] = [];
  for (let h = 0; h <= sm.maxGoals; h++) {
    for (let a = 0; a <= sm.maxGoals; a++) {
      picks.push({
        home: h,
        away: a,
        expectedPoints: expectedPoints(sm, h, a, rules),
        exactProb: sm.matrix[h]![a]!,
      });
    }
  }
  picks.sort((x, y) => y.expectedPoints - x.expectedPoints);
  return { best: picks[0]!, ranking: picks.slice(0, 10) };
}
