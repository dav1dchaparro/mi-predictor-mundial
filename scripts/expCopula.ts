// EXPERIMENTO: ¿la cópula de Frank (admite dependencia NEGATIVA entre goles
// local/visita, que Dixon-Coles no puede) mejora el acierto de marcador exacto
// frente a la mejor config DC? Compara sobre el holdout. Solo se adopta si gana.
import { getDb } from "../lib/db/schema.js";
import { loadHistoryForFit } from "../lib/data/history.js";
import { splitByCutoff, fitTrain } from "../lib/backtest/holdout.js";
import { cmpWeight } from "../lib/model/poisson.js";

const CUTOFF = Number(process.argv[2] ?? 730);
const pct = (x: number) => (x * 100).toFixed(2) + "%";
const db = getDb();
const all = loadHistoryForFit(db, "2026-06-18T00:00:00.000Z");
const { train, test } = splitByCutoff(all, CUTOFF);
const fit = fitTrain(train, { iterations: 120 });

const NU = 1.10, MAXG = 10;

// pmf marginal CMP normalizada.
function marg(lambda: number): number[] {
  const w = Array.from({ length: MAXG + 1 }, (_, k) => cmpWeight(k, lambda, NU));
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x) => x / s);
}
// CDF acumulada.
function cdf(p: number[]): number[] { const c: number[] = []; let s = 0; for (const x of p) { s += x; c.push(s); } return c; }

// Cópula de Frank C(u,v;theta).
function frank(u: number, v: number, theta: number): number {
  if (Math.abs(theta) < 1e-8) return u * v; // independencia
  const e = Math.exp(-theta);
  return -1 / theta * Math.log(1 + (Math.exp(-theta * u) - 1) * (Math.exp(-theta * v) - 1) / (e - 1));
}

type Outcome = "home" | "draw" | "away";
const oc = (h: number, a: number): Outcome => (h > a ? "home" : h === a ? "draw" : "away");

// Modo de la matriz construida con dependencia: DC (rho) o Frank (theta).
function evalConfig(mode: "dc" | "frank", param: number, baseMult: number): { exact: number; n: number } {
  let exact = 0, n = 0;
  const base = fit.base * baseMult;
  for (const m of test) {
    const atkH = fit.attack.get(m.home), defH = fit.defense.get(m.home);
    const atkA = fit.attack.get(m.away), defA = fit.defense.get(m.away);
    if (atkH == null || defH == null || atkA == null || defA == null) continue;
    const g = m.neutral ? 1 : fit.homeAdvantage;
    const lh = base * atkH * defA * g, la = base * atkA * defH;
    const ph = marg(lh), pa = marg(la);
    let bh = 0, ba = 0, bp = -1;
    if (mode === "frank") {
      const Fh = cdf(ph), Fa = cdf(pa);
      for (let h = 0; h <= MAXG; h++) for (let a = 0; a <= MAXG; a++) {
        const u1 = Fh[h]!, u0 = h > 0 ? Fh[h - 1]! : 0;
        const v1 = Fa[a]!, v0 = a > 0 ? Fa[a - 1]! : 0;
        const p = frank(u1, v1, param) - frank(u0, v1, param) - frank(u1, v0, param) + frank(u0, v0, param);
        if (p > bp) { bp = p; bh = h; ba = a; }
      }
    } else {
      // DC: rho retoca las 4 celdas bajas.
      for (let h = 0; h <= MAXG; h++) for (let a = 0; a <= MAXG; a++) {
        let tau = 1;
        if (h === 0 && a === 0) tau = 1 - lh * la * param;
        else if (h === 0 && a === 1) tau = 1 + lh * param;
        else if (h === 1 && a === 0) tau = 1 + la * param;
        else if (h === 1 && a === 1) tau = 1 - param;
        const p = ph[h]! * pa[a]! * Math.max(0, tau);
        if (p > bp) { bp = p; bh = h; ba = a; }
      }
    }
    if (bh === m.homeGoals && ba === m.awayGoals) exact++;
    n++;
  }
  return { exact: exact / n, n };
}

console.log(`test: ${test.length} partidos | nu=${NU}`);
console.log("\nDixon-Coles (rho):");
for (const rho of [0, -0.03, -0.05, -0.10]) for (const bm of [1.0, 1.1]) {
  const r = evalConfig("dc", rho, bm); console.log(`  rho=${String(rho).padStart(5)} baseM=${bm} -> exacto ${pct(r.exact)}`);
}
console.log("\nFrank copula (theta; <0 = dependencia negativa):");
for (const th of [0, -0.5, -1.0, -2.0, 0.5]) for (const bm of [1.0, 1.1]) {
  const r = evalConfig("frank", th, bm); console.log(`  theta=${String(th).padStart(5)} baseM=${bm} -> exacto ${pct(r.exact)}`);
}
