import { describe, it, expect } from "vitest";
import { parseFixtures } from "./history.js";

describe("history parseFixtures", () => {
  const items = [
    { fixture: { id: 1, date: "2024-06-01T18:00:00Z", status: { short: "FT" } }, league: { id: 10, name: "Friendlies" }, teams: { home: { name: "Brazil" }, away: { name: "Mexico" } }, goals: { home: 3, away: 2 } },
    // sin terminar -> se descarta
    { fixture: { id: 2, date: "2024-06-02T18:00:00Z", status: { short: "NS" } }, teams: { home: { name: "Spain" }, away: { name: "Italy" } }, goals: { home: null, away: null } },
    // terminado por penales -> se incluye, marcador de los 120'
    { fixture: { id: 3, date: "2024-07-01T18:00:00Z", status: { short: "PEN" } }, league: { id: 4, name: "Euro" }, teams: { home: { name: "France" }, away: { name: "Portugal" } }, goals: { home: 0, away: 0 } },
    // sin goles cargados -> se descarta
    { fixture: { id: 4, date: "2024-06-03T18:00:00Z", status: { short: "FT" } }, teams: { home: { name: "A" }, away: { name: "B" } }, goals: { home: null, away: 1 } },
  ];

  it("solo incluye partidos terminados con marcador", () => {
    const rows = parseFixtures(items as any);
    expect(rows.map((r) => r.api_fixture_id).sort()).toEqual([1, 3]);
  });

  it("preserva marcador, fecha y competencia", () => {
    const rows = parseFixtures(items as any);
    const br = rows.find((r) => r.api_fixture_id === 1)!;
    expect(br.home_name).toBe("Brazil");
    expect(br.home_goals).toBe(3);
    expect(br.away_goals).toBe(2);
    expect(br.competition).toBe("Friendlies");
    expect(br.played_at).toBe("2024-06-01T18:00:00Z");
  });
});
