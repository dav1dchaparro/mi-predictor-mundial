// Pronósticos de 16avos de final (Round of 32) del Mundial 2026.
//
// Bracket REAL (verificado vs CBS/FOX/ESPN, 1-jul-2026). De los 16 cruces:
//   - 9 YA JUGADOS: se registran los resultados reales y se contrasta el modelo
//     PRE-partido (sin mercado) contra ellos -> calibración honesta en vivo.
//   - 7 PENDIENTES: se anclan a MERCADO REAL scrapeado (Pinnacle guest API +
//     consenso FOX/FanDuel). Consenso = probabilidades sin margen (devig Shin)
//     ponderando Pinnacle el doble (casa sharp). El modelo (Poisson+Dixon-Coles)
//     se ensambla 50/50 con ese consenso, igual que el pipeline de grupos.
//
// Mercado fresco: si existe data/r32_market.json (scrapeado por el agente de
// research), sus cuotas REEMPLAZAN a las hardcodeadas e incluyen la línea de
// goles (O/U) -> anclaje COMPLETO de lambdas (total + reparto), y el mercado de
// marcador exacto como referencia. Si existe data/judge_picks_r32.json, el pick
// final del panel de jueces se muestra junto al del modelo.
//
// Uso: npx tsx scripts/r32.ts
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { getDb } from "../lib/db/schema.js";
import { predictMatch } from "../lib/predict/predictMatch.js";
import { fairProbs1X2, type Odds1X2, type OverUnderOdds } from "../lib/model/index.js";

const db = getDb();
type T = { name: string; attack: number; defense: number; rating: number; is_host: number };
const teams = new Map(
  (db.prepare("SELECT name, attack, defense, rating, is_host FROM teams").all() as T[]).map((t) => [t.name, t]),
);

// Cuotas americanas -> decimales. -280 => 1.36 ; +390 => 4.90
const am = (a: number) => Math.round((a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1) * 100) / 100;

type Real = { h: number; a: number; pen?: string; extra?: boolean };
type OddsSrc = { pin: [number, number, number]; fox: [number, number, number] };
type Fx = {
  home: string; away: string; date: string; city: string;
  alt?: number; hostHome?: boolean;
  real?: Real;   // resultado real (partido jugado)
  odds?: OddsSrc; // mercado real (partido pendiente)
};

// Orientación home/away = seeding del bracket. Sedes neutrales salvo anfitrión.
const FIXTURES: Fx[] = [
  // ---- 9 JUGADOS (resultados reales) ----
  { home: "Sudáfrica", away: "Canadá", date: "Jun 28", city: "Los Ángeles", real: { h: 0, a: 1 } },
  { home: "Brasil", away: "Japón", date: "Jun 29", city: "Houston", real: { h: 2, a: 1 } },
  { home: "Alemania", away: "Paraguay", date: "Jun 29", city: "Boston", real: { h: 1, a: 1, pen: "Paraguay 4-3 pen" } },
  { home: "Países Bajos", away: "Marruecos", date: "Jun 29", city: "Monterrey", real: { h: 1, a: 1, pen: "Marruecos 3-2 pen" } },
  { home: "Costa de Marfil", away: "Noruega", date: "Jun 30", city: "Dallas", real: { h: 1, a: 2 } },
  { home: "Francia", away: "Suecia", date: "Jun 30", city: "Nueva York", real: { h: 3, a: 0 } },
  { home: "México", away: "Ecuador", date: "Jun 30", city: "Ciudad de México", alt: 2240, hostHome: true, real: { h: 2, a: 0 } },
  { home: "Inglaterra", away: "RD Congo", date: "Jul 1", city: "Atlanta", real: { h: 2, a: 1 } },
  { home: "Bélgica", away: "Senegal", date: "Jul 1", city: "Seattle", real: { h: 3, a: 2, extra: true } },
  { home: "USA", away: "Bosnia y Herzegovina", date: "Jul 1", city: "Santa Clara", hostHome: true, real: { h: 2, a: 0 } },

  // ---- 6 PENDIENTES (mercado hardcodeado = fallback; data/r32_market.json manda) ----
  { home: "España", away: "Austria", date: "Jul 2", city: "Los Ángeles",
    odds: { pin: [1.32, 5.5, 10.2], fox: [am(-320), am(420), am(1000)] } },
  { home: "Portugal", away: "Croacia", date: "Jul 2", city: "Toronto",
    odds: { pin: [1.76, 3.62, 5.21], fox: [am(-130), am(240), am(410)] } },
  { home: "Suiza", away: "Argelia", date: "Jul 2", city: "Vancouver",
    odds: { pin: [2.08, 3.25, 4.08], fox: [am(100), am(210), am(320)] } },
  { home: "Australia", away: "Egipto", date: "Jul 3", city: "Dallas",
    odds: { pin: [3.36, 2.89, 2.56], fox: [am(240), am(185), am(150)] } },
  { home: "Argentina", away: "Cabo Verde", date: "Jul 3", city: "Miami",
    odds: { pin: [1.16, 8.3, 19.51], fox: [am(-650), am(650), am(1600)] } },
  { home: "Colombia", away: "Ghana", date: "Jul 3", city: "Kansas City",
    odds: { pin: [1.53, 4.05, 7.38], fox: [am(-195), am(280), am(650)] } },
];

