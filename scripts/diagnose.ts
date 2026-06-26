// Diagnóstico: compara el pick guardado del modelo (última predicción por fixture)
// contra el resultado REAL ya cargado. Reporta tasa de exacto, de resultado (1X2),
// de diferencia, y desglosa por estrategia de marcador (qué habría clavado cada una).
import { getDb } from "../lib/db/schema.js";

const db = getDb();
const pct = (x: number, n: number) => n ? (100 * x / n).toFixed(1) + "%" : "—";

interface Row { id: number; h: string; a: string; hg: number; ag: number; payload: string; kickoff: string }
const rows = db.prepare(`
  SELECT f.id, th.name h, ta.name a, f.home_goals hg, f.away_goals ag, f.kickoff, p.payload
  FROM fixtures f
  JOIN teams th ON th.id=f.home_team_id JOIN teams ta ON ta.id=f.away_team_id
  JOIN predictions p ON p.fixture_id=f.id AND p.kind='match'
  WHERE f.status='finished'
    AND p.created_at = (SELECT max(created_at) FROM predictions p2 WHERE p2.fixture_id=f.id AND p2.kind='match')
  ORDER BY f.kickoff
`).all() as Row[];

const out1x2 = (h: number, a: number) => h > a ? "H" : h === a ? "D" : "A";

let exact = 0, res = 0, diff = 0;
const stratNames = ["goles-esperados", "ev-optimo", "mas-probable", "condicional-1x2"] as const;
const stratExact: Record<string, number> = Object.fromEntries(stratNames.map((s) => [s, 0]));
const lines: string[] = [];

for (const r of rows) {
  const p = JSON.parse(r.payload);
  const rec = p.recommended;
  const isExact = rec.home === r.hg && rec.away === r.ag;
  const isRes = out1x2(rec.home, rec.away) === out1x2(r.hg, r.ag);
  const isDiff = (rec.home - rec.away) === (r.hg - r.ag);
  if (isExact) exact++;
  if (isRes) res++;
  if (isDiff) diff++;
  for (const s of stratNames) {
    const o = p.scorelineOptions?.[s];
    if (o && o.home === r.hg && o.away === r.ag) stratExact[s] = (stratExact[s] ?? 0) + 1;
  }
  lines.push(
    `${(isExact ? "✓EXACTO" : isRes ? "·result" : "  miss ").padEnd(8)} ${r.h} vs ${r.a}`.padEnd(52) +
    `real ${r.hg}-${r.ag}  | pick ${rec.home}-${rec.away}` +
    (p.scorelineOptions ? `  [mp ${p.scorelineOptions["mas-probable"].home}-${p.scorelineOptions["mas-probable"].away} · ge ${p.scorelineOptions["goles-esperados"].home}-${p.scorelineOptions["goles-esperados"].away} · ev ${p.scorelineOptions["ev-optimo"].home}-${p.scorelineOptions["ev-optimo"].away}]` : "")
  );
}

const n = rows.length;
console.log(`\n=== DIAGNÓSTICO: modelo (pick guardado) vs realidad — ${n} partidos jugados ===\n`);
console.log(lines.join("\n"));
console.log(`\n--- TOTALES (pick recomendado, estrategia '${rows[0] ? JSON.parse(rows[0].payload).scorelineStrategy : "?"}') ---`);
console.log(`  Marcador EXACTO : ${exact}/${n} = ${pct(exact, n)}`);
console.log(`  Resultado 1X2   : ${res}/${n} = ${pct(res, n)}`);
console.log(`  Diferencia goles: ${diff}/${n} = ${pct(diff, n)}`);
console.log(`\n--- ¿Qué habría clavado CADA estrategia (en estos mismos partidos)? ---`);
for (const s of stratNames) console.log(`  ${s.padEnd(18)} exacto: ${stratExact[s] ?? 0}/${n} = ${pct(stratExact[s] ?? 0, n)}`);

// Puntos de polla con el reglamento exacto=5, resultado=2, diferencia=1.
let pts = 0;
for (const r of rows) {
  const p = JSON.parse(r.payload); const rec = p.recommended;
  if (rec.home === r.hg && rec.away === r.ag) pts += 5;
  else if (out1x2(rec.home, rec.away) === out1x2(r.hg, r.ag)) pts += 2;
  else if ((rec.home - rec.away) === (r.hg - r.ag)) pts += 1;
}
console.log(`\n  PUNTOS de polla (5/2/1) con el pick del modelo: ${pts} en ${n} partidos (${(pts/n).toFixed(2)}/partido)`);
