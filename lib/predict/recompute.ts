// Pipeline de recálculo: lee la DB, corre el modelo y guarda predicciones con
// timestamp. Lo invoca el cron diario. No toca la red: solo lee lo que la
// ingesta ya dejó en SQLite.

import type Database from "better-sqlite3";
import { runMonteCarlo, type MonteCarloTeam } from "../model/index.js";
import { predictMatch } from "./predictMatch.js";

export interface TeamRow {
  id: number;
  name: string;
  group_letter: string;
  rating: number;
  attack: number;
  defense: number;
  is_host: number;
}

export interface FixtureRow {
  id: number;
  home_team_id: number;
  away_team_id: number;
  kickoff: string;
  stage: string;
  altitude_m: number | null;
  temp_c: number | null;
  status: string;
}

function loadTeams(db: Database.Database): Map<number, TeamRow> {
  const rows = db.prepare("SELECT * FROM teams").all() as TeamRow[];
  return new Map(rows.map((t) => [t.id, t]));
}

function savePrediction(
  db: Database.Database,
  kind: "match" | "tournament",
  fixtureId: number | null,
  payload: unknown,
  now: string,
): void {
  db.prepare(
    `INSERT INTO predictions (fixture_id, kind, created_at, payload)
     VALUES (?, ?, ?, ?)`,
  ).run(fixtureId, kind, now, JSON.stringify(payload));
}

export interface RecomputeOptions {
  /** timestamp ISO de esta corrida (inyectado para reproducibilidad). */
  now: string;
  iterations?: number;
  seed?: number;
}

/** Corre el Monte Carlo del torneo y lo guarda. Devuelve las odds. */
export function recomputeTournament(db: Database.Database, opts: RecomputeOptions) {
  const teams = loadTeams(db);
  const mcTeams: MonteCarloTeam[] = [...teams.values()].map((t) => ({
    name: t.name,
    group: t.group_letter,
    attack: t.attack,
    defense: t.defense,
    rating: t.rating,
  }));
  const hostNames = [...teams.values()].filter((t) => t.is_host).map((t) => t.name);

  const odds = runMonteCarlo(mcTeams, {
    iterations: opts.iterations ?? 10000,
    seed: opts.seed ?? 12345,
    hostNames,
  });
  savePrediction(db, "tournament", null, odds, opts.now);
  return odds;
}

interface OddsRow {
  fixture_id: number;
  home: number; draw: number; away: number;
  ou_over: number | null; ou_under: number | null;
  exact_top: string | null;
}

function loadOdds(db: Database.Database): Map<number, OddsRow> {
  const rows = db.prepare("SELECT * FROM odds").all() as OddsRow[];
  return new Map(rows.map((o) => [o.fixture_id, o]));
}

/** Predice todos los partidos programados y los guarda. Devuelve cuántos. */
export function recomputeFixtures(db: Database.Database, opts: RecomputeOptions): { total: number; anchored: number } {
  const teams = loadTeams(db);
  const odds = loadOdds(db);
  const fixtures = db
    .prepare("SELECT * FROM fixtures WHERE status = 'scheduled'")
    .all() as FixtureRow[];

  let count = 0;
  let anchored = 0;
  for (const f of fixtures) {
    const home = teams.get(f.home_team_id);
    const away = teams.get(f.away_team_id);
    if (!home || !away) continue;

    // Cuotas de Betano para este partido, si las hay.
    const o = odds.get(f.id);
    const market = o
      ? {
          odds1X2: { home: o.home, draw: o.draw, away: o.away },
          overUnder: o.ou_over && o.ou_under
            ? { line: 2.5, over: o.ou_over, under: o.ou_under }
            : undefined,
          exact: o.exact_top ? (JSON.parse(o.exact_top) as { score: string; price: number }[]) : undefined,
        }
      : undefined;
    if (market) anchored++;

    const pred = predictMatch({
      homeName: home.name,
      awayName: away.name,
      home: { name: home.name, attack: home.attack, defense: home.defense, rating: home.rating },
      away: { name: away.name, attack: away.attack, defense: away.defense, rating: away.rating },
      venue: {
        altitudeMeters: f.altitude_m ?? undefined,
        tempCelsius: f.temp_c ?? undefined,
        homeIsHost: home.is_host === 1,
      },
      market,
    });
    savePrediction(db, "match", f.id, pred, opts.now);
    count++;
  }
  return { total: count, anchored };
}

/** Recálculo completo: torneo + todos los partidos. */
export function recomputeAll(db: Database.Database, opts: RecomputeOptions) {
  const odds = recomputeTournament(db, opts);
  const fx = recomputeFixtures(db, opts);
  return { teams: odds.length, fixtures: fx.total, anchored: fx.anchored, topChampion: odds[0]?.name };
}