// Consenso: promedio ponderado de probs sin margen (Shin). Pinnacle x2, resto x1.
function consensusBooks(books: { book: string; home: number; draw: number; away: number }[]): Odds1X2 {
  let W = 0;
  const c = { home: 0, draw: 0, away: 0 };
  for (const b of books) {
    const w = /pinnacle/i.test(b.book) ? 2 : 1;
    const p = fairProbs1X2({ home: b.home, draw: b.draw, away: b.away });
    c.home += p.home * w; c.draw += p.draw * w; c.away += p.away * w;
    W += w;
  }
  return { home: W / c.home, draw: W / c.draw, away: W / c.away };
}
function consensus(o: OddsSrc): Odds1X2 {
  return consensusBooks([
    { book: "Pinnacle", home: o.pin[0], draw: o.pin[1], away: o.pin[2] },
    { book: "FOX", home: o.fox[0], draw: o.fox[1], away: o.fox[2] },
  ]);
}

// ---- Mercado fresco scrapeado (data/r32_market.json), si existe ----
type FreshEntry = {
  home: string; away: string; kickoffUTC?: string;
  books: { book: string; home: number; draw: number; away: number }[];
  overUnder?: { line: number; over: number; under: number; book?: string } | null;
  exactScores?: { score: string; price: number; book?: string }[];
};
const fresh = new Map<string, FreshEntry>();
let freshAt: string | undefined;
if (existsSync("data/r32_market.json")) {
  const raw = JSON.parse(readFileSync("data/r32_market.json", "utf8")) as { updatedAt?: string; matches: FreshEntry[] };
  freshAt = raw.updatedAt;
  for (const m of raw.matches) if (m.books?.length) fresh.set(`${m.home}|${m.away}`, m);
  console.log(`[r32] mercado fresco: ${fresh.size} partidos (${freshAt ?? "sin fecha"})`);
}

// ---- Predicciones PRE-partido congeladas para los ya jugados ----
// Tras el refit (que ya vio estos resultados), re-predecirlos contaminaría la
// calibración en vivo. Se usan las predicciones originales de antes de cada juego.
type Prematch = { home: string; away: string; p1x2: { home: number; draw: number; away: number }; moda: string; golesEsp: string };
const prematch = new Map<string, Prematch>();
if (existsSync("data/r32_prematch.json")) {
  const pm = JSON.parse(readFileSync("data/r32_prematch.json", "utf8")) as { matches: Prematch[] };
  for (const p of pm.matches) prematch.set(`${p.home}|${p.away}`, p);
}

// ---- Picks del panel de jueces (data/judge_picks_r32.json), si existe ----
type JudgePick = { match: string; finalScore: string; altScore: string; confidence: string; rationale: string };
const judges = new Map<string, JudgePick>();
if (existsSync("data/judge_picks_r32.json")) {
  const jp = JSON.parse(readFileSync("data/judge_picks_r32.json", "utf8")) as JudgePick[];
  for (const j of jp) judges.set(j.match, j);
  console.log(`[r32] picks de jueces: ${judges.size}`);
}

const played: any[] = [];
const upcoming: any[] = [];

