// Tuneo del modelo para MAXIMIZAR marcadores exactos. Fitea fuerzas sobre el
// período de entrenamiento y barre (base, rho, estrategia de decisión, nu) sobre
// un holdout temporal (últimos ~2 años). Imprime el mejor config + baselines.
// Uso: npx tsx scripts/tuneExact.ts [cutoffDays]
import { getDb } from "../lib/db/schema.js";
import { loadHistoryForFit } from "../lib/data/history.js";
import { splitByCutoff, fitTrain, evaluate, type HoldoutConfig } from "../lib/backtest/holdout.js";
import type { ScorelineStrategy } from "../lib/model/scoreline.js";

const CUTOFF = Number(process.argv[2] ?? 730); // test = últimos N días
const pct = (x: number) => (x * 100).toFixed(2) + "%";

const db = getDb();
const all = loadHistoryForFit(db, "2026-06-18T00:00:00.000Z");
const { train, test } = splitByCutoff(all, CUTOFF);
console.log(`histórico: ${all.length} | train: ${train.length} | test: ${test.length} (últimos ${CUTOFF} días)`);

console.log("fiteando fuerzas sobre train...");
const fit = fitTrain(train, { iterations: 80 });
console.log(`base fiteada (goles): ${fit.base.toFixed(3)} | ventaja local: ×${fit.homeAdvantage.toFixed(3)} | logLik=${fit.logLik.toFixed(0)}`);

// Baseline 1: siempre 1-0 (favorito). Baseline 2: marcador más común del train.
const freq = new Map<string, number>();
for (const m of train) { const k = `${m.homeGoals}-${m.awayGoals}`; freq.set(k, (freq.get(k) ?? 0) + 1); }
const mostCommon = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
let b10 = 0, bmc = 0;
for (const m of test) {
  if (m.homeGoals === 1 && m.awayGoals === 0) b10++;
  if (`${m.homeGoals}-${m.awayGoals}` === mostCommon) bmc++;
}
console.log(`baseline "siempre 1-0": ${pct(b10 / test.length)} | "siempre ${mostCommon}" (más común): ${pct(bmc / test.length)}`);

const baseMults = [0.9, 1.0, 1.1, 1.2];
const rhos = [0, -0.03, -0.06, -0.10, -0.14];
const nus = [0.85, 0.9, 1.0, 1.1, 1.2];
const strategies: ScorelineStrategy[] = ["mas-probable", "ev-optimo", "goles-esperados", "condicional-1x2"];

interface Row { cfg: HoldoutConfig; exactHit: number; hit1X2: number; rps: number; logLoss: number }
const rows: Row[] = [];
for (const baseMult of baseMults) for (const rho of rhos) for (const nu of nus) for (const strategy of strategies) {
  const cfg: HoldoutConfig = { baseMult, rho, nu, strategy };
  const m = evaluate(fit, test, cfg);
  rows.push({ cfg, ...m });
}

rows.sort((a, b) => b.exactHit - a.exactHit);
console.log(`\nTOP 12 configs por ACIERTO EXACTO (de ${rows.length} probadas):`);
console.log("  exact   1X2     rps    baseM rho    nu    estrategia");
for (const r of rows.slice(0, 12)) {
  console.log(`  ${pct(r.exactHit).padStart(6)} ${pct(r.hit1X2).padStart(6)} ${r.rps.toFixed(3)}  ${r.cfg.baseMult.toFixed(2)}  ${String(r.cfg.rho).padStart(5)}  ${r.cfg.nu!.toFixed(2)}  ${r.cfg.strategy}`);
}

// Mejor por estrategia, para ver el efecto puro de la regla de decisión.
console.log(`\nMEJOR config por ESTRATEGIA de decisión:`);
for (const s of strategies) {
  const best = rows.filter((r) => r.cfg.strategy === s)[0]!;
  console.log(`  ${s.padEnd(18)} exact=${pct(best.exactHit)}  (baseMult=${best.cfg.baseMult} rho=${best.cfg.rho} nu=${best.cfg.nu})`);
}
