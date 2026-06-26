// Carga los resultados REALES del Mundial 2026 (data/wc2026_results.json) en:
//   1. fixtures   -> status='finished' + home_goals/away_goals (orientados al fixture)
//   2. matches_history -> para que el refit MLE (scripts/fit.ts) aprenda de lo visto
//      en cancha. Se marcan neutral=1 (sedes neutrales del Mundial) salvo anfitriones.
// Idempotente: re-ejecutable. Uso: npx tsx scripts/ingestResults.ts
import { readFileSync } from "node:fs";
import { getDb } from "../lib/db/schema.js";
import { seedTeams } from "../lib/data/seed.js";
import { seedFixtures } from "../lib/data/seedFixtures.js";
import { ingestHistoryRows, type HistoryRow } from "../lib/data/history.js";
import { resolve, norm } from "../lib/data/teamNames.js";

interface RawMatch { group: string; date: string; home: string; hg: number; away: string; ag: number }

const HOSTS = new Set(["mexico", "canada", "usa"]); // anfitriones: juegan "en casa"

function fnv1a(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const db = getDb();
seedTeams(db); seedFixtures(db);

const raw = JSON.parse(readFileSync("data/wc2026_results.json", "utf8")) as { matches: RawMatch[] };

// Mapa de equipos: nombre normalizado de la DB -> id.
const teams = db.prepare("SELECT id, name FROM teams").all() as { id: number; name: string }[];
const teamId = new Map<string, number>(teams.map((t) => [norm(t.name), t.id]));

// Mapa de fixtures de grupo por par no-ordenado de ids -> fixture.
interface Fx { id: number; home_team_id: number; away_team_id: number }
const fixtures = db.prepare("SELECT id, home_team_id, away_team_id FROM fixtures WHERE stage='group'").all() as Fx[];
const pairKey = (a: number, b: number) => [a, b].sort((x, y) => x - y).join("-");
const fxByPair = new Map<string, Fx>(fixtures.map((f) => [pairKey(f.home_team_id, f.away_team_id), f]));

const setFinished = db.prepare("UPDATE fixtures SET status='finished', home_goals=?, away_goals=? WHERE id=?");

// Dedup: el CSV martj42 ya trae la fecha 1 del Mundial (en inglés). Borramos TODO
// el Mundial 2026 de matches_history para reinsertar nuestro set canónico de 47
// (verificado, cubre hasta hoy) sin doble conteo.
const del = db.prepare("DELETE FROM matches_history WHERE played_at >= '2026-06-11' AND tournament = 'FIFA World Cup'");

let matched = 0, unmatched: string[] = [];
const historyRows: HistoryRow[] = [];
const tx = db.transaction(() => {
  const removed = del.run().changes;
  if (removed) console.log(`[ingestResults] borradas ${removed} filas previas de Mundial 2026 (dedup).`);
  for (const m of raw.matches) {
    const hKey = resolve(m.home), aKey = resolve(m.away);
    const hId = teamId.get(hKey), aId = teamId.get(aKey);
    if (hId == null || aId == null) { unmatched.push(`${m.home} (${hKey}) / ${m.away} (${aKey})`); continue; }

    // 1. fixtures: orientar los goles al orden del fixture.
    const fx = fxByPair.get(pairKey(hId, aId));
    if (fx) {
      const homeIsFixtureHome = fx.home_team_id === hId;
      const fhg = homeIsFixtureHome ? m.hg : m.ag;
      const fag = homeIsFixtureHome ? m.ag : m.hg;
      setFinished.run(fhg, fag, fx.id);
      matched++;
    } else {
      unmatched.push(`sin fixture: ${m.home} vs ${m.away}`);
    }

    // 2. matches_history: en el orden REAL del partido (con su ventaja de local si
    //    el local es anfitrión; si no, neutral). Nombres normalizados ya resueltos.
    const neutral = HOSTS.has(hKey) ? 0 : 1;
    historyRows.push({
      api_fixture_id: fnv1a(`wc2026|${m.date}|${hKey}|${aKey}`),
      home_name: hKey, away_name: aKey,
      home_goals: m.hg, away_goals: m.ag,
      played_at: `${m.date}T00:00:00.000Z`,
      competition: "FIFA World Cup", tournament: "FIFA World Cup",
      neutral,
    });
  }
});
tx();

const n = ingestHistoryRows(db, historyRows);

console.log(`[ingestResults] partidos en JSON: ${raw.matches.length}`);
console.log(`[ingestResults] fixtures marcados 'finished': ${matched}`);
console.log(`[ingestResults] filas en matches_history: ${n}`);
if (unmatched.length) {
  console.log(`[ingestResults] SIN EMPAREJAR (${unmatched.length}):`);
  unmatched.forEach((u) => console.log("   - " + u));
}
const fin = (db.prepare("SELECT count(*) c FROM fixtures WHERE status='finished'").get() as { c: number }).c;
console.log(`[ingestResults] total fixtures finished en DB: ${fin}`);
