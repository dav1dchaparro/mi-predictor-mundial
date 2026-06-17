import { describe, it, expect } from "vitest";
import { parseOddsApi, type OddsApiEvent } from "./theOddsApi.js";

const ev: OddsApiEvent = {
  home_team: "Mexico",
  away_team: "South Korea",
  commence_time: "2026-06-18T18:00:00Z",
  bookmakers: [
    {
      key: "williamhill",
      markets: [
        { key: "h2h", outcomes: [{ name: "Mexico", price: 2.0 }, { name: "Draw", price: 3.2 }, { name: "South Korea", price: 3.8 }] },
        { key: "totals", outcomes: [{ name: "Over", price: 1.9, point: 2.5 }, { name: "Under", price: 1.95, point: 2.5 }] },
      ],
    },
    {
      key: "marathonbet",
      markets: [
        { key: "h2h", outcomes: [{ name: "Mexico", price: 2.2 }, { name: "Draw", price: 3.4 }, { name: "South Korea", price: 3.4 }] },
      ],
    },
    {
      // Pinnacle se EXCLUYE del consenso (ya la traemos por su API guest).
      key: "pinnacle",
      markets: [
        { key: "h2h", outcomes: [{ name: "Mexico", price: 1.5 }, { name: "Draw", price: 9.9 }, { name: "South Korea", price: 9.9 }] },
      ],
    },
  ],
};

describe("theOddsApi parseOddsApi", () => {
  it("promedia las casas EU y excluye Pinnacle", () => {
    const [r] = parseOddsApi([ev]);
    expect(r!.home).toBeCloseTo((2.0 + 2.2) / 2, 6); // 2.1, sin Pinnacle
    expect(r!.away).toBeCloseTo((3.8 + 3.4) / 2, 6); // 3.6
    expect(r!.books.sort()).toEqual(["marathonbet", "williamhill"]);
  });

  it("toma Over/Under 2.5 solo de las casas que lo ofrecen", () => {
    const [r] = parseOddsApi([ev]);
    expect(r!.over).toBeCloseTo(1.9, 6); // solo williamhill tiene totals
    expect(r!.under).toBeCloseTo(1.95, 6);
  });

  it("omite partidos sin ninguna casa con 1X2 completo", () => {
    const incompleto: OddsApiEvent = {
      home_team: "A", away_team: "B",
      bookmakers: [{ key: "williamhill", markets: [{ key: "h2h", outcomes: [{ name: "A", price: 2 }] }] }],
    };
    expect(parseOddsApi([incompleto])).toHaveLength(0);
  });
});
