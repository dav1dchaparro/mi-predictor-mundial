// Dataset de Qatar 2022 para backtest. Solo fase de grupos (48 partidos): cada
// resultado es un 90' limpio con un 1X2 definido, sin ambigüedad de prórroga ni
// penales. Es la medida más defendible de calibración del modelo.
//
// Ratings tipo Elo APROXIMADOS a noviembre 2022 (orden de magnitud). El backtest
// no busca clavar cada marcador, sino verificar que el modelo acierta el 1X2
// cerca del ~50% y el marcador exacto cerca del ~9-10%, como dicta la literatura.

export interface BtTeam {
  name: string;
  rating: number;
}

export const QATAR_RATINGS: Record<string, number> = {
  Brasil: 2170, Argentina: 2080, Francia: 2080, España: 2045, "Países Bajos": 2040,
  Bélgica: 1990, Alemania: 1960, Portugal: 2000, Inglaterra: 1980, Croacia: 1910,
  Uruguay: 1900, Dinamarca: 1900, Suiza: 1860, México: 1820, Japón: 1820,
  Senegal: 1810, Marruecos: 1810, Serbia: 1820, "Estados Unidos": 1800, Gales: 1780,
  Polonia: 1780, "Corea del Sur": 1790, Ecuador: 1780, Irán: 1750, Camerún: 1740,
  Canadá: 1730, Australia: 1720, Ghana: 1720, Túnez: 1690, "Costa Rica": 1680,
  Catar: 1680, "Arabia Saudita": 1640,
};

export interface BtMatch {
  home: string;
  away: string;
  hg: number; // goles local (90')
  ag: number; // goles visitante (90')
}

// Anfitrión 2022: Catar.
export const HOST_2022 = "Catar";

export const QATAR_GROUP_MATCHES: BtMatch[] = [
  // Grupo A
  { home: "Catar", away: "Ecuador", hg: 0, ag: 2 },
  { home: "Senegal", away: "Países Bajos", hg: 0, ag: 2 },
  { home: "Catar", away: "Senegal", hg: 1, ag: 3 },
  { home: "Países Bajos", away: "Ecuador", hg: 1, ag: 1 },
  { home: "Ecuador", away: "Senegal", hg: 1, ag: 2 },
  { home: "Países Bajos", away: "Catar", hg: 2, ag: 0 },
  // Grupo B
  { home: "Inglaterra", away: "Irán", hg: 6, ag: 2 },
  { home: "Estados Unidos", away: "Gales", hg: 1, ag: 1 },
  { home: "Gales", away: "Irán", hg: 0, ag: 2 },
  { home: "Inglaterra", away: "Estados Unidos", hg: 0, ag: 0 },
  { home: "Gales", away: "Inglaterra", hg: 0, ag: 3 },
  { home: "Irán", away: "Estados Unidos", hg: 0, ag: 1 },
  // Grupo C
  { home: "Argentina", away: "Arabia Saudita", hg: 1, ag: 2 },
  { home: "México", away: "Polonia", hg: 0, ag: 0 },
  { home: "Polonia", away: "Arabia Saudita", hg: 2, ag: 0 },
  { home: "Argentina", away: "México", hg: 2, ag: 0 },
  { home: "Polonia", away: "Argentina", hg: 0, ag: 2 },
  { home: "Arabia Saudita", away: "México", hg: 1, ag: 2 },
  // Grupo D
  { home: "Dinamarca", away: "Túnez", hg: 0, ag: 0 },
  { home: "Francia", away: "Australia", hg: 4, ag: 1 },
  { home: "Túnez", away: "Australia", hg: 0, ag: 1 },
  { home: "Francia", away: "Dinamarca", hg: 2, ag: 1 },
  { home: "Australia", away: "Dinamarca", hg: 1, ag: 0 },
  { home: "Túnez", away: "Francia", hg: 1, ag: 0 },
  // Grupo E
  { home: "Alemania", away: "Japón", hg: 1, ag: 2 },
  { home: "España", away: "Costa Rica", hg: 7, ag: 0 },
  { home: "Japón", away: "Costa Rica", hg: 0, ag: 1 },
  { home: "España", away: "Alemania", hg: 1, ag: 1 },
  { home: "Japón", away: "España", hg: 2, ag: 1 },
  { home: "Costa Rica", away: "Alemania", hg: 2, ag: 4 },
  // Grupo F
  { home: "Marruecos", away: "Croacia", hg: 0, ag: 0 },
  { home: "Bélgica", away: "Canadá", hg: 1, ag: 0 },
  { home: "Bélgica", away: "Marruecos", hg: 0, ag: 2 },
  { home: "Croacia", away: "Canadá", hg: 4, ag: 1 },
  { home: "Croacia", away: "Bélgica", hg: 0, ag: 0 },
  { home: "Canadá", away: "Marruecos", hg: 1, ag: 2 },
  // Grupo G
  { home: "Suiza", away: "Camerún", hg: 1, ag: 0 },
  { home: "Brasil", away: "Serbia", hg: 2, ag: 0 },
  { home: "Camerún", away: "Serbia", hg: 3, ag: 3 },
  { home: "Brasil", away: "Suiza", hg: 1, ag: 0 },
  { home: "Serbia", away: "Suiza", hg: 2, ag: 3 },
  { home: "Camerún", away: "Brasil", hg: 1, ag: 0 },
  // Grupo H
  { home: "Uruguay", away: "Corea del Sur", hg: 0, ag: 0 },
  { home: "Portugal", away: "Ghana", hg: 3, ag: 2 },
  { home: "Corea del Sur", away: "Ghana", hg: 2, ag: 3 },
  { home: "Portugal", away: "Uruguay", hg: 2, ag: 0 },
  { home: "Ghana", away: "Uruguay", hg: 0, ag: 2 },
  { home: "Corea del Sur", away: "Portugal", hg: 2, ag: 1 },
];
