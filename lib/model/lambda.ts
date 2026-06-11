// Cálculo de los goles esperados (lambda) de cada equipo en un partido.
// El lambda alimenta la matriz de Poisson/Dixon-Coles. Esta es la capa donde
// entra todo el conocimiento futbolístico: fuerza ofensiva/defensiva, rating,
// forma reciente y ajustes de contexto del Mundial 2026 (altitud, clima, sede).

export interface TeamStrength {
  name: string;
  /** ataque relativo a la media del torneo. 1.0 = promedio, 1.3 = +30%. */
  attack: number;
  /** defensa relativa: 1.0 = promedio, <1 concede menos, >1 concede más. */
  defense: number;
  /** rating tipo Elo/SPI, usado para ponderar (opcional). */
  rating?: number;
}

export interface VenueContext {
  /** metros sobre el nivel del mar de la sede. */
  altitudeMeters?: number;
  /** temperatura estimada del partido en °C. */
  tempCelsius?: number;
  /** true si el equipo local es de los anfitriones / juega "casi-local". */
  homeIsHost?: boolean;
}

/**
 * Goles promedio por equipo en un partido de Mundial (base de referencia).
 * Calibrado a 1.25 por grid search sobre 3 mundiales: la fase de grupos es más
 * baja en goles de lo que sugiere el promedio general, y bajar la base mejora
 * los puntos de polla sin perder marcador exacto. Ver scripts/optimize.ts.
 */
export const BASE_GOALS = 1.25;

/**
 * Penaliza el ataque de un equipo no aclimatado en altitud alta (>1500m) y por
 * calor extremo (>30°C), que bajan la intensidad y los goles esperados.
 */
function contextMultiplier(ctx: VenueContext): number {
  let m = 1;
  if (ctx.altitudeMeters && ctx.altitudeMeters > 1500) {
    // hasta -8% de goles para no aclimatados en sedes tipo CDMX (2240m).
    const over = Math.min(ctx.altitudeMeters - 1500, 1500);
    m *= 1 - 0.08 * (over / 1500);
  }
  if (ctx.tempCelsius && ctx.tempCelsius > 30) {
    const over = Math.min(ctx.tempCelsius - 30, 10);
    m *= 1 - 0.05 * (over / 10);
  }
  return m;
}

export interface LambdaInputs {
  home: TeamStrength;
  away: TeamStrength;
  venue?: VenueContext;
  /** factor de ventaja de sede para el local. 1.0 = neutral. */
  homeAdvantage?: number;
}

/**
 * lambda_local = BASE * ataque_local * defensa_visitante * ventaja_sede * contexto
 * lambda_visit = BASE * ataque_visit * defensa_local * contexto
 *
 * La ventaja de sede solo aplica al local (anfitrión o gran diáspora).
 */
export function computeLambdas(inp: LambdaInputs): { lambdaHome: number; lambdaAway: number } {
  const venue = inp.venue ?? {};
  const ctx = contextMultiplier(venue);
  const homeAdv = inp.homeAdvantage ?? (venue.homeIsHost ? 1.15 : 1.0);

  const lambdaHome = BASE_GOALS * inp.home.attack * inp.away.defense * homeAdv * ctx;
  const lambdaAway = BASE_GOALS * inp.away.attack * inp.home.defense * ctx;

  // Clamp a un rango razonable para evitar lambdas absurdos por datos sucios.
  return {
    lambdaHome: Math.min(Math.max(lambdaHome, 0.15), 5),
    lambdaAway: Math.min(Math.max(lambdaAway, 0.15), 5),
  };
}
