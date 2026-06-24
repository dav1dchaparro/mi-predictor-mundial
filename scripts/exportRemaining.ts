// Exporta los partidos restantes (scheduled) con su distribución estadística
// (lambdas, top-5 marcadores, 1X2, picks por estrategia) a un JSON que alimenta
// el workflow de inteligencia por partido. Uso: npx tsx scripts/exportRemaining.ts
import { writeFileSync } from "node:fs";
import { getDb } from "../lib/db/schema.js";

const db = getDb();
const rows = db.prepare(`
  SELECT f.id, th.name home, ta.name away, th.group_letter grp, f.kickoff, p.payload
  FROM fixtures f
  JOIN teams th ON th.id=f.home_team_id JOIN teams ta ON ta.id=f.away_team_id
  JOIN predictions p ON p.fixture_id=f.id AND p.kind='match'
  WHERE f.status='scheduled'
    AND p.created_at=(SELECT max(created_at) FROM predictions p2 WHERE p2.fixture_id=f.id AND p2.kind='match')
  ORDER BY th.group_letter, f.kickoff
`).all() as { id: number; home: string; away: string; grp: string; kickoff: string; payload: string }[];

const out = rows.map((r) => {
  const p = JSON.parse(r.payload);
  return {
    id: r.id, group: r.grp, date: r.kickoff.slice(0, 10),
    home: r.home, away: r.away,
    lambdaHome: Number(p.lambdaHome.toFixed(2)), lambdaAway: Number(p.lambdaAway.toFixed(2)),
    p1x2: {
      home: Math.round(100 * p.markets.result.home),
      draw: Math.round(100 * p.markets.result.draw),
      away: Math.round(100 * p.markets.result.away),
    },
    topScores: p.markets.topScores.slice(0, 5).map((s: { home: number; away: number; prob: number }) =>
      ({ score: `${s.home}-${s.away}`, prob: Math.round(100 * s.prob) })),
    modelPicks: {
      masProbable: `${p.scorelineOptions["mas-probable"].home}-${p.scorelineOptions["mas-probable"].away}`,
      evOptimo: `${p.scorelineOptions["ev-optimo"].home}-${p.scorelineOptions["ev-optimo"].away}`,
      golesEsperados: `${p.scorelineOptions["goles-esperados"].home}-${p.scorelineOptions["goles-esperados"].away}`,
    },
  };
});

const path = process.argv[2] ?? "data/remaining_matches.json";
writeFileSync(path, JSON.stringify(out, null, 2));
console.log(`[exportRemaining] ${out.length} partidos -> ${path}`);
