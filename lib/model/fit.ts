// Estimación de fuerzas por MÁXIMA VEROSIMILITUD con PONDERACIÓN TEMPORAL
// (el "corazón" de la tesis Millassón, ptos. 1-2). En vez de derivar ataque y
// defensa de un rating Elo fijo, los AJUSTA a partir de resultados históricos:
//
//   log λ_local = ataque[local] + defensa[visita] + ventajaLocal
//   log λ_visit = ataque[visita] + defensa[local]
//
// maximizando la log-verosimilitud Poisson con la corrección Dixon-Coles para
// resultados bajos (0-0, 1-0, 0-1, 1-1) y un PESO EXPONENCIAL por antigüedad:
//   w(t) = exp(-ξ · días) -> los partidos recientes pesan más que los viejos.
//
// Es puro y testeable: dados los partidos, devuelve attack/defense por equipo en
// la convención del modelo (media geométrica 1.0). Conectarlo a datos reales (5
// años de ligas + copas) es el paso de ingesta; acá queda el estimador listo.

export interface FitMatch {
  home: string;
  away: string;
  homeGoals: number;
  awayGoals: number;
  /** antigüedad del partido en días (0 = hoy). Alimenta el decay temporal. */
  daysAgo: number;
}

export interface FitOptions {
  /** tasa de decaimiento temporal por día. 0 = sin decay; Dixon-Coles usó ~0.0065
   *  (vida media ~107 días). Mayor ξ = olvida más rápido lo viejo. */
  xi?: number;
  /** corrección Dixon-Coles para marcadores bajos. */
  rho?: number;
  iterations?: number;
  /** paso del ascenso por gradiente. */
  learningRate?: number;
}

export interface FitResult {
  attack: Map<string, number>; // multiplicativo, media geométrica 1.0
  defense: Map<string, number>; // multiplicativo, media geométrica 1.0
  homeAdvantage: number; // factor multiplicativo sobre λ local (>1)
  rho: number;
  logLik: number;
  iterations: number;
}

/** Peso exponencial por antigüedad: w = exp(−ξ·días). ξ=0 -> todos pesan 1. */
export function timeDecayWeight(daysAgo: number, xi: number): number {
  return Math.exp(-xi * Math.max(daysAgo, 0));
}

/** Corrección Dixon-Coles τ para la dependencia en marcadores bajos. */
export function dcTau(hg: number, ag: number, lh: number, la: number, rho: number): number {
  if (hg === 0 && ag === 0) return 1 - lh * la * rho;
  if (hg === 0 && ag === 1) return 1 + lh * rho;
  if (hg === 1 && ag === 0) return 1 + la * rho;
  if (hg === 1 && ag === 1) return 1 - rho;
  return 1;
}

// log-verosimilitud Poisson de un gol-count (constante factorial omitida: no
// depende de los parámetros, no afecta el argmax).
function poissonLogCore(k: number, lambda: number): number {
  return k * Math.log(lambda) - lambda;
}

interface Params { atk: number[]; def: number[]; logHome: number }

function weightedLogLik(
  p: Params, idx: Map<string, number>, matches: FitMatch[], weights: number[], rho: number,
): number {
  let ll = 0;
  const gamma = Math.exp(p.logHome);
  for (let m = 0; m < matches.length; m++) {
    const mt = matches[m]!;
    const i = idx.get(mt.home)!, j = idx.get(mt.away)!;
    const lh = Math.exp(p.atk[i]! + p.def[j]!) * gamma;
    const la = Math.exp(p.atk[j]! + p.def[i]!);
    const tau = dcTau(mt.homeGoals, mt.awayGoals, lh, la, rho);
    const safeTau = tau > 1e-9 ? tau : 1e-9; // evita log(≤0)
    ll += weights[m]! * (poissonLogCore(mt.homeGoals, lh) + poissonLogCore(mt.awayGoals, la) + Math.log(safeTau));
  }
  return ll;
}

// Normaliza atk y def a media 0 (identificabilidad): exp() queda con media
// geométrica 1.0, la convención del modelo (1.0 = promedio del torneo).
function center(arr: number[]): void {
  const mean = arr.reduce((s, x) => s + x, 0) / arr.length;
  for (let i = 0; i < arr.length; i++) arr[i]! -= mean;
}

/**
 * Ajusta ataque/defensa/ventaja-local por MLE con decay temporal vía ascenso por
 * gradiente numérico. Pensado para decenas de equipos y cientos/miles de partidos.
 */
export function fitDixonColes(matches: FitMatch[], opts: FitOptions = {}): FitResult {
  const xi = opts.xi ?? 0;
  const rho = opts.rho ?? -0.14;
  const iterations = opts.iterations ?? 400;
  const lr = opts.learningRate ?? 0.05;

  const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))];
  const idx = new Map(teams.map((t, i) => [t, i]));
  const N = teams.length;
  const weights = matches.map((m) => timeDecayWeight(m.daysAgo, xi));

  const p: Params = { atk: new Array(N).fill(0), def: new Array(N).fill(0), logHome: Math.log(1.3) };
  const eps = 1e-4;

  const llAt = (q: Params) => weightedLogLik(q, idx, matches, weights, rho);

  for (let it = 0; it < iterations; it++) {
    const base = llAt(p);
    // gradiente numérico por diferencias hacia adelante
    const gAtk = new Array(N).fill(0);
    const gDef = new Array(N).fill(0);
    for (let i = 0; i < N; i++) {
      p.atk[i]! += eps; gAtk[i] = (llAt(p) - base) / eps; p.atk[i]! -= eps;
      p.def[i]! += eps; gDef[i] = (llAt(p) - base) / eps; p.def[i]! -= eps;
    }
    p.logHome += eps; const gHome = (llAt(p) - base) / eps; p.logHome -= eps;

    // paso de ascenso (normalizado para estabilidad)
    const gnorm = Math.sqrt(gAtk.concat(gDef, [gHome]).reduce((s, x) => s + x * x, 0)) || 1;
    const step = lr / Math.max(gnorm / Math.sqrt(2 * N + 1), 1);
    for (let i = 0; i < N; i++) { p.atk[i]! += step * gAtk[i]!; p.def[i]! += step * gDef[i]!; }
    p.logHome += step * gHome;
    center(p.atk); center(p.def);
  }

  return {
    attack: new Map(teams.map((t, i) => [t, Math.exp(p.atk[i]!)])),
    defense: new Map(teams.map((t, i) => [t, Math.exp(p.def[i]!)])),
    homeAdvantage: Math.exp(p.logHome),
    rho,
    logLik: llAt(p),
    iterations,
  };
}
