// Mercado de tarjetas. Poisson sobre el total esperado de tarjetas del partido,
// ajustado por intensidad (rivalidad, peso del partido, árbitro estricto).
// La investigación marca este mercado como de MENOR confianza que los goles.

import { poissonPmf } from "./poisson.js";

export interface CardsInput {
  /** tarjetas promedio del equipo local (recibidas) en partidos recientes. */
  homeAvgCards: number;
  awayAvgCards: number;
  /** multiplicador de intensidad. 1.0 normal, >1 clásico/eliminatoria. */
  intensity?: number;
}

export interface CardsMarket {
  expectedTotal: number;
  /** over/under para una línea semientera (ej. 3.5). */
  overUnder: { line: number; over: number; under: number }[];
  /** probabilidad de al menos una tarjeta roja en el partido. */
  redCardProb: number;
  /** confianza del mercado: tarjetas es ruidoso -> "media". */
  confidence: "alta" | "media" | "baja";
}

export function cardsMarket(inp: CardsInput): CardsMarket {
  const intensity = inp.intensity ?? 1;
  const expectedTotal = (inp.homeAvgCards + inp.awayAvgCards) * intensity;

  const overUnder = [2.5, 3.5, 4.5, 5.5].map((line) => {
    let over = 0;
    // sumar P(k) para k > line, truncando en un máximo razonable.
    for (let k = Math.ceil(line); k <= 15; k++) over += poissonPmf(k, expectedTotal);
    return { line, over, under: 1 - over };
  });

  // ~1 de cada 12 tarjetas es roja como heurística; prob de >=1 roja vía Poisson.
  const lambdaRed = expectedTotal / 12;
  const redCardProb = 1 - poissonPmf(0, lambdaRed);

  return { expectedTotal, overUnder, redCardProb, confidence: "media" };
}