for (const f of FIXTURES) {
  const home = teams.get(f.home)!;
  const away = teams.get(f.away)!;
  const fm = !f.real ? fresh.get(`${f.home}|${f.away}`) : undefined;
  const consOdds = fm ? consensusBooks(fm.books) : f.odds ? consensus(f.odds) : undefined;
  const ou: OverUnderOdds | undefined = fm?.overUnder
    ? { line: fm.overUnder.line, over: fm.overUnder.over, under: fm.overUnder.under }
    : undefined;
  const exact = fm?.exactScores?.map((e) => ({ score: e.score, price: e.price }));
  const pred = predictMatch({
    homeName: f.home, awayName: f.away,
    home: { name: home.name, attack: home.attack, defense: home.defense, rating: home.rating },
    away: { name: away.name, attack: away.attack, defense: away.defense, rating: away.rating },
    venue: { altitudeMeters: f.alt, homeIsHost: f.hostHome === true },
    market: consOdds ? { odds1X2: consOdds, overUnder: ou, exact } : undefined,
  });
  const m = pred.markets;
  const pH = m.result.home, pD = m.result.draw, pA = m.result.away;
  const advHome = pH + pD / 2; // ganar en 90' + empate resuelto ~50/50 en penales
  const base = {
    date: f.date, city: f.city, home: f.home, away: f.away,
    lambdaHome: +pred.lambdaHome.toFixed(2), lambdaAway: +pred.lambdaAway.toFixed(2),
    marketAnchored: pred.marketAnchored,
    p1x2: { home: Math.round(100 * pH), draw: Math.round(100 * pD), away: Math.round(100 * pA) },
    advance: { home: Math.round(100 * advHome), away: Math.round(100 * (1 - advHome)) },
    topScores: m.topScores.slice(0, 4).map((s: any) => ({ score: `${s.home}-${s.away}`, prob: Math.round(100 * s.prob) })),
    picks: {
      moda: `${pred.scorelineOptions["mas-probable"].home}-${pred.scorelineOptions["mas-probable"].away}`,
      evOptimo: `${pred.scorelineOptions["ev-optimo"].home}-${pred.scorelineOptions["ev-optimo"].away}`,
      golesEsperados: `${pred.scorelineOptions["goles-esperados"].home}-${pred.scorelineOptions["goles-esperados"].away}`,
    },
  };

  if (f.real) {
    const r = f.real;
    // Preferir la predicción PRE-partido congelada (evita contaminación post-refit).
    const pm = prematch.get(`${f.home}|${f.away}`);
    if (pm) {
      base.p1x2 = pm.p1x2;
      base.picks = { ...base.picks, moda: pm.moda, golesEsperados: pm.golesEsp };
    }
    const [mh, ma] = base.picks.moda.split("-").map(Number);
    const outcomeReal = r.h > r.a ? "home" : r.h < r.a ? "away" : "draw";
    const outcomeModel = base.p1x2.home >= base.p1x2.draw && base.p1x2.home >= base.p1x2.away ? "home"
      : base.p1x2.away >= base.p1x2.draw ? "away" : "draw";
    played.push({
      ...base,
      real: `${r.h}-${r.a}${r.pen ? ` (${r.pen})` : r.extra ? " (pró.)" : ""}`,
      realScore: { home: r.h, away: r.a },
      hitExact: mh === r.h && ma === r.a,
      hit1x2: outcomeReal === outcomeModel,
    });
  } else {
    const judge = judges.get(`${f.home} vs ${f.away}`);
    upcoming.push({
      ...base,
      market: { home: +consOdds!.home.toFixed(2), draw: +consOdds!.draw.toFixed(2), away: +consOdds!.away.toFixed(2) },
      freshMarket: !!fm,
      ouUsed: ou ? { line: ou.line, over: ou.over, under: ou.under } : null,
      marketExact: fm?.exactScores?.slice(0, 3).map((e) => ({ score: e.score, price: e.price })) ?? null,
      judge: judge ? { finalScore: judge.finalScore, altScore: judge.altScore, confidence: judge.confidence, rationale: judge.rationale } : null,
    });
  }
}

const out = { generatedAt: new Date().toISOString(), played, upcoming };
writeFileSync("data/r32_predictions.json", JSON.stringify(out, null, 2));
writeReport(out);

