import { describe, it, expect } from "vitest";
import { extractInitialState, parseMatch, parseLeague } from "./betano.js";

// Muestra mínima con la forma real del JSON de Betano.
const event = {
  name: "México - Sudáfrica",
  url: "/cuotas-de-partido/mexico-sudafrica/77352108/",
  markets: [
    { name: "Resultado del partido", type: "MRES", selections: [
      { name: "1", fullName: "México", price: 1.45 },
      { name: "X", fullName: "Empate", price: 4.3 },
      { name: "2", fullName: "Sudáfrica", price: 8.0 },
    ] },
    { name: "Goles totales Más/Menos", type: "HCTG", selections: [
      { name: "Más 2.5", price: 2.15, handicap: 2.5 },
      { name: "Menos 2.5", price: 1.7, handicap: 2.5 },
      { name: "Más 1.5", price: 1.39, handicap: 1.5 },
    ] },
    { name: "Marcador exacto", type: "CSFT", selections: [
      { name: "2 - 0", price: 5.8 },
      { name: "1 - 0", price: 5.0 },
      { name: "0 - 0", price: 7.9 },
    ] },
  ],
};

const matchHtml = `<html><script>window["initial_state"]=${JSON.stringify({ data: { event } })};</script></html>`;
const leagueHtml = `<html><script>window["initial_state"]=${JSON.stringify({ data: { x: [event] } })};</script></html>`;

describe("betano parser", () => {
  it("extractInitialState recupera el JSON embebido", () => {
    expect(extractInitialState(matchHtml)).not.toBeNull();
    expect(extractInitialState("<html>sin estado</html>")).toBeNull();
  });

  it("parseMatch lee 1X2, Over/Under 2.5 y marcador exacto ordenado", () => {
    const m = parseMatch(extractInitialState(matchHtml));
    expect(m).not.toBeNull();
    expect(m!.home).toBe(1.45);
    expect(m!.draw).toBe(4.3);
    expect(m!.away).toBe(8.0);
    expect(m!.ouOver).toBe(2.15);
    expect(m!.ouUnder).toBe(1.7);
    // ordenado por menor cuota = mas probable
    expect(m!.exact![0]!.score).toBe("1-0");
    expect(m!.exact![0]!.price).toBe(5.0);
  });

  it("parseLeague encuentra los partidos con su 1X2 y URL", () => {
    const list = parseLeague(extractInitialState(leagueHtml));
    expect(list).toHaveLength(1);
    expect(list[0]!.name).toBe("México - Sudáfrica");
    expect(list[0]!.url).toContain("/cuotas-de-partido/");
    expect(list[0]!.home).toBe(1.45);
  });
});
