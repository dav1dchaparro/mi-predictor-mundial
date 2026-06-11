// Schema SQLite. Toda la data cruda y las predicciones viven aquí; el modelo
// solo lee de esta DB (nunca llama a la API). Predicciones con timestamp para
// poder mostrar el histórico ("así predecía la IA hace una semana").

import Database from "better-sqlite3";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  group_letter TEXT NOT NULL,
  rating REAL NOT NULL DEFAULT 1500,
  attack REAL NOT NULL DEFAULT 1.0,
  defense REAL NOT NULL DEFAULT 1.0,
  is_host INTEGER NOT NULL DEFAULT 0,
  api_team_id INTEGER
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  name TEXT NOT NULL,
  goals_per_90 REAL NOT NULL DEFAULT 0,
  api_player_id INTEGER
);

CREATE TABLE IF NOT EXISTS fixtures (
  id INTEGER PRIMARY KEY,
  api_fixture_id INTEGER UNIQUE,
  home_team_id INTEGER NOT NULL REFERENCES teams(id),
  away_team_id INTEGER NOT NULL REFERENCES teams(id),
  kickoff TEXT NOT NULL,
  stage TEXT NOT NULL,            -- 'group' | 'r32' | 'r16' | 'qf' | 'sf' | 'final'
  venue TEXT,
  altitude_m INTEGER,
  temp_c REAL,
  status TEXT NOT NULL DEFAULT 'scheduled', -- scheduled | finished
  home_goals INTEGER,
  away_goals INTEGER
);

CREATE TABLE IF NOT EXISTS match_events (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
  minute INTEGER,
  type TEXT NOT NULL,            -- 'goal' | 'yellow' | 'red'
  team_id INTEGER REFERENCES teams(id),
  player_id INTEGER REFERENCES players(id)
);

CREATE TABLE IF NOT EXISTS match_stats (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER NOT NULL REFERENCES fixtures(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  shots INTEGER,
  shots_on_target INTEGER,
  possession REAL,
  corners INTEGER,
  yellow_cards INTEGER,
  red_cards INTEGER,
  xg REAL
);

CREATE TABLE IF NOT EXISTS predictions (
  id INTEGER PRIMARY KEY,
  fixture_id INTEGER REFERENCES fixtures(id),
  kind TEXT NOT NULL,            -- 'match' | 'tournament'
  created_at TEXT NOT NULL,      -- ISO timestamp para el histórico
  payload TEXT NOT NULL          -- JSON con todos los mercados
);

CREATE TABLE IF NOT EXISTS odds (
  fixture_id INTEGER PRIMARY KEY REFERENCES fixtures(id),
  betano_url TEXT,
  home REAL, draw REAL, away REAL,   -- 1X2 (cuotas decimales)
  ou_over REAL, ou_under REAL,        -- Over/Under 2.5 goles (nullable)
  exact_top TEXT,                     -- JSON [{score,price}] de la casa (nullable)
  scraped_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_pred_fixture ON predictions(fixture_id, created_at);
CREATE INDEX IF NOT EXISTS idx_fixtures_stage ON fixtures(stage, kickoff);
`;

let dbInstance: Database.Database | null = null;

export function getDb(path = "data/mundial.db"): Database.Database {
  if (dbInstance) return dbInstance;
  dbInstance = new Database(path);
  dbInstance.pragma("journal_mode = WAL");
  dbInstance.exec(SCHEMA);
  return dbInstance;
}

/** Crea una DB en memoria (para tests y seeds efímeros). */
export function getMemoryDb(): Database.Database {
  const db = new Database(":memory:");
  db.exec(SCHEMA);
  return db;
}
