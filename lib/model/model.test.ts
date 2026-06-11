import { describe, it, expect } from "vitest";
import { buildScoreMatrix, poissonPmf } from "./poisson.js";
import { result1X2, deriveAllMarkets, overUnder, topExactScores, bttsYes } from "./markets.js";
import { optimalPick, expectedPoints } from "./polla.js";
import { computeLambdas } from "./lambda.js";

const sum = (m: number[][]) => m.flat().reduce((a, b) => a + b, 0);

describe("poisson", () => {
  it("pmf de una distribución suma ~1", () => {
    let total = 0;
    for (let k = 0; k <= 20; k++) total += poissonPmf(k, 1.5);
    expect(total).toBeCloseTo(1, 5);
  });

  it("la matriz de marcadores está normalizada a 1", () => {
    const sm = buildScoreMatrix(1.6, 1.1);
    expect(sum(sm.matrix)).toBeCloseTo(1, 6);
  });

  it("Dixon-Coles sube la probabilidad del 0-0 frente al Poisson puro", () => {
    const dc = buildScoreMatrix(1.2, 1.2, { rho: -0.1 });
    const pure = buildScoreMatrix(1.2, 1.2, { rho: 0 });
    expect(dc.matrix[0]![0]!).toBeGreaterThan(pure.matrix[0]![0]!);
  });
});

describe("markets", () => {
  it("1X2 suma 1 y el favorito local gana más probabilidad", () => {
    const sm = buildScoreMatrix(2.0, 0.8);
    const r = result1X2(sm);
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 6);
    expect(r.home).toBeGreaterThan(r.away);
  });

  it("over y under suman 1", () => {
    const sm = buildScoreMatrix(1.4, 1.2);
    const ou = overUnder(sm, 2.5);
    expect(ou.over + ou.under).toBeCloseTo(1, 6);
  });

  it("top scores está ordenado descendente", () => {
    const sm = buildScoreMatrix(1.5, 1.3);
    const top = topExactScores(sm, 5);
    for (let i = 1; i < top.length; i++) {
      expect(top[i]!.prob).toBeLessThanOrEqual(top[i - 1]!.prob);
    }
  });

  it("BTTS sube con lambdas altos", () => {
    expect(bttsYes(buildScoreMatrix(2, 2))).toBeGreaterThan(bttsYes(buildScoreMatrix(0.7, 0.7)));
  });

  it("deriveAllMarkets entrega todos los mercados", () => {
    const all = deriveAllMarkets(buildScoreMatrix(1.5, 1.2));
    expect(all.overUnder).toHaveLength(3);
    expect(all.topScores).toHaveLength(5);
  });
});

describe("polla optimizer", () => {
  it("el pick óptimo puede diferir del marcador más probable", () => {
    const sm = buildScoreMatrix(1.7, 1.2);
    const rules = { exactScore: 5, correctResult: 2 };
    const { best } = optimalPick(sm, rules);
    const mostLikely = topExactScores(sm, 1)[0]!;
    // El óptimo nunca tiene menos puntos esperados que el más probable.
    const epMostLikely = expectedPoints(sm, mostLikely.home, mostLikely.away, rules);
    expect(best.expectedPoints).toBeGreaterThanOrEqual(epMostLikely);
  });

  it("con solo puntos por exacto, el óptimo ES el más probable", () => {
    const sm = buildScoreMatrix(1.4, 1.1);
    const { best } = optimalPick(sm, { exactScore: 5, correctResult: 0 });
    const mostLikely = topExactScores(sm, 1)[0]!;
    expect(best.home).toBe(mostLikely.home);
    expect(best.away).toBe(mostLikely.away);
  });
});

describe("lambda", () => {
  it("un equipo más fuerte genera mayor lambda", () => {
    const fuerte = { name: "A", attack: 1.4, defense: 0.8 };
    const debil = { name: "B", attack: 0.8, defense: 1.3 };
    const { lambdaHome, lambdaAway } = computeLambdas({ home: fuerte, away: debil });
    expect(lambdaHome).toBeGreaterThan(lambdaAway);
  });

  it("la altitud reduce los goles esperados", () => {
    const t = { name: "X", attack: 1, defense: 1 };
    const base = computeLambdas({ home: t, away: t });
    const altura = computeLambdas({ home: t, away: t, venue: { altitudeMeters: 2240 } });
    expect(altura.lambdaHome).toBeLessThan(base.lambdaHome);
  });
});
