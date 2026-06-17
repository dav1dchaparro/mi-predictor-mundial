// Ingesta de RESULTADOS HISTÓRICOS de selecciones desde API-Football, para
// alimentar el refit de fuerzas por MLE con ponderación temporal (lib/model/fit.ts).
// El modelo nunca llama a la API: la ingesta persiste en matches_history y el fit
// lee de ahí. El parseo es puro y testeable; la red está aislada en ingestHistory.

import type Database from "better-sqlite3";
import { apiGet, type ApiOptions } from "./apiFootball.js";
import { resolve } from "./teamNames.js";
import type { FitMatch } from "../model/fit.js";

// Competencias internacionales de selecciones en API-Football (league ids). Los
// ids son estables pero conviene verificarlos; las eliminatorias tienen un id por
// confederación. Seasons: años a traer (5+ para muestra significativa).
export interface Competition { id: number; name: string; seasons: number[] }

export const DEFAULT_COMPETITIONS: Competition[] = [
  { id: 1, name: "World Cup", seasons: [2022] },
  { id: 4, name: "Euro Championship", seasons: [2024] },
  { id: 5, name: "UEFA Nations League", seasons: [2022, 2024, 2025] },
  { id: 9, name: "Copa America", seasons: [2024] },
  { id: 10, name: "Friendlies", seasons: [2021, 2022, 2023, 2024, 2025, 2026] },
  { id: 34, name: "World Cup Qualifiers CONMEBOL", seasons: [2023, 2024, 2025] },
  { id: 32, name: "World Cup Qualifiers UEFA", seasons: [2024, 2025] },
  { id: 29, name: "World Cup Qualifiers Africa", seasons: [2023, 2024, 2025] },
  { id: 30, name: "World Cup Qualifiers Asia", seasons: [2023, 2024, 2025] },
];

export interface HistoryRow {
  api_fixture_id: number;
  home_name: string;
  away_name: string;
  home_goals: number;
  away_goals: number;
  played_at: string;
  competition?: string;
  league_id?: number;
}

// Forma del item de /fixtures en API-Football (solo lo que usamos).
interface ApiFixture {
  fixture?: { id?: number; date?: string; status?: { short?: string } };
  league?: { id?: number; name?: string };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  goals?: { home?: number | null; away?: number | null };
}

const FINISHED = new Set(["FT", "AET", "PEN"]);

/** Filtra a partidos TERMINADos con marcador y los normaliza a HistoryRow. */
export function parseFixtures(items: ApiFixture[]): HistoryRow[] {
  const out: HistoryRow[] = [];
  for (const it of items) {
    const id = it.fixture?.id;
    const status = it.fixture?.status?.short;
    const date = it.fixture?.date;
    const h = it.teams?.home?.name, a = it.teams?.away?.name;
    const hg = it.goals?.home, ag = it.goals?.away;
    if (id == null || !date || !h || !a) continue;
    if (!status || !FINISHED.has(status)) continue;
    if (hg == null || ag == null) continue;
    out.push({
      api_fixture_id: id, home_name: h, away_name: a,
      home_goals: hg, away_goals: ag, played_at: date,
      competition: it.league?.name, league_id: it.league?.id,
    });
  }
  return out;
}

/**
 * Trae los resultados de las competencias dadas y los upsertea en matches_history.
 * Re-ejecutable: dedup por api_fixture_id. Devuelve cuántos se ingirieron.
 */
export async function ingestHistory(
  db: Database.Database,
  competitions: Competition[] = DEFAULT_COMPETITIONS,
  opts: ApiOptions = {},
): Promise<{ ingested: number; calls: number; perComp: Record<string, number> }> {
  const upsert = db.prepare(
    `INSERT INTO matches_history (api_fixture_id, home_name, away_name, home_goals, away_goals, played_at, competition, league_id)
     VALUES (@api_fixture_id, @home_name, @away_name, @home_goals, @away_goals, @played_at, @competition, @league_id)
     ON CONFLICT(api_fixture_id) DO UPDATE SET home_goals=excluded.home_goals, away_goals=excluded.away_goals, played_at=excluded.played_at`,
  );
  let ingested = 0, calls = 0;
  const perComp: Record<string, number> = {};
  for (const comp of competitions) {
    for (const season of comp.seasons) {
      calls++;
      const items = (await apiGet<ApiFixture[]>("/fixtures", { league: comp.id, season }, opts)) ?? [];
      const rows = parseFixtures(items);
      const tx = db.transaction((rs: HistoryRow[]) => { for (const r of rs) upsert.run(r); });
      tx(rows);
      ingested += rows.length;
      perComp[comp.name] = (perComp[comp.name] ?? 0) + rows.length;
    }
  }
  return { ingested, calls, perComp };
}

interface HistRow { home_name: string; away_name: string; home_goals: number; away_goals: number; played_at: string }

/**
 * Carga TODO matches_history como FitMatch[], mapeando nombres crudos a normalizados
 * (resolve) y calculando daysAgo desde `nowIso`. Incluye todas las selecciones (no
 * solo las del Mundial): el MLE gana señal usando los partidos vs el resto del mundo.
 * El re-centrado al campo del Mundial se hace luego en scripts/fit.ts.
 */
export function loadHistoryForFit(db: Database.Database, nowIso: string): FitMatch[] {
  const rows = db.prepare("SELECT home_name, away_name, home_goals, away_goals, played_at FROM matches_history").all() as HistRow[];
  const nowMs = Date.parse(nowIso);
  const out: FitMatch[] = [];
  for (const r of rows) {
    const daysAgo = Math.max(0, (nowMs - Date.parse(r.played_at)) / 86_400_000);
    out.push({ home: resolve(r.home_name), away: resolve(r.away_name), homeGoals: r.home_goals, awayGoals: r.away_goals, daysAgo });
  }
  return out;
}
