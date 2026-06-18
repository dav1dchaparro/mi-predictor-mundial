// Backtest HOLDOUT temporal sobre el histórico real de selecciones, con el ÚNICO
// objetivo de maximizar la TASA DE ACIERTO DE MARCADOR EXACTO (pérdida 0-1).
//
// Protocolo: se fitea fuerzas (ataque/defensa/ventaja-local) sobre los partidos
// ANTERIORES al corte y se predice el período posterior, sin mirar el futuro.
// Para cada partido de test se construye la matriz de marcadores y se elige UN
// marcador según la regla de decisión; se compara con el real. Métricas:
//   - exactHit: % de marcadores exactos clavados  (la que importa)
//   - rps:      Ranked Probability Score del 1X2  (calidad de la distribución)
//   - logLoss:  log-loss del 1X2
//   - hit1X2:   % de resultados acertados (referencia)
// La regla de decisión y rho/BASE se barren por grid-search para hallar el óptimo.

import { buildScoreMatrix } from "../model/poisson.js";
import { result1X2 } from "../model/markets.js";
import { pickScoreline, type ScorelineStrategy } from "../model/scoreline.js";
import { fitDixonColes, type FitMatch, type FitResult } from "../model/fit.js";
import type { PollaRules } from "../model/polla.js";

const RULES: PollaRules = { exactScore: 5, correctResult: 2, goalDifference: 1 };

export interface HoldoutConfig {
  /** multiplicador sobre el nivel base fiteado (fit.base). 1 = MLE. */
  baseMult: number;
  /** corrección Dixon-Coles. */
  rho: number;
  /** regla para elegir el marcador a jugar. */
  strategy: ScorelineStrategy;
  /** sobredispersión Conway-Maxwell-Poisson (1 = Poisson). */
  nu?: number;
  maxGoals?: number;
}

export interface HoldoutMetrics {
  n: number;
  exactHit: number;
  hit1X2: number;
  rps: number;
  logLoss: number;
}

type Outcome = "home" | "draw" | "away";
const outcomeOf = (h: number, a: number): Outcome => (h > a ? "home" : h === a ? "draw" : "away");

/** Divide por fecha: train = daysAgo > corte, test = daysAgo <= corte. */
export function splitByCutoff(matches: FitMatch[], cutoffDays: number): { train: FitMatch[]; test: FitMatch[] } {
  const train: FitMatch[] = [], test: FitMatch[] = [];
  for (const m of matches) (m.daysAgo > cutoffDays ? train : test).push(m);
  return { train, test };
}

/** Ranked Probability Score del 1X2 (orden home < draw < away). 0 = perfecto. */
function rps1x2(p: { home: number; draw: number; away: number }, real: Outcome): number {
  const cumP = [p.home, p.home + p.draw];
  const y = real === "home" ? [1, 1] : real === "draw" ? [0, 1] : [0, 0];
  return 0.5 * ((cumP[0]! - y[0]!) ** 2 + (cumP[1]! - y[1]!) ** 2);
}

/**
 * Evalúa una config sobre el test usando fuerzas ya fiteadas. No re-fitea: las
 * fuerzas son independientes de (base, rho, strategy, nu), así que el grid-search
 * reusa un único fit (rápido).
 */
export function evaluate(fit: FitResult, test: FitMatch[], cfg: HoldoutConfig): HoldoutMetrics {
  const maxGoals = cfg.maxGoals ?? 10;
  let exact = 0, hit = 0, rps = 0, ll = 0, n = 0;
  for (const m of test) {
    const atkH = fit.attack.get(m.home), defH = fit.defense.get(m.home);
    const atkA = fit.attack.get(m.away), defA = fit.defense.get(m.away);
    if (atkH == null || defH == null || atkA == null || defA == null) continue; // equipo no visto en train
    const gamma = m.neutral ? 1 : fit.homeAdvantage;
    const base = fit.base * cfg.baseMult;
    const lambdaHome = base * atkH * defA * gamma;
    const lambdaAway = base * atkA * defH;
    const sm = buildScoreMatrix(lambdaHome, lambdaAway, { rho: cfg.rho, maxGoals, nu: cfg.nu });

    const pick = pickScoreline(sm, RULES, cfg.strategy);
    const real = outcomeOf(m.homeGoals, m.awayGoals);
    if (pick.home === m.homeGoals && pick.away === m.awayGoals) exact++;

    const r = result1X2(sm);
    const pick1X2: Outcome = r.home >= r.draw && r.home >= r.away ? "home" : r.away >= r.draw ? "away" : "draw";
    if (pick1X2 === real) hit++;
    rps += rps1x2(r, real);
    ll += -Math.log(Math.max(r[real], 1e-12));
    n++;
  }
  return { n, exactHit: exact / n, hit1X2: hit / n, rps: rps / n, logLoss: ll / n };
}

/** Fitea fuerzas sobre el train (sólo una vez por barrido de params). */
export function fitTrain(train: FitMatch[], opts: { xi?: number; rho?: number; iterations?: number } = {}): FitResult {
  return fitDixonColes(train, { xi: opts.xi ?? 0.0019, rho: opts.rho ?? -0.06, iterations: opts.iterations ?? 80 });
}
