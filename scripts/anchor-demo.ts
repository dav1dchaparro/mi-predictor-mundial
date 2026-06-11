// Compara: modelo solo vs modelo anclado al mercado (cuotas reales de Betano)
// vs lo que la propia casa publica en su mercado de marcador exacto.
// Partido: México vs Sudáfrica (Mundial 2026). Correr: npx tsx scripts/anchor-demo.ts

import {
  computeLambdas, buildScoreMatrix, topExactScores, result1X2,
  marketLambdas, blendLambdas, fairProbs1X2,
} from "../lib/model/index.js";
import { strengthFromRating } from "../lib/data/seed.js";

const mexico = { name: "México", rating: 1880, ...strengthFromRating(1880) };
const rsa = { name: "Sudáfrica", rating: 1650, ...strengthFromRating(1650) };

// Cuotas reales de Betano (scrapeadas).
const odds1X2 = { home: 1.45, draw: 4.3, away: 8.0 };
const overUnder = { line: 2.5, over: 2.15, under: 1.7 };

const pct = (x: number) => (x * 100).toFixed(1) + "%";
function report(title: string, lh: number, la: number) {
  const sm = buildScoreMatrix(lh, la, { rho: -0.14 });
  const r = result1X2(sm);
  const top = topExactScores(sm, 4);
  console.log(`\n  ${title}`);
  console.log(`    Goles esp: ${lh.toFixed(2)} - ${la.toFixed(2)}  |  1X2: ${pct(r.home)} / ${pct(r.draw)} / ${pct(r.away)}`);
  console.log(`    Marcador a jugar: ${top[0]!.home}-${top[0]!.away} (${pct(top[0]!.prob)})  ·  top: ${top.map((s) => `${s.home}-${s.away}`).join(", ")}`);
}

// 1) Modelo solo
const model = computeLambdas({ home: mexico, away: rsa, venue: { homeIsHost: true } });
report("MODELO SOLO", model.lambdaHome, model.lambdaAway);

// 2) Mercado puro (cuotas invertidas)
const mkt = marketLambdas(odds1X2, overUnder);
report("MERCADO PURO (cuotas Betano invertidas)", mkt.lambdaHome, mkt.lambdaAway);

// 3) Ensamble 50/50
const blend = blendLambdas(model, mkt, 0.5);
report("ANCLADO 50/50 (modelo + mercado)", blend.lambdaHome, blend.lambdaAway);

// Referencia: lo que paga Betano
const fair = fairProbs1X2(odds1X2);
console.log(`\n  BETANO (referencia):`);
console.log(`    1X2 justo: ${pct(fair.home)} / ${pct(fair.draw)} / ${pct(fair.away)}`);
console.log(`    Marcador exacto que MENOS paga: 1-0 (5.0), luego 2-0 (5.8), 0-0 (7.9), 1-1 (8.75)`);
