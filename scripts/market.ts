// Recálculo anclado a DOS casas de apuestas + reporte comparativo.
//   1. Lee las cuotas de Betano ya scrapeadas (tabla odds, vía scripts/odds.ts).
//   2. Trae el 1X2 de Pinnacle (segunda fuente, API guest) y lo guarda.
//   3. Construye un CONSENSO: promedio de las probabilidades sin margen de ambas
//      casas (el consenso de dos libros es más afilado que cualquiera solo).
//   4. Para cada partido calcula 4 escenarios (modelo / Betano / Pinnacle /
//      consenso), GUARDA la predicción anclada al consenso (la que verá la app) y
//      escribe REPORTE.md con la comparación completa.
// Uso: npx tsx scripts/market.ts

import { writeFileSync } from "node:fs";
import { getDb } from "../lib/db/schema.js";
import { seedTeams } from "../lib/data/seed.js";
import { seedFixtures } from "../lib/data/seedFixtures.js";
import { fetchPinnacleWorldCup } from "../lib/data/pinnacle.js";
import { fetchOddsApiWorldCup } from "../lib/data/theOddsApi.js";
import { fairProbs1X2, valueBets, type Odds1X2, type ValueBet } from "../lib/model/index.js";
import { predictMatch, type MatchContext } from "../lib/predict/predictMatch.js";
import { norm, resolve } from "../lib/data/teamNames.js";

interface TeamRow { id: number; name: string; group_letter: string; rating: number; attack: number; defense: number; is_host: number }
interface FixtureRow { id: number; home_team_id: number; away_team_id: number; kickoff: string; altitude_m: number | null; temp_c: number | null }
interface OddsRow { fixture_id: number; home: number; draw: number; away: number; ou_over: number | null; ou_under: number | null; exact_top: string | null; pin_home: number | null; pin_draw: number | null; pin_away: number | null; oa_home: number | null; oa_draw: number | null; oa_away: number | null; oa_over: number | null; oa_under: number | null }

function pct(p: number) { return `${(p * 100).toFixed(0)}%`; }

// Pesos del consenso: Pinnacle es la casa "sharp" de referencia (línea de cierre
// con r²≈0.997 vs resultados), así que pesa el doble que Betano y que el consenso
// EU de The Odds API. Con las 3 fuentes Pinnacle aporta ~50% (2/4); con solo
// Betano+Pinnacle, ~67%. Heurística respaldada por la literatura (Pinnacle = oro).
const SOURCE_WEIGHT = { pinnacle: 2, betano: 1, oddsApi: 1 } as const;
type Prob = { home: number; draw: number; away: number };
function weightedProbs(list: { p: Prob; w: number }[]): Prob {
  const W = list.reduce((s, x) => s + x.w, 0);
  return {
    home: list.reduce((s, x) => s + x.p.home * x.w, 0) / W,
    draw: list.reduce((s, x) => s + x.p.draw * x.w, 0) / W,
    away: list.reduce((s, x) => s + x.p.away * x.w, 0) / W,
  };
}
const probsToFairOdds = (p: { home: number; draw: number; away: number }): Odds1X2 => ({
  home: 1 / p.home, draw: 1 / p.draw, away: 1 / p.away,
});

