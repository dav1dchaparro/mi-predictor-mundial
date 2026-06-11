// Mercado de goleadores. Reparte el lambda del equipo entre sus jugadores según
// su tasa histórica de goles por minuto y los minutos esperados, y deriva:
//  - goleador en cualquier momento (anytime scorer)
//  - primer goleador del partido

import { poissonPmf } from "./poisson.js";

export interface PlayerScoring {
  name: string;
  /** goles por 90 minutos histórico del jugador. */
  goalsPer90: number;
  /** minutos esperados en este partido (90 titular, menos si rota). */
  expectedMinutes: number;
}

export interface ScorerProb {
  name: string;
  /** lambda individual de goles en el partido. */
  lambda: number;
  /** P(marque al menos 1) = goleador en cualquier momento. */
  anytime: number;
  /** P(sea el primer goleador del partido). */
  firstScorer: number;
}

/**
 * @param teamLambda goles esperados del equipo (de computeLambdas).
 * @param players plantilla con su tasa goleadora.
 * Devuelve la probabilidad de gol de cada jugador, escalada para que la suma de
 * lambdas individuales iguale el lambda del equipo (conservación de goles).
 */
export function scorerMarket(teamLambda: number, players: PlayerScoring[]): ScorerProb[] {
  // peso bruto = goles/90 * (minutos/90)
  const rawLambdas = players.map((p) => p.goalsPer90 * (p.expectedMinutes / 90));
  const rawTotal = rawLambdas.reduce((a, b) => a + b, 0);

  // escalar para conservar el lambda del equipo (incluye autogoles/otros como resto).
  const scale = rawTotal > 0 ? teamLambda / rawTotal : 0;

  return players.map((p, i) => {
    const lambda = rawLambdas[i]! * scale;
    const anytime = 1 - poissonPmf(0, lambda);
    // primer goleador: prob de marcar el primer gol del equipo, aproximado como
    // la cuota del lambda del jugador sobre el del equipo por la prob de que el
    // equipo marque al menos una vez.
    const teamScores = 1 - poissonPmf(0, teamLambda);
    const share = teamLambda > 0 ? lambda / teamLambda : 0;
    const firstScorer = share * teamScores;
    return { name: p.name, lambda, anytime, firstScorer };
  }).sort((a, b) => b.anytime - a.anytime);
}
