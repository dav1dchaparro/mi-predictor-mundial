// Tercera fuente de cuotas: The Odds API (the-odds-api.com). Una sola llamada a
// la región EU devuelve varias casas (William Hill, Marathonbet, 1xBet, Betfair,
// Pinnacle...) en JSON. Tomamos el 1X2 (h2h) y el Over/Under 2.5 (totals) y
// construimos el CONSENSO de las casas EU EXCLUYENDO Pinnacle (ya la traemos por
// su API guest, no queremos contarla dos veces). El parseo es puro y testeable.
//
// Endpoint:
//   GET https://api.the-odds-api.com/v4/sports/soccer_fifa_world_cup/odds
//       ?apiKey=KEY&regions=eu&markets=h2h,totals&oddsFormat=decimal
// La key (free tier ~500 req/mes) se lee de THE_ODDS_API_KEY. El sport key del
// Mundial solo está activo "in-season"; si no existe, se descubre desde /sports.

const BASE = "https://api.the-odds-api.com/v4";
const WC_KEY_HINT = "soccer_fifa_world_cup";
// Pinnacle ya es nuestra 2ª fuente vía API guest: se excluye del consenso EU.
const EXCLUDE_BOOKS = new Set(["pinnacle"]);

export interface OddsApiConsensus {
  home_team: string;
  away_team: string;
  commence_time?: string;
  home: number; // cuota decimal promedio (con margen; Shin lo quita después)
  draw: number;
  away: number;
  over?: number; // Over/Under 2.5 promedio
  under?: number;
  books: string[]; // casas que aportaron al consenso
}

interface Outcome { name?: string; price?: number; point?: number }
interface ApiMarket { key?: string; outcomes?: Outcome[] }
interface Bookmaker { key?: string; title?: string; markets?: ApiMarket[] }
export interface OddsApiEvent {
  home_team?: string;
  away_team?: string;
  commence_time?: string;
  bookmakers?: Bookmaker[];
}

const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * Construye el consenso (promedio de cuotas decimales) de las casas EU por
 * partido, excluyendo Pinnacle. Solo incluye un partido si al menos una casa
 * tiene 1X2 completo. El Over/Under usa solo la línea 2.5.
 */
export function parseOddsApi(events: OddsApiEvent[]): OddsApiConsensus[] {
  const out: OddsApiConsensus[] = [];
  for (const ev of events) {
    if (!ev.home_team || !ev.away_team || !ev.bookmakers) continue;

    const h: number[] = [], d: number[] = [], a: number[] = [];
    const ov: number[] = [], un: number[] = [];
    const books: string[] = [];

    for (const bk of ev.bookmakers) {
      if (!bk.key || EXCLUDE_BOOKS.has(bk.key) || !bk.markets) continue;
      const h2h = bk.markets.find((m) => m.key === "h2h")?.outcomes;
      if (!h2h) continue;
      const home = h2h.find((o) => o.name === ev.home_team)?.price;
      const away = h2h.find((o) => o.name === ev.away_team)?.price;
      const draw = h2h.find((o) => o.name === "Draw")?.price;
      if (home == null || away == null || draw == null) continue;
      h.push(home); d.push(draw); a.push(away);
      books.push(bk.key);

      // Over/Under 2.5 (línea exacta 2.5), si la casa la ofrece.
      const tot = bk.markets.find((m) => m.key === "totals")?.outcomes;
      const over = tot?.find((o) => o.name === "Over" && Math.abs((o.point ?? 0) - 2.5) < 0.01)?.price;
      const under = tot?.find((o) => o.name === "Under" && Math.abs((o.point ?? 0) - 2.5) < 0.01)?.price;
      if (over != null && under != null) { ov.push(over); un.push(under); }
    }

    if (!h.length) continue;
    out.push({
      home_team: ev.home_team,
      away_team: ev.away_team,
      commence_time: ev.commence_time,
      home: avg(h), draw: avg(d), away: avg(a),
      over: ov.length ? avg(ov) : undefined,
      under: un.length ? avg(un) : undefined,
      books: [...new Set(books)],
    });
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`TheOddsApi ${res.status} en ${url.replace(/apiKey=[^&]+/, "apiKey=***")}${body ? ` — ${body.slice(0, 200)}` : ""}`);
  }
  return res.json();
}

/** Resuelve el sport key del Mundial (puede variar/activarse solo in-season). */
export async function resolveWorldCupSportKey(apiKey: string): Promise<string> {
  const sports = (await getJson(`${BASE}/sports/?apiKey=${apiKey}`)) as { key: string; title?: string }[];
  const hit = sports.find((s) => s.key === WC_KEY_HINT)
    ?? sports.find((s) => /world cup/i.test(s.title ?? "") && /soccer|fifa/i.test(s.key));
  if (!hit) throw new Error(`No se encontró el Mundial en /sports (¿fuera de temporada?). Keys: ${sports.map((s) => s.key).filter((k) => /soccer/.test(k)).join(", ")}`);
  return hit.key;
}

/** Descarga el consenso de casas EU del Mundial. Devuelve [] si no hay key. */
export async function fetchOddsApiWorldCup(
  apiKey = process.env.THE_ODDS_API_KEY ?? "",
): Promise<{ consensus: OddsApiConsensus[]; sportKey: string }> {
  if (!apiKey) return { consensus: [], sportKey: "" };
  const sportKey = await resolveWorldCupSportKey(apiKey);
  const events = (await getJson(
    `${BASE}/sports/${sportKey}/odds?apiKey=${apiKey}&regions=eu&markets=h2h,totals&oddsFormat=decimal`,
  )) as OddsApiEvent[];
  return { consensus: parseOddsApi(events), sportKey };
}
