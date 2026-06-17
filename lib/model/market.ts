// Anclar el modelo al mercado de apuestas. Las cuotas de las casas incorporan
// lesiones, alineaciones y contexto que el modelo no ve. Invertimos las cuotas
// para extraer los goles esperados "implícitos del mercado" y los promediamos
// con los del modelo (ensamble), que la literatura muestra superior a uno solo.

import { poissonPmf, buildScoreMatrix } from "./poisson.js";
import { result1X2 } from "./markets.js";

export interface Odds1X2 {
  home: number; // cuota decimal (ej. 2.10)
  draw: number;
  away: number;
}

export interface OverUnderOdds {
  line: number; // ej. 2.5
  over: number; // cuota decimal
  under: number;
}

/**
 * Devig MULTIPLICATIVO (normalización proporcional): reparte el margen en
 * proporción a las inversas. Es el método más simple pero, según la literatura
 * (Štrumbelj 2014; Clarke 2017), el MENOS preciso: infla los favoritos extremos
 * (favourite-longshot bias). Se conserva como referencia y fallback.
 */
export function devigMultiplicative(prices: number[]): number[] {
  const inv = prices.map((p) => 1 / p);
  const sum = inv.reduce((s, x) => s + x, 0);
  return inv.map((x) => x / sum);
}

/**
 * Devig por el MÉTODO DE SHIN. Modela el margen como la presencia de una
 * proporción `z` de apostadores informados ("insiders"); resolver z reparte el
 * overround de forma que castiga más a los favoritos y menos a los longshots,
 * quedando mejor calibrado que el multiplicativo en casi todas las casas
 * (Štrumbelj 2014; Clarke et al. 2017 — Shin es el mejor para Pinnacle/bet365).
 *
 * Para precios crudos π_i = 1/o_i con B = Σπ_i (>1), la prob. justa es
 *   p_i(z) = (√(z² + 4(1−z)·π_i²/B) − z) / (2(1−z))
 * y se busca z ∈ [0,1) tal que Σ p_i(z) = 1 (Σ es decreciente en z).
 */
export function devigShin(prices: number[]): number[] {
  const pi = prices.map((p) => 1 / p);
  const B = pi.reduce((s, x) => s + x, 0);
  if (!(B > 1)) return pi.slice(); // sin margen (o degenerado): nada que quitar
  const probs = (z: number) =>
    pi.map((x) => (Math.sqrt(z * z + 4 * (1 - z) * (x * x) / B) - z) / (2 * (1 - z)));
  const sumAt = (z: number) => probs(z).reduce((s, x) => s + x, 0);
  // Σ(0) = √B > 1 ; Σ crece-decrece monótona en z -> bisección hacia Σ=1.
  let lo = 0;
  let hi = 0.5;
  while (sumAt(hi) > 1 && hi < 0.999) hi = (hi + 1) / 2; // asegura el cruce
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (sumAt(mid) > 1) lo = mid;
    else hi = mid;
  }
  const z = (lo + hi) / 2;
  const p = probs(z);
  const s = p.reduce((a, x) => a + x, 0);
  return p.map((x) => x / s); // renormaliza por seguridad numérica
}

/**
 * Quita el margen de la casa (overround) y devuelve probabilidades justas 1X2.
 * Usa Shin por defecto (mejor calibrado); `multiplicative` para el método simple.
 */
export function fairProbs1X2(
  odds: Odds1X2,
  method: "shin" | "multiplicative" = "shin",
): { home: number; draw: number; away: number } {
  const devig = method === "shin" ? devigShin : devigMultiplicative;
  const [home, draw, away] = devig([odds.home, odds.draw, odds.away]);
  return { home: home!, draw: draw!, away: away! };
}

function fairTwoWay(over: number, under: number): { over: number; under: number } {
  const [o, u] = devigShin([over, under]);
  return { over: o!, under: u! };
}

/** P(total de goles > line) bajo Poisson(lambdaTotal). */
function pOver(lambdaTotal: number, line: number): number {
  let under = 0;
  for (let k = 0; k <= Math.floor(line); k++) under += poissonPmf(k, lambdaTotal);
  return 1 - under;
}

/**
 * Resuelve el total de goles esperado (lambdaTotal) que reproduce la P(over) del
 * mercado, por bisección. El total de dos Poisson independientes es Poisson.
 */
export function totalGoalsFromOverUnder(ou: OverUnderOdds): number {
  const target = fairTwoWay(ou.over, ou.under).over;
  let lo = 0.1;
  let hi = 6.0;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (pOver(mid, ou.line) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export interface MarketLambdas {
  lambdaHome: number;
  lambdaAway: number;
  lambdaTotal: number;
}

/**
 * Lambdas implícitos del mercado: el total sale del over/under y el reparto
 * local/visitante se busca para reproducir el cociente 1X2 justo.
 */
export function marketLambdas(odds: Odds1X2, ou: OverUnderOdds): MarketLambdas {
  const lambdaTotal = totalGoalsFromOverUnder(ou);
  const fair = fairProbs1X2(odds);
  const targetHomeShare = fair.home / (fair.home + fair.away); // ignora empate

  // búsqueda del reparto que iguala la cuota de victoria local/visitante.
  let bestH = lambdaTotal / 2;
  let bestErr = Infinity;
  for (let lh = 0.05; lh < lambdaTotal; lh += 0.02) {
    const la = lambdaTotal - lh;
    const r = result1X2(buildScoreMatrix(lh, la, { rho: -0.06, maxGoals: 8 }));
    const share = r.home / (r.home + r.away);
    const err = Math.abs(share - targetHomeShare);
    if (err < bestErr) {
      bestErr = err;
      bestH = lh;
    }
  }
  return { lambdaHome: bestH, lambdaAway: lambdaTotal - bestH, lambdaTotal };
}

/**
 * Anclaje SOLO de resultado: cuando hay cuotas 1X2 pero no Over/Under, se mantiene
 * el total de goles del modelo y se re-reparte entre local/visitante para
 * reproducir el 1X2 del mercado. Útil con las cuotas de la página de liga.
 */
export function anchorResultLambdas(modelTotal: number, odds: Odds1X2): { lambdaHome: number; lambdaAway: number } {
  const fair = fairProbs1X2(odds);
  const targetHomeShare = fair.home / (fair.home + fair.away);
  let bestH = modelTotal / 2;
  let bestErr = Infinity;
  for (let lh = 0.05; lh < modelTotal; lh += 0.02) {
    const la = modelTotal - lh;
    const r = result1X2(buildScoreMatrix(lh, la, { rho: -0.14, maxGoals: 8 }));
    const share = r.home / (r.home + r.away);
    const err = Math.abs(share - targetHomeShare);
    if (err < bestErr) { bestErr = err; bestH = lh; }
  }
  return { lambdaHome: bestH, lambdaAway: modelTotal - bestH };
}

/**
 * Ensamble: promedio ponderado entre los lambdas del modelo y los del mercado.
 * weight = peso del mercado en [0,1]. 0.5 = mitad y mitad.
 */
export function blendLambdas(
  model: { lambdaHome: number; lambdaAway: number },
  market: { lambdaHome: number; lambdaAway: number },
  weight = 0.5,
): { lambdaHome: number; lambdaAway: number } {
  const w = Math.min(Math.max(weight, 0), 1);
  return {
    lambdaHome: model.lambdaHome * (1 - w) + market.lambdaHome * w,
    lambdaAway: model.lambdaAway * (1 - w) + market.lambdaAway * w,
  };
}
