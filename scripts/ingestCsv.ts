// Ingesta del dataset abierto de resultados internacionales (martj42) a
// matches_history. Sin API key. Uso:
//   npx tsx scripts/ingestCsv.ts [rutaCsv] [sinceISO]
// Default: data/intl_results.csv (o lo baja si falta) desde 2010-01-01.
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { getDb } from "../lib/db/schema.js";
import { parseInternationalCsv, ingestHistoryRows } from "../lib/data/history.js";

const RAW_URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv";
const path = process.argv[2] ?? "data/intl_results.csv";
const since = process.argv[3] ?? "2010-01-01";

async function ensureCsv(p: string): Promise<string> {
  if (existsSync(p)) return readFileSync(p, "utf8");
  if (existsSync("/tmp/intl_results.csv")) return readFileSync("/tmp/intl_results.csv", "utf8");
  console.log(`[ingest] descargando ${RAW_URL} ...`);
  const txt = await (await fetch(RAW_URL)).text();
  writeFileSync(p, txt);
  return txt;
}

async function main() {
  const csv = await ensureCsv(path);
  const rows = parseInternationalCsv(csv, { since });
  const db = getDb();
  const n = ingestHistoryRows(db, rows);
  const total = (db.prepare("SELECT count(*) c FROM matches_history").get() as { c: number }).c;
  const neut = (db.prepare("SELECT count(*) c FROM matches_history WHERE neutral=1").get() as { c: number }).c;
  const span = db.prepare("SELECT min(played_at) a, max(played_at) b FROM matches_history").get() as { a: string; b: string };
  console.log(`[ingest] parseados ${rows.length} (desde ${since}) → upserted ${n}. Total en DB: ${total} (neutrales: ${neut}).`);
  console.log(`[ingest] rango: ${span.a?.slice(0, 10)} .. ${span.b?.slice(0, 10)}`);
}
main().catch((e) => { console.error("[ingest] error:", e); process.exit(1); });
