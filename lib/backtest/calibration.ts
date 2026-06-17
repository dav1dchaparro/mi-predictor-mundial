// Validación por CALIBRACIÓN (tesis Millassón, pto. 4: "curvas de calibración
// para asegurar que el modelo sea estadísticamente sólido"). Un modelo está bien
// calibrado si, de todas las veces que dice "30%", el evento ocurre ~30% de las
// veces. Mide:
//   - Reliability bins: prob. predicha promedio vs frecuencia observada por bin.
//   - Brier score (multiclase 1X2): error cuadrático medio de las probabilidades.
//   - Sesgo de empate: prob. media de empate del modelo vs frecuencia real de
//     empates (revela si el modelo sobreestima los X, como sugiere el Kelly).

export type Outcome = "home" | "draw" | "away";

export interface CalibrationPoint {
  probs: { home: number; draw: number; away: number };
  realOutcome: Outcome;
}

export interface ReliabilityBin {
  lo: number; // límite inferior del bin (ej. 0.3)
  hi: number;
  count: number; // cuántas predicciones cayeron acá
  meanPred: number; // prob. predicha promedio en el bin
  observed: number; // frecuencia observada de acierto en el bin
}

export interface CalibrationResult {
  n: number; // nº de predicciones individuales (3 por partido: home/draw/away)
  brier: number; // 0 = perfecto; menor es mejor. (azar 1X2 ≈ 0.22)
  bins: ReliabilityBin[];
  /** sesgo de empate: media P(empate) del modelo − frecuencia real de empates. */
  drawBias: number;
  meanDrawProb: number;
  drawRate: number;
}

/**
 * Calibración multiclase. Cada partido aporta 3 pares (prob, ocurrió?) — uno por
 * resultado — a los bins, y un término al Brier. `bins` controla la granularidad.
 */
export function calibration(points: CalibrationPoint[], bins = 10): CalibrationResult {
  const edges = Array.from({ length: bins + 1 }, (_, i) => i / bins);
  const acc = edges.slice(0, -1).map((lo, i) => ({ lo, hi: edges[i + 1]!, sumPred: 0, sumObs: 0, count: 0 }));

  let brierSum = 0;
  let drawProbSum = 0;
  let draws = 0;

  for (const pt of points) {
    drawProbSum += pt.probs.draw;
    if (pt.realOutcome === "draw") draws++;
    for (const oc of ["home", "draw", "away"] as Outcome[]) {
      const p = pt.probs[oc];
      const y = pt.realOutcome === oc ? 1 : 0;
      brierSum += (p - y) ** 2;
      // bin (el último incluye 1.0)
      let bi = Math.floor(p * bins);
      if (bi >= bins) bi = bins - 1;
      acc[bi]!.sumPred += p;
      acc[bi]!.sumObs += y;
      acc[bi]!.count++;
    }
  }

  const n = points.length;
  return {
    n,
    brier: brierSum / (n * 3),
    bins: acc.map((b) => ({
      lo: b.lo, hi: b.hi, count: b.count,
      meanPred: b.count ? b.sumPred / b.count : 0,
      observed: b.count ? b.sumObs / b.count : 0,
    })),
    meanDrawProb: drawProbSum / n,
    drawRate: draws / n,
    drawBias: drawProbSum / n - draws / n,
  };
}