async function main() {
  const db = getDb();
  const now = new Date().toISOString();
  seedTeams(db); seedFixtures(db);

  // ---- 1. Pinnacle: traer y guardar el 1X2 (segunda fuente) ----
  console.log("[market] trayendo 1X2 de Pinnacle...");
  const pin = await fetchPinnacleWorldCup();
  console.log(`[market] Pinnacle devolvió ${pin.length} partidos`);

  const teams = db.prepare("SELECT * FROM teams").all() as TeamRow[];
  const byId = new Map(teams.map((t) => [t.id, t]));
  const idx = new Map(teams.map((t) => [norm(t.name), t.id]));
  const fixtures = db.prepare("SELECT * FROM fixtures WHERE stage='group'").all() as FixtureRow[];

  const findFixture = (a: number, b: number) => {
    const f = db.prepare("SELECT id FROM fixtures WHERE home_team_id=? AND away_team_id=? AND stage='group'").get(a, b) as { id: number } | undefined;
    if (f) return { id: f.id, reversed: false };
    const r = db.prepare("SELECT id FROM fixtures WHERE home_team_id=? AND away_team_id=? AND stage='group'").get(b, a) as { id: number } | undefined;
    return r ? { id: r.id, reversed: true } : null;
  };
  const upsertPin = db.prepare(
    `INSERT INTO odds (fixture_id, pin_home, pin_draw, pin_away, pin_scraped_at) VALUES (?,?,?,?,?)
     ON CONFLICT(fixture_id) DO UPDATE SET pin_home=excluded.pin_home, pin_draw=excluded.pin_draw, pin_away=excluded.pin_away, pin_scraped_at=excluded.pin_scraped_at`,
  );
  let pinMatched = 0;
  const pinUnmatched: string[] = [];
  for (const e of pin) {
    const [hn, an] = e.name.split(" - ");
    const a = idx.get(resolve(hn ?? "")), b = idx.get(resolve(an ?? ""));
    if (!a || !b) { pinUnmatched.push(e.name); continue; }
    const hit = findFixture(a, b);
    if (!hit) { pinUnmatched.push(e.name); continue; }
    const o = hit.reversed ? { home: e.away, draw: e.draw, away: e.home } : { home: e.home, draw: e.draw, away: e.away };
    upsertPin.run(hit.id, o.home, o.draw, o.away, now);
    pinMatched++;
  }
  console.log(`[market] Pinnacle emparejados: ${pinMatched}/${fixtures.length}` + (pinUnmatched.length ? ` | sin emparejar: ${pinUnmatched.join(", ")}` : ""));

  // ---- 1b. The Odds API: consenso EU (3ª fuente, opcional si hay key) ----
  let oaMatched = 0;
  try {
    console.log("[market] trayendo consenso EU de The Odds API...");
    const { consensus, sportKey } = await fetchOddsApiWorldCup();
    if (!consensus.length) {
      console.log("[market] The Odds API: sin key (THE_ODDS_API_KEY) o sin partidos -> se omite la 3ª fuente.");
    } else {
      console.log(`[market] The Odds API (${sportKey}) devolvió ${consensus.length} partidos`);
      const upsertOa = db.prepare(
        `INSERT INTO odds (fixture_id, oa_home, oa_draw, oa_away, oa_over, oa_under, oa_books, oa_scraped_at) VALUES (?,?,?,?,?,?,?,?)
         ON CONFLICT(fixture_id) DO UPDATE SET oa_home=excluded.oa_home, oa_draw=excluded.oa_draw, oa_away=excluded.oa_away, oa_over=excluded.oa_over, oa_under=excluded.oa_under, oa_books=excluded.oa_books, oa_scraped_at=excluded.oa_scraped_at`,
      );
      const oaUnmatched: string[] = [];
      for (const e of consensus) {
        const a = idx.get(resolve(e.home_team)), b = idx.get(resolve(e.away_team));
        if (!a || !b) { oaUnmatched.push(`${e.home_team}-${e.away_team}`); continue; }
        const hit = findFixture(a, b);
        if (!hit) { oaUnmatched.push(`${e.home_team}-${e.away_team}`); continue; }
        const o = hit.reversed
          ? { home: e.away, draw: e.draw, away: e.home, over: e.over, under: e.under }
          : { home: e.home, draw: e.draw, away: e.away, over: e.over, under: e.under };
        upsertOa.run(hit.id, o.home, o.draw, o.away, o.over ?? null, o.under ?? null, e.books.join(","), now);
        oaMatched++;
      }
      console.log(`[market] The Odds API emparejados: ${oaMatched}/${fixtures.length}` + (oaUnmatched.length ? ` | sin emparejar: ${oaUnmatched.join(", ")}` : ""));
    }
  } catch (err) {
    console.warn(`[market] The Odds API falló (se continúa con 2 casas): ${(err as Error).message}`);
  }

  // ---- 2. Por partido: escenarios + guardar consenso + filas del reporte ----
  const odds = new Map((db.prepare("SELECT * FROM odds").all() as OddsRow[]).map((o) => [o.fixture_id, o]));
  const savePred = db.prepare("INSERT INTO predictions (fixture_id, kind, created_at, payload) VALUES (?, 'match', ?, ?)");

  const baseCtx = (f: FixtureRow): MatchContext => {
    const h = byId.get(f.home_team_id)!, a = byId.get(f.away_team_id)!;
    return {
      homeName: h.name, awayName: a.name,
      home: { name: h.name, attack: h.attack, defense: h.defense, rating: h.rating },
      away: { name: a.name, attack: a.attack, defense: a.defense, rating: a.rating },
      venue: { altitudeMeters: f.altitude_m ?? undefined, tempCelsius: f.temp_c ?? undefined, homeIsHost: h.is_host === 1 },
    };
  };
  const pick = (ctx: MatchContext) => { const p = predictMatch(ctx); return { rec: `${p.recommended.home}-${p.recommended.away}`, r: p.markets.result, pred: p }; };

  type Row = { kickoff: string; match: string; group: string; sources: number;
    model: ReturnType<typeof pick>; betano?: ReturnType<typeof pick>; pinn?: ReturnType<typeof pick>; oa?: ReturnType<typeof pick>; cons: ReturnType<typeof pick>;
    bOdds?: Odds1X2; pOdds?: Odds1X2; oaOdds?: Odds1X2; consProbs: { home: number; draw: number; away: number }; value?: string; bets: ValueBet[] };
  const rows: Row[] = [];

  for (const f of fixtures.sort((x, y) => x.kickoff.localeCompare(y.kickoff))) {
    const h = byId.get(f.home_team_id)!, a = byId.get(f.away_team_id)!;
    const o = odds.get(f.id);
    const ctx = baseCtx(f);

    const model = pick(ctx);

    const bOdds: Odds1X2 | undefined = o && o.home ? { home: o.home, draw: o.draw, away: o.away } : undefined;
    const pOdds: Odds1X2 | undefined = o && o.pin_home ? { home: o.pin_home, draw: o.pin_draw!, away: o.pin_away! } : undefined;
    const oaOdds: Odds1X2 | undefined = o && o.oa_home ? { home: o.oa_home, draw: o.oa_draw!, away: o.oa_away! } : undefined;
    const ou = o && o.ou_over && o.ou_under ? { line: 2.5, over: o.ou_over, under: o.ou_under } : undefined;
    const oaOu = o && o.oa_over && o.oa_under ? { line: 2.5, over: o.oa_over, under: o.oa_under } : undefined;
    const consOu = ou ?? oaOu; // O/U para el consenso: preferir Betano, sino EU
    const exact = o && o.exact_top ? (JSON.parse(o.exact_top) as { score: string; price: number }[]) : undefined;

    const betano = bOdds ? pick({ ...ctx, market: { odds1X2: bOdds, overUnder: ou, exact } }) : undefined;
    const pinn = pOdds ? pick({ ...ctx, market: { odds1X2: pOdds } }) : undefined;
    const oa = oaOdds ? pick({ ...ctx, market: { odds1X2: oaOdds, overUnder: oaOu } }) : undefined;

    // CONSENSO PONDERADO: promedio de probabilidades sin margen (devig Shin) de las
    // casas disponibles, con Pinnacle pesando el doble (casa sharp de referencia).
    const fairList = [
      bOdds && { p: fairProbs1X2(bOdds), w: SOURCE_WEIGHT.betano },
      pOdds && { p: fairProbs1X2(pOdds), w: SOURCE_WEIGHT.pinnacle },
      oaOdds && { p: fairProbs1X2(oaOdds), w: SOURCE_WEIGHT.oddsApi },
    ].filter(Boolean) as { p: Prob; w: number }[];
    const consProbs = fairList.length ? weightedProbs(fairList) : model.r;
    const consOdds = probsToFairOdds(consProbs);
    const consMarket = fairList.length ? { odds1X2: consOdds, overUnder: consOu, exact } : undefined;
    const cons = pick({ ...ctx, market: consMarket });

    // GUARDAR la predicción anclada al consenso como la última 'match'.
    savePred.run(f.id, now, JSON.stringify(cons.pred));

    // APUESTAS DE VALOR (Kelly): prob. del MODELO PURO vs la MEJOR cuota cruda
    // disponible entre casas (line shopping). Kelly fraccional 0.25, edge ≥ 7%.
    const best = (sel: (o: Odds1X2) => number, books: [Odds1X2 | undefined, string][]) => {
      let top: { odds: number; book?: string } | undefined;
      for (const [o, name] of books) {
        if (!o) continue;
        const v = sel(o);
        if (!top || v > top.odds) top = { odds: v, book: name };
      }
      return top;
    };
    const books: [Odds1X2 | undefined, string][] = [[bOdds, "Betano"], [pOdds, "Pinnacle"], [oaOdds, "EU"]];
    const bets = (bOdds || pOdds || oaOdds)
      ? valueBets(model.r,
          { home: best((o) => o.home, books), draw: best((o) => o.draw, books), away: best((o) => o.away, books) },
          { fraction: 0.25, minEdge: 0.07 })
      : [];

    // Detección de valor: mayor brecha entre la prob del modelo y el consenso.
    let value: string | undefined;
    if (fairList.length) {
      const diffs: [string, number][] = [
        [`${h.name}`, model.r.home - consProbs.home],
        ["Empate", model.r.draw - consProbs.draw],
        [`${a.name}`, model.r.away - consProbs.away],
      ];
      diffs.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
      const [lab, d] = diffs[0]!;
      if (Math.abs(d) >= 0.07) value = `${d > 0 ? "Modelo alcista" : "Mercado alcista"} en ${lab} (${(d * 100 > 0 ? "+" : "")}${(d * 100).toFixed(0)} pp)`;
    }

    rows.push({ kickoff: f.kickoff, match: `${h.name} vs ${a.name}`, group: h.group_letter, sources: fairList.length, model, betano, pinn, oa, cons, bOdds, pOdds, oaOdds, consProbs, value, bets });
  }

  writeReport(rows, now);
  const anchored = rows.filter((r) => r.sources > 0).length;
  console.log(`[market] partidos: ${rows.length} | anclados a mercado: ${anchored} | reporte: REPORTE.md`);
}

