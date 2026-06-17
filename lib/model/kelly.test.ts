import { describe, it, expect } from "vitest";
import { kellyFraction, valueBets } from "./kelly.js";

describe("Kelly / value betting", () => {
  it("sin valor (prob igual a la implícita) => fracción 0", () => {
    // cuota 2.0 implica 50%; con p=0.5 no hay edge.
    expect(kellyFraction(0.5, 2.0)).toBeCloseTo(0, 6);
  });

  it("con valor => fracción positiva y conocida", () => {
    // p=0.6, cuota 2.0 (b=1): f* = (1*0.6 - 0.4)/1 = 0.2
    expect(kellyFraction(0.6, 2.0)).toBeCloseTo(0.2, 6);
  });

  it("Kelly fraccional escala la apuesta", () => {
    expect(kellyFraction(0.6, 2.0, 0.5)).toBeCloseTo(0.1, 6);
  });

  it("prob menor que la implícita => 0 (no apostar contra el valor)", () => {
    expect(kellyFraction(0.4, 2.0)).toBe(0);
  });

  it("valueBets detecta solo los resultados con edge suficiente", () => {
    // modelo cree más en el local que la cuota: edge = 0.55*2.2 - 1 = 0.21
    const bets = valueBets(
      { home: 0.55, draw: 0.25, away: 0.20 },
      { home: { odds: 2.2, book: "betano" }, draw: { odds: 3.4 }, away: { odds: 4.0 } },
      { minEdge: 0.05, fraction: 0.5 },
    );
    expect(bets).toHaveLength(1);
    expect(bets[0]!.outcome).toBe("home");
    expect(bets[0]!.book).toBe("betano");
    expect(bets[0]!.edge).toBeCloseTo(0.21, 6);
    expect(bets[0]!.kelly).toBeGreaterThan(0);
  });

  it("ordena por edge descendente", () => {
    const bets = valueBets(
      { home: 0.5, draw: 0.3, away: 0.2 },
      { home: { odds: 2.4 }, draw: { odds: 4.0 }, away: { odds: 1.5 } },
      { minEdge: 0.05 },
    );
    // home edge 0.2, draw edge 0.2 -> ambos pasan; away 0.2*1.5-1=-0.7 fuera
    expect(bets.every((b) => b.edge >= 0.05)).toBe(true);
    for (let i = 1; i < bets.length; i++) expect(bets[i - 1]!.edge).toBeGreaterThanOrEqual(bets[i]!.edge);
  });
});
