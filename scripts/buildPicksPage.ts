// Reconstruye la página de marcadores (public/picks.html) combinando:
//   - data/judge_picks_md3.json  (picks del juez, en MI orientación, nombres ES)
//   - data/md3_schedule.json     (calendario REAL, orden oficial FIFA, kickoff UTC)
// Reorienta cada marcador al orden oficial local-visitante, convierte el kickoff a
// hora de COLOMBIA (UTC-5) y ordena por fecha/hora. Uso: npx tsx scripts/buildPicksPage.ts
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, norm } from "../lib/data/teamNames.js";

interface Pick { match: string; finalScore: string; altScore: string; confidence: string; rationale: string }
interface Sched { group: string; home: string; away: string; kickoffUTC: string; venue: string }

const picks = JSON.parse(readFileSync("data/judge_picks_md3.json", "utf8")) as Pick[];
const sched = (JSON.parse(readFileSync("data/md3_schedule.json", "utf8")) as { matches: Sched[] }).matches;

// Index de picks por par no-ordenado de equipos (clave normalizada ES).
const pairKey = (a: string, b: string) => [norm(a), norm(b)].sort().join("|");
const pickByPair = new Map<string, { home: string; away: string } & Pick>();
for (const p of picks) {
  const [home, away] = p.match.split(" vs ");
  pickByPair.set(pairKey(home!, away!), { ...p, home: home!, away: away! });
}

const flip = (s: string) => s.split("-").reverse().join("-");
// Convierte ISO UTC -> hora Colombia (UTC-5). Devuelve {date:'YYYY-MM-DD', time:'HH:MM'}.
function toColombia(iso: string) {
  const ms = Date.parse(iso) - 5 * 3600 * 1000;
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`,
    time: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`,
    iso,
  };
}

// Mapa de par-clave -> nombre ES (para mostrar el orden oficial con nombres lindos).
const esName = new Map<string, string>();
for (const p of picks) {
  const [home, away] = p.match.split(" vs ");
  esName.set(norm(home!), home!);
  esName.set(norm(away!), away!);
}

const rows = sched.map((s) => {
  const key = pairKey(resolve(s.home), resolve(s.away));
  const pick = pickByPair.get(key);
  if (!pick) { console.warn(`[buildPicksPage] sin pick para ${s.home} vs ${s.away}`); return null; }
  // ¿La orientación oficial coincide con la mía?
  const sameOrient = norm(pick.home) === resolve(s.home);
  const finalScore = sameOrient ? pick.finalScore : flip(pick.finalScore);
  const altScore = sameOrient ? pick.altScore : flip(pick.altScore);
  // Nombres ES en orden oficial.
  const homeES = esName.get(resolve(s.home)) ?? s.home;
  const awayES = esName.get(resolve(s.away)) ?? s.away;
  const col = toColombia(s.kickoffUTC);
  return {
    group: s.group, home: homeES, away: awayES,
    date: col.date, time: col.time, kickoffUTC: s.kickoffUTC, venue: s.venue,
    finalScore, altScore, confidence: pick.confidence, rationale: pick.rationale,
  };
}).filter(Boolean) as any[];

rows.sort((a, b) => a.kickoffUTC.localeCompare(b.kickoffUTC) || a.group.localeCompare(b.group));
writeFileSync("data/final_report.json", JSON.stringify(rows, null, 2));

// Render HTML standalone -> public/picks.html
const slim = rows.map((r) => ({ date: r.date, time: r.time, group: r.group, home: r.home, away: r.away, finalScore: r.finalScore, altScore: r.altScore, confidence: r.confidence, rationale: r.rationale, venue: r.venue }));
const tpl = readFileSync("scripts/picks.template.html", "utf8");
const doc = tpl.replace("__DATA__", JSON.stringify(slim));
writeFileSync("public/picks.html", doc);

const conf = { alta: 0, media: 0, baja: 0 } as Record<string, number>;
rows.forEach((r) => conf[r.confidence]++);
console.log(`[buildPicksPage] ${rows.length} partidos | confianza ${JSON.stringify(conf)} -> public/picks.html + data/final_report.json`);
let d = ""; rows.forEach((r) => { if (r.date !== d) { d = r.date; console.log(`\n[${d}]`); } console.log(`  ${r.time} ${r.group}  ${(r.home + " vs " + r.away).padEnd(34)} ${r.finalScore} (alt ${r.altScore}, ${r.confidence})`); });
