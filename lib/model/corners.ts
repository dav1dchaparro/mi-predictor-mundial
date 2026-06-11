// Mercado de corners. Poisson sobre el total esperado, con línea DINÁMICA:
// se elige la línea semientera más cercana al total esperado, que es la más
// informativa (over/under ~50/50). Confianza media como las tarjetas.

import { poissonPmf } from "./poisson.js";

export interface CornersInput {
  /** corners promedio a favor del local en partidos recientes. */
  homeAvgCorners: number;
  awayAvgCorners: number;
  /** equipos dominantes generan más corners; multiplicador opcional. */
  dominanceMultiplier?: number;
}

export interface CornersMarket {
  expectedTotal: number;
  /** línea dinámica elegida cerca del total esperado. */
  mainLine: { line: number; over: number; under: number };
  /** líneas alternativas alrededor. */
  alternatives: { line: number; over: number; under: number }[];
  confidence: "alta" | "media" | "baja";
}

function overUnderAt(line: number, lambda: number) {
  let over = 0;
  for (let k = Math.ceil(line); k <= 30; k++) over += poissonPmf(k, lambda);
  return { line, over, under: 1 - over };
}

export function cornersMarket(inp: CornersInput): CornersMarket {
  const mult = inp.dominanceMultiplier ?? 1;
  const expectedTotal = (inp.homeAvgCorners + inp.awayAvgCorners) * mult;

  // línea dinámica: la .5 más cercana al total esperado.
  const mainLineValue = Math.round(expectedTotal) - 0.5;
  const mainLine = overUnderAt(mainLineValue, expectedTotal);
  const alternatives = [mainLineValue - 2, mainLineValue - 1, mainLineValue + 1, mainLineValue + 2]
    .filter((l) => l > 0)
    .map((l) => overUnderAt(l, expectedTotal));

  return { expectedTotal, mainLine, alternatives, confidence: "media" };
}
