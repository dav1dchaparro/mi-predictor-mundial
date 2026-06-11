import { describe, it, expect } from "vitest";
import { cardsMarket } from "./cards.js";
import { cornersMarket } from "./corners.js";
import { scorerMarket } from "./scorers.js";

describe("cards", () => {
  it("over/under suman 1 en cada línea", () => {
    const m = cardsMarket({ homeAvgCards: 2, awayAvgCards: 2.2 });
    for (const ou of m.overUnder) expect(ou.over + ou.under).toBeCloseTo(1, 6);
  });
  it("mayor intensidad sube las tarjetas esperadas y la prob de roja", () => {
    const normal = cardsMarket({ homeAvgCards: 2, awayAvgCards: 2 });
    const clasico = cardsMarket({ homeAvgCards: 2, awayAvgCards: 2, intensity: 1.5 });
    expect(clasico.expectedTotal).toBeGreaterThan(normal.expectedTotal);
    expect(clasico.redCardProb).toBeGreaterThan(normal.redCardProb);
  });
});

describe("corners", () => {
  it("la línea principal está cerca del total esperado", () => {
    const m = cornersMarket({ homeAvgCorners: 5.5, awayAvgCorners: 4.5 });
    expect(Math.abs(m.mainLine.line - m.expectedTotal)).toBeLessThanOrEqual(1);
    expect(m.mainLine.over + m.mainLine.under).toBeCloseTo(1, 6);
  });
});

describe("scorers", () => {
  const players = [
    { name: "Goleador", goalsPer90: 0.8, expectedMinutes: 90 },
    { name: "Mediocampo", goalsPer90: 0.2, expectedMinutes: 90 },
    { name: "Defensa", goalsPer90: 0.05, expectedMinutes: 90 },
  ];

  it("la suma de lambdas individuales conserva el lambda del equipo", () => {
    const teamLambda = 1.8;
    const m = scorerMarket(teamLambda, players);
    const sum = m.reduce((s, p) => s + p.lambda, 0);
    expect(sum).toBeCloseTo(teamLambda, 6);
  });

  it("el delantero es el favorito a goleador en cualquier momento", () => {
    const m = scorerMarket(1.8, players);
    expect(m[0]!.name).toBe("Goleador");
    expect(m[0]!.anytime).toBeGreaterThan(m[1]!.anytime);
  });

  it("toda probabilidad está en [0,1]", () => {
    const m = scorerMarket(1.8, players);
    for (const p of m) {
      expect(p.anytime).toBeGreaterThanOrEqual(0);
      expect(p.anytime).toBeLessThanOrEqual(1);
      expect(p.firstScorer).toBeGreaterThanOrEqual(0);
      expect(p.firstScorer).toBeLessThanOrEqual(1);
    }
  });
});