function writeReport(rows: any[], now: string) {
  const L: string[] = [];
  L.push(`# Reporte de marcadores — Mundial 2026`);
  L.push(``);
  L.push(`_Generado ${now}. Modelo propio (Poisson + Dixon-Coles) anclado a tres fuentes: **Betano** (cuotas + Over/Under + marcador exacto), **Pinnacle** (1X2, casa "sharp" de referencia) y **EU** (consenso de William Hill / Marathonbet / 1xBet vía The Odds API). El **consenso** promedia las probabilidades sin margen (devig de Shin) ponderando Pinnacle el doble; es lo que la app muestra como marcador a jugar._`);
  L.push(``);
  const anchored = rows.filter((r) => r.sources > 0);
  L.push(`- Partidos: **${rows.length}** | con cuotas de mercado: **${anchored.length}** | solo-modelo (sin cuotas aún): **${rows.length - anchored.length}**`);
  const agree = anchored.filter((r) => r.cons.rec === r.betano?.rec && r.cons.rec === r.pinn?.rec).length;
  L.push(`- Coincidencia de marcador exacto modelo-consenso vs ambas casas: referencia interna.`);
  L.push(``);

  // Agrupar por jornada (fecha)
  const byDate = new Map<string, any[]>();
  for (const r of rows) {
    const d = r.kickoff.slice(0, 10);
    if (!byDate.has(d)) byDate.set(d, []);
    byDate.get(d)!.push(r);
  }
  for (const [date, list] of [...byDate.entries()].sort()) {
    L.push(`## ${date}`);
    L.push(``);
    L.push(`| Partido | 1X2 consenso | Modelo | Betano | Pinnacle | EU | **A jugar (consenso)** | Lectura |`);
    L.push(`|---|---|---|---|---|---|---|---|`);
    for (const r of list) {
      const c = r.consProbs;
      const x = r.sources ? `${pct(c.home)}/${pct(c.draw)}/${pct(c.away)}` : "—";
      L.push(`| ${r.match} (${r.group}) | ${x} | ${r.model.rec} | ${r.betano?.rec ?? "—"} | ${r.pinn?.rec ?? "—"} | ${r.oa?.rec ?? "—"} | **${r.cons.rec}** | ${r.value ?? ""} |`);
    }
    L.push(``);
  }

  // ---- Apuestas de valor (Kelly) ----
  const labelOf = (r: any, oc: string) => oc === "home" ? r.match.split(" vs ")[0] : oc === "away" ? r.match.split(" vs ")[1] : "Empate";
  const withBets = rows.filter((r) => r.bets.length).sort((a, b) => b.bets[0].edge - a.bets[0].edge);
  L.push(`## Apuestas de valor (criterio de Kelly)`);
  L.push(``);
  L.push(`_Donde el **modelo puro** (sin anclar al mercado) discrepa de la mejor cuota disponible a su favor. Edge = p·cuota − 1. Stake = Kelly fraccional (¼). Esto NO es el marcador a jugar en el prode: es gestión de banca para apuestas 1X2. Solo entretenimiento, no recomendación._`);
  L.push(``);
  // Diagnóstico honesto: contar cuántas señales son empates/longshots revela
  // sesgo del modelo más que valor real.
  const drawBets = withBets.reduce((s, r) => s + r.bets.filter((b: ValueBet) => b.outcome === "draw").length, 0);
  const totalBets = withBets.reduce((s, r) => s + r.bets.length, 0);
  L.push(`> ⚠️ **Leer con cautela — esto es un diagnóstico de calibración, no plata gratis.** De ${totalBets} señales, **${drawBets} son al empate** y varias a tapados con cuota >15 (edges de +200/+300%). Eso NO son decenas de oportunidades reales: es la firma de que el **modelo puro sobreestima los empates y comprime los extremos** frente al mercado (que es más afilado en las colas). El edge real, si existe, está en las señales moderadas (favoritos/contextos), no en los longshots. Esto es justamente lo que corrigen la calibración (\`npm run backtest\`) y una mejor estimación de fuerzas (ver ANALISIS.md).`);
  L.push(``);
  if (!withBets.length) {
    L.push(`_Sin apuestas de valor con edge ≥ 7% en este scrape (el modelo y el mercado concuerdan)._`);
  } else {
    L.push(`Top 15 por edge (de ${totalBets} señales totales):`);
    L.push(``);
    L.push(`| Partido | Apuesta | Prob. modelo | Mejor cuota | Casa | Edge | Stake (¼ Kelly) |`);
    L.push(`|---|---|---|---|---|---|---|`);
    const flat = withBets.flatMap((r: any) => r.bets.map((b: ValueBet) => ({ r, b })));
    flat.sort((x, y) => y.b.edge - x.b.edge);
    for (const { r, b } of flat.slice(0, 15)) {
      L.push(`| ${r.match} | ${labelOf(r, b.outcome)} | ${pct(b.prob)} | ${b.odds.toFixed(2)} | ${b.book ?? "—"} | +${(b.edge * 100).toFixed(0)}% | ${(b.kelly * 100).toFixed(1)}% |`);
    }
  }
  L.push(``);
  writeFileSync("REPORTE.md", L.join("\n"));
}

main().catch((e) => { console.error("[market] error:", e); process.exit(1); });
