// Tuning EXPANDIDO in-torneo: además de rho/nu/baseMult/estrategia, barre el decay
// temporal xi (re-fitea por cada xi). Test = los 48 partidos del Mundial 2026.
// Reporta el top global y el mejor por estrategia. Uso: npx tsx scripts/tuneWC2.ts
import { getDb } from "../lib/db/schema.js";
import { resolve } from "../lib/data/teamNames.js";
import { fitDixonColes, type FitMatch } from "../lib/model/fit.js";
import { evaluate, type HoldoutConfig } from "../lib/backtest/holdout.js";
import type { ScorelineStrategy } from "../lib/model/scoreline.js";

const db = getDb();
const NOW = "2026-06-25T00:00:00.000Z";
const WC_START = "2026-06-11";
const pct = (x: number) => (x * 100).toFixed(1) + "%";

interface H { home_name: string; away_name: string; home_goals: number; away_goals: number; played_at: string; neutral: number | null; tournament: string | null }
const rows = db.prepare("SELECT home_name, away_name, home_goals, away_goals, played_at, neutral, tournament FROM matches_history").all() as H[];
const nowMs = Date.parse(NOW);
const toFit = (r: H): FitMatch => ({
  home: resolve(r.home_name), away: resolve(r.away_name),
  homeGoals: r.home_goals, awayGoals: r.away_goals,
  daysAgo: Math.max(0, (nowMs - Date.parse(r.played_at)) / 86_400_000),
  neutral: r.neutral === 1,
});
const train = rows.filter((r) => r.played_at.slice(0, 10) < WC_START).map(toFit);
const test = rows.filter((r) => r.tournament === "FIFA World Cup" && r.played_at.slice(0, 10) >= WC_START).map(toFit);
console.log(`train ${train.length} | test ${test.length} (Mundial 2026)\n`);

const xis = [0.0010, 0.0019, 0.0030, 0.0045];
const baseMults = [0.9, 1.0, 1.1, 1.2, 1.3];
const rhos = [0, -0.03, -0.05, -0.08, -0.12];
const nus = [0.85, 0.95, 1.05, 1.15, 1.25];
const strategies: ScorelineStrategy[] = ["mas-probable", "ev-optimo", "goles-esperados", "condicional-1x2"];

interface Row { xi: number; cfg: HoldoutConfig; exactHit: number; hit1X2: number }
const out: Row[] = [];
for (const xi of xis) {
  const fit = fitDixonColes(train, { xi, rho: -0.06, iterations: 150 });
  for (const baseMult of baseMults) for (const rho of rhos) for (const nu of nus) for (const strategy of strategies) {
    const cfg: HoldoutConfig = { baseMult, rho, nu, strategy };
    const m = evaluate(fit, test, cfg);
    out.push({ xi, cfg, exactHit: m.exactHit, hit1X2: m.hit1X2 });
  }
  console.log(`xi=${xi} (vida media ~${Math.round(Math.LN2 / xi)}d) evaluado`);
}
out.sort((a, b) => b.exactHit - a.exactHit);
console.log(`\nTOP 15 (de ${out.length}):`);
console.log("  exact   1X2    xi      baseM rho    nu    estrategia");
for (const r of out.slice(0, 15))
  console.log(`  ${pct(r.exactHit).padStart(6)} ${pct(r.hit1X2).padStart(6)}  ${r.xi.toFixed(4)}  ${r.cfg.baseMult.toFixed(2)}  ${String(r.cfg.rho).padStart(5)}  ${r.cfg.nu!.toFixed(2)}  ${r.cfg.strategy}`);
console.log(`\nMEJOR por estrategia:`);
for (const s of strategies) {
  const b = out.filter((r) => r.cfg.strategy === s)[0]!;
  console.log(`  ${s.padEnd(18)} exact=${pct(b.exactHit)} (xi=${b.xi} baseMult=${b.cfg.baseMult} rho=${b.cfg.rho} nu=${b.cfg.nu})`);
}
