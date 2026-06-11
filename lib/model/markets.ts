// Todos los mercados se derivan de la matriz de marcadores: una sola fuente de
// verdad, por lo que las probabilidades siempre son coherentes entre sí.

import type { ScoreMatrix } from "./poisson.js";

export interface Market1X2 {
  home: number; // gana local
  draw: number; // empate
  away: number; // gana visitante
}

export interface DoubleChance {
  homeOrDraw: number; // 1X
  homeOrAway: number; // 12
  drawOrAway: number; // X2
}

export interface ExactScore {
  home: number;
  away: number;
  prob: number;
}

export interface OverUnder {
  line: number;
  over: number;
  under: number;
}

function forEachCell(sm: ScoreMatrix, fn: (h: number, a: number, p: number) => void) {
  for (let h = 0; h <= sm.maxGoals; h++) {
    for (let a = 0; a <= sm.maxGoals; a++) {
      fn(h, a, sm.matrix[h]![a]!);
    }
  }
}

export function result1X2(sm: ScoreMatrix): Market1X2 {
  let home = 0, draw = 0, away = 0;
  forEachCell(sm, (h, a, p) => {
    if (h > a) home += p;
    else if (h === a) draw += p;
    else away += p;
  });
  return { home, draw, away };
}

export function doubleChance(sm: ScoreMatrix): DoubleChance {
  const r = result1X2(sm);
  return {
    homeOrDraw: r.home + r.draw,
    homeOrAway: r.home + r.away,
    drawOrAway: r.draw + r.away,
  };
}

export function bttsYes(sm: ScoreMatrix): number {
  let yes = 0;
  forEachCell(sm, (h, a, p) => {
    if (h > 0 && a > 0) yes += p;
  });
  return yes;
}

/** Over/Under para una línea .5 (sin push, ya que la línea es semientera). */
export function overUnder(sm: ScoreMatrix, line: number): OverUnder {
  let over = 0;
  forEachCell(sm, (h, a, p) => {
    if (h + a > line) over += p;
  });
  return { line, over, under: 1 - over };
}

/** Top-N marcadores exactos más probables, ordenados desc. */
export function topExactScores(sm: ScoreMatrix, n = 5): ExactScore[] {
  const all: ExactScore[] = [];
  forEachCell(sm, (h, a, p) => all.push({ home: h, away: a, prob: p }));
  all.sort((x, y) => y.prob - x.prob);
  return all.slice(0, n);
}

/** Probabilidad de que el local deje la portería a cero (clean sheet local). */
export function cleanSheetHome(sm: ScoreMatrix): number {
  let p = 0;
  forEachCell(sm, (h, a, prob) => {
    if (a === 0) p += prob;
  });
  return p;
}

export function cleanSheetAway(sm: ScoreMatrix): number {
  let p = 0;
  forEachCell(sm, (h, a, prob) => {
    if (h === 0) p += prob;
  });
  return p;
}

export interface AllMarkets {
  result: Market1X2;
  doubleChance: DoubleChance;
  bttsYes: number;
  overUnder: OverUnder[];
  topScores: ExactScore[];
  cleanSheet: { home: number; away: number };
}

/** Empaqueta todos los mercados de un partido a partir de la matriz. */
export function deriveAllMarkets(sm: ScoreMatrix): AllMarkets {
  return {
    result: result1X2(sm),
    doubleChance: doubleChance(sm),
    bttsYes: bttsYes(sm),
    overUnder: [1.5, 2.5, 3.5].map((l) => overUnder(sm, l)),
    topScores: topExactScores(sm, 5),
    cleanSheet: { home: cleanSheetHome(sm), away: cleanSheetAway(sm) },
  };
}
