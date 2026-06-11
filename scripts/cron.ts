// Recálculo diario. Local: `npx tsx scripts/cron.ts`. Deploy: Vercel Cron 1x/día.
// Flujo: (1) ingesta de resultados nuevos -> (2) recálculo del modelo.
// Por ahora la ingesta es opcional (requiere RAPIDAPI_KEY); el recálculo corre
// siempre sobre lo que haya en la DB sembrada.

import { getDb } from "../lib/db/schema.js";
import { seedTeams } from "../lib/data/seed.js";
import { seedFixtures } from "../lib/data/seedFixtures.js";
import { recomputeAll } from "../lib/predict/recompute.js";

async function main() {
  const db = getDb();

  // Asegura que los 48 equipos y los partidos de grupo estén sembrados (idempotente).
  const seeded = seedTeams(db);
  const fixtures = seedFixtures(db);
  console.log(`[cron] equipos: ${seeded} | partidos nuevos: ${fixtures}`);

  // TODO ingesta: si hay RAPIDAPI_KEY, traer fixtures/resultados y actualizar
  // forma reciente antes de recalcular. (lib/data/apiFootball.ts ya está listo.)

  const now = new Date().toISOString();
  const result = recomputeAll(db, { now, iterations: 10000 });

  console.log(`[cron] recálculo ${now}`);
  console.log(`[cron] favorito al título: ${result.topChampion}`);
  console.log(`[cron] partidos predichos: ${result.fixtures}`);
}

main().catch((err) => {
  console.error("[cron] error:", err);
  process.exit(1);
});
