import { describe, it, expect } from "vitest";
import { runMonteCarlo, type MonteCarloTeam } from "./montecarlo.js";

// 48 equipos en 12 grupos = estructura real del Mundial 2026 (32 a eliminatorias).
function buildTeams(): MonteCarloTeam[] {
  const groups = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];
  const teams: MonteCarloTeam[] = [];
  for (const g of groups) {
    teams.push({ name: `${g}-fuerte`, group: g, attack: 1.4, defense: 0.75, rating: 1900 });
    teams.push({ name: `${g}-medio1`, group: g, attack: 1.0, defense: 1.0, rating: 1600 });
    teams.push({ name: `${g}-medio2`, group: g, attack: 1.0, defense: 1.0, rating: 1550 });
    teams.push({ name: `${g}-debil`, group: g, attack: 0.7, defense: 1.3, rating: 1300 });
  }
  return teams;
}

describe("monte carlo", () => {
  const odds = runMonteCarlo(buildTeams(), { iterations: 2000, seed: 42 });

  it("las probabilidades de campeón suman ~1", () => {
    const total = odds.reduce((s, o) => s + o.champion, 0);
    expect(total).toBeCloseTo(1, 2);
  });

  it("los equipos fuertes tienen más chance de ser campeón que los débiles", () => {
    const fuerte = odds.find((o) => o.name === "A-fuerte")!;
    const debil = odds.find((o) => o.name === "A-debil")!;
    expect(fuerte.champion).toBeGreaterThan(debil.champion);
  });

  it("toda probabilidad está en [0,1] y es monótona por ronda", () => {
    for (const o of odds) {
      expect(o.champion).toBeGreaterThanOrEqual(0);
      expect(o.roundOf32).toBeLessThanOrEqual(1);
      // avanzar más lejos nunca es más probable que avanzar menos
      expect(o.champion).toBeLessThanOrEqual(o.finalist + 1e-9);
      expect(o.finalist).toBeLessThanOrEqual(o.semifinal + 1e-9);
      expect(o.semifinal).toBeLessThanOrEqual(o.quarterfinal + 1e-9);
    }
  });

  it("es reproducible con la misma semilla", () => {
    const a = runMonteCarlo(buildTeams(), { iterations: 500, seed: 7 });
    const b = runMonteCarlo(buildTeams(), { iterations: 500, seed: 7 });
    expect(a[0]!.champion).toBe(b[0]!.champion);
  });
});
