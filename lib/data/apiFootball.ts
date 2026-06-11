// Cliente de API-Football (RapidAPI) con cache en disco y retry.
// El plan free son 100 requests/día, por eso cacheamos agresivo: el cron diario
// y la cache respetan el límite. El modelo NUNCA usa este cliente; solo la
// ingesta lo llama y persiste el resultado en SQLite.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = "https://api-football-v1.p.rapidapi.com/v3";
const CACHE_DIR = "data/.api-cache";

export interface ApiOptions {
  /** TTL de cache en ms. Por defecto 12h (suficiente para recálculo diario). */
  cacheTtlMs?: number;
  /** reintentos ante error de red / 429. */
  retries?: number;
}

function cacheKey(path: string, params: Record<string, string | number>): string {
  const q = Object.entries(params).sort().map(([k, v]) => `${k}=${v}`).join("&");
  return `${path.replace(/\//g, "_")}__${q}`.replace(/[^a-z0-9_=&-]/gi, "");
}

async function readCache(key: string, ttl: number): Promise<unknown | null> {
  try {
    const raw = await readFile(join(CACHE_DIR, `${key}.json`), "utf8");
    const { ts, data } = JSON.parse(raw) as { ts: number; data: unknown };
    if (Date.now() - ts < ttl) return data;
  } catch {
    /* cache miss */
  }
  return null;
}

async function writeCache(key: string, data: unknown): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await writeFile(join(CACHE_DIR, `${key}.json`), JSON.stringify({ ts: Date.now(), data }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET genérico a API-Football. Lee de cache si está fresca; si no, llama a la
 * API con retry exponencial y persiste el resultado.
 */
export async function apiGet<T = unknown>(
  path: string,
  params: Record<string, string | number> = {},
  opts: ApiOptions = {},
): Promise<T> {
  const key = process.env.RAPIDAPI_KEY;
  const ttl = opts.cacheTtlMs ?? 12 * 60 * 60 * 1000;
  const retries = opts.retries ?? 3;
  const ck = cacheKey(path, params);

  const cached = await readCache(ck, ttl);
  if (cached !== null) return cached as T;

  if (!key) {
    throw new Error("RAPIDAPI_KEY no configurada. Pon la key en .env.local o usa el seed offline.");
  }

  const url = new URL(`${BASE_URL}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          "x-rapidapi-key": key,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      });
      if (res.status === 429) throw new Error("rate-limited (429)");
      if (!res.ok) throw new Error(`API ${res.status}: ${res.statusText}`);
      const json = (await res.json()) as { response: T };
      await writeCache(ck, json.response);
      return json.response;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(2 ** attempt * 1000);
    }
  }
  throw new Error(`API-Football falló tras ${retries + 1} intentos: ${String(lastErr)}`);
}

// Endpoints concretos (WC2026 league id en API-Football suele ser 1, season 2026).
export const WC_LEAGUE_ID = 1;
export const WC_SEASON = 2026;

export function getFixtures(opts?: ApiOptions) {
  return apiGet("/fixtures", { league: WC_LEAGUE_ID, season: WC_SEASON }, opts);
}

export function getFixtureEvents(fixtureId: number, opts?: ApiOptions) {
  return apiGet("/fixtures/events", { fixture: fixtureId }, opts);
}

export function getFixtureStats(fixtureId: number, opts?: ApiOptions) {
  return apiGet("/fixtures/statistics", { fixture: fixtureId }, opts);
}
