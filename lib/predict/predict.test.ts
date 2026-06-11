import { describe, it, expect } from "vitest";
import { getMemoryDb } from "../db/schema.js";
import { seedTeams } from "../data/seed.js";
import { predictMatch } from "./predictMatch.js";
import { recomputeAll, recomputeTournament } from "./recompute.js";

describe("predictMatch", () => {
  it("predice todos los mercados y un pick de polla", () => {
    const pred = predictMatch({
      homeName: "Argentina",
      awayName: "México",
      home: { name: "Argentina", attack: 1.4, defense: 0.78 },
      away: { name: "México", attack: 1.05, defense: 1.0 },
    });
    const r = pred.markets.result;
    expect(r.home + r.draw + r.away).toBeCloseTo(1, 6);
    expect(pred.markets.topScores).toHaveLength(5);
    expect(pred.pollaPick).toBeDefined();
    expect(pred.lambdaHome).toBeGreaterThan(0);
  });

  it("incluye tarjetas y corners cuando se pasan promedios", () => {
    const pred = predictMatch({
      homeName: "A", awayName: "B",
      home: { name: "A", attack: 1, defense: 1 },
      away: { name: "B", attack: 1, defense: 1 },
      cards: { homeAvg: 2, awayAvg: 2.2, intensity: 1.2 },
      corners: { homeAvg: 5, awayAvg: 4 },
    });
    expect(pred.cards?.redCardProb).toBeGreaterThan(0);
    expect(pred.corners?.mainLine.over).toBeGreaterThan(0);
  });
});

describe("recompute pipeline", () => {
  it("guarda predicción de torneo con timestamp y la puede leer", () => {
    const db = getMemoryDb();
    seedTeams(db);
    const now = "2026-06-09T00:00:00.000Z";
    const odds = recomputeTournament(db, { now, iterations: 1000, seed: 1 });

    expect(odds).toHaveLength(48);
    const row = db.prepare("SELECT * FROM predictions WHERE kind='tournament'").get() as {
      created_at: string; payload: string;
    };
    expect(row.created_at).toBe(now);
    const parsed = JSON.parse(row.payload);
    expect(parsed[0].champion).toBeGreaterThanOrEqual(parsed[1].champion);
  });

  it("recomputeAll corre sin fixtures y reporta favorito", () => {
    const db = getMemoryDb();
    seedTeams(db);
    const result = recomputeAll(db, { now: "2026-06-09T00:00:00.000Z", iterations: 800, seed: 2 });
    expect(result.teams).toBe(48);
    expect(result.fixtures).toBe(0); // no hay fixtures sembrados aún
    expect(typeof result.topChampion).toBe("string");
  });
});
