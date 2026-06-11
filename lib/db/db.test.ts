import { describe, it, expect } from "vitest";
import { getMemoryDb } from "./schema.js";
import { seedTeams, strengthFromRating, SEED_TEAMS } from "../data/seed.js";

describe("schema + seed", () => {
  it("crea las tablas y siembra 48 equipos en 12 grupos", () => {
    const db = getMemoryDb();
    const n = seedTeams(db);
    expect(n).toBe(48);

    const count = db.prepare("SELECT COUNT(*) c FROM teams").get() as { c: number };
    expect(count.c).toBe(48);

    const groups = db.prepare("SELECT DISTINCT group_letter FROM teams").all();
    expect(groups).toHaveLength(12);

    // cada grupo tiene exactamente 4 equipos
    const perGroup = db.prepare(
      "SELECT group_letter, COUNT(*) c FROM teams GROUP BY group_letter",
    ).all() as { group_letter: string; c: number }[];
    for (const g of perGroup) expect(g.c).toBe(4);
  });

  it("el seed es idempotente (re-sembrar no duplica)", () => {
    const db = getMemoryDb();
    seedTeams(db);
    seedTeams(db);
    const count = db.prepare("SELECT COUNT(*) c FROM teams").get() as { c: number };
    expect(count.c).toBe(48);
  });

  it("un rating alto produce más ataque y menos defensa concedida", () => {
    const top = strengthFromRating(2120);
    const bottom = strengthFromRating(1540);
    expect(top.attack).toBeGreaterThan(bottom.attack);
    expect(top.defense).toBeLessThan(bottom.defense);
  });

  it("hay exactamente 3 anfitriones marcados", () => {
    expect(SEED_TEAMS.filter((t) => t.isHost)).toHaveLength(3);
  });
});
