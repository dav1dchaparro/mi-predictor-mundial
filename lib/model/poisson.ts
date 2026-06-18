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

/** log(k!) por suma directa (k chico: goles). */
function logFactorial(k: number): number {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
}

/**
 * Peso NO normalizado de k goles bajo Conway-Maxwell-Poisson: w_k = λ^k / (k!)^ν.
 * ν=1 recupera Poisson (salvo la constante e^{-λ}, que se cancela al renormalizar
 * la matriz). ν<1 = sobredispersión (cola más pesada), ν>1 = sub-dispersión
 * (más concentrado). Permite ajustar la dispersión de goles que el Poisson fija.
 */
export function cmpWeight(k: number, lambda: number, nu: number): number {
  if (k < 0) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(k * Math.log(lambda) - nu * logFactorial(k));
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
  /** dispersión Conway-Maxwell-Poisson. 1 = Poisson; <1 sobredisp.; >1 sub-disp. */
  nu?: number;
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
  const nu = opts.nu ?? 1;

  // Marginales (pesos no normalizados): Poisson si nu=1, CMP si no.
  const wh = Array.from({ length: maxGoals + 1 }, (_, k) => cmpWeight(k, lambdaHome, nu));
  const wa = Array.from({ length: maxGoals + 1 }, (_, k) => cmpWeight(k, lambdaAway, nu));

  const matrix: number[][] = [];
  let total = 0;

  for (let h = 0; h <= maxGoals; h++) {
    const row: number[] = [];
    const ph = wh[h]!;
    for (let a = 0; a <= maxGoals; a++) {
      const pa = wa[a]!;
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
