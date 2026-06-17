// Refit de fuerzas por MLE con ponderación temporal (tesis Millassón).
//   1. Asegura resultados históricos en matches_history (los ingiere de
//      API-Football si la tabla está vacía; re-ejecutable y cacheado).
//   2. Ajusta ataque/defensa/ventaja-local con fitDixonColes + decay exp(-ξ·días).
//   3. Re-centra las 48 selecciones del Mundial a media geométrica 1.0 (la
//      convención del modelo) y escribe attack/defense en teams.
//   4. Recalcula predicciones con las fuerzas nuevas.
// Uso: npx tsx scripts/fit.ts [xi] [minMatches]
//   xi por defecto 0.0019/día (~vida media 1 año, razonable para selecciones).

import { getDb } from "../lib/db/schema.js";
import { seedTeams } from "../lib/data/seed.js";
import { seedFixtures } from "../lib/data/seedFixtures.js";
import { ingestHistory, loadHistoryForFit } from "../lib/data/history.js";
import { norm } from "../lib/data/teamNames.js";
import { fitDixonColes } from "../lib/model/index.js";
import { recomputeAll } from "../lib/predict/recompute.js";

const XI = Number(process.argv[2] ?? 0.0019);
const MIN_MATCHES = Number(process.argv[3] ?? 8);

interface TeamRow { id: number; name: string; attack: number; defense: number; rating: number }

async function main() {
  const db = getDb();
  const now = new Date().toISOString();
  seedTeams(db); seedFixtures(db);

  // 1. ¿Hay histórico? Si no, ingerir (necesita RAPIDAPI_KEY).
  const have = (db.prepare("SELECT count(*) n FROM matches_history").get() as { n: number }).n;
  if (have === 0) {
    if (!process.env.RAPIDAPI_KEY) {
      console.error("[fit] matches_history vacía y no hay RAPIDAPI_KEY. Poné la key en .env.local para ingerir el histórico, o cargá la tabla manualmente.");
      process.exit(1);
    }
    console.log("[fit] ingiriendo resultados históricos de selecciones...");
    const r = await ingestHistory(db);
    console.log(`[fit] ingeridos ${r.ingested} partidos en ${r.calls} llamadas. Por competencia:`, r.perComp);
  } else {
    console.log(`[fit] usando ${have} partidos ya en matches_history (no se re-ingiere).`);
  }

  // 2. Cargar y ajustar.
  const matches = loadHistoryForFit(db, now);
  if (matches.length < 50) {
    console.warn(`[fit] solo ${matches.length} partidos: la muestra es chica, el fit será ruidoso.`);
  }
  // nº de partidos por equipo (normalizado) -> umbral de confianza.
  const appearances = new Map<string, number>();
  for (const m of matches) {
    appearances.set(m.home, (appearances.get(m.home) ?? 0) + 1);
    appearances.set(m.away, (appearances.get(m.away) ?? 0) + 1);
  }
  console.log(`[fit] ajustando MLE sobre ${matches.length} partidos (ξ=${XI}, vida media ~${Math.round(Math.LN2 / XI)} días)...`);
  const fit = fitDixonColes(matches, { xi: XI, iterations: 500 });
  console.log(`[fit] ventaja de local estimada: ×${fit.homeAdvantage.toFixed(3)} | logLik=${fit.logLik.toFixed(1)}`);

  // 3. Re-centrar las selecciones del Mundial a media geométrica 1.0.
  const teams = db.prepare("SELECT id, name, attack, defense, rating FROM teams").all() as TeamRow[];
  const updatable = teams
    .map((t) => ({ t, key: norm(t.name), n: appearances.get(norm(t.name)) ?? 0 }))
    .filter((x) => x.n >= MIN_MATCHES && fit.attack.has(x.key));
  if (!updatable.length) {
    console.error(`[fit] ningún equipo del Mundial alcanza ${MIN_MATCHES} partidos en el histórico. ¿Faltan competencias/temporadas?`);
    process.exit(1);
  }
  const geoMean = (xs: number[]) => Math.exp(xs.reduce((s, x) => s + Math.log(x), 0) / xs.length);
  const aMean = geoMean(updatable.map((x) => fit.attack.get(x.key)!));
  const dMean = geoMean(updatable.map((x) => fit.defense.get(x.key)!));

  const upd = db.prepare("UPDATE teams SET attack=?, defense=? WHERE id=?");
  const skipped = teams.length - updatable.length;
  const report: { name: string; n: number; atkOld: number; atkNew: number; defOld: number; defNew: number }[] = [];
  const tx = db.transaction(() => {
    for (const { t, key, n } of updatable) {
      const atkNew = fit.attack.get(key)! / aMean; // re-centrado al campo del Mundial
      const defNew = fit.defense.get(key)! / dMean;
      report.push({ name: t.name, n, atkOld: t.attack, atkNew, defOld: t.defense, defNew });
      upd.run(Number(atkNew.toFixed(4)), Number(defNew.toFixed(4)), t.id);
    }
  });
  tx();

  // 4. Recalcular predicciones con las fuerzas nuevas.
  const rc = recomputeAll(db, { now, iterations: 10000 });

  // Reporte: los mayores cambios de ataque.
  report.sort((a, b) => Math.abs(b.atkNew - b.atkOld) - Math.abs(a.atkNew - a.atkOld));
  console.log(`\n[fit] fuerzas actualizadas: ${updatable.length} selecciones (${skipped} sin datos suficientes mantienen su rating Elo).`);
  console.log("  EQUIPO".padEnd(24) + "n   ATK old→new      DEF old→new");
  for (const r of report.slice(0, 16)) {
    console.log(
      "  " + r.name.padEnd(22) + String(r.n).padStart(3) + "   " +
      `${r.atkOld.toFixed(2)}→${r.atkNew.toFixed(2)}`.padEnd(15) + `${r.defOld.toFixed(2)}→${r.defNew.toFixed(2)}`,
    );
  }
  console.log(`\n[fit] listo. recomputado: ${rc.fixtures} partidos | favorito MC: ${rc.topChampion}`);
  console.log("[fit] Tip: re-corré 'npm run market' para re-anclar al mercado con las fuerzas nuevas.");
}

main().catch((e) => { console.error("[fit] error:", e); process.exit(1); });
