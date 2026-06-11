// Dataset Mundial Rusia 2018 para tercer backtest. Fase de grupos: 32 equipos,
// 8 grupos de 4 = 48 partidos, todos en 90'. Ratings Elo aproximados a junio 2018.

export const WC2018_RATINGS: Record<string, number> = {
  Brasil: 2130, Alemania: 2080, España: 2050, Francia: 2000, Argentina: 1985,
  Portugal: 1970, Bélgica: 1930, Inglaterra: 1920, Uruguay: 1890, Colombia: 1870,
  Croacia: 1850, Suiza: 1850, Dinamarca: 1840, México: 1820, Suecia: 1810,
  Polonia: 1810, Perú: 1810, Irán: 1790, Serbia: 1770, Marruecos: 1750,
  Senegal: 1750, Islandia: 1740, "Costa Rica": 1740, "Corea del Sur": 1740,
  Australia: 1710, Japón: 1710, Nigeria: 1690, Rusia: 1680, Túnez: 1650,
  Egipto: 1640, "Arabia Saudita": 1580, Panamá: 1570,
};

export const HOST_2018 = "Rusia";

import type { BtMatch } from "./qatar2022.js";

export const WC2018_GROUP_MATCHES: BtMatch[] = [
  // Grupo A
  { home: "Rusia", away: "Arabia Saudita", hg: 5, ag: 0 },
  { home: "Egipto", away: "Uruguay", hg: 0, ag: 1 },
  { home: "Rusia", away: "Egipto", hg: 3, ag: 1 },
  { home: "Uruguay", away: "Arabia Saudita", hg: 1, ag: 0 },
  { home: "Uruguay", away: "Rusia", hg: 3, ag: 0 },
  { home: "Arabia Saudita", away: "Egipto", hg: 2, ag: 1 },
  // Grupo B
  { home: "Marruecos", away: "Irán", hg: 0, ag: 1 },
  { home: "Portugal", away: "España", hg: 3, ag: 3 },
  { home: "Portugal", away: "Marruecos", hg: 1, ag: 0 },
  { home: "Irán", away: "España", hg: 0, ag: 1 },
  { home: "Irán", away: "Portugal", hg: 1, ag: 1 },
  { home: "España", away: "Marruecos", hg: 2, ag: 2 },
  // Grupo C
  { home: "Francia", away: "Australia", hg: 2, ag: 1 },
  { home: "Perú", away: "Dinamarca", hg: 0, ag: 1 },
  { home: "Dinamarca", away: "Australia", hg: 1, ag: 1 },
  { home: "Francia", away: "Perú", hg: 1, ag: 0 },
  { home: "Dinamarca", away: "Francia", hg: 0, ag: 0 },
  { home: "Australia", away: "Perú", hg: 0, ag: 2 },
  // Grupo D
  { home: "Argentina", away: "Islandia", hg: 1, ag: 1 },
  { home: "Croacia", away: "Nigeria", hg: 2, ag: 0 },
  { home: "Argentina", away: "Croacia", hg: 0, ag: 3 },
  { home: "Nigeria", away: "Islandia", hg: 2, ag: 0 },
  { home: "Nigeria", away: "Argentina", hg: 1, ag: 2 },
  { home: "Islandia", away: "Croacia", hg: 1, ag: 2 },
  // Grupo E
  { home: "Costa Rica", away: "Serbia", hg: 0, ag: 1 },
  { home: "Brasil", away: "Suiza", hg: 1, ag: 1 },
  { home: "Brasil", away: "Costa Rica", hg: 2, ag: 0 },
  { home: "Serbia", away: "Suiza", hg: 1, ag: 2 },
  { home: "Serbia", away: "Brasil", hg: 0, ag: 2 },
  { home: "Suiza", away: "Costa Rica", hg: 2, ag: 2 },
  // Grupo F
  { home: "Alemania", away: "México", hg: 0, ag: 1 },
  { home: "Suecia", away: "Corea del Sur", hg: 1, ag: 0 },
  { home: "Corea del Sur", away: "México", hg: 1, ag: 2 },
  { home: "Alemania", away: "Suecia", hg: 2, ag: 1 },
  { home: "Corea del Sur", away: "Alemania", hg: 2, ag: 0 },
  { home: "México", away: "Suecia", hg: 0, ag: 3 },
  // Grupo G
  { home: "Bélgica", away: "Panamá", hg: 3, ag: 0 },
  { home: "Túnez", away: "Inglaterra", hg: 1, ag: 2 },
  { home: "Bélgica", away: "Túnez", hg: 5, ag: 2 },
  { home: "Inglaterra", away: "Panamá", hg: 6, ag: 1 },
  { home: "Inglaterra", away: "Bélgica", hg: 0, ag: 1 },
  { home: "Panamá", away: "Túnez", hg: 1, ag: 2 },
  // Grupo H
  { home: "Colombia", away: "Japón", hg: 1, ag: 2 },
  { home: "Polonia", away: "Senegal", hg: 1, ag: 2 },
  { home: "Japón", away: "Senegal", hg: 2, ag: 2 },
  { home: "Polonia", away: "Colombia", hg: 0, ag: 3 },
  { home: "Japón", away: "Polonia", hg: 0, ag: 1 },
  { home: "Senegal", away: "Colombia", hg: 0, ag: 1 },
];
