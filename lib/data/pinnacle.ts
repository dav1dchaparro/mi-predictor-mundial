// Segunda fuente de cuotas: Pinnacle (la casa más "sharp" del mercado, sus
// líneas son la referencia de eficiencia). A diferencia de Betano no hace falta
// navegador: su API "guest" de Arcadia devuelve JSON directo. Solo tomamos el
// 1X2 (moneyline 3 vías) del partido completo. El parseo es puro y testeable.

const ARCADIA = "https://guest.api.arcadia.pinnacle.com/0.1";
// Key pública que el propio frontend de Pinnacle usa para invitados.
const API_KEY = process.env.PINNACLE_API_KEY ?? "CmX2KcMrXuFmNg6YFbmTxE0y9CIrOi0R";
const SOCCER_SPORT_ID = 29;

const HEADERS = {
  "X-API-Key": API_KEY,
  "User-Agent":
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
  Referer: "https://www.pinnacle.com/",
  Accept: "application/json",
};

export interface PinnacleOdds {
  name: string; // "Argentina - Algeria"
  home: number; // cuota decimal
  draw: number;
  away: number;
  start?: string;
}

/** Odds americanas -> decimales. -244 => 1.41 ; +354 => 4.54 */
export function americanToDecimal(a: number): number {
  const dec = a > 0 ? a / 100 + 1 : 100 / Math.abs(a) + 1;
  return Math.round(dec * 100) / 100;
}

interface Participant { name?: string; alignment?: string }
interface Matchup { id: number; type?: string; units?: string; parent?: unknown; participants?: Participant[]; startTime?: string }
interface Price { designation?: string; price?: number }
interface Market { matchupId?: number; type?: string; period?: number; prices?: Price[] }

/**
 * Combina matchups + mercados "straight" en una lista de 1X2.
 * Solo juegos principales (type=matchup, units=Regular, sin parent) con el
 * moneyline de período 0 (partido completo) usando designation home/draw/away.
 */
export function parsePinnacle(matchups: Matchup[], markets: Market[]): PinnacleOdds[] {
  const games = new Map<number, Matchup>();
  for (const m of matchups) {
    if (m.type === "matchup" && m.units === "Regular" && !m.parent && m.participants) {
      games.set(m.id, m);
    }
  }
  const out: PinnacleOdds[] = [];
  for (const k of markets) {
    if (k.type !== "moneyline" || k.period !== 0 || !k.matchupId) continue;
    const g = games.get(k.matchupId);
    if (!g || !k.prices) continue;
    const home = g.participants!.find((p) => p.alignment === "home")?.name;
    const away = g.participants!.find((p) => p.alignment === "away")?.name;
    const byDes = (d: string) => k.prices!.find((p) => p.designation === d)?.price;
    const h = byDes("home"), dr = byDes("draw"), aw = byDes("away");
    if (!home || !away || h == null || dr == null || aw == null) continue;
    out.push({
      name: `${home} - ${away}`,
      home: americanToDecimal(h),
      draw: americanToDecimal(dr),
      away: americanToDecimal(aw),
      start: g.startTime,
    });
  }
  return out;
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Pinnacle ${res.status} en ${url}`);
  return res.json();
}

/** Descarga el 1X2 de todos los partidos de la Copa Mundial en Pinnacle. */
export async function fetchPinnacleWorldCup(): Promise<PinnacleOdds[]> {
  const leagues = (await getJson(
    `${ARCADIA}/sports/${SOCCER_SPORT_ID}/leagues?all=false`,
  )) as { id: number; name: string }[];
  // OJO: Pinnacle lista ligas derivadas como "FIFA - World Cup Corners" /
  // "... Cards" que NO tienen moneyline. Hay que excluirlas y quedarse con la
  // liga principal (idealmente el nombre exacto "FIFA - World Cup").
  const wcCandidates = leagues.filter(
    (l) => /world cup|mundial/i.test(l.name) && !/corner|card|booking|tarjeta|specials?/i.test(l.name),
  );
  const wc = wcCandidates.find((l) => /^fifa\s*-\s*world cup$/i.test(l.name.trim()))
    ?? wcCandidates.sort((a, b) => a.name.length - b.name.length)[0];
  if (!wc) throw new Error("No se encontró la liga 'FIFA - World Cup' en Pinnacle");

  const [matchups, markets] = await Promise.all([
    getJson(`${ARCADIA}/leagues/${wc.id}/matchups`) as Promise<Matchup[]>,
    getJson(`${ARCADIA}/leagues/${wc.id}/markets/straight`) as Promise<Market[]>,
  ]);
  return parsePinnacle(matchups, markets);
}
