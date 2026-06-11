// Resumen de validación: corre los tres backtests y agrega métricas, para
// mostrar la precisión real del modelo dentro de la app (no solo en un script).

import { runBacktest } from "./run.js";
import { QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022 } from "./qatar2022.js";
import { EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO } from "./euro2024.js";
import { WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018 } from "./wc2018.js";

export interface TournamentSummary {
  name: string;
  matches: number;
  rate1X2: number;
  rateExact: number;
  pollaPoints: number;
  pollaMax: number;
}

export interface ValidationSummary {
  tournaments: TournamentSummary[];
  total: number;
  rate1X2: number;
  rateExact: number;
  /** error estándar binomial del 1X2 (honestidad estadística). */
  se1X2: number;
  pollaPoints: number;
  pollaMax: number;
  /** desglose decisivos vs empates: de dónde sale (y se topa) la precisión. */
  decisiveHit: number;
  decisiveTotal: number;
  drawTotal: number;
}

export function getValidationSummary(): ValidationSummary {
  const runs = [
    { name: "Rusia 2018", r: runBacktest(WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018) },
    { name: "Qatar 2022", r: runBacktest(QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022) },
    { name: "Euro 2024", r: runBacktest(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO) },
  ];

  const tournaments: TournamentSummary[] = runs.map(({ name, r }) => ({
    name,
    matches: r.matches,
    rate1X2: r.rate1X2,
    rateExact: r.rateExact,
    pollaPoints: r.pollaPoints,
    pollaMax: r.pollaMax,
  }));

  const total = runs.reduce((s, x) => s + x.r.matches, 0);
  const hit1X2 = runs.reduce((s, x) => s + x.r.hit1X2, 0);
  const hitExact = runs.reduce((s, x) => s + x.r.hitExact, 0);
  const pollaPoints = runs.reduce((s, x) => s + x.r.pollaPoints, 0);
  const pollaMax = runs.reduce((s, x) => s + x.r.pollaMax, 0);

  // desglose decisivos vs empates a partir del detalle
  let decisiveHit = 0, decisiveTotal = 0, drawTotal = 0;
  for (const { r } of runs) {
    for (const d of r.details) {
      const isDraw = d.real.split("-")[0] === d.real.split("-")[1];
      if (isDraw) drawTotal++;
      else {
        decisiveTotal++;
        if (d.hit1X2) decisiveHit++;
      }
    }
  }

  const p = hit1X2 / total;
  return {
    tournaments,
    total,
    rate1X2: p,
    rateExact: hitExact / total,
    se1X2: Math.sqrt((p * (1 - p)) / total),
    pollaPoints,
    pollaMax,
    decisiveHit,
    decisiveTotal,
    drawTotal,
  };
}
