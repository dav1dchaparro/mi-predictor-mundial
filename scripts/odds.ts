// Ingesta de cuotas de Betano y recálculo anclado.
// Uso:  npx tsx scripts/odds.ts [limitePaginasPartido]
//   - scrapea la liga (1X2 + URL de los 72 partidos)
//   - scrapea N páginas de partido (Over/Under + marcador exacto de la casa)
//   - recalcula las predicciones usando esas cuotas
// Re-ejecutable: cachea lo ya scrapeado y completa el resto.

import { getDb } from "../lib/db/schema.js";
import { seedTeams } from "../lib/data/seed.js";
import { seedFixtures } from "../lib/data/seedFixtures.js";
import { ingestLeague, ingestMatchPages } from "../lib/data/ingestOdds.js";
import { recomputeAll } from "../lib/predict/recompute.js";

async function main() {
  const limit = Number(process.argv[2] ?? 12);
  const db = getDb();
  const now = new Date().toISOString();

  // Asegura equipos y fixtures (para poder emparejar).
  seedTeams(db);
  seedFixtures(db);

  console.log("[odds] scrapeando página de liga (1X2 de los 72 partidos)...");
  const league = await ingestLeague(db, now);
  console.log(`[odds] emparejados: ${league.matched}/72` +
    (league.unmatched.length ? ` | sin emparejar: ${league.unmatched.join(", ")}` : ""));

  console.log(`[odds] scrapeando hasta ${limit} páginas de partido (O/U + marcador exacto)...`);
  const pages = await ingestMatchPages(db, now, { limit });
  console.log(`[odds] páginas nuevas: ${pages.scraped} | pendientes: ${pages.remaining}`);

  console.log("[odds] recalculando predicciones con las cuotas...");
  const r = recomputeAll(db, { now, iterations: 10000 });
  console.log(`[odds] listo. partidos: ${r.fixtures} | anclados al mercado: ${r.anchored} | favorito: ${r.topChampion}`);
}

main().catch((err) => { console.error("[odds] error:", err); process.exit(1); });
