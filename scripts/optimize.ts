// Grid search HONESTO: busca la config (base de goles, escala de rating, rho)
// que maximiza marcador exacto y puntos de polla en el AGREGADO de los 3
// torneos, y reporta el desglose por torneo para detectar overfit.
// Correr: npx tsx scripts/optimize.ts

import { buildScoreMatrix, topExactScores, optimalPick, type PollaRules } from "../lib/model/index.js";
import { QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022, type BtMatch } from "../lib/backtest/qatar2022.js";
import { EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO } from "../lib/backtest/euro2024.js";
import { WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018 } from "../lib/backtest/wc2018.js";

const RULES: PollaRules = { exactScore: 5, correctResult: 2, goalDifference: 1 };

interface Cfg { base: number; scale: number; rho: number }

function strength(rating: number, scale: number) {
  const z = (rating - 1800) / scale;
  return {
    attack: Math.min(Math.max(1 + z * 0.45, 0.5), 1.7),
    defense: Math.min(Math.max(1 - z * 0.45, 0.45), 1.6),
  };
}

const out = (h: number, a: number) => (h > a ? 1 : h === a ? 0 : -1);
function pollaPts(ph: number, pa: number, hg: number, ag: number) {
  if (ph === hg && pa === ag) return RULES.exactScore;
  let p = 0;
  if (out(ph, pa) === out(hg, ag)) p += RULES.correctResult;
  if (RULES.goalDifference && ph - pa === hg - ag && hg - ag !== 0) p += RULES.goalDifference;
  return p;
}

const TOURNAMENTS = [
  { name: "2018", matches: WC2018_GROUP_MATCHES, ratings: WC2018_RATINGS, host: HOST_2018 },
  { name: "2022", matches: QATAR_GROUP_MATCHES, ratings: QATAR_RATINGS, host: HOST_2022 },
  { name: "Euro", matches: EURO_GROUP_MATCHES, ratings: EURO_RATINGS, host: HOST_EURO },
];

function evalTournament(t: typeof TOURNAMENTS[number], c: Cfg) {
  let exact = 0, polla = 0;
  for (const m of t.matches as BtMatch[]) {
    const sh = strength(t.ratings[m.home] ?? 1700, c.scale);
    const sa = strength(t.ratings[m.away] ?? 1700, c.scale);
    const adv = m.home === t.host ? 1.15 : 1.0;
    const lh = c.base * sh.attack * sa.defense * adv;
    const la = c.base * sa.attack * sh.defense;
    const sm = buildScoreMatrix(lh, la, { rho: c.rho });
    const ml = topExactScores(sm, 1)[0]!;
    if (ml.home === m.hg && ml.away === m.ag) exact++;
    const { best } = optimalPick(sm, RULES);
    polla += pollaPts(best.home, best.away, m.hg, m.ag);
  }
  return { exact, polla, n: t.matches.length };
}

function evalCfg(c: Cfg) {
  const per = TOURNAMENTS.map((t) => ({ name: t.name, ...evalTournament(t, c) }));
  const exact = per.reduce((s, p) => s + p.exact, 0);
  const polla = per.reduce((s, p) => s + p.polla, 0);
  const n = per.reduce((s, p) => s + p.n, 0);
  return { per, exact, polla, n };
}

const baseline: Cfg = { base: 1.35, scale: 400, rho: -0.06 };
const b = evalCfg(baseline);
const pct = (x: number, n: number) => ((x / n) * 100).toFixed(1) + "%";
console.log(`\n  BASELINE (base=1.35, scale=400, rho=-0.06):`);
console.log(`  Exacto: ${b.exact}/${b.n} ${pct(b.exact, b.n)}  |  Polla: ${b.polla} pts`);
console.log(`  por torneo: ${b.per.map((p) => `${p.name} ex${p.exact}/pl${p.polla}`).join("  ")}\n`);

console.log("  GRID SEARCH (optimizando puntos de polla, robusto entre torneos):");
let best = { polla: b.polla, exact: b.exact, cfg: baseline };
const results: { c: Cfg; exact: number; polla: number; minRatio: number }[] = [];
for (const base of [1.15, 1.2, 1.25, 1.3, 1.35, 1.4]) {
  for (const scale of [300, 350, 400, 450]) {
    for (const rho of [-0.14, -0.1, -0.06, -0.03]) {
      const c = { base, scale, rho };
      const r = evalCfg(c);
      // robustez: que ningún torneo empeore mucho su polla vs baseline proporcional
      const ratios = r.per.map((p, i) => p.polla / Math.max(b.per[i]!.polla, 1));
      const minRatio = Math.min(...ratios);
      results.push({ c, exact: r.exact, polla: r.polla, minRatio });
      if (r.polla > best.polla) best = { polla: r.polla, exact: r.exact, cfg: c };
    }
  }
}

// top 5 por puntos de polla, mostrando si son robustos
results.sort((x, y) => y.polla - x.polla);
console.log("  Top configs por puntos de polla:");
for (const r of results.slice(0, 6)) {
  const robust = r.minRatio >= 0.95 ? "robusto" : "frágil ";
  console.log(`  base=${r.c.base} scale=${r.c.scale} rho=${r.c.rho}  ->  polla ${r.polla}  exacto ${r.exact}  [${robust} min=${r.minRatio.toFixed(2)}]`);
}

console.log(`\n  Mejor: base=${best.cfg.base}, scale=${best.cfg.scale}, rho=${best.cfg.rho}`);
const win = evalCfg(best.cfg);
console.log(`  Polla ${win.polla} (baseline ${b.polla}, +${win.polla - b.polla})  |  Exacto ${win.exact}/${win.n} ${pct(win.exact, win.n)} (baseline ${pct(b.exact, b.n)})`);
console.log(`  por torneo: ${win.per.map((p) => `${p.name} ex${p.exact}/pl${p.polla}`).join("  ")}\n`);