function writeReport(o: { generatedAt: string; played: any[]; upcoming: any[] }) {
  const L: string[] = [];
  const ex = o.played.filter((p) => p.hitExact).length;
  const r1 = o.played.filter((p) => p.hit1x2).length;
  L.push(`# 16avos de final — Mundial 2026`);
  L.push(``);
  L.push(`_Generado ${o.generatedAt}. Bracket real verificado (CBS/FOX/ESPN). Los **pendientes** se anclan a mercado real fresco (multi-casa, devig de Shin, Pinnacle al doble): con línea de goles O/U el anclaje de lambdas es COMPLETO (total + reparto), ensamblado 50/50 con el modelo propio (Poisson + Dixon-Coles). El pick final lo decide un panel de jueces (modelo + mercado de marcador exacto + noticias). Entretenimiento, no casa de apuestas._`);
  L.push(``);
  L.push(`## Ya jugados — modelo pre-partido vs resultado real`);
  L.push(``);
  L.push(`Calibración en vivo: **marcador exacto ${ex}/${o.played.length} (${Math.round(100*ex/o.played.length)}%)** · **1X2 ${r1}/${o.played.length} (${Math.round(100*r1/o.played.length)}%)**.`);
  L.push(``);
  L.push(`| Fecha | Partido | Real | 1X2 modelo | Moda | Goles-esp | Acierto |`);
  L.push(`|---|---|---|---|---|---|---|`);
  for (const r of o.played) {
    const hit = r.hitExact ? "✅ exacto" : r.hit1x2 ? "≈ 1X2" : "✗";
    L.push(`| ${r.date} | ${r.home} vs ${r.away} | **${r.real}** | ${r.p1x2.home}/${r.p1x2.draw}/${r.p1x2.away} | ${r.picks.moda} | ${r.picks.golesEsperados} | ${hit} |`);
  }
  L.push(``);
  L.push(`## Pendientes — modelo ⊗ mercado real`);
  L.push(``);
  const anyJudge = o.upcoming.some((r) => r.judge);
  L.push(`| Fecha | Partido | Mercado (consenso) | O/U | 1X2 modelo | Avanza | Top marcadores | Exacto casas | Moda${anyJudge ? " | **A jugar (juez)**" : ""} |`);
  L.push(`|---|---|---|---|---|---|---|---|---|${anyJudge ? "---|" : ""}`);
  for (const r of o.upcoming) {
    const fav = r.advance.home >= r.advance.away ? r.home : r.away;
    const favPct = Math.max(r.advance.home, r.advance.away);
    const tops = r.topScores.slice(0, 3).map((s: any) => `${s.score} ${s.prob}%`).join(" · ");
    const ouCol = r.ouUsed ? `${r.ouUsed.line} (${r.ouUsed.over}/${r.ouUsed.under})` : "—";
    const mex = r.marketExact ? r.marketExact.map((e: any) => `${e.score} @${e.price}`).join(" · ") : "—";
    const judgeCol = anyJudge ? ` **${r.judge ? `${r.judge.finalScore}` : r.picks.moda}**${r.judge ? ` (alt ${r.judge.altScore})` : ""} |` : "";
    L.push(`| ${r.date} | ${r.home} vs ${r.away} | ${r.market.home}/${r.market.draw}/${r.market.away} | ${ouCol} | ${r.p1x2.home}/${r.p1x2.draw}/${r.p1x2.away} | ${fav} ${favPct}% | ${tops} | ${mex} | ${anyJudge ? r.picks.moda : `**${r.picks.moda}**`} |${judgeCol}`);
  }
  L.push(``);
  if (anyJudge) {
    L.push(`### Racional del juez por partido`);
    L.push(``);
    for (const r of o.upcoming) {
      if (!r.judge) continue;
      L.push(`- **${r.home} vs ${r.away} → ${r.judge.finalScore}** (alt ${r.judge.altScore}, confianza ${r.judge.confidence}): ${r.judge.rationale}`);
    }
    L.push(``);
  }
  writeFileSync("REPORTE-R32.md", L.join("\n"));
}

// ---------- Tabla legible en consola ----------
const exactHits = played.filter((p) => p.hitExact).length;
const r1x2Hits = played.filter((p) => p.hit1x2).length;

console.log("\n================  16avos — YA JUGADOS (modelo pre-partido vs real)  ================");
for (const r of played) {
  const ex = r.hitExact ? "✅ exacto" : r.hit1x2 ? "≈ 1X2 ok" : "✗ falló";
  console.log(
    `\n${r.date}  ${r.home} ${r.realScore.home}-${r.realScore.away} ${r.away}  (${r.city})` +
    `\n   real: ${r.real}  | modelo moda ${r.picks.moda} · goles-esp ${r.picks.golesEsperados}  -> ${ex}` +
    `\n   1X2 modelo ${r.p1x2.home}/${r.p1x2.draw}/${r.p1x2.away}`,
  );
}
console.log(`\n[calibración en vivo] exacto: ${exactHits}/${played.length} (${Math.round(100*exactHits/played.length)}%) | 1X2: ${r1x2Hits}/${played.length} (${Math.round(100*r1x2Hits/played.length)}%)`);

console.log("\n================  16avos — PENDIENTES (modelo ⊗ mercado real)  ================");
for (const r of upcoming) {
  const fav = r.advance.home >= r.advance.away ? r.home : r.away;
  const favPct = Math.max(r.advance.home, r.advance.away);
  console.log(
    `\n${r.date}  ${r.home} vs ${r.away}  (${r.city})` +
    `\n   mercado(consenso) ${r.market.home}/${r.market.draw}/${r.market.away} | λ ${r.lambdaHome}-${r.lambdaAway}` +
    `\n   1X2 ${r.p1x2.home}/${r.p1x2.draw}/${r.p1x2.away} | avanza: ${fav} ${favPct}%` +
    `\n   marcadores: ${r.topScores.map((s: any) => `${s.score} ${s.prob}%`).join("  ")}` +
    `\n   picks → moda ${r.picks.moda} | EV-óptimo ${r.picks.evOptimo} | goles-esp ${r.picks.golesEsperados}`,
  );
}
console.log(`\n[r32] ${played.length} jugados + ${upcoming.length} pendientes -> data/r32_predictions.json`);
