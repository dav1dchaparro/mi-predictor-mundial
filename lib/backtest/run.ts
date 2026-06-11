// Motor del backtest: corre el modelo sobre cada partido histórico y compara
// con el resultado real. Métricas: acierto 1X2, acierto marcador exacto y los
// puntos de polla que el modelo habría cosechado.

import { computeLambdas, buildScoreMatrix, result1X2, topExactScores, optimalPick, type PollaRules } from "../model/index.js";
import { strengthFromRating } from "../data/seed.js";
import { QATAR_RATINGS, QATAR_GROUP_MATCHES, HOST_2022, type BtMatch } from "./qatar2022.js";

type Outcome = "home" | "draw" | "away";
function outcomeOf(hg: number, ag: number): Outcome {
  return hg > ag ? "home" : hg === ag ? "draw" : "away";
}

export interface BacktestResult {
  matches: number;
  hit1X2: number;
  hitExact: number;
  rate1X2: number;
  rateExact: number;
  /** puntos de polla logrados vs máximo teórico si se clavara todo. */
  pollaPoints: number;
  pollaMax: number;
  /** baseline: acertar "gana siempre el favorito por rating" para comparar. */
  baseline1X2: number;
  details: {
    match: string;
    real: string;
    pick1X2: Outcome;
    pickExact: string;
    pollaPick: string;
    hit1X2: boolean;
    hitExact: boolean;
    pts: number;
  }[];
}

const DEFAULT_RULES: PollaRules = { exactScore: 5, correctResult: 2, goalDifference: 1 };

function pollaPointsFor(pickH: number, pickA: number, hg: number, ag: number, rules: PollaRules): number {
  if (pickH === hg && pickA === ag) return rules.exactScore;
  let pts = 0;
  if (outcomeOf(pickH, pickA) === outcomeOf(hg, ag)) pts += rules.correctResult;
  if (rules.goalDifference && pickH - pickA === hg - ag && hg - ag !== 0) pts += rules.goalDifference;
  return pts;
}

export function runBacktest(
  matches: BtMatch[] = QATAR_GROUP_MATCHES,
  ratings: Record<string, number> = QATAR_RATINGS,
  host = HOST_2022,
  rules: PollaRules = DEFAULT_RULES,
): BacktestResult {
  let hit1X2 = 0, hitExact = 0, pollaPoints = 0, baseline1X2 = 0;
  const details: BacktestResult["details"] = [];

  for (const m of matches) {
    const rh = ratings[m.home] ?? 1700;
    const ra = ratings[m.away] ?? 1700;
    const home = { name: m.home, rating: rh, ...strengthFromRating(rh) };
    const away = { name: m.away, rating: ra, ...strengthFromRating(ra) };

    const { lambdaHome, lambdaAway } = computeLambdas({
      home, away, venue: { homeIsHost: m.home === host },
    });
    const sm = buildScoreMatrix(lambdaHome, lambdaAway, { rho: -0.14 });

    // pick 1X2 = resultado más probable
    const r = result1X2(sm);
    const pick1X2: Outcome =
      r.home >= r.draw && r.home >= r.away ? "home" : r.away >= r.draw ? "away" : "draw";
    // pick marcador = el más probable; pick de polla = el de máximos pts esperados
    const ml = topExactScores(sm, 1)[0]!;
    const { best } = optimalPick(sm, rules);

    const realOutcome = outcomeOf(m.hg, m.ag);
    const wasHit1X2 = pick1X2 === realOutcome;
    const wasHitExact = ml.home === m.hg && ml.away === m.ag;
    const pts = pollaPointsFor(best.home, best.away, m.hg, m.ag, rules);

    if (wasHit1X2) hit1X2++;
    if (wasHitExact) hitExact++;
    pollaPoints += pts;
    // baseline: favorito por rating (con ventaja de sede mínima) gana
    const favHome = rh + (m.home === host ? 80 : 0) >= ra;
    if ((favHome && realOutcome === "home") || (!favHome && realOutcome === "away")) baseline1X2++;

    details.push({
      match: `${m.home} vs ${m.away}`,
      real: `${m.hg}-${m.ag}`,
      pick1X2,
      pickExact: `${ml.home}-${ml.away}`,
      pollaPick: `${best.home}-${best.away}`,
      hit1X2: wasHit1X2,
      hitExact: wasHitExact,
      pts,
    });
  }

  const n = matches.length;
  return {
    matches: n,
    hit1X2,
    hitExact,
    rate1X2: hit1X2 / n,
    rateExact: hitExact / n,
    pollaPoints,
    pollaMax: n * rules.exactScore,
    baseline1X2: baseline1X2 / n,
    details,
  };
}
