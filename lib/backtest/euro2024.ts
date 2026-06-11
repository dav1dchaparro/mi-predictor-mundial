// Dataset Euro 2024 (Alemania) para segunda validación. Fase de grupos: 24
// equipos, 6 grupos de 4 = 36 partidos, todos resueltos en 90' (1X2 limpio).
// Ratings tipo Elo APROXIMADOS a junio 2024.

export const EURO_RATINGS: Record<string, number> = {
  Francia: 2050, España: 2030, Portugal: 2010, Inglaterra: 2000, "Países Bajos": 1960,
  Bélgica: 1950, Alemania: 1950, Italia: 1900, Croacia: 1900, Dinamarca: 1870,
  Suiza: 1860, Austria: 1850, Ucrania: 1820, Chequia: 1810, Serbia: 1810,
  Turquía: 1800, Polonia: 1790, Hungría: 1790, Escocia: 1780, Eslovenia: 1760,
  Eslovaquia: 1760, Rumanía: 1740, Albania: 1720, Georgia: 1700,
};

export const HOST_EURO = "Alemania";

import type { BtMatch } from "./qatar2022.js";

export const EURO_GROUP_MATCHES: BtMatch[] = [
  // Grupo A
  { home: "Alemania", away: "Escocia", hg: 5, ag: 1 },
  { home: "Hungría", away: "Suiza", hg: 1, ag: 3 },
  { home: "Alemania", away: "Hungría", hg: 2, ag: 0 },
  { home: "Escocia", away: "Suiza", hg: 1, ag: 1 },
  { home: "Suiza", away: "Alemania", hg: 1, ag: 1 },
  { home: "Escocia", away: "Hungría", hg: 0, ag: 1 },
  // Grupo B
  { home: "España", away: "Croacia", hg: 3, ag: 0 },
  { home: "Italia", away: "Albania", hg: 2, ag: 1 },
  { home: "Croacia", away: "Albania", hg: 2, ag: 2 },
  { home: "España", away: "Italia", hg: 1, ag: 0 },
  { home: "Albania", away: "España", hg: 0, ag: 1 },
  { home: "Croacia", away: "Italia", hg: 1, ag: 1 },
  // Grupo C
  { home: "Eslovenia", away: "Dinamarca", hg: 1, ag: 1 },
  { home: "Serbia", away: "Inglaterra", hg: 0, ag: 1 },
  { home: "Eslovenia", away: "Serbia", hg: 1, ag: 1 },
  { home: "Dinamarca", away: "Inglaterra", hg: 1, ag: 1 },
  { home: "Inglaterra", away: "Eslovenia", hg: 0, ag: 0 },
  { home: "Dinamarca", away: "Serbia", hg: 0, ag: 0 },
  // Grupo D
  { home: "Polonia", away: "Países Bajos", hg: 1, ag: 2 },
  { home: "Austria", away: "Francia", hg: 0, ag: 1 },
  { home: "Polonia", away: "Austria", hg: 1, ag: 3 },
  { home: "Países Bajos", away: "Francia", hg: 0, ag: 0 },
  { home: "Países Bajos", away: "Austria", hg: 2, ag: 3 },
  { home: "Francia", away: "Polonia", hg: 1, ag: 1 },
  // Grupo E
  { home: "Rumanía", away: "Ucrania", hg: 3, ag: 0 },
  { home: "Bélgica", away: "Eslovaquia", hg: 0, ag: 1 },
  { home: "Eslovaquia", away: "Ucrania", hg: 1, ag: 2 },
  { home: "Bélgica", away: "Rumanía", hg: 2, ag: 0 },
  { home: "Eslovaquia", away: "Rumanía", hg: 1, ag: 1 },
  { home: "Ucrania", away: "Bélgica", hg: 0, ag: 0 },
  // Grupo F
  { home: "Turquía", away: "Georgia", hg: 3, ag: 1 },
  { home: "Portugal", away: "Chequia", hg: 2, ag: 1 },
  { home: "Georgia", away: "Chequia", hg: 1, ag: 1 },
  { home: "Turquía", away: "Portugal", hg: 0, ag: 3 },
  { home: "Chequia", away: "Turquía", hg: 1, ag: 2 },
  { home: "Georgia", away: "Portugal", hg: 2, ag: 0 },
];
