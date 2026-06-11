// Ingesta de cuotas de Betano a la DB. Empareja cada partido de Betano con su
// fixture por PAR de equipos (sin importar el orden local/visitante, que Betano
// a veces invierte). Si está invertido, se intercambian 1X2 y marcador exacto
// para que queden en la orientación de NUESTRO fixture. Cachea lo ya scrapeado.

import type Database from "better-sqlite3";
import { scrapeLeague, scrapeMatch, type MatchOdds } from "./betano.js";

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Equivalencias por nombre normalizado (Betano -> nuestro nombre normalizado).
const NORM_ALIAS: Record<string, string> = {
  eeuu: "usa",
  republicacheca: "chequia",
  republicademocraticadelcongo: "rdcongo",
};

function resolveNorm(name: string): string {
  const n = norm(name);
  return NORM_ALIAS[n] ?? n;
}

interface TeamRow { id: number; name: string }
function teamIndex(db: Database.Database): Map<string, number> {
  const rows = db.prepare("SELECT id, name FROM teams").all() as TeamRow[];
  return new Map(rows.map((t) => [norm(t.name), t.id]));
}

/**
 * Empareja un nombre de Betano ("México - Sudáfrica") con un fixture de grupo.
 * Devuelve el id y si el orden está invertido respecto a nuestro fixture.
 */
function matchEvent(db: Database.Database, idx: Map<string, number>, eventName: string):
  { fixtureId: number; reversed: boolean } | null {
  const parts = eventName.split(" - ");
  if (parts.length !== 2) return null;
  const a = idx.get(resolveNorm(parts[0]!));
  const b = idx.get(resolveNorm(parts[1]!));
  if (!a || !b) return null;
  const fwd = db.prepare(
    "SELECT id FROM fixtures WHERE home_team_id=? AND away_team_id=? AND stage='group'",
  ).get(a, b) as { id: number } | undefined;
  if (fwd) return { fixtureId: fwd.id, reversed: false };
  const rev = db.prepare(
    "SELECT id FROM fixtures WHERE home_team_id=? AND away_team_id=? AND stage='group'",
  ).get(b, a) as { id: number } | undefined;
  if (rev) return { fixtureId: rev.id, reversed: true };
  return null;
}

function swapScore(score: string): string {
  const m = score.match(/^(\d+)-(\d+)$/);
  return m ? `${m[2]}-${m[1]}` : score;
}

/** Reorienta las cuotas a la perspectiva de nuestro fixture (swap si reversed). */
function orient(o: MatchOdds, reversed: boolean) {
  if (!reversed) {
    return {
      home: o.home, draw: o.draw, away: o.away,
      ouOver: o.ouOver ?? null, ouUnder: o.ouUnder ?? null,
      exact: o.exact ?? null,
    };
  }
  return {
    home: o.away, draw: o.draw, away: o.home, // intercambiar local/visitante
    ouOver: o.ouOver ?? null, ouUnder: o.ouUnder ?? null, // total simétrico
    exact: o.exact ? o.exact.map((e) => ({ score: swapScore(e.score), price: e.price })) : null,
  };
}

const upsert = (db: Database.Database) => db.prepare(
  `INSERT INTO odds (fixture_id, betano_url, home, draw, away, ou_over, ou_under, exact_top, scraped_at)
   VALUES (@fixture_id, @betano_url, @home, @draw, @away, @ou_over, @ou_under, @exact_top, @scraped_at)
   ON CONFLICT(fixture_id) DO UPDATE SET
     betano_url=excluded.betano_url, home=excluded.home, draw=excluded.draw, away=excluded.away,
     ou_over=COALESCE(excluded.ou_over, odds.ou_over),
     ou_under=COALESCE(excluded.ou_under, odds.ou_under),
     exact_top=COALESCE(excluded.exact_top, odds.exact_top),
     scraped_at=excluded.scraped_at`,
);

/** Scrapea la liga y guarda 1X2 + URL de todos los partidos. */
export async function ingestLeague(db: Database.Database, now: string): Promise<{ matched: number; unmatched: string[] }> {
  const events = await scrapeLeague();
  const idx = teamIndex(db);
  const stmt = upsert(db);
  let matched = 0;
  const unmatched: string[] = [];
  for (const e of events) {
    const hit = matchEvent(db, idx, e.name);
    if (!hit) { unmatched.push(e.name); continue; }
    const od = orient(e, hit.reversed);
    stmt.run({
      fixture_id: hit.fixtureId, betano_url: e.url,
      home: od.home, draw: od.draw, away: od.away,
      ou_over: null, ou_under: null, exact_top: null, scraped_at: now,
    });
    matched++;
  }
  return { matched, unmatched };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Scrapea páginas de partido (O/U + marcador exacto) para fixtures con URL que
 * aún no tienen marcador exacto. Limitado y con pausa; re-ejecutable.
 */
export async function ingestMatchPages(
  db: Database.Database, now: string, opts: { limit?: number; delayMs?: number } = {},
): Promise<{ scraped: number; remaining: number }> {
  const limit = opts.limit ?? 12;
  const delayMs = opts.delayMs ?? 1500;
  const idx = teamIndex(db);
  const pending = db.prepare(
    "SELECT fixture_id, betano_url FROM odds WHERE betano_url IS NOT NULL AND exact_top IS NULL ORDER BY fixture_id",
  ).all() as { fixture_id: number; betano_url: string }[];

  const stmt = upsert(db);
  let scraped = 0;
  for (const row of pending.slice(0, limit)) {
    let m: MatchOdds | null = null;
    try { m = await scrapeMatch(row.betano_url); } catch { m = null; }
    if (m) {
      // reorientar segun el nombre del evento (Betano puede invertir el orden)
      const hit = matchEvent(db, idx, m.name);
      const od = orient(m, hit?.reversed ?? false);
      stmt.run({
        fixture_id: row.fixture_id, betano_url: row.betano_url,
        home: od.home, draw: od.draw, away: od.away,
        ou_over: od.ouOver, ou_under: od.ouUnder,
        exact_top: od.exact ? JSON.stringify(od.exact.slice(0, 8)) : null,
        scraped_at: now,
      });
      scraped++;
    }
    await sleep(delayMs);
  }
  return { scraped, remaining: Math.max(0, pending.length - scraped) };
}
