// Normalización y mapeo de nombres de equipo. Las fuentes externas (Pinnacle,
// The Odds API, API-Football) usan nombres en inglés; nuestra DB está en español.
// Este módulo centraliza el normalizado y los alias para emparejar contra la DB.

/** "Côte d'Ivoire" -> "cotedivoire" (sin acentos, minúsculas, solo alfanumérico). */
export function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Nombres en inglés (Pinnacle / The Odds API / API-Football) -> nombre normalizado
// de NUESTRA DB (español).
export const EN_ALIAS: Record<string, string> = {
  czechia: "chequia", czechrepublic: "chequia", southkorea: "coreadelsur",
  korearepublic: "coreadelsur", southafrica: "sudafrica", switzerland: "suiza",
  bosniaandherzegovina: "bosniayherzegovina", bosniaherzegovina: "bosniayherzegovina",
  qatar: "catar", brazil: "brasil", morocco: "marruecos", scotland: "escocia",
  unitedstates: "usa", usa: "usa", turkey: "turquia", turkiye: "turquia",
  germany: "alemania", ivorycoast: "costademarfil", cotedivoire: "costademarfil",
  netherlands: "paisesbajos", japan: "japon", sweden: "suecia", tunisia: "tunez",
  belgium: "belgica", egypt: "egipto", newzealand: "nuevazelanda", spain: "espana",
  saudiarabia: "arabiasaudita", capeverde: "caboverde", caboverde: "caboverde",
  france: "francia", norway: "noruega", iraq: "irak", algeria: "argelia",
  jordan: "jordania", drcongo: "rdcongo", congodr: "rdcongo",
  democraticrepublicofcongo: "rdcongo", england: "inglaterra", croatia: "croacia",
  curacao: "curazao", mexico: "mexico", canada: "canada", argentina: "argentina",
  austria: "austria", senegal: "senegal", haiti: "haiti", colombia: "colombia",
  uzbekistan: "uzbekistan", paraguay: "paraguay", australia: "australia",
  panama: "panama", ghana: "ghana", ecuador: "ecuador", uruguay: "uruguay",
  iran: "iran", portugal: "portugal", denmark: "dinamarca", italy: "italia",
};

/** Normaliza y aplica el alias inglés->español. */
export const resolve = (n: string): string => EN_ALIAS[norm(n)] ?? norm(n);
