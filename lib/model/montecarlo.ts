// Monte Carlo del torneo: simula el Mundial 2026 miles de veces y cuenta
// frecuencias para campeón, fase alcanzada por equipo y Bota de Oro.
//
// Formato Mundial 2026: 48 equipos, 12 grupos de 4. Avanzan los 2 primeros de
// cada grupo (24) + los 8 mejores terceros = 32 a eliminatorias directas.

import { computeLambdas, type TeamStrength } from "./lambda.js";
import { makeRng, samplePoisson, type Rng } from "./rng.js";

export interface MonteCarloTeam extends TeamStrength {
  group: string; // "A".."L"
}

export interface MonteCarloOptions {
  iterations?: number;
  seed?: number;
  /** ventaja de sede para anfitriones (USA, México, Canadá). */
  hostNames?: string[];
}

export interface TeamOdds {
  name: string;
  champion: number;
  finalist: number;
  semifinal: number;
  quarterfinal: number;
  roundOf16: number;
  roundOf32: number;
  groupWinner: number;
  /** goles promedio del equipo por torneo simulado (proxy de Bota de Oro). */
  avgGoals: number;
}

interface SimTeam {
  ref: MonteCarloTeam;
  // stats de grupo en la simulación actual
  pts: number;
  gf: number;
  ga: number;
  goalsScored: number; // acumulado del torneo para Bota de Oro
}

function playMatch(home: SimTeam, away: SimTeam, hosts: Set<string>, rng: Rng): [number, number] {
  const { lambdaHome, lambdaAway } = computeLambdas({
    home: home.ref,
    away: away.ref,
    venue: { homeIsHost: hosts.has(home.ref.name) },
    homeAdvantage: hosts.has(home.ref.name) ? 1.12 : 1.0,
  });
  return [samplePoisson(lambdaHome, rng), samplePoisson(lambdaAway, rng)];
}

/** Resuelve un cruce de eliminatoria: empate -> penales (~moneda al aire). */
function playKnockout(a: SimTeam, b: SimTeam, hosts: Set<string>, rng: Rng): SimTeam {
  const [ga, gb] = playMatch(a, b, hosts, rng);
  a.goalsScored += ga;
  b.goalsScored += gb;
  if (ga > gb) return a;
  if (gb > ga) return b;
  // Prórroga + penales: ligero sesgo al de mayor rating si existe, si no 50/50.
  const ra = a.ref.rating ?? 1500;
  const rb = b.ref.rating ?? 1500;
  const pA = 1 / (1 + Math.pow(10, (rb - ra) / 600));
  return rng.next() < pA ? a : b;
}

function rankGroup(teams: SimTeam[]): SimTeam[] {
  return [...teams].sort((x, y) => {
    if (y.pts !== x.pts) return y.pts - x.pts;
    const dx = x.gf - x.ga;
    const dy = y.gf - y.ga;
    if (dy !== dx) return dy - dx;
    return y.gf - x.gf;
  });
}

export function runMonteCarlo(teams: MonteCarloTeam[], opts: MonteCarloOptions = {}): TeamOdds[] {
  const iterations = opts.iterations ?? 10000;
  const hosts = new Set(opts.hostNames ?? ["USA", "México", "Mexico", "Canadá", "Canada"]);
  const rng = makeRng(opts.seed ?? 12345);

  const groups = new Map<string, MonteCarloTeam[]>();
  for (const t of teams) {
    if (!groups.has(t.group)) groups.set(t.group, []);
    groups.get(t.group)!.push(t);
  }

  // acumuladores
  const acc = new Map<string, Omit<TeamOdds, "name">>();
  for (const t of teams) {
    acc.set(t.name, {
      champion: 0, finalist: 0, semifinal: 0, quarterfinal: 0,
      roundOf16: 0, roundOf32: 0, groupWinner: 0, avgGoals: 0,
    });
  }

  for (let iter = 0; iter < iterations; iter++) {
    const sim = new Map<string, SimTeam>();
    for (const t of teams) {
      sim.set(t.name, { ref: t, pts: 0, gf: 0, ga: 0, goalsScored: 0 });
    }

    // --- Fase de grupos: round robin dentro de cada grupo ---
    const thirds: SimTeam[] = [];
    const qualified: SimTeam[] = [];
    for (const [, gTeams] of groups) {
      const st = gTeams.map((t) => sim.get(t.name)!);
      for (let i = 0; i < st.length; i++) {
        for (let j = i + 1; j < st.length; j++) {
          const [gi, gj] = playMatch(st[i]!, st[j]!, hosts, rng);
          st[i]!.gf += gi; st[i]!.ga += gj; st[i]!.goalsScored += gi;
          st[j]!.gf += gj; st[j]!.ga += gi; st[j]!.goalsScored += gj;
          if (gi > gj) st[i]!.pts += 3;
          else if (gj > gi) st[j]!.pts += 3;
          else { st[i]!.pts += 1; st[j]!.pts += 1; }
        }
      }
      const ranked = rankGroup(st);
      acc.get(ranked[0]!.ref.name)!.groupWinner++;
      qualified.push(ranked[0]!, ranked[1]!); // 1ro y 2do directos
      if (ranked[2]) thirds.push(ranked[2]); // candidato a mejor tercero
    }

    // 8 mejores terceros completan los 32.
    thirds.sort((x, y) => {
      if (y.pts !== x.pts) return y.pts - x.pts;
      return (y.gf - y.ga) - (x.gf - x.ga);
    });
    qualified.push(...thirds.slice(0, 8));

    for (const q of qualified) acc.get(q.ref.name)!.roundOf32++;

    // --- Eliminatorias: bracket simple sobre los clasificados ---
    // El hito alcanzado al ganar depende del tamaño de la ronda jugada, no de
    // un índice fijo, para ser correcto con cualquier número de clasificados.
    // (orden de siembra aproximado; suficiente para frecuencias agregadas)
    let round = qualified.slice();
    // Recortar a la mayor potencia de 2 <= clasificados (el bracket real es 32).
    let bracketSize = 1;
    while (bracketSize * 2 <= round.length) bracketSize *= 2;
    round = round.slice(0, bracketSize);

    const stageByRemaining: Record<number, keyof Omit<TeamOdds, "name">> = {
      32: "roundOf16",
      16: "quarterfinal",
      8: "semifinal",
      4: "finalist",
    };
    while (round.length > 1) {
      const reached = stageByRemaining[round.length];
      const next: SimTeam[] = [];
      for (let i = 0; i + 1 < round.length; i += 2) {
        next.push(playKnockout(round[i]!, round[i + 1]!, hosts, rng));
      }
      if (reached) for (const w of next) acc.get(w.ref.name)![reached]++;
      round = next;
    }
    if (round[0]) acc.get(round[0].ref.name)!.champion++;

    // acumular goles del torneo para Bota de Oro
    for (const [name, st] of sim) acc.get(name)!.avgGoals += st.goalsScored;
  }

  const result: TeamOdds[] = teams.map((t) => {
    const a = acc.get(t.name)!;
    return {
      name: t.name,
      champion: a.champion / iterations,
      finalist: a.finalist / iterations,
      semifinal: a.semifinal / iterations,
      quarterfinal: a.quarterfinal / iterations,
      roundOf16: a.roundOf16 / iterations,
      roundOf32: a.roundOf32 / iterations,
      groupWinner: a.groupWinner / iterations,
      avgGoals: a.avgGoals / iterations,
    };
  });

  result.sort((x, y) => y.champion - x.champion);
  return result;
}
