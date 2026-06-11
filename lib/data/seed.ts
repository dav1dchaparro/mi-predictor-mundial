// Seed del Mundial 2026: 48 equipos en 12 grupos (A-L).
// Ratings tipo Elo aproximados (eloratings.net, orden de magnitud). Cuando se
// confirme el sorteo oficial, basta editar los grupos aquí.
// attack/defense se DERIVAN del rating relativo a la media, así un solo número
// por equipo alimenta el modelo de goles.

import type Database from "better-sqlite3";

export interface SeedTeam {
  name: string;
  group: string;
  rating: number;
  isHost?: boolean;
}

// Sorteo REAL del Mundial 2026 (grupos A-L). Ratings tipo Elo aproximados.
export const SEED_TEAMS: SeedTeam[] = [
  // A
  { name: "México", group: "A", rating: 1880, isHost: true },
  { name: "Sudáfrica", group: "A", rating: 1650 },
  { name: "Corea del Sur", group: "A", rating: 1790 },
  { name: "Chequia", group: "A", rating: 1810 },
  // B
  { name: "Canadá", group: "B", rating: 1800, isHost: true },
  { name: "Bosnia y Herzegovina", group: "B", rating: 1680 },
  { name: "Catar", group: "B", rating: 1660 },
  { name: "Suiza", group: "B", rating: 1860 },
  // C
  { name: "Brasil", group: "C", rating: 2050 },
  { name: "Marruecos", group: "C", rating: 1890 },
  { name: "Haití", group: "C", rating: 1480 },
  { name: "Escocia", group: "C", rating: 1780 },
  // D
  { name: "USA", group: "D", rating: 1830, isHost: true },
  { name: "Paraguay", group: "D", rating: 1720 },
  { name: "Australia", group: "D", rating: 1720 },
  { name: "Turquía", group: "D", rating: 1820 },
  // E
  { name: "Alemania", group: "E", rating: 2000 },
  { name: "Curazao", group: "E", rating: 1540 },
  { name: "Costa de Marfil", group: "E", rating: 1710 },
  { name: "Ecuador", group: "E", rating: 1830 },
  // F
  { name: "Países Bajos", group: "F", rating: 1990 },
  { name: "Japón", group: "F", rating: 1870 },
  { name: "Suecia", group: "F", rating: 1810 },
  { name: "Túnez", group: "F", rating: 1670 },
  // G
  { name: "Bélgica", group: "G", rating: 1960 },
  { name: "Egipto", group: "G", rating: 1740 },
  { name: "Irán", group: "G", rating: 1750 },
  { name: "Nueva Zelanda", group: "G", rating: 1560 },
  // H
  { name: "España", group: "H", rating: 2100 },
  { name: "Cabo Verde", group: "H", rating: 1560 },
  { name: "Arabia Saudita", group: "H", rating: 1640 },
  { name: "Uruguay", group: "H", rating: 1940 },
  // I
  { name: "Francia", group: "I", rating: 2080 },
  { name: "Senegal", group: "I", rating: 1820 },
  { name: "Irak", group: "I", rating: 1560 },
  { name: "Noruega", group: "I", rating: 1880 },
  // J
  { name: "Argentina", group: "J", rating: 2120 },
  { name: "Argelia", group: "J", rating: 1760 },
  { name: "Austria", group: "J", rating: 1840 },
  { name: "Jordania", group: "J", rating: 1600 },
  // K
  { name: "Portugal", group: "K", rating: 2040 },
  { name: "RD Congo", group: "K", rating: 1660 },
  { name: "Uzbekistán", group: "K", rating: 1630 },
  { name: "Colombia", group: "K", rating: 1950 },
  // L
  { name: "Inglaterra", group: "L", rating: 2030 },
  { name: "Croacia", group: "L", rating: 1910 },
  { name: "Ghana", group: "L", rating: 1680 },
  { name: "Panamá", group: "L", rating: 1640 },
];

const RATING_MEAN = 1800; // media aproximada del campo
// sensibilidad rating -> fuerza. Calibrado a 300 por grid search sobre 3
// mundiales (favoritos algo más marcados mejoran la polla). Ver scripts/optimize.ts.
const RATING_SCALE = 300;

/**
 * Deriva ataque y defensa del rating: equipos por encima de la media atacan más
 * y conceden menos. Se mantiene en un rango razonable.
 */
export function strengthFromRating(rating: number): { attack: number; defense: number } {
  const z = (rating - RATING_MEAN) / RATING_SCALE; // ~[-0.65, 0.8]
  const attack = Math.min(Math.max(1 + z * 0.45, 0.6), 1.6);
  const defense = Math.min(Math.max(1 - z * 0.45, 0.55), 1.5);
  return { attack, defense };
}

/** Inserta (o reemplaza) los 48 equipos en la DB. Idempotente. */
export function seedTeams(db: Database.Database): number {
  const insert = db.prepare(
    `INSERT INTO teams (name, group_letter, rating, attack, defense, is_host)
     VALUES (@name, @group, @rating, @attack, @defense, @is_host)
     ON CONFLICT(name) DO UPDATE SET
       group_letter=excluded.group_letter, rating=excluded.rating,
       attack=excluded.attack, defense=excluded.defense, is_host=excluded.is_host`,
  );
  const tx = db.transaction((teams: SeedTeam[]) => {
    for (const t of teams) {
      const { attack, defense } = strengthFromRating(t.rating);
      insert.run({
        name: t.name, group: t.group, rating: t.rating,
        attack, defense, is_host: t.isHost ? 1 : 0,
      });
    }
  });
  tx(SEED_TEAMS);
  return SEED_TEAMS.length;
}
