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
  /** true si se jugó en cancha neutral: no recibe ventaja de local. */
  neutral?: boolean;
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
  /** nivel base de goles del torneo = exp(μ): λ = base · atk · def · (ventaja). */
  base: number;
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

interface Params { atk: number[]; def: number[]; logHome: number; mu: number }

function weightedLogLik(
  p: Params, idx: Map<string, number>, matches: FitMatch[], weights: number[], rho: number,
): number {
  let ll = 0;
  const gamma = Math.exp(p.logHome);
  const base = Math.exp(p.mu);
  for (let m = 0; m < matches.length; m++) {
    const mt = matches[m]!;
    const i = idx.get(mt.home)!, j = idx.get(mt.away)!;
    // En cancha neutral no hay ventaja de local (clave para sedes del Mundial).
    const g = mt.neutral ? 1 : gamma;
    const lh = base * Math.exp(p.atk[i]! + p.def[j]!) * g;
    const la = base * Math.exp(p.atk[j]! + p.def[i]!);
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
 * Ajusta ataque/defensa/ventaja-local por MÁXIMA VEROSIMILITUD Poisson con decay
 * temporal, vía Newton-Raphson de diagonal con GRADIENTE ANALÍTICO (una sola
 * pasada por iteración → escala a cientos de equipos y miles de partidos). Las
 * fuerzas se estiman bajo Poisson independiente (convención estándar: rho es una
 * corrección local pequeña que se aplica al construir la matriz, no a las fuerzas).
 *
 * Gradiente del log-lik Poisson ponderado: ∂ll/∂atk_k = Σ w·(y−λ) sobre los
 * partidos donde k ataca; Hessiano diagonal: −Σ w·λ. El paso de Newton g/H
 * converge en pocas decenas de iteraciones (estilo IRLS). En cancha neutral no
 * hay ventaja de local (no contribuye a logHome).
 */
export function fitDixonColes(matches: FitMatch[], opts: FitOptions = {}): FitResult {
  const xi = opts.xi ?? 0;
  const rho = opts.rho ?? -0.14;
  const iterations = opts.iterations ?? 120;
  const damp = opts.learningRate ?? 0.5; // amortiguación del paso de Newton (0.9 oscila)

  const teams = [...new Set(matches.flatMap((m) => [m.home, m.away]))];
  const idx = new Map(teams.map((t, i) => [t, i]));
  const N = teams.length;
  const M = matches.length;
  const hi = new Int32Array(M), ai = new Int32Array(M);
  const yh = new Float64Array(M), ya = new Float64Array(M);
  const w = new Float64Array(M), neu = new Uint8Array(M);
  for (let m = 0; m < M; m++) {
    const mt = matches[m]!;
    hi[m] = idx.get(mt.home)!; ai[m] = idx.get(mt.away)!;
    yh[m] = mt.homeGoals; ya[m] = mt.awayGoals;
    w[m] = timeDecayWeight(mt.daysAgo, xi);
    neu[m] = mt.neutral ? 1 : 0;
  }

  const atk = new Float64Array(N), def = new Float64Array(N);
  let logHome = Math.log(1.3);
  let mu = Math.log(1.3); // intercepto global (nivel de goles); separa nivel de ventaja local

  for (let it = 0; it < iterations; it++) {
    const gAtk = new Float64Array(N), gDef = new Float64Array(N);
    const hAtk = new Float64Array(N), hDef = new Float64Array(N);
    let gHome = 0, hHome = 0, gMu = 0, hMu = 0;
    for (let m = 0; m < M; m++) {
      const i = hi[m]!, j = ai[m]!, wm = w[m]!;
      const g = neu[m] ? 0 : logHome;
      const lh = Math.exp(mu + atk[i]! + def[j]! + g);
      const la = Math.exp(mu + atk[j]! + def[i]!);
      const rh = wm * (yh[m]! - lh), ra = wm * (ya[m]! - la);
      gAtk[i]! += rh; gDef[j]! += rh; gAtk[j]! += ra; gDef[i]! += ra;
      hAtk[i]! += wm * lh; hDef[j]! += wm * lh; hAtk[j]! += wm * la; hDef[i]! += wm * la;
      gMu += rh + ra; hMu += wm * (lh + la);
      if (!neu[m]) { gHome += rh; hHome += wm * lh; }
    }
    for (let k = 0; k < N; k++) {
      if (hAtk[k]! > 0) atk[k]! += damp * gAtk[k]! / hAtk[k]!;
      if (hDef[k]! > 0) def[k]! += damp * gDef[k]! / hDef[k]!;
    }
    if (hHome > 0) logHome += damp * gHome / hHome;
    if (hMu > 0) mu += damp * gMu / hMu;
    // identificabilidad: atk y def a media 0 (geomean exp = 1.0); el nivel vive en μ.
    let ma = 0, md = 0;
    for (let k = 0; k < N; k++) { ma += atk[k]!; md += def[k]!; }
    ma /= N; md /= N;
    for (let k = 0; k < N; k++) { atk[k]! -= ma; def[k]! -= md; }
    mu += ma + md; // reabsorbe el nivel removido por el centrado en μ
  }

  // log-lik final (con la corrección Dixon-Coles, para reportar). weightedLogLik
  // ya respeta neutral por partido.
  const p: Params = { atk: Array.from(atk), def: Array.from(def), logHome, mu };
  const wArr = Array.from(w);

  return {
    attack: new Map(teams.map((t, i) => [t, Math.exp(atk[i]!)])),
    defense: new Map(teams.map((t, i) => [t, Math.exp(def[i]!)])),
    homeAdvantage: Math.exp(logHome),
    base: Math.exp(mu),
    rho,
    logLik: weightedLogLik(p, idx, matches, wArr, rho),
    iterations,
  };
}
