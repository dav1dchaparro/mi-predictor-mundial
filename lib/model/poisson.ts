// Núcleo del modelo: matriz de probabilidad de marcadores.
// Poisson base + corrección Dixon-Coles (sube la frecuencia de marcadores bajos
// 0-0, 1-0, 0-1, 1-1, que es justo donde el Poisson simple falla en mundiales).

/** Probabilidad de marcar exactamente k goles con media lambda (Poisson). */
export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  // exp(-lambda) * lambda^k / k!  calculado en log para evitar overflow.
  let logP = -lambda + k * Math.log(lambda);
  for (let i = 2; i <= k; i++) logP -= Math.log(i);
  return Math.exp(logP);
}

/**
 * Factor de corrección Dixon-Coles (tau) para los cuatro marcadores bajos.
 * rho < 0 sube empates 0-0 / 1-1 y baja 1-0 / 0-1, replicando lo observado.
 */
export function dixonColesTau(
  homeGoals: number,
  awayGoals: number,
  lambdaHome: number,
  lambdaAway: number,
  rho: number,
): number {
  if (homeGoals === 0 && awayGoals === 0) return 1 - lambdaHome * lambdaAway * rho;
  if (homeGoals === 0 && awayGoals === 1) return 1 + lambdaHome * rho;
  if (homeGoals === 1 && awayGoals === 0) return 1 + lambdaAway * rho;
  if (homeGoals === 1 && awayGoals === 1) return 1 - rho;
  return 1;
}

export interface ScoreMatrix {
  /** matrix[h][a] = probabilidad de marcador h-a (local h, visitante a). */
  matrix: number[][];
  maxGoals: number;
  lambdaHome: number;
  lambdaAway: number;
}

export interface ScoreMatrixOptions {
  /** goles máximos por equipo a modelar. 8 cubre >99.9% de la masa. */
  maxGoals?: number;
  /** parámetro Dixon-Coles. Típico [-0.15, -0.03]. 0 = Poisson puro. */
  rho?: number;
}

/**
 * Construye la matriz de marcadores a partir de los goles esperados de cada equipo.
 * Aplica Dixon-Coles y renormaliza para que la matriz sume 1.
 */
export function buildScoreMatrix(
  lambdaHome: number,
  lambdaAway: number,
  opts: ScoreMatrixOptions = {},
): ScoreMatrix {
  const maxGoals = opts.maxGoals ?? 8;
  const rho = opts.rho ?? -0.05;

  const matrix: number[][] = [];
  let total = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    const ph = poissonPmf(h, lambdaHome);
    for (let a = 0; a <= maxGoals; a++) {
      const pa = poissonPmf(a, lambdaAway);
      const tau = dixonColesTau(h, a, lambdaHome, lambdaAway, rho);
      const p = ph * pa * Math.max(0, tau); // tau no puede volver la prob negativa
      row.push(p);
      total += p;
    }
    matrix.push(row);
  }

  // Renormalizar: Dixon-Coles y el truncado en maxGoals rompen la suma a 1.
  if (total > 0) {
    for (let h = 0; h <= maxGoals; h++) {
      for (let a = 0; a <= maxGoals; a++) {
        matrix[h]![a]! /= total;
      }
    }
  }

  return { matrix, maxGoals, lambdaHome, lambdaAway };
}
