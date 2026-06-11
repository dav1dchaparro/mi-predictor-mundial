// Diagnóstico y barrido de parámetros para MAXIMIZAR el acierto 1X2.
// Self-contained: replica computeLambdas pero con BASE_GOALS / escala de rating
// ajustables, para ver qué mueve de verdad la aguja. Corre: npx tsx scripts/tune.ts

import { buildScoreMatrix, result1X2 } from "../lib/model/index.js";
import { QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022 } from "../lib/backtest/qatar2022.js";
import { EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO } from "../lib/backtest/euro2024.js";
import type { BtMatch } from "../lib/backtest/qatar2022.js";

interface Cfg { base: number; ratingScale: number; rho: number; hostAdv: number }

function strength(rating: number, scale: number) {
  const z = (rating - 1800) / scale;
  return {
    attack: Math.min(Math.max(1 + z * 0.45, 0.5), 1.7),
    defense: Math.min(Math.max(1 - z * 0.45, 0.45), 1.6),
  };
}

type O = "home" | "draw" | "away";
const out = (h: number, a: number): O => (h > a ? "home" : h === a ? "draw" : "away");

function evalCfg(matches: BtMatch[], ratings: Record<string, number>, host: string, c: Cfg) {
  let hit = 0, drawPicks = 0, drawActual = 0, drawHit = 0;
  for (const m of matches) {
    const sh = strength(ratings[m.home] ?? 1700, c.ratingScale);
    const sa = strength(ratings[m.away] ?? 1700, c.ratingScale);
    const adv = m.home === host ? c.hostAdv : 1.0;
    const lh = c.base * sh.attack * sa.defense * adv;
    const la = c.base * sa.attack * sh.defense;
    const r = result1X2(buildScoreMatrix(lh, la, { rho: c.rho }));
    const pick: O = r.home >= r.draw && r.home >= r.away ? "home" : r.away >= r.draw ? "away" : "draw";
    const real = out(m.hg, m.ag);
    if (pick === real) hit++;
    if (pick === "draw") drawPicks++;
    if (real === "draw") { drawActual++; if (pick === "draw") drawHit++; }
  }
  return { hit, n: matches.length, drawPicks, drawActual, drawHit };
}

function combined(c: Cfg) {
  const q = evalCfg(QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022, c);
  const e = evalCfg(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO, c);
  return { hit: q.hit + e.hit, n: q.n + e.n, drawPicks: q.drawPicks + e.drawPicks,
           drawActual: q.drawActual + e.drawActual, q, e };
}

const baseCfg: Cfg = { base: 1.35, ratingScale: 400, rho: -0.06, hostAdv: 1.15 };
const pct = (h: number, n: number) => ((h / n) * 100).toFixed(1) + "%";

console.log("\n  DIAGNÓSTICO con la config actual:");
const cur = combined(baseCfg);
console.log(`  1X2 agregado: ${pct(cur.hit, cur.n)}  (Qatar ${pct(cur.q.hit, cur.q.n)} / Euro ${pct(cur.e.hit, cur.e.n)})`);
console.log(`  Empates: el modelo predijo ${cur.drawPicks}, hubo ${cur.drawActual} reales.`);
console.log(`  -> empates reales perdidos: ${cur.drawActual} (casi todos, porque el empate rara vez es el más probable)\n`);

console.log("  BARRIDO (base de goles x rho), buscando máximo 1X2 agregado:");
let best = { score: 0, cfg: baseCfg };
for (const base of [1.15, 1.25, 1.35, 1.45]) {
  let line = `  base=${base.toFixed(2)}  `;
  for (const rho of [-0.12, -0.08, -0.04]) {
    const c = { ...baseCfg, base, rho };
    const r = combined(c);
    const s = r.hit / r.n;
    if (s > best.score) best = { score: s, cfg: c };
    line += `rho ${rho}: ${pct(r.hit, r.n)} (${r.drawPicks}D)  `;
  }
  console.log(line);
}

console.log(`\n  Mejor config del barrido: base=${best.cfg.base}, rho=${best.cfg.rho} -> ${(best.score * 100).toFixed(1)}%`);
const b = combined(best.cfg);
console.log(`  (Qatar ${pct(b.q.hit, b.q.n)} / Euro ${pct(b.e.hit, b.e.n)}, empates predichos: ${b.drawPicks})\n`);

// --- Regla de empate: pick draw cuando P(draw) >= t (sweep del umbral) ---
function evalDrawRule(matches: BtMatch[], ratings: Record<string, number>, host: string, c: Cfg, t: number) {
  let hit = 0, drawPicks = 0, drawHit = 0;
  for (const m of matches) {
    const sh = strength(ratings[m.home] ?? 1700, c.ratingScale);
    const sa = strength(ratings[m.away] ?? 1700, c.ratingScale);
    const adv = m.home === host ? c.hostAdv : 1.0;
    const lh = c.base * sh.attack * sa.defense * adv;
    const la = c.base * sa.attack * sh.defense;
    const r = result1X2(buildScoreMatrix(lh, la, { rho: c.rho }));
    let pick: O = r.home >= r.away ? "home" : "away";
    if (r.draw >= t) pick = "draw"; // regla: si el empate es bastante probable, jugarlo
    const real = out(m.hg, m.ag);
    if (pick === real) hit++;
    if (pick === "draw") { drawPicks++; if (real === "draw") drawHit++; }
  }
  return { hit, n: matches.length, drawPicks, drawHit };
}

console.log("  REGLA DE EMPATE (jugar empate si P(empate) >= umbral):");
let bestRule = { score: cur.hit / cur.n, t: 1.0 };
for (const t of [0.32, 0.30, 0.28, 0.27, 0.26, 0.25, 0.24]) {
  const q = evalDrawRule(QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022, baseCfg, t);
  const e = evalDrawRule(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO, baseCfg, t);
  const hit = q.hit + e.hit, n = q.n + e.n;
  const dp = q.drawPicks + e.drawPicks, dh = q.drawHit + e.drawHit;
  if (hit / n > bestRule.score) bestRule = { score: hit / n, t };
  console.log(`  umbral ${t.toFixed(2)}: 1X2 ${pct(hit, n)}  (jugó ${dp} empates, acertó ${dh})  Qatar ${pct(q.hit, q.n)} / Euro ${pct(e.hit, e.n)}`);
}
console.log(`\n  -> Mejor umbral de empate: ${bestRule.t} -> ${(bestRule.score * 100).toFixed(1)}% agregado\n`);
