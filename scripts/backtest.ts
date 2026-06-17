// Reporte de backtest. Correr: npx tsx scripts/backtest.ts
import { runBacktest, type BacktestResult } from "../lib/backtest/run.js";
import { calibration } from "../lib/backtest/calibration.js";
import { QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022 } from "../lib/backtest/qatar2022.js";
import { EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO } from "../lib/backtest/euro2024.js";
import { WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018 } from "../lib/backtest/wc2018.js";

const pct = (x: number) => (x * 100).toFixed(1) + "%";

function report(title: string, r: BacktestResult, detail = false) {
  console.log(`\n  BACKTEST · ${title} (fase de grupos, ${r.matches} partidos)\n`);
  console.log(`  Acierto 1X2:             ${r.hit1X2}/${r.matches}  ${pct(r.rate1X2)}   (umbral ~50%)`);
  console.log(`  Acierto marcador exacto: ${r.hitExact}/${r.matches}  ${pct(r.rateExact)}   (umbral ~9-10%)`);
  console.log(`  Baseline (favorito Elo): ${pct(r.baseline1X2)}`);
  console.log(`  Puntos de polla:         ${r.pollaPoints}/${r.pollaMax}  (${pct(r.pollaPoints / r.pollaMax)} del máximo)`);
  if (detail) {
    console.log("\n  " + "PARTIDO".padEnd(34) + "REAL  1X2   EXACTO  POLLA  PTS");
    for (const d of r.details) {
      const flag = d.hitExact ? "**" : d.hit1X2 ? " ·" : "  ";
      console.log(
        "  " + d.match.padEnd(34) + d.real.padEnd(6) +
        (d.hit1X2 ? "OK " : "-- ").padEnd(6) + d.pickExact.padEnd(8) +
        d.pollaPick.padEnd(7) + String(d.pts).padStart(2) + " " + flag,
      );
    }
  }
}

const wc2018 = runBacktest(WC2018_GROUP_MATCHES, WC2018_RATINGS, HOST_2018);
const qatar = runBacktest(QATAR_GROUP_MATCHES, QATAR_RATINGS, HOST_2022);
const euro = runBacktest(EURO_GROUP_MATCHES, EURO_RATINGS, HOST_EURO);

report("Mundial Rusia 2018", wc2018);
report("Mundial Qatar 2022", qatar, true);
report("Euro 2024", euro);

// Agregado de los tres torneos.
const all = [wc2018, qatar, euro];
const n = all.reduce((s, r) => s + r.matches, 0);
const hit1X2 = all.reduce((s, r) => s + r.hit1X2, 0);
const hitExact = all.reduce((s, r) => s + r.hitExact, 0);
const pollaPoints = all.reduce((s, r) => s + r.pollaPoints, 0);
const pollaMax = all.reduce((s, r) => s + r.pollaMax, 0);
// Error estándar binomial del acierto 1X2, para honestidad estadística.
const p = hit1X2 / n;
const se = Math.sqrt((p * (1 - p)) / n);
console.log(`\n  ── AGREGADO (${n} partidos, 3 torneos) ──`);
console.log(`  Acierto 1X2:             ${pct(p)}  ± ${(se * 100).toFixed(1)}% (IC95 ~${pct(p - 1.96 * se)}–${pct(p + 1.96 * se)})`);
console.log(`  Acierto marcador exacto: ${pct(hitExact / n)}`);
console.log(`  Puntos de polla:         ${pollaPoints}/${pollaMax}  (${pct(pollaPoints / pollaMax)})\n`);

// ── CALIBRACIÓN (curvas de fiabilidad) ──
const points = all.flatMap((r) => r.details.map((d) => ({ probs: d.probs, realOutcome: d.realOutcome })));
const cal = calibration(points, 10);
console.log(`  ── CALIBRACIÓN (${cal.n} partidos, ${cal.n * 3} probabilidades 1X2) ──`);
console.log(`  Brier score:  ${cal.brier.toFixed(4)}   (0 = perfecto; azar 1X2 ≈ 0.2222; menor es mejor)`);
console.log(`  Sesgo empate: P(X) media ${pct(cal.meanDrawProb)} vs empates reales ${pct(cal.drawRate)}  -> ${cal.drawBias >= 0 ? "+" : ""}${(cal.drawBias * 100).toFixed(1)} pp ${cal.drawBias > 0.02 ? "(SOBREESTIMA empates)" : cal.drawBias < -0.02 ? "(SUBESTIMA empates)" : "(ok)"}`);
console.log(`\n  Bin prob.   n    predicho   observado   (| = predicho, # = observado)`);
for (const b of cal.bins) {
  if (!b.count) continue;
  const bar = (x: number) => "#".repeat(Math.round(x * 20));
  console.log(
    `  ${pct(b.lo).padStart(5)}-${pct(b.hi).padEnd(5)} ${String(b.count).padStart(4)}   ${pct(b.meanPred).padStart(7)}   ${pct(b.observed).padStart(8)}   ${bar(b.observed)}`,
  );
}
console.log("");
