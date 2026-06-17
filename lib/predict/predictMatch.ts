// Orquesta la predicción de UN partido: lee fuerzas de la DB, calcula lambdas,
// construye la matriz y deriva todos los mercados. Resultado serializable a JSON
// para guardarlo en la tabla predictions con timestamp.

import {
  computeLambdas, buildScoreMatrix, deriveAllMarkets, optimalPick,
  cardsMarket, cornersMarket, marketLambdas, blendLambdas, anchorResultLambdas,
  type AllMarkets, type PollaRules, type Odds1X2, type OverUnderOdds,
} from "../model/index.js";
import type { TeamStrength } from "../model/lambda.js";

export interface MatchContext {
  home: TeamStrength;
  away: TeamStrength;
  homeName: string;
  awayName: string;
  venue?: { altitudeMeters?: number; tempCelsius?: number; homeIsHost?: boolean };
  /** promedios para mercados secundarios (de match_stats históricos). */
  cards?: { homeAvg: number; awayAvg: number; intensity?: number };
  corners?: { homeAvg: number; awayAvg: number };
  pollaRules?: PollaRules;
  /**
   * Cuotas de mercado opcionales (Betano). Si llegan, se anclan al modelo.
   * overUnder es opcional: con él el anclaje es completo; sin él se ancla solo
   * el 1X2. `exact` es el mercado de marcador exacto de la casa: cuando existe,
   * su marcador menos pago es la recomendación directa para el prode.
   */
  market?: {
    odds1X2: Odds1X2;
    overUnder?: OverUnderOdds;
    exact?: { score: string; price: number }[];
    weight?: number;
  };
}

export type PickSource = "market-anchored" | "model";

export interface MatchPrediction {
  homeName: string;
  awayName: string;
  lambdaHome: number;
  lambdaAway: number;
  /** true si los lambdas se promediaron con el mercado. */
  marketAnchored: boolean;
  markets: AllMarkets;
  cards?: ReturnType<typeof cardsMarket>;
  corners?: ReturnType<typeof cornersMarket>;
  pollaPick?: { home: number; away: number; expectedPoints: number; mostLikely: { home: number; away: number } };
  /** Marcador recomendado para el prode. SIEMPRE lo decide el modelo. */
  recommended: { home: number; away: number; prob?: number; source: PickSource };
  /** Cuotas de mercado usadas para anclar (para mostrarlas en la UI). */
  marketUsed?: { home: number; draw: number; away: number; ouOver?: number; ouUnder?: number };
  /** Marcador exacto que más cree Betano (lo que menos paga). Solo referencia. */
  betanoReference?: { home: number; away: number; agrees: boolean };
}

// Reglas de prode por defecto, alineadas con el backtest validado (lib/backtest/
// run.ts). Premian clavar el marcador exacto, pero también acertar el resultado
// (1X2) y la diferencia de goles. Con correctResult > 0 el pick óptimo respeta el
// favoritismo del 1X2 en vez de colapsar a 1-1, que es la moda que infla la
// corrección Dixon-Coles para casi cualquier favorito moderado.
const DEFAULT_POLLA: PollaRules = { exactScore: 5, correctResult: 2, goalDifference: 1 };

/** "1-0" -> {home:1, away:0}. Devuelve null si no parsea. */
function parseScore(s: string): { home: number; away: number } | null {
  const m = s.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!m) return null;
  return { home: Number(m[1]), away: Number(m[2]) };
}

export function predictMatch(ctx: MatchContext): MatchPrediction {
  const modelLambdas = computeLambdas({
    home: ctx.home,
    away: ctx.away,
    venue: ctx.venue,
  });

  // Ensamble con el mercado si llegan cuotas (captura lesiones/alineaciones).
  let lambdaHome = modelLambdas.lambdaHome;
  let lambdaAway = modelLambdas.lambdaAway;
  let marketAnchored = false;
  if (ctx.market) {
    const weight = ctx.market.weight ?? 0.5; // ensamble 50/50: el mercado afina, el modelo decide
    if (ctx.market.overUnder) {
      // anclaje completo: total (O/U) + reparto (1X2)
      const ml = marketLambdas(ctx.market.odds1X2, ctx.market.overUnder);
      const blended = blendLambdas(modelLambdas, ml, weight);
      lambdaHome = blended.lambdaHome;
      lambdaAway = blended.lambdaAway;
    } else {
      // solo 1X2 (cuotas de liga): mantener el total del modelo, re-repartir
      const total = modelLambdas.lambdaHome + modelLambdas.lambdaAway;
      const anchored = anchorResultLambdas(total, ctx.market.odds1X2);
      const blended = blendLambdas(modelLambdas, anchored, weight);
      lambdaHome = blended.lambdaHome;
      lambdaAway = blended.lambdaAway;
    }
    marketAnchored = true;
  }

  // rho -0.14: corrección Dixon-Coles calibrada por grid search (scripts/optimize.ts).
  const sm = buildScoreMatrix(lambdaHome, lambdaAway, { rho: -0.14 });
  const markets = deriveAllMarkets(sm);

  const rules = ctx.pollaRules ?? DEFAULT_POLLA;
  const { best } = optimalPick(sm, rules);
  const mostLikely = markets.topScores[0]!;

  // El marcador a jugar es el que MAXIMIZA los puntos esperados de la polla, no la
  // moda de la matriz. Con favoritos moderados (lambda ~1.3-1.9) la moda colapsa a
  // 1-1 por el boost Dixon-Coles aunque el 1X2 favorezca claramente a un equipo;
  // el óptimo de puntos esperados sí respeta ese favoritismo. El más probable
  // queda en topScores y en pollaPick.mostLikely como referencia. Betano es input.
  const recommended: MatchPrediction["recommended"] = {
    home: best.home, away: best.away, prob: best.exactProb,
    source: marketAnchored ? "market-anchored" : "model",
  };

  // Referencia: el marcador exacto que más cree la casa (solo para comparar).
  let betanoReference: MatchPrediction["betanoReference"];
  const be = ctx.market?.exact?.[0];
  const parsed = be ? parseScore(be.score) : null;
  if (parsed) {
    betanoReference = {
      home: parsed.home, away: parsed.away,
      agrees: parsed.home === mostLikely.home && parsed.away === mostLikely.away,
    };
  }

  const out: MatchPrediction = {
    homeName: ctx.homeName,
    awayName: ctx.awayName,
    lambdaHome,
    lambdaAway,
    marketAnchored,
    markets,
    recommended,
    pollaPick: {
      home: best.home,
      away: best.away,
      expectedPoints: best.expectedPoints,
      mostLikely: { home: mostLikely.home, away: mostLikely.away },
    },
  };

  if (ctx.market) {
    out.marketUsed = {
      home: ctx.market.odds1X2.home, draw: ctx.market.odds1X2.draw, away: ctx.market.odds1X2.away,
      ouOver: ctx.market.overUnder?.over, ouUnder: ctx.market.overUnder?.under,
    };
  }
  if (betanoReference) out.betanoReference = betanoReference;

  if (ctx.cards) {
    out.cards = cardsMarket({
      homeAvgCards: ctx.cards.homeAvg,
      awayAvgCards: ctx.cards.awayAvg,
      intensity: ctx.cards.intensity,
    });
  }
  if (ctx.corners) {
    out.corners = cornersMarket({
      homeAvgCorners: ctx.corners.homeAvg,
      awayAvgCorners: ctx.corners.awayAvg,
    });
  }

  return out;
}
