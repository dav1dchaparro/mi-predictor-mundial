import { describe, it, expect } from "vitest";
import { fitDixonColes, timeDecayWeight, dcTau, type FitMatch } from "./fit.js";

describe("time decay", () => {
  it("w(0)=1 y decae monótonamente", () => {
    expect(timeDecayWeight(0, 0.01)).toBeCloseTo(1, 9);
    expect(timeDecayWeight(100, 0.01)).toBeLessThan(timeDecayWeight(10, 0.01));
  });
  it("ξ=0 anula el decay (todo pesa 1)", () => {
    expect(timeDecayWeight(9999, 0)).toBe(1);
  });
});

describe("Dixon-Coles τ", () => {
  it("ρ<0 sube 0-0 y 1-1, baja 1-0 y 0-1", () => {
    const lh = 1.2, la = 1.0, rho = -0.14;
    expect(dcTau(0, 0, lh, la, rho)).toBeGreaterThan(1);
    expect(dcTau(1, 1, lh, la, rho)).toBeGreaterThan(1);
    expect(dcTau(1, 0, lh, la, rho)).toBeLessThan(1);
    expect(dcTau(2, 2, lh, la, rho)).toBe(1); // fuera de la corrección
  });
});

// Genera un round-robin repetido con resultados fijos (determinista).
function dataset(results: [string, string, number, number][], daysAgo = 10): FitMatch[] {
  return results.map(([home, away, hg, ag]) => ({ home, away, homeGoals: hg, awayGoals: ag, daysAgo }));
}

describe("fitDixonColes (MLE)", () => {
  it("recupera que el equipo fuerte ataca más y defiende mejor", () => {
    // Fuerte golea, Débil es goleado, Medio en el medio. Repetido para señal.
    const base: [string, string, number, number][] = [
      ["Fuerte", "Medio", 3, 0], ["Fuerte", "Debil", 4, 0], ["Medio", "Debil", 2, 0],
      ["Medio", "Fuerte", 0, 2], ["Debil", "Fuerte", 0, 3], ["Debil", "Medio", 0, 2],
    ];
    const matches = [...dataset(base), ...dataset(base), ...dataset(base)];
    const fit = fitDixonColes(matches, { iterations: 600, learningRate: 0.08 });

    expect(fit.attack.get("Fuerte")!).toBeGreaterThan(fit.attack.get("Medio")!);
    expect(fit.attack.get("Medio")!).toBeGreaterThan(fit.attack.get("Debil")!);
    // defensa: <1 = concede menos (mejor). Fuerte defiende mejor que Débil.
    expect(fit.defense.get("Fuerte")!).toBeLessThan(fit.defense.get("Debil")!);
    // media geométrica de attack ≈ 1 (identificabilidad)
    const ga = [...fit.attack.values()].reduce((s, x) => s * x, 1) ** (1 / fit.attack.size);
    expect(ga).toBeCloseTo(1, 1);
  });

  it("estima la ventaja de local cuando el local siempre marca más", () => {
    // Dos equipos iguales; el local siempre gana 2-1 -> la asimetría solo se
    // explica con ventaja de local > 1.
    const base: [string, string, number, number][] = [["A", "B", 2, 1], ["B", "A", 2, 1]];
    const matches = [...dataset(base), ...dataset(base), ...dataset(base), ...dataset(base)];
    const fit = fitDixonColes(matches, { iterations: 700, learningRate: 0.08 });
    expect(fit.homeAdvantage).toBeGreaterThan(1.2);
    // equipos parejos: ataques casi iguales
    expect(fit.attack.get("A")! / fit.attack.get("B")!).toBeCloseTo(1, 1);
  });

  it("la ponderación temporal hace que lo reciente mande", () => {
    // X dominaba hace mucho (4-0) pero ahora pierde (0-3). Con decay fuerte, su
    // ataque estimado debe caer respecto a no usar decay.
    const old: [string, string, number, number][] = [["X", "Y", 4, 0], ["X", "Y", 4, 0]];
    const recent: [string, string, number, number][] = [["X", "Y", 0, 3], ["X", "Y", 0, 3]];
    const matches = [...dataset(old, 1000), ...dataset(recent, 1)];

    const noDecay = fitDixonColes(matches, { xi: 0, iterations: 500 });
    const decay = fitDixonColes(matches, { xi: 0.01, iterations: 500 });
    // con decay, el ataque de X (relativo a Y) es menor que sin decay
    const ratioNo = noDecay.attack.get("X")! / noDecay.attack.get("Y")!;
    const ratioDecay = decay.attack.get("X")! / decay.attack.get("Y")!;
    expect(ratioDecay).toBeLessThan(ratioNo);
  });
});
