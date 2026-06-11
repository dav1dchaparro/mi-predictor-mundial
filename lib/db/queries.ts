// Consultas de lectura para el dashboard. Siempre devuelven la predicción MÁS
// RECIENTE (por created_at). Las usan los Server Components.

import { getDb } from "./schema.js";
import type { TeamOdds } from "../model/montecarlo.js";
import type { MatchPrediction } from "../predict/predictMatch.js";

export interface FixtureSummary {
  id: number;
  homeName: string;
  awayName: string;
  kickoff: string;
  stage: string;
  venue: string | null;
  groupLetter: string;
}

/** Última proyección de torneo (Monte Carlo): odds por equipo, ya ordenadas. */
export function getTournamentOdds(): TeamOdds[] | null {
  const db = getDb();
  const row = db
    .prepare("SELECT payload FROM predictions WHERE kind='tournament' ORDER BY created_at DESC LIMIT 1")
    .get() as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as TeamOdds[]) : null;
}

/** Bota de Oro: proxy por goles promedio del equipo en el Monte Carlo. */
export function getGoldenBoot(limit = 10): { name: string; avgGoals: number }[] {
  const odds = getTournamentOdds();
  if (!odds) return [];
  return [...odds]
    .sort((a, b) => b.avgGoals - a.avgGoals)
    .slice(0, limit)
    .map((o) => ({ name: o.name, avgGoals: o.avgGoals }));
}

export interface GroupStanding {
  name: string;
  rating: number;
  /** prob de ganar el grupo y de avanzar (de la proyección Monte Carlo). */
  groupWinner: number;
  roundOf32: number;
}

/** Tabla proyectada de un grupo, ordenada por prob de avanzar. */
export function getGroupProjection(letter: string): GroupStanding[] {
  const db = getDb();
  const teams = db
    .prepare("SELECT name, rating FROM teams WHERE group_letter=? ORDER BY rating DESC")
    .all(letter.toUpperCase()) as { name: string; rating: number }[];
  const odds = getTournamentOdds();
  const byName = new Map((odds ?? []).map((o) => [o.name, o]));
  return teams
    .map((t) => {
      const o = byName.get(t.name);
      return {
        name: t.name,
        rating: t.rating,
        groupWinner: o?.groupWinner ?? 0,
        roundOf32: o?.roundOf32 ?? 0,
      };
    })
    .sort((a, b) => b.roundOf32 - a.roundOf32);
}

export function getGroupLetters(): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT DISTINCT group_letter FROM teams ORDER BY group_letter")
    .all() as { group_letter: string }[];
  return rows.map((r) => r.group_letter);
}

/** Lista de partidos con su grupo, para el índice de partidos. */
export function getFixtures(): FixtureSummary[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT f.id, f.kickoff, f.stage, f.venue,
              h.name AS homeName, a.name AS awayName, h.group_letter AS groupLetter
       FROM fixtures f
       JOIN teams h ON h.id = f.home_team_id
       JOIN teams a ON a.id = f.away_team_id
       ORDER BY f.kickoff, f.id`,
    )
    .all() as FixtureSummary[];
  return rows;
}

export function getFixtureSummary(id: number): FixtureSummary | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT f.id, f.kickoff, f.stage, f.venue,
              h.name AS homeName, a.name AS awayName, h.group_letter AS groupLetter
       FROM fixtures f
       JOIN teams h ON h.id = f.home_team_id
       JOIN teams a ON a.id = f.away_team_id
       WHERE f.id = ?`,
    )
    .get(id) as FixtureSummary | undefined;
  return row ?? null;
}

/** Última predicción de un partido con todos los mercados. */
export function getMatchPrediction(fixtureId: number): MatchPrediction | null {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT payload FROM predictions WHERE kind='match' AND fixture_id=? ORDER BY created_at DESC LIMIT 1",
    )
    .get(fixtureId) as { payload: string } | undefined;
  return row ? (JSON.parse(row.payload) as MatchPrediction) : null;
}
