// Scraper de cuotas de Betano (Mundial 2026). Betano expone TODO el estado en un
// JSON embebido `window["initial_state"]`, así que no hace falta parsear el DOM:
// extraemos ese objeto y leemos los mercados. El scrape usa google-chrome en
// headless (Betano tiene Cloudflare y carga por JS). El parseo es puro y testeable.

import { execFile } from "node:child_process";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

export const BETANO_BASE = "https://www.betano.bet.ar";
export const WC2026_LEAGUE_URL =
  "https://www.betano.bet.ar/sport/futbol/copa-mundial/copa-mundial-de-la-fifa-2026/493g/";

export interface ExactScoreOdd {
  score: string; // "1-0"
  price: number;
}

export interface MatchOdds {
  name: string;
  url: string;
  // 1X2 (cuotas decimales)
  home: number;
  draw: number;
  away: number;
  // Over/Under 2.5 goles (puede faltar si solo se scrapeó la liga)
  ouOver?: number;
  ouUnder?: number;
  // mercado de marcador exacto de la casa, ordenado por menor cuota (mas probable)
  exact?: ExactScoreOdd[];
}

/** Extrae el objeto JSON balanceado de window["initial_state"]. */
export function extractInitialState(html: string): unknown | null {
  const marker = 'window["initial_state"]=';
  const at = html.indexOf(marker);
  if (at < 0) return null;
  const start = html.indexOf("{", at);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

interface Selection { name?: string; fullName?: string; price?: number; handicap?: number }
interface Market { name?: string; type?: string; selections?: Selection[] }
interface BetanoEvent { name?: string; url?: string; markets?: Market[] }

function read1X2(markets: Market[]): { home: number; draw: number; away: number } | null {
  // MRES = resultado del partido; MR12 = SuperCuotas (mismo 1X2, ligeramente alto)
  const mk = markets.find((m) => m.type === "MRES") ?? markets.find((m) => m.type === "MR12");
  if (!mk?.selections) return null;
  const byName = (n: string) => mk.selections!.find((s) => s.name === n)?.price;
  const home = byName("1"), draw = byName("X"), away = byName("2");
  if (home && draw && away) return { home, draw, away };
  return null;
}

/** Parsea la página de un partido: 1X2 + Over/Under 2.5 + marcador exacto. */
export function parseMatch(state: unknown): MatchOdds | null {
  const ev = (state as { data?: { event?: BetanoEvent } })?.data?.event;
  if (!ev?.markets) return null;
  const r = read1X2(ev.markets);
  if (!r) return null;

  const out: MatchOdds = {
    name: ev.name ?? "",
    url: ev.url ?? "",
    home: r.home, draw: r.draw, away: r.away,
  };

  // Over/Under total de goles, linea 2.5 (type HCTG)
  const ou = ev.markets.find((m) => m.type === "HCTG");
  if (ou?.selections) {
    const over = ou.selections.find((s) => Math.abs((s.handicap ?? 0) - 2.5) < 0.01 && /m.s|over/i.test(s.name ?? ""));
    const under = ou.selections.find((s) => Math.abs((s.handicap ?? 0) - 2.5) < 0.01 && /menos|under/i.test(s.name ?? ""));
    if (over?.price && under?.price) { out.ouOver = over.price; out.ouUnder = under.price; }
  }

  // Marcador exacto (type CSFT), ordenado por menor cuota = mas probable
  const cs = ev.markets.find((m) => m.type === "CSFT");
  if (cs?.selections) {
    out.exact = cs.selections
      .filter((s): s is Required<Pick<Selection, "name" | "price">> => !!s.name && !!s.price)
      .map((s) => ({ score: s.name.replace(/\s/g, ""), price: s.price }))
      .sort((a, b) => a.price - b.price);
  }
  return out;
}

/** Parsea la página de liga: todos los partidos con su URL y 1X2. */
export function parseLeague(state: unknown): MatchOdds[] {
  const events: BetanoEvent[] = [];
  const walk = (o: unknown) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === "object") {
      const e = o as BetanoEvent;
      if (typeof e.url === "string" && e.url.includes("/cuotas-de-partido/") && e.markets) events.push(e);
      Object.values(o).forEach(walk);
    }
  };
  walk(state);

  const seen = new Set<string>();
  const out: MatchOdds[] = [];
  for (const e of events) {
    if (!e.url || seen.has(e.url)) continue;
    const r = read1X2(e.markets!);
    if (!r) continue;
    seen.add(e.url);
    out.push({ name: e.name ?? "", url: e.url, home: r.home, draw: r.draw, away: r.away });
  }
  return out;
}

/** Descarga el DOM renderizado de una URL con google-chrome headless. */
export function fetchRendered(url: string, timeoutMs = 60000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "google-chrome",
      [
        "--headless=new", "--disable-gpu", "--no-sandbox",
        "--window-size=1366,2200", `--user-agent=${UA}`, "--lang=es-AR",
        "--virtual-time-budget=25000", "--dump-dom", url,
      ],
      { timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) reject(err);
        else resolve(stdout);
      },
    );
  });
}

export async function scrapeMatch(url: string): Promise<MatchOdds | null> {
  const full = url.startsWith("http") ? url : BETANO_BASE + url;
  return parseMatch(extractInitialState(await fetchRendered(full)));
}

export async function scrapeLeague(): Promise<MatchOdds[]> {
  return parseLeague(extractInitialState(await fetchRendered(WC2026_LEAGUE_URL)));
}
